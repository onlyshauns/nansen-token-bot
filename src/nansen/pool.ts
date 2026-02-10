import { NansenClient } from './client.js';

const clients = new Map<string, NansenClient>();

/**
 * Get or create a NansenClient for a given API key.
 * Caches by key so multiple users with the same key share one client.
 */
export function getClient(apiKey: string): NansenClient {
  let client = clients.get(apiKey);
  if (!client) {
    client = new NansenClient(apiKey);
    clients.set(apiKey, client);
  }
  return client;
}

/**
 * Validate a Nansen API key by making a lightweight test call.
 * Returns true if the key works, false otherwise.
 */
export async function validateKey(apiKey: string): Promise<boolean> {
  try {
    const client = new NansenClient(apiKey);
    // Quick test: fetch USDT info on Ethereum (known to exist)
    const result = await client.getTokenInfo(
      'ethereum',
      '0xdac17f958d2ee523a2206206994597c13d831ec7',
      '1d'
    );
    return result !== null;
  } catch {
    return false;
  }
}
