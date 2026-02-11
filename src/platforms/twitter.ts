/**
 * Twitter/X Bot — aixbt-style automated tweets.
 *
 * Two loops:
 *  1. Scheduled scan: scan watchlist → rank by interest → LLM tweet → post
 *  2. Mention poll: fetch @mentions → parse query → build report → LLM reply
 *
 * Supports Free ($0) and Basic ($100/mo) tiers with adaptive intervals.
 */

import { TwitterApi, type TweetV2PostTweetResult } from 'twitter-api-v2';
import type { NansenClient } from '../nansen/client.js';
import { AnthropicClient } from '../llm/client.js';
import { getWatchlistTokens } from '../twitter/watchlist.js';
import { scanWatchlist } from '../twitter/scanner.js';
import { wasRecentlyTweeted, recordTweet, getLastMentionId, setLastMentionId, setLastScanAt } from '../twitter/state.js';
import { canTweet, canRead, recordTweetUsage, recordReadUsage, getUsageSummary, isNearLimit } from '../twitter/rateLimiter.js';
import { generateScheduledTweet, generateReplyTweet } from '../llm/tweetPrompt.js';
import { extractTokenQuery, parseUserInput } from '../core/parser.js';
import { resolveToken } from '../core/resolver.js';
import { buildTokenReport } from '../core/lookup.js';
import { toTweetText } from './render.js';

// ============================================
// Types
// ============================================

export interface TwitterCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

export interface TwitterOptions {
  tier: string;
  scanIntervalHours: number;
  mentionPollMinutes: number;
  dryRun: boolean;
}

// ============================================
// Entry Point
// ============================================

export async function startTwitter(
  creds: TwitterCredentials,
  nansen: NansenClient,
  anthropic: AnthropicClient,
  opts: TwitterOptions
): Promise<void> {
  const client = new TwitterApi({
    appKey: creds.apiKey,
    appSecret: creds.apiSecret,
    accessToken: creds.accessToken,
    accessSecret: creds.accessSecret,
  });

  // Verify credentials
  let botUserId: string;
  try {
    const me = await client.v2.me();
    botUserId = me.data.id;
    console.log(`[Twitter] Authenticated as @${me.data.username} (id: ${botUserId})`);
  } catch (error) {
    console.error('[Twitter] Failed to authenticate:', error);
    throw error;
  }

  console.log(`[Twitter] Tier: ${opts.tier} | Scan: every ${opts.scanIntervalHours}h | Mentions: every ${opts.mentionPollMinutes}min | DryRun: ${opts.dryRun}`);

  // Adapt mention poll interval for Free tier (very limited reads)
  const effectiveMentionPollMs = opts.tier === 'free'
    ? 8 * 60 * 60 * 1000  // 8 hours on free tier
    : opts.mentionPollMinutes * 60 * 1000;

  const scanIntervalMs = opts.scanIntervalHours * 60 * 60 * 1000;

  // Run first scan after a short delay (let other bots start first)
  setTimeout(() => runScheduledScan(client, nansen, anthropic, opts), 10_000);

  // Scheduled scan loop
  setInterval(() => runScheduledScan(client, nansen, anthropic, opts), scanIntervalMs);

  // Mention poll loop
  setTimeout(() => runMentionPoll(client, botUserId, nansen, anthropic, opts), 30_000);
  setInterval(() => runMentionPoll(client, botUserId, nansen, anthropic, opts), effectiveMentionPollMs);

  // Keep alive (matches Telegram/Discord pattern)
  await new Promise(() => {});
}

// ============================================
// Scheduled Scan Loop
// ============================================

async function runScheduledScan(
  client: TwitterApi,
  nansen: NansenClient,
  anthropic: AnthropicClient,
  opts: TwitterOptions
): Promise<void> {
  try {
    console.log(`[Twitter] Starting scheduled scan... (${getUsageSummary(opts.tier)})`);

    if (!canTweet(opts.tier)) {
      console.warn('[Twitter] Tweet rate limit reached, skipping scan');
      return;
    }

    if (isNearLimit(opts.tier)) {
      console.warn('[Twitter] Approaching rate limits!');
    }

    const tokens = getWatchlistTokens();
    const results = await scanWatchlist(tokens, nansen);

    if (results.length === 0) {
      console.log('[Twitter] No interesting findings this scan cycle');
      setLastScanAt(new Date().toISOString());
      return;
    }

    // Filter out recently tweeted tokens
    const fresh = results.filter((r) => !wasRecentlyTweeted(r.token.symbol));
    if (fresh.length === 0) {
      console.log('[Twitter] All interesting tokens were tweeted recently, skipping');
      setLastScanAt(new Date().toISOString());
      return;
    }

    // Generate tweet via LLM
    const tweetText = await generateScheduledTweet(anthropic, fresh);
    if (!tweetText) {
      console.warn('[Twitter] LLM failed to generate tweet');
      return;
    }

    // Post it
    const topToken = fresh[0].token.symbol;
    await postTweet(client, tweetText, opts.dryRun);
    recordTweet(topToken);
    recordTweetUsage();
    setLastScanAt(new Date().toISOString());

    console.log(`[Twitter] Posted scheduled tweet about $${topToken}`);
  } catch (error) {
    console.error('[Twitter] Scheduled scan error:', error);
  }
}

// ============================================
// Mention Poll Loop
// ============================================

async function runMentionPoll(
  client: TwitterApi,
  botUserId: string,
  nansen: NansenClient,
  anthropic: AnthropicClient,
  opts: TwitterOptions
): Promise<void> {
  try {
    if (!canRead(opts.tier)) {
      console.log('[Twitter] Read rate limit reached, skipping mention poll');
      return;
    }

    const sinceId = getLastMentionId();
    console.log(`[Twitter] Polling mentions (since_id: ${sinceId || 'none'})...`);

    const mentionParams: Record<string, string> = {};
    if (sinceId) mentionParams.since_id = sinceId;

    const mentions = await client.v2.userMentionTimeline(botUserId, {
      max_results: 10,
      ...mentionParams,
    });
    recordReadUsage();

    if (!mentions.data?.data || mentions.data.data.length === 0) {
      console.log('[Twitter] No new mentions');
      return;
    }

    console.log(`[Twitter] Found ${mentions.data.data.length} new mention(s)`);

    // Track the newest mention ID for pagination
    let newestId = sinceId;

    for (const mention of mentions.data.data) {
      try {
        // Update newest ID
        if (!newestId || mention.id > newestId) {
          newestId = mention.id;
        }

        // Extract token query from mention text
        const query = extractTokenQuery(mention.text);
        if (!query) {
          console.log(`[Twitter] Mention ${mention.id}: no token query found, skipping`);
          continue;
        }

        console.log(`[Twitter] Mention ${mention.id}: query="${query}"`);

        if (!canTweet(opts.tier)) {
          console.warn('[Twitter] Tweet rate limit reached, stopping mention processing');
          break;
        }

        // Parse + resolve
        const parsed = parseUserInput(query);
        if (!parsed) {
          console.log(`[Twitter] Could not parse query: ${query}`);
          continue;
        }

        let resolved;
        try {
          resolved = await resolveToken(parsed);
        } catch {
          console.log(`[Twitter] Could not resolve token for query: ${query}`);
          continue;
        }

        const report = await buildTokenReport(resolved, nansen);

        // Generate reply via LLM
        const reportText = toTweetText(report).join('\n\n');
        const authorName = mention.author_id || 'anon';
        const replyParts = await generateReplyTweet(anthropic, reportText, query, authorName);

        if (replyParts.length === 0) {
          console.warn(`[Twitter] LLM failed to generate reply for ${query}`);
          continue;
        }

        // Post as reply thread
        await postReplyThread(client, mention.id, replyParts, opts.dryRun);
        recordTweetUsage();

        console.log(`[Twitter] Replied to mention ${mention.id} about $${resolved.symbol}`);

        // Small delay between processing mentions
        await sleep(2000);
      } catch (error) {
        console.error(`[Twitter] Error processing mention ${mention.id}:`, error);
      }
    }

    // Save the newest mention ID for next poll
    if (newestId) {
      setLastMentionId(newestId);
    }
  } catch (error) {
    console.error('[Twitter] Mention poll error:', error);
  }
}

// ============================================
// Twitter API Helpers
// ============================================

async function postTweet(
  client: TwitterApi,
  text: string,
  dryRun: boolean
): Promise<TweetV2PostTweetResult | null> {
  if (dryRun) {
    console.log(`[Twitter DRY RUN] Would tweet (${text.length} chars):\n${text}`);
    return null;
  }

  const result = await client.v2.tweet(text);
  console.log(`[Twitter] Tweet posted: ${result.data.id} (${text.length} chars)`);
  return result;
}

async function postReplyThread(
  client: TwitterApi,
  replyToId: string,
  parts: string[],
  dryRun: boolean
): Promise<void> {
  if (dryRun) {
    console.log(`[Twitter DRY RUN] Would reply to ${replyToId} with ${parts.length} tweet(s):`);
    for (const [i, part] of parts.entries()) {
      console.log(`  [${i + 1}/${parts.length}] (${part.length} chars): ${part}`);
    }
    return;
  }

  let lastTweetId = replyToId;
  for (const part of parts) {
    const result = await client.v2.tweet(part, {
      reply: { in_reply_to_tweet_id: lastTweetId },
    });
    lastTweetId = result.data.id;
    console.log(`[Twitter] Reply posted: ${result.data.id} (${part.length} chars)`);

    // Small delay between thread tweets
    await sleep(500);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
