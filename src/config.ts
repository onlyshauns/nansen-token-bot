import 'dotenv/config';

export const config = {
  nansenApiKey: optional('NANSEN_API_KEY'),
  telegramBotToken: optional('TELEGRAM_BOT_TOKEN'),
  discordBotToken: optional('DISCORD_BOT_TOKEN'),
  discordClientId: optional('DISCORD_CLIENT_ID'),
  anthropicApiKey: optional('ANTHROPIC_API_KEY'),
};

function optional(key: string): string | undefined {
  return process.env[key] || undefined;
}
