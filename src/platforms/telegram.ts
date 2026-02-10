import { Bot, Context, NextFunction } from 'grammy';
import { parseUserInput, isTokenQuery } from '../core/parser.js';
import { resolveToken } from '../core/resolver.js';
import { buildTokenReport } from '../core/lookup.js';
import { toTelegramHTML } from './render.js';
import { getKey, setKey, deleteKey, getDmOnly, setDmOnly, incrementQueryCount, getStats, allowUser, revokeUser, findAllowedKey, getAllowedUsers } from '../storage/keyStore.js';
import { getClient, validateKey } from '../nansen/pool.js';
import {
  checkRateLimit,
  recordQuery,
  getRemainingPerMinute,
  isQueryInFlight,
  markQueryStart,
  markQueryEnd,
} from '../security/rateLimiter.js';
import { config } from '../config.js';
import { AnthropicClient } from '../llm/client.js';
import { generatePersonalityReply } from '../llm/personality.js';
import { checkLlmRateLimit, recordLlmCall } from '../llm/rateLimiter.js';

import type { NansenClient } from '../nansen/client.js';

const ONBOARDING_MSG =
  '\uD83D\uDD11 <b>You haven\'t set your Nansen API key yet!</b>\n\n' +
  'To get started:\n' +
  '1. Get your API key from <a href="https://app.nansen.ai">app.nansen.ai</a>\n' +
  '2. DM me: <code>/setkey YOUR_API_KEY</code>\n\n' +
  'Your key is stored securely and only used for your queries.';

export async function startTelegram(token: string): Promise<void> {
  const bot = new Bot(token);

  // /start command
  bot.command('start', async (ctx) => {
    const userId = ctx.from?.id;
    const hasKey = userId ? getKey(userId) !== null : false;

    if (hasKey) {
      await ctx.reply(
        '<b>Nansen Token Lookup Bot</b> \u2705\n\n' +
        'Your API key is configured. Send a token to look up:\n\n' +
        '\u2022 <code>$PEPE</code> \u2014 looks up highest market cap match\n' +
        '\u2022 <code>$PEPE SOL</code> \u2014 looks up PEPE on Solana\n' +
        '\u2022 <code>0x6982...</code> \u2014 looks up by contract address\n\n' +
        'Commands:\n' +
        '/token &lt;query&gt; \u2014 look up a token\n' +
        '/allow \u2014 reply to a user to grant them access (groups)\n' +
        '/revoke \u2014 reply to a user to remove access (groups)\n' +
        '/allowlist \u2014 see who has access in this group\n' +
        '/dmonly \u2014 toggle DM-only mode\n' +
        '/mystats \u2014 see your usage stats\n' +
        '/removekey \u2014 remove your API key',
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
      );
    } else {
      await ctx.reply(
        '<b>Nansen Token Lookup Bot</b>\n\n' +
        'Look up any token with on-chain intelligence from Nansen.\n\n' +
        ONBOARDING_MSG,
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
      );
    }
  });

  // /setkey command
  bot.command('setkey', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Always try to delete the message (it contains the key!)
    try {
      await ctx.api.deleteMessage(ctx.chat!.id, ctx.message!.message_id);
    } catch {
      // May fail if bot isn't admin
    }

    // Block /setkey in groups — keys should only be set in DMs
    if (ctx.chat!.type !== 'private') {
      await ctx.reply(
        '\u26A0\uFE0F For security, please set your API key in a <b>private message</b> to me.\n\n' +
        'Tap my name \u2192 Send Message \u2192 <code>/setkey YOUR_KEY</code>',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const apiKey = ctx.match?.trim();

    if (!apiKey) {
      await ctx.reply(
        'Usage: <code>/setkey YOUR_API_KEY</code>\n\n' +
        'Get your key from <a href="https://app.nansen.ai">app.nansen.ai</a>',
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
      );
      return;
    }

    await ctx.reply('\u23F3 Validating your API key...');

    const valid = await validateKey(apiKey);
    if (!valid) {
      await ctx.reply(
        '\u274C Invalid API key. Please check your key and try again.\n\n' +
        'Get your key from <a href="https://app.nansen.ai">app.nansen.ai</a>',
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
      );
      return;
    }

    setKey(userId, apiKey);
    console.log(`[Telegram] API key set for user ${userId}`);

    await ctx.reply(
      '\u2705 <b>API key saved!</b>\n\n' +
      'You\'re all set. Try sending <code>$PEPE</code> or any token symbol.',
      { parse_mode: 'HTML' }
    );
  });

  // /removekey command
  bot.command('removekey', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const existing = getKey(userId);
    if (!existing) {
      await ctx.reply('You don\'t have an API key set.');
      return;
    }

    deleteKey(userId);
    console.log(`[Telegram] API key removed for user ${userId}`);

    await ctx.reply('\u2705 Your API key has been removed.');
  });

  // /dmonly command — toggle DM-only mode
  bot.command('dmonly', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (!getKey(userId)) {
      await ctx.reply(ONBOARDING_MSG, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      return;
    }

    const arg = ctx.match?.trim().toLowerCase();

    if (arg === 'on') {
      setDmOnly(userId, true);
      await ctx.reply(
        '\uD83D\uDD12 <b>DM-only mode enabled.</b>\n\n' +
        'Your API key will only work in private messages with me.\n' +
        'Token queries in groups will be silently ignored.',
        { parse_mode: 'HTML' }
      );
    } else if (arg === 'off') {
      setDmOnly(userId, false);
      await ctx.reply(
        '\uD83D\uDD13 <b>DM-only mode disabled.</b>\n\n' +
        'Your API key now works in both DMs and groups.',
        { parse_mode: 'HTML' }
      );
    } else {
      const current = getDmOnly(userId);
      await ctx.reply(
        `\uD83D\uDD10 <b>DM-only mode:</b> ${current ? 'ON \uD83D\uDD12' : 'OFF \uD83D\uDD13'}\n\n` +
        'Usage:\n' +
        '<code>/dmonly on</code> \u2014 only respond to your queries in DMs\n' +
        '<code>/dmonly off</code> \u2014 respond in DMs and groups',
        { parse_mode: 'HTML' }
      );
    }
  });

  // /mystats command — show usage stats
  bot.command('mystats', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const stats = getStats(userId);
    if (!stats) {
      await ctx.reply(ONBOARDING_MSG, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      return;
    }

    const remaining = getRemainingPerMinute(userId);
    const lastQuery = stats.lastQueryAt ? formatTimeAgo(stats.lastQueryAt) : 'Never';
    const mode = stats.dmOnly ? 'DM only \uD83D\uDD12' : 'DMs + Groups \uD83D\uDD13';

    await ctx.reply(
      '\uD83D\uDCCA <b>Your API Usage</b>\n\n' +
      `\u2022 Total queries: <b>${stats.queryCount}</b>\n` +
      `\u2022 Last query: ${lastQuery}\n` +
      `\u2022 Mode: ${mode}\n` +
      `\u2022 Rate limit: <b>${remaining}/10</b> queries remaining this minute`,
      { parse_mode: 'HTML' }
    );
  });

  // /allow command — grant a user access to your API key in this group
  bot.command('allow', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Only works in groups
    if (ctx.chat?.type === 'private') {
      await ctx.reply('This command only works in groups.');
      return;
    }

    // Must have own key
    if (!getKey(userId)) {
      await ctx.reply(ONBOARDING_MSG, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      return;
    }

    // Must reply to someone's message
    const target = ctx.message?.reply_to_message?.from;
    if (!target || target.is_bot) {
      await ctx.reply(
        'Reply to a user\'s message with <code>/allow</code> to grant them access to your API key in this group.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const groupId = ctx.chat!.id;
    allowUser(userId, groupId, target.id);

    const name = target.first_name + (target.last_name ? ' ' + target.last_name : '');
    await ctx.reply(
      `\u2705 <b>${escapeHtml(name)}</b> can now use your API key in this group.\n\n` +
      'Use <code>/revoke</code> (reply to their message) to remove access.',
      { parse_mode: 'HTML' }
    );
    console.log(`[Telegram] User ${userId} allowed ${target.id} in group ${groupId}`);
  });

  // /revoke command — remove a user's access to your API key in this group
  bot.command('revoke', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (ctx.chat?.type === 'private') {
      await ctx.reply('This command only works in groups.');
      return;
    }

    if (!getKey(userId)) {
      await ctx.reply(ONBOARDING_MSG, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      return;
    }

    const target = ctx.message?.reply_to_message?.from;
    if (!target || target.is_bot) {
      await ctx.reply(
        'Reply to a user\'s message with <code>/revoke</code> to remove their access.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const groupId = ctx.chat!.id;
    revokeUser(userId, groupId, target.id);

    const name = target.first_name + (target.last_name ? ' ' + target.last_name : '');
    await ctx.reply(
      `\u274C <b>${escapeHtml(name)}</b>'s access has been revoked in this group.`,
      { parse_mode: 'HTML' }
    );
    console.log(`[Telegram] User ${userId} revoked ${target.id} in group ${groupId}`);
  });

  // /allowlist command — show who has access in this group
  bot.command('allowlist', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (ctx.chat?.type === 'private') {
      await ctx.reply('This command only works in groups.');
      return;
    }

    if (!getKey(userId)) {
      await ctx.reply(ONBOARDING_MSG, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      return;
    }

    const groupId = ctx.chat!.id;
    const allowed = getAllowedUsers(userId, groupId);

    if (allowed.length === 0) {
      await ctx.reply(
        '\uD83D\uDCCB <b>No users allowed in this group.</b>\n\n' +
        'Reply to someone\'s message with <code>/allow</code> to grant access.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const lines = allowed.map((id) => `\u2022 <code>${id}</code>`);
    await ctx.reply(
      `\uD83D\uDCCB <b>Allowed users in this group (${allowed.length}):</b>\n\n` +
      lines.join('\n') + '\n\n' +
      'Reply to a message with <code>/revoke</code> to remove access.',
      { parse_mode: 'HTML' }
    );
  });

  // /token command
  bot.command('token', async (ctx) => {
    const query = ctx.match;
    if (!query) {
      await ctx.reply('Usage: /token $PEPE or /token 0x6982...');
      return;
    }

    const userId = ctx.from?.id;
    if (!userId) return;

    // Security checks
    const guardResult = await runSecurityChecks(ctx, userId);
    if (!guardResult.ok) return;

    await executeTokenQuery(ctx, query, guardResult.nansen!, userId);
  });

  // Auto-detect $SYMBOL and CA in messages
  bot.on('message:text', async (ctx, next) => {
    let text = ctx.message.text;
    // Skip commands
    if (text.startsWith('/')) return;

    // In groups, also respond to messages that mention the bot
    const botUsername = ctx.me.username;
    if (botUsername && text.includes(`@${botUsername}`)) {
      text = text.replace(`@${botUsername}`, '').trim();
    }

    // Not a token query — pass to the next handler (personality replies)
    if (!isTokenQuery(text)) return next();

    const userId = ctx.from?.id;
    if (!userId) return;

    // Security checks
    const guardResult = await runSecurityChecks(ctx, userId);
    if (!guardResult.ok) return;

    await executeTokenQuery(ctx, text, guardResult.nansen!, userId);
  });

  // ============================================
  // AI Personality Replies (reply-to-bot detection)
  // ============================================

  const anthropicKey = config.anthropicApiKey;
  if (anthropicKey) {
    const anthropic = new AnthropicClient(anthropicKey);
    console.log('[Telegram] AI personality enabled');

    bot.on('message:text', async (ctx) => {
      // Skip commands
      if (ctx.message.text.startsWith('/')) return;

      const botId = ctx.me.id;
      const botUsername = ctx.me.username;

      // Trigger 1: Reply to the bot's own message
      const repliedTo = ctx.message.reply_to_message;
      const isReplyToBot = repliedTo && repliedTo.from?.id === botId;

      // Trigger 2: @mention the bot (in groups)
      const isMention = botUsername && ctx.message.text.includes(`@${botUsername}`);

      if (!isReplyToBot && !isMention) return;

      // Rate limit check (silently skip if exceeded)
      const userId = ctx.from?.id;
      if (!userId) return;
      if (!checkLlmRateLimit(userId)) return;

      // Extract context
      const botMessageText = isReplyToBot
        ? (repliedTo!.text || repliedTo!.caption || '')
        : '';
      let userMessageText = ctx.message.text;
      // Strip the @mention from the user's message
      if (botUsername) {
        userMessageText = userMessageText.replace(`@${botUsername}`, '').trim();
      }
      const userName = ctx.from.first_name || 'anon';

      if (!userMessageText) return;

      // Record the call for rate limiting
      recordLlmCall(userId);

      // Show typing indicator
      try {
        await ctx.api.sendChatAction(ctx.chat!.id, 'typing');
      } catch { /* ignore */ }

      // Generate and send reply
      const reply = await generatePersonalityReply(anthropic, {
        botMessageText,
        userMessageText,
        userName,
      });

      if (reply) {
        try {
          await ctx.reply(reply, {
            parse_mode: 'HTML',
            reply_parameters: { message_id: ctx.message.message_id },
          });
        } catch {
          // Fallback without HTML parsing if the LLM produced invalid HTML
          await ctx.reply(reply, {
            reply_parameters: { message_id: ctx.message.message_id },
          });
        }
      }
    });
  } else {
    console.log('[Telegram] AI personality disabled (no ANTHROPIC_API_KEY)');
  }

  bot.catch((err) => {
    console.error('[Telegram] Bot error:', err);
  });

  console.log('[Telegram] Bot starting...');
  await bot.start();
}

// ============================================
// Security Checks
// ============================================

interface GuardResult {
  ok: boolean;
  nansen?: NansenClient;
}

/**
 * Run all security checks before processing a query.
 * Returns { ok: true, nansen } if all checks pass, { ok: false } otherwise.
 * Sends appropriate error messages to the user.
 */
async function runSecurityChecks(ctx: Context, userId: number): Promise<GuardResult> {
  // 1. Check if user has an API key
  const nansen = getNansenForUser(ctx);
  if (!nansen) {
    await ctx.reply(ONBOARDING_MSG, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    return { ok: false };
  }

  // 2. DM-only mode check — silently ignore in groups
  const isPrivate = ctx.chat?.type === 'private';
  if (!isPrivate && getDmOnly(userId)) {
    // Silently ignore — don't spam the group with "DM only" messages
    return { ok: false };
  }

  // 3. Concurrent query check
  if (isQueryInFlight(userId)) {
    await ctx.reply('\u23F3 Please wait for your current query to finish.');
    return { ok: false };
  }

  // 4. Rate limit check
  const rateCheck = checkRateLimit(userId);
  if (!rateCheck.allowed) {
    await ctx.reply(
      `\u26A0\uFE0F Slow down! Try again in ${rateCheck.retryAfterSecs}s.`
    );
    return { ok: false };
  }

  return { ok: true, nansen };
}

// ============================================
// Query Execution
// ============================================

/**
 * Execute a token query with rate limiting and concurrency guard.
 */
async function executeTokenQuery(
  ctx: Context,
  rawQuery: string,
  nansen: NansenClient,
  userId: number
): Promise<void> {
  // Record the query for rate limiting
  recordQuery(userId);
  markQueryStart(userId);

  try {
    await handleTokenQuery(ctx, rawQuery, nansen);
    // Increment persistent stats only on success
    incrementQueryCount(userId);
  } finally {
    markQueryEnd(userId);
  }
}

// ============================================
// Helpers
// ============================================

/**
 * Look up the user's API key and return a NansenClient, or null if not set.
 * In groups, also checks if another user has granted them access via /allow.
 */
function getNansenForUser(ctx: Context): NansenClient | null {
  const userId = ctx.from?.id;
  if (!userId) return null;

  // 1. User's own key always takes priority
  const ownKey = getKey(userId);
  if (ownKey) return getClient(ownKey);

  // 2. In groups, check if someone allowed this user
  const chatType = ctx.chat?.type;
  if (chatType && chatType !== 'private') {
    const groupId = ctx.chat!.id;
    const allowedKey = findAllowedKey(userId, groupId);
    if (allowedKey) return getClient(allowedKey);
  }

  return null;
}

async function handleTokenQuery(ctx: Context, rawQuery: string, nansen: NansenClient): Promise<void> {
  const parsed = parseUserInput(rawQuery);
  if (!parsed) {
    return;
  }

  // Show typing indicator
  await ctx.api.sendChatAction(ctx.chat!.id, 'typing');

  try {
    // Resolve token
    console.log(`[Telegram] Resolving "${parsed.query}"...`);
    const token = await resolveToken(parsed);
    console.log(`[Telegram] Resolved: ${token.symbol} on ${token.chain}`);

    // Show typing while fetching data
    await ctx.api.sendChatAction(ctx.chat!.id, 'typing');

    // Build report
    console.log(`[Telegram] Building report...`);
    const report = await buildTokenReport(token, nansen);
    console.log(`[Telegram] Report built, rendering...`);

    // Render and send
    const html = toTelegramHTML(report);
    await sendLongMessage(ctx, html);
    console.log(`[Telegram] Message sent for ${token.symbol}`);
  } catch (error) {
    console.error(`[Telegram] Error for "${parsed.query}":`, error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    await ctx.reply(
      `\u274C Could not look up "${parsed.query}"\n\n${message}\n\nTry using the contract address directly.`,
      { parse_mode: 'HTML' }
    );
  }
}

async function sendLongMessage(ctx: Context, html: string): Promise<void> {
  const MAX_LENGTH = 4096;

  if (html.length <= MAX_LENGTH) {
    await ctx.reply(html, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    return;
  }

  // Split at paragraph boundaries
  const chunks = splitMessage(html, MAX_LENGTH);
  for (const chunk of chunks) {
    await ctx.reply(chunk, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  }
}

function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = remaining.lastIndexOf('\n\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength * 0.3) {
      splitIndex = remaining.lastIndexOf('\n', maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength * 0.3) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }

  return chunks;
}

/**
 * Escape HTML special chars for safe Telegram rendering.
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Format an ISO timestamp as a relative "time ago" string.
 */
function formatTimeAgo(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;

  if (diffMs < 60_000) return 'Just now';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
