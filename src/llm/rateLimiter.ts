/**
 * Separate rate limiter for LLM personality replies.
 * Keeps LLM costs bounded without affecting token query rate limits.
 *
 * Limits:
 *  - Per user: 5 replies per minute, 20 per hour
 *  - Global: 60 replies per minute (across all users)
 */

const USER_PER_MINUTE = 5;
const USER_PER_HOUR = 20;
const GLOBAL_PER_MINUTE = 60;

const userLog = new Map<number, number[]>();
const globalLog: number[] = [];

export function checkLlmRateLimit(userId: number): boolean {
  const now = Date.now();
  const oneMinAgo = now - 60_000;
  const oneHourAgo = now - 3_600_000;

  // Global check
  const globalRecent = globalLog.filter((t) => t > oneMinAgo);
  if (globalRecent.length >= GLOBAL_PER_MINUTE) return false;

  // Per-user checks
  const timestamps = userLog.get(userId) || [];
  const lastMinute = timestamps.filter((t) => t > oneMinAgo);
  if (lastMinute.length >= USER_PER_MINUTE) return false;

  const lastHour = timestamps.filter((t) => t > oneHourAgo);
  if (lastHour.length >= USER_PER_HOUR) return false;

  return true;
}

export function recordLlmCall(userId: number): void {
  const now = Date.now();

  const timestamps = userLog.get(userId) || [];
  timestamps.push(now);
  userLog.set(userId, timestamps);

  globalLog.push(now);
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const oneHourAgo = Date.now() - 3_600_000;

  for (const [userId, timestamps] of userLog.entries()) {
    const recent = timestamps.filter((t) => t > oneHourAgo);
    if (recent.length === 0) {
      userLog.delete(userId);
    } else {
      userLog.set(userId, recent);
    }
  }

  // Prune global log
  const recentGlobal = globalLog.filter((t) => t > oneHourAgo);
  globalLog.length = 0;
  globalLog.push(...recentGlobal);
}, 5 * 60 * 1000).unref();
