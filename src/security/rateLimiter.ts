/**
 * Per-user rate limiter and concurrent query guard.
 *
 * In-memory only — rate limits reset on restart (by design).
 * Prevents:
 *  1. Query spam (sliding window: 10/min, 30/hour)
 *  2. Concurrent flooding (1 query at a time per user)
 */

const MAX_PER_MINUTE = 10;
const MAX_PER_HOUR = 30;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================
// Rate Limiter (sliding window)
// ============================================

/** Timestamps of recent queries per user */
const queryLog = new Map<number, number[]>();

/**
 * Check if a user is within rate limits.
 * Does NOT record the query — call `recordQuery` after the check passes.
 */
export function checkRateLimit(userId: number): { allowed: boolean; retryAfterSecs?: number } {
  const now = Date.now();
  const timestamps = queryLog.get(userId) || [];

  // Count queries in the last minute
  const oneMinAgo = now - 60_000;
  const lastMinute = timestamps.filter((t) => t > oneMinAgo);

  if (lastMinute.length >= MAX_PER_MINUTE) {
    const oldestInWindow = lastMinute[0];
    const retryAfterSecs = Math.ceil((oldestInWindow + 60_000 - now) / 1000);
    return { allowed: false, retryAfterSecs: Math.max(retryAfterSecs, 1) };
  }

  // Count queries in the last hour
  const oneHourAgo = now - 3_600_000;
  const lastHour = timestamps.filter((t) => t > oneHourAgo);

  if (lastHour.length >= MAX_PER_HOUR) {
    const oldestInWindow = lastHour[0];
    const retryAfterSecs = Math.ceil((oldestInWindow + 3_600_000 - now) / 1000);
    return { allowed: false, retryAfterSecs: Math.max(retryAfterSecs, 1) };
  }

  return { allowed: true };
}

/**
 * Record a query for rate limiting purposes.
 * Call this AFTER the rate limit check passes and before starting the query.
 */
export function recordQuery(userId: number): void {
  const now = Date.now();
  const timestamps = queryLog.get(userId) || [];
  timestamps.push(now);
  queryLog.set(userId, timestamps);
}

/**
 * Get remaining queries in the current minute window.
 */
export function getRemainingPerMinute(userId: number): number {
  const now = Date.now();
  const timestamps = queryLog.get(userId) || [];
  const oneMinAgo = now - 60_000;
  const lastMinute = timestamps.filter((t) => t > oneMinAgo);
  return Math.max(0, MAX_PER_MINUTE - lastMinute.length);
}

// ============================================
// Concurrent Query Guard
// ============================================

/** Set of user IDs with an in-flight query */
const inFlight = new Set<number>();

export function isQueryInFlight(userId: number): boolean {
  return inFlight.has(userId);
}

export function markQueryStart(userId: number): void {
  inFlight.add(userId);
}

export function markQueryEnd(userId: number): void {
  inFlight.delete(userId);
}

// ============================================
// Cleanup (prune stale entries)
// ============================================

function cleanup(): void {
  const oneHourAgo = Date.now() - 3_600_000;

  for (const [userId, timestamps] of queryLog.entries()) {
    const recent = timestamps.filter((t) => t > oneHourAgo);
    if (recent.length === 0) {
      queryLog.delete(userId);
    } else {
      queryLog.set(userId, recent);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanup, CLEANUP_INTERVAL_MS).unref();
