/**
 * Persistent state for the Twitter bot.
 * Stores last mention ID and recent tweet history for deduplication.
 * Uses the same atomic-write pattern as keyStore.ts.
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const STATE_FILE = join(DATA_DIR, 'twitter-state.json');

// ============================================
// Types
// ============================================

interface RecentTweet {
  symbol: string;
  tweetedAt: string; // ISO timestamp
}

interface TwitterState {
  lastMentionId: string | null;
  lastScanAt: string | null;
  recentTweets: RecentTweet[];
}

// ============================================
// Persistence
// ============================================

function load(): TwitterState {
  try {
    const raw = readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(raw) as TwitterState;
  } catch {
    return { lastMentionId: null, lastScanAt: null, recentTweets: [] };
  }
}

function save(state: TwitterState): void {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = STATE_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
  renameSync(tmp, STATE_FILE);
}

// ============================================
// Last Mention ID
// ============================================

export function getLastMentionId(): string | null {
  return load().lastMentionId;
}

export function setLastMentionId(id: string): void {
  const state = load();
  state.lastMentionId = id;
  save(state);
}

// ============================================
// Scan Timestamp
// ============================================

export function getLastScanAt(): string | null {
  return load().lastScanAt;
}

export function setLastScanAt(iso: string): void {
  const state = load();
  state.lastScanAt = iso;
  save(state);
}

// ============================================
// Recent Tweet Deduplication
// ============================================

const DEDUP_HOURS = 12;

/**
 * Check if we've tweeted about this token recently.
 */
export function wasRecentlyTweeted(symbol: string): boolean {
  const state = load();
  const cutoff = Date.now() - DEDUP_HOURS * 60 * 60 * 1000;

  return state.recentTweets.some(
    (t) => t.symbol.toUpperCase() === symbol.toUpperCase() && new Date(t.tweetedAt).getTime() > cutoff
  );
}

/**
 * Record that we tweeted about a token.
 */
export function recordTweet(symbol: string): void {
  const state = load();
  const cutoff = Date.now() - DEDUP_HOURS * 60 * 60 * 1000;

  // Prune old entries while adding new one
  state.recentTweets = state.recentTweets.filter(
    (t) => new Date(t.tweetedAt).getTime() > cutoff
  );
  state.recentTweets.push({ symbol: symbol.toUpperCase(), tweetedAt: new Date().toISOString() });
  save(state);
}
