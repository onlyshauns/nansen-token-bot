/**
 * Twitter API rate limiter — tracks daily/monthly tweet + read usage.
 * Auto-adapts limits based on TWITTER_TIER (free vs basic).
 */

// ============================================
// Tier Limits
// ============================================

interface TierLimits {
  tweetsPerMonth: number;
  readsPerMonth: number;
  tweetsPerDay: number;
  readsPerDay: number;
}

const TIER_LIMITS: Record<string, TierLimits> = {
  free: {
    tweetsPerMonth: 1500,
    readsPerMonth: 100,
    tweetsPerDay: 50, // ~1500/30
    readsPerDay: 3,   // ~100/30
  },
  basic: {
    tweetsPerMonth: 3000,
    readsPerMonth: 10000,
    tweetsPerDay: 100,  // ~3000/30
    readsPerDay: 333,   // ~10000/30
  },
};

// ============================================
// State
// ============================================

interface UsageCounters {
  tweetsToday: number;
  readsToday: number;
  tweetsThisMonth: number;
  readsThisMonth: number;
  dayStart: number;   // epoch ms
  monthStart: number; // epoch ms
}

let state: UsageCounters = {
  tweetsToday: 0,
  readsToday: 0,
  tweetsThisMonth: 0,
  readsThisMonth: 0,
  dayStart: startOfDay(),
  monthStart: startOfMonth(),
};

function startOfDay(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfMonth(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function rolloverIfNeeded(): void {
  const now = Date.now();

  // Day rollover
  if (now - state.dayStart >= 24 * 60 * 60 * 1000) {
    state.tweetsToday = 0;
    state.readsToday = 0;
    state.dayStart = startOfDay();
  }

  // Month rollover
  if (now - state.monthStart >= 31 * 24 * 60 * 60 * 1000) {
    state.tweetsThisMonth = 0;
    state.readsThisMonth = 0;
    state.monthStart = startOfMonth();
  }
}

// ============================================
// Public API
// ============================================

export function canTweet(tier: string): boolean {
  rolloverIfNeeded();
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
  return (
    state.tweetsToday < limits.tweetsPerDay &&
    state.tweetsThisMonth < limits.tweetsPerMonth
  );
}

export function canRead(tier: string): boolean {
  rolloverIfNeeded();
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
  return (
    state.readsToday < limits.readsPerDay &&
    state.readsThisMonth < limits.readsPerMonth
  );
}

export function recordTweetUsage(): void {
  rolloverIfNeeded();
  state.tweetsToday++;
  state.tweetsThisMonth++;
}

export function recordReadUsage(): void {
  rolloverIfNeeded();
  state.readsToday++;
  state.readsThisMonth++;
}

export function getUsageSummary(tier: string): string {
  rolloverIfNeeded();
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
  return (
    `Tweets: ${state.tweetsToday}/${limits.tweetsPerDay}/day, ` +
    `${state.tweetsThisMonth}/${limits.tweetsPerMonth}/month | ` +
    `Reads: ${state.readsToday}/${limits.readsPerDay}/day, ` +
    `${state.readsThisMonth}/${limits.readsPerMonth}/month`
  );
}

/**
 * Check if we're at 80% of any limit (for warning logs)
 */
export function isNearLimit(tier: string): boolean {
  rolloverIfNeeded();
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
  return (
    state.tweetsToday >= limits.tweetsPerDay * 0.8 ||
    state.tweetsThisMonth >= limits.tweetsPerMonth * 0.8 ||
    state.readsToday >= limits.readsPerDay * 0.8 ||
    state.readsThisMonth >= limits.readsPerMonth * 0.8
  );
}
