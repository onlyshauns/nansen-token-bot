/**
 * LLM prompts for generating Twitter/X posts.
 * Uses Claude to write concise, crypto-native tweets.
 */

import { AnthropicClient } from './client.js';
import type { ScanResult } from '../twitter/scanner.js';
import type { NansenProductMatch } from '../core/parser.js';

// ============================================
// System Prompts
// ============================================

const SCHEDULED_TWEET_PROMPT = `You are @nansen_intern, an on-chain analytics bot that tweets about smart money flows and whale activity using Nansen data.

RULES:
- Write exactly ONE tweet. 280 characters MAX. This is non-negotiable.
- Lead with the strongest signal (biggest flow, most unusual activity)
- Use $SYMBOL format for token tickers
- Crypto-native voice: concise, data-driven, slightly edgy
- Include specific numbers ($2.3M, 4.2x, etc.) — raw data is your edge
- Do NOT use hashtags. Do NOT use emojis. Do NOT say "DYOR" or "NFA"
- Do NOT start with "Breaking:" or "Alert:" — just state the signal
- One short punchy take at the end is fine ("whales know something" / "smart money loading")
- Plain text only. No markdown, no formatting
- If multiple tokens have signals, pick the single most interesting one`;

const PRODUCT_REPLY_PROMPT = `You are @nansen_intern, the helpful assistant for Nansen — the leading onchain analytics platform. Someone asked about a Nansen product or feature. Write a short, friendly reply pointing them to the right place.

RULES:
- Write exactly ONE tweet. 280 characters MAX.
- Always include the URL provided — this is the key action
- Be helpful and direct — answer their question, don't just link-dump
- Crypto-native voice: knowledgeable, friendly, not corporate
- Do NOT use hashtags. Do NOT use emojis.
- Plain text only. No markdown, no formatting
- If they ask about staking, mention the $2B+ AUM and 20+ chains
- If they ask about research, mention the alpha and market briefings
- If they ask "what is Nansen" or about plans, give a quick pitch about the platform`;

const REPLY_TWEET_PROMPT = `You are @nansen_intern, an on-chain analytics bot. Someone mentioned you asking about a token. Write a reply with the key data.

RULES:
- Write 1-2 tweets worth of analysis (280 chars each, separated by ---)
- Lead with price and key market data
- Highlight the most interesting flow signals (smart money, whale activity)
- Use $SYMBOL format for token tickers
- Crypto-native voice: concise, data-driven
- Include specific numbers — this is your edge over generic bots
- Do NOT use hashtags. Do NOT use emojis. Do NOT say "DYOR" or "NFA"
- Plain text only. No markdown, no formatting
- If data is limited, be upfront: "limited on-chain data for this one"`;

// ============================================
// Generators
// ============================================

/**
 * Generate a scheduled tweet about the most interesting watchlist findings.
 */
export async function generateScheduledTweet(
  client: AnthropicClient,
  scanResults: ScanResult[]
): Promise<string | null> {
  if (scanResults.length === 0) return null;

  // Build context from top scan results (top 3)
  const context = scanResults
    .slice(0, 3)
    .map((r) => {
      const lines: string[] = [];
      lines.push(`$${r.token.symbol} (${r.token.name}) on ${r.token.chain}`);
      lines.push(`Interest score: ${r.interestScore}`);
      lines.push(`Signals: ${r.signals.join(', ')}`);

      const rpt = r.report;
      if (rpt.priceUsd) lines.push(`Price: $${rpt.priceUsd}`);
      if (rpt.priceChange24h) lines.push(`24h change: ${rpt.priceChange24h.toFixed(2)}%`);
      if (rpt.marketCapUsd) lines.push(`Mcap: $${formatCompact(rpt.marketCapUsd)}`);
      if (rpt.volume24hUsd) lines.push(`24h Vol: $${formatCompact(rpt.volume24hUsd)}`);

      if (rpt.smartMoney.buySell) {
        const bs = rpt.smartMoney.buySell;
        lines.push(`SM buying: $${formatCompact(bs.boughtVolumeUsd)} (${bs.buyerCount} wallets)`);
        lines.push(`SM selling: $${formatCompact(bs.soldVolumeUsd)} (${bs.sellerCount} wallets)`);
        lines.push(`SM net: $${formatCompact(bs.netFlowUsd)}`);
      }

      for (const flow of rpt.flows) {
        if (flow.walletCount > 0 && flow.netFlowUsd !== 0) {
          const ratio = flow.avgFlowUsd !== 0
            ? `${(flow.netFlowUsd / flow.avgFlowUsd).toFixed(1)}x avg`
            : '';
          lines.push(`${flow.name}: $${formatCompact(flow.netFlowUsd)} net flow ${ratio}`);
        }
      }

      return lines.join('\n');
    })
    .join('\n\n---\n\n');

  try {
    const tweet = await client.createMessage(SCHEDULED_TWEET_PROMPT, [
      { role: 'user', content: `Here are today's top signals from the watchlist:\n\n${context}\n\nWrite one tweet about the most interesting finding.` },
    ], { maxTokens: 120 });

    return truncateTweet(tweet.trim());
  } catch (error) {
    console.error('[TweetPrompt] Scheduled tweet generation failed:', error);
    return null;
  }
}

/**
 * Generate a reply tweet for a token analysis request.
 * Optional focusContext (e.g. "smart money", "whales") steers the LLM to
 * emphasize that angle in the reply.
 */
export async function generateReplyTweet(
  client: AnthropicClient,
  reportText: string,
  userQuery: string,
  userName: string,
  focusContext?: string
): Promise<string[]> {
  try {
    let prompt =
      `@${userName} asked: "${userQuery}"\n\n` +
      `Here is the token report data:\n${reportText}\n\n`;

    if (focusContext) {
      prompt += `The user is specifically asking about ${focusContext} activity. Focus your reply on ${focusContext}-related data from the report.\n\n`;
    }

    prompt += `Write a reply with the key analysis.`;

    const reply = await client.createMessage(REPLY_TWEET_PROMPT, [
      { role: 'user', content: prompt },
    ], { maxTokens: 250 });

    // Split on --- separator for multi-tweet replies
    const parts = reply
      .trim()
      .split(/\n*---\n*/)
      .map((p) => truncateTweet(p.trim()))
      .filter((p) => p.length > 0);

    return parts.length > 0 ? parts : [truncateTweet(reply.trim())];
  } catch (error) {
    console.error('[TweetPrompt] Reply tweet generation failed:', error);
    return [];
  }
}

/**
 * Generate a reply for a Nansen product/feature question.
 * e.g. "where can I stake $SOL?" → short helpful reply with Nansen link.
 */
export async function generateProductReply(
  client: AnthropicClient,
  mentionText: string,
  product: NansenProductMatch
): Promise<string[]> {
  try {
    const reply = await client.createMessage(PRODUCT_REPLY_PROMPT, [
      {
        role: 'user',
        content:
          `Someone asked: "${mentionText}"\n\n` +
          `Matched Nansen product: ${product.product}\n` +
          `URL: ${product.url}\n` +
          `Description: ${product.description}\n\n` +
          `Write a helpful reply directing them to the right place.`,
      },
    ], { maxTokens: 120 });

    const trimmed = reply.trim();
    if (!trimmed) return [];

    return [truncateTweet(trimmed)];
  } catch (error) {
    console.error('[TweetPrompt] Product reply generation failed:', error);
    return [];
  }
}

// ============================================
// Helpers
// ============================================

function truncateTweet(text: string): string {
  if (text.length <= 280) return text;
  // Hard truncate at 277 + "..."
  return text.slice(0, 277) + '...';
}

function formatCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${abs.toFixed(0)}`;
}
