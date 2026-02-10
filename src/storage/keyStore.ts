import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const KEYS_FILE = join(DATA_DIR, 'keys.json');

// ============================================
// Types
// ============================================

interface UserConfig {
  apiKey: string;
  dmOnly: boolean;
  queryCount: number;
  lastQueryAt?: string; // ISO timestamp
  /** Users allowed to use this key in groups: { groupId: [userId, ...] } */
  allowedUsers?: Record<string, number[]>;
}

/** Raw file format — values may be old (plain string) or new (UserConfig) */
type RawKeyMap = Record<string, string | UserConfig>;
type KeyMap = Record<string, UserConfig>;

// ============================================
// Persistence
// ============================================

function load(): KeyMap {
  try {
    const raw = readFileSync(KEYS_FILE, 'utf-8');
    const data = JSON.parse(raw) as RawKeyMap;
    return migrate(data);
  } catch {
    return {};
  }
}

/**
 * Auto-migrate old format (plain string apiKey) to new UserConfig object.
 */
function migrate(data: RawKeyMap): KeyMap {
  const result: KeyMap = {};
  let needsSave = false;

  for (const [userId, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      // Old format: just the API key string
      result[userId] = {
        apiKey: value,
        dmOnly: false,
        queryCount: 0,
      };
      needsSave = true;
    } else {
      // New format: already a UserConfig
      result[userId] = value;
    }
  }

  // Persist the migrated data
  if (needsSave) {
    save(result);
  }

  return result;
}

function save(data: KeyMap): void {
  mkdirSync(DATA_DIR, { recursive: true });
  // Atomic write: write to temp file, then rename
  const tmp = KEYS_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  renameSync(tmp, KEYS_FILE);
}

// ============================================
// API Key Management
// ============================================

export function getKey(userId: number): string | null {
  const data = load();
  return data[String(userId)]?.apiKey ?? null;
}

export function setKey(userId: number, apiKey: string): void {
  const data = load();
  const existing = data[String(userId)];

  data[String(userId)] = {
    apiKey,
    dmOnly: existing?.dmOnly ?? false,
    queryCount: existing?.queryCount ?? 0,
    lastQueryAt: existing?.lastQueryAt,
  };

  save(data);
}

export function deleteKey(userId: number): void {
  const data = load();
  delete data[String(userId)];
  save(data);
}

// ============================================
// DM-Only Mode
// ============================================

export function getDmOnly(userId: number): boolean {
  const data = load();
  return data[String(userId)]?.dmOnly ?? false;
}

export function setDmOnly(userId: number, enabled: boolean): void {
  const data = load();
  const config = data[String(userId)];
  if (!config) return; // No key set — nothing to toggle

  config.dmOnly = enabled;
  save(data);
}

// ============================================
// Usage Stats
// ============================================

export function incrementQueryCount(userId: number): void {
  const data = load();
  const config = data[String(userId)];
  if (!config) return;

  config.queryCount = (config.queryCount || 0) + 1;
  config.lastQueryAt = new Date().toISOString();
  save(data);
}

export function getStats(userId: number): { queryCount: number; lastQueryAt?: string; dmOnly: boolean } | null {
  const data = load();
  const config = data[String(userId)];
  if (!config) return null;

  return {
    queryCount: config.queryCount || 0,
    lastQueryAt: config.lastQueryAt,
    dmOnly: config.dmOnly,
  };
}

// ============================================
// Allowed Users (group access sharing)
// ============================================

/**
 * Grant a user access to use the owner's API key in a specific group.
 */
export function allowUser(ownerId: number, groupId: number, targetUserId: number): void {
  const data = load();
  const config = data[String(ownerId)];
  if (!config) return;

  if (!config.allowedUsers) config.allowedUsers = {};
  const gid = String(groupId);
  if (!config.allowedUsers[gid]) config.allowedUsers[gid] = [];

  if (!config.allowedUsers[gid].includes(targetUserId)) {
    config.allowedUsers[gid].push(targetUserId);
  }

  save(data);
}

/**
 * Revoke a user's access to the owner's API key in a specific group.
 */
export function revokeUser(ownerId: number, groupId: number, targetUserId: number): void {
  const data = load();
  const config = data[String(ownerId)];
  if (!config?.allowedUsers) return;

  const gid = String(groupId);
  const list = config.allowedUsers[gid];
  if (!list) return;

  config.allowedUsers[gid] = list.filter((id) => id !== targetUserId);
  if (config.allowedUsers[gid].length === 0) delete config.allowedUsers[gid];

  save(data);
}

/**
 * Find an API key that a user is allowed to use in a specific group.
 * Returns the owner's API key if found, null otherwise.
 */
export function findAllowedKey(userId: number, groupId: number): string | null {
  const data = load();

  for (const config of Object.values(data)) {
    const gid = String(groupId);
    if (config.allowedUsers?.[gid]?.includes(userId)) {
      return config.apiKey;
    }
  }

  return null;
}

/**
 * Get the list of allowed users for a specific group, owned by a specific user.
 */
export function getAllowedUsers(ownerId: number, groupId: number): number[] {
  const data = load();
  const config = data[String(ownerId)];
  if (!config?.allowedUsers) return [];
  return config.allowedUsers[String(groupId)] || [];
}
