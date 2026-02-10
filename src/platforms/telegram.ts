import { Bot, Context } from 'grammy';
import type { NansenClient } from '../nansen/client.js';
import { parseUserInput, isTokenQuery } from '../core/parser.js';
import { resolveToken } from '../core/resolver.js';
import { buildTokenReport } from '../core/lookup.js';
import { toTelegramHTML } from './render.js';

export async function startTelegram(token: string, nansen: NansenClient): Promise<void> {
  const bot = new Bot(token);

  // /start command
  bot.command('start', async (ctx) => {
    await ctx.reply(
      '<b>Nansen Token Lookup Bot</b>\n\n' +
      'Send a token symbol or contract address to look up:\n\n' +
      '\u2022 <code>$PEPE</code> — looks up highest market cap match\n' +
      '\u2022 <code>$PEPE SOL</code> — looks up PEPE on Solana\n' +
      '\u2022 <code>0x6982...</code> — looks up by contract address\n\n' +
      'Or use /token &lt;query&gt;',
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
    await handleTokenQuery(ctx, text, nansen);
  });

  bot.catch((err) => {
    console.error('[Telegram] Bot error:', err);
  });

  console.log('[Telegram] Bot starting...');
  await bot.start();
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
