import { Bot, Context } from 'grammy';
import { parseUserInput, isTokenQuery } from '../core/parser.js';
import { resolveToken } from '../core/resolver.js';
import { buildTokenReport } from '../core/lookup.js';
import { toTelegramHTML } from './render.js';
import { getKey, setKey, deleteKey } from '../storage/keyStore.js';
import { getClient, validateKey } from '../nansen/pool.js';

const ONBOARDING_MSG =
  '\uD83D\uDD11 <b>You haven\'t set your Nansen API key yet!</b>\n\n' +
  'To get started:\n' +
  '1. Get your API key from <a href="https://app.nansen.ai">app.nansen.ai</a>\n' +
  '2. Send: <code>/setkey YOUR_API_KEY</code>\n\n' +
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

    const apiKey = ctx.match?.trim();

    // Delete the user's message containing the key (security)
    try {
      await ctx.api.deleteMessage(ctx.chat!.id, ctx.message!.message_id);
    } catch {
      // May fail in groups if bot isn't admin — that's OK
    }

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

  // /token command
  bot.command('token', async (ctx) => {
    const query = ctx.match;
    if (!query) {
      await ctx.reply('Usage: /token $PEPE or /token 0x6982...');
      return;
    }

    const nansen = getNansenForUser(ctx);
    if (!nansen) {
      await ctx.reply(ONBOARDING_MSG, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      return;
    }

    await handleTokenQuery(ctx, query, nansen);
  });

  // Auto-detect $SYMBOL and CA in messages
  bot.on('message:text', async (ctx) => {
    let text = ctx.message.text;
    // Skip commands
    if (text.startsWith('/')) return;

    // In groups, also respond to messages that mention the bot
    const botUsername = ctx.me.username;
    if (botUsername && text.includes(`@${botUsername}`)) {
      text = text.replace(`@${botUsername}`, '').trim();
    }

    // Only respond to messages that look like token queries
    if (!isTokenQuery(text)) return;

    const nansen = getNansenForUser(ctx);
    if (!nansen) {
      await ctx.reply(ONBOARDING_MSG, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      return;
    }

    await handleTokenQuery(ctx, text, nansen);
  });

  bot.catch((err) => {
    console.error('[Telegram] Bot error:', err);
  });

  console.log('[Telegram] Bot starting...');
  await bot.start();
}

// ============================================
// Helpers
// ============================================

import type { NansenClient } from '../nansen/client.js';

/**
 * Look up the user's API key and return a NansenClient, or null if not set.
 */
function getNansenForUser(ctx: Context): NansenClient | null {
  const userId = ctx.from?.id;
  if (!userId) return null;

  const apiKey = getKey(userId);
  if (!apiKey) return null;

  return getClient(apiKey);
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
