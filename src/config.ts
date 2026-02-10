import 'dotenv/config';

export const config = {
  nansenApiKey: required('NANSEN_API_KEY'),
  telegramBotToken: optional('TELEGRAM_BOT_TOKEN'),
  discordBotToken: optional('DISCORD_BOT_TOKEN'),
  discordClientId: optional('DISCORD_CLIENT_ID'),
};

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string): string | undefined {
  return process.env[key] || undefined;
}
