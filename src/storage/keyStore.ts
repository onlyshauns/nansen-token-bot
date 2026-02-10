import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DATA_DIR = join(process.cwd(), 'data');
const KEYS_FILE = join(DATA_DIR, 'keys.json');

type KeyMap = Record<string, string>; // userId → apiKey

function load(): KeyMap {
  try {
    const raw = readFileSync(KEYS_FILE, 'utf-8');
    return JSON.parse(raw) as KeyMap;
  } catch {
    return {};
  }
}

function save(data: KeyMap): void {
  mkdirSync(DATA_DIR, { recursive: true });
  // Atomic write: write to temp file, then rename
  const tmp = KEYS_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  renameSync(tmp, KEYS_FILE);
}

export function getKey(userId: number): string | null {
  const data = load();
  return data[String(userId)] ?? null;
}

export function setKey(userId: number, apiKey: string): void {
  const data = load();
  data[String(userId)] = apiKey;
  save(data);
}

export function deleteKey(userId: number): void {
  const data = load();
  delete data[String(userId)];
  save(data);
}
