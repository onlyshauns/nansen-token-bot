import 'dotenv/config';

export const config = {
  nansenApiKey: optional('NANSEN_API_KEY'),
  telegramBotToken: optional('TELEGRAM_BOT_TOKEN'),
  discordBotToken: optional('DISCORD_BOT_TOKEN'),
  discordClientId: optional('DISCORD_CLIENT_ID'),
  anthropicApiKey: optional('ANTHROPIC_API_KEY'),

  // Twitter/X Bot
  twitterApiKey: optional('TWITTER_API_KEY'),
  twitterApiSecret: optional('TWITTER_API_SECRET'),
  twitterAccessToken: optional('TWITTER_ACCESS_TOKEN'),
  twitterAccessSecret: optional('TWITTER_ACCESS_SECRET'),
  twitterTier: optional('TWITTER_TIER') || 'free',                       // 'free' | 'basic'
  twitterScanIntervalHours: Number(optional('TWITTER_SCAN_INTERVAL_HOURS') || '6'),
  twitterMentionPollMinutes: Number(optional('TWITTER_MENTION_POLL_MINUTES') || '15'),
  twitterDryRun: optional('TWITTER_DRY_RUN') === 'true',
};

function optional(key: string): string | undefined {
  return process.env[key] || undefined;
}
