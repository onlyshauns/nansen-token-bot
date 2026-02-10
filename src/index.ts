import { config } from './config.js';
import { NansenClient } from './nansen/client.js';
import { startTelegram } from './platforms/telegram.js';
import { startDiscord } from './platforms/discord.js';

async function main() {
  const tasks: Promise<void>[] = [];

  // Telegram: users provide their own API key via /setkey
  if (config.telegramBotToken) {
    tasks.push(startTelegram(config.telegramBotToken));
  } else {
    console.warn('[Main] TELEGRAM_BOT_TOKEN not set — Telegram bot disabled');
  }

  // Discord: uses a shared API key from .env
  if (config.discordBotToken && config.discordClientId && config.nansenApiKey) {
    const nansen = new NansenClient(config.nansenApiKey);
    tasks.push(startDiscord(config.discordBotToken, config.discordClientId, nansen));
  } else if (config.discordBotToken) {
    console.warn('[Main] DISCORD_BOT_TOKEN set but missing DISCORD_CLIENT_ID or NANSEN_API_KEY — Discord bot disabled');
  }

  if (tasks.length === 0) {
    console.error('[Main] No bot tokens configured. Set TELEGRAM_BOT_TOKEN in .env');
    process.exit(1);
  }

  console.log(`[Main] Starting ${tasks.length} bot(s)...`);
  await Promise.all(tasks);
}

main().catch((error) => {
  console.error('[Main] Fatal error:', error);
  process.exit(1);
});
