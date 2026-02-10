import { config } from './config.js';
import { NansenClient } from './nansen/client.js';
import { startTelegram } from './platforms/telegram.js';
import { startDiscord } from './platforms/discord.js';

async function main() {
  const nansen = new NansenClient(config.nansenApiKey);
  const tasks: Promise<void>[] = [];

  if (config.telegramBotToken) {
    tasks.push(startTelegram(config.telegramBotToken, nansen));
  } else {
    console.warn('[Main] TELEGRAM_BOT_TOKEN not set — Telegram bot disabled');
  }

  if (config.discordBotToken && config.discordClientId) {
    tasks.push(startDiscord(config.discordBotToken, config.discordClientId, nansen));
  } else {
    console.warn('[Main] DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID not set — Discord bot disabled');
  }

  if (tasks.length === 0) {
    console.error('[Main] No bot tokens configured. Set TELEGRAM_BOT_TOKEN and/or DISCORD_BOT_TOKEN in .env');
    process.exit(1);
  }

  console.log(`[Main] Starting ${tasks.length} bot(s)...`);
  await Promise.all(tasks);
}

main().catch((error) => {
  console.error('[Main] Fatal error:', error);
  process.exit(1);
});
