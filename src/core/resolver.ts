import type { ParsedInput, ResolvedToken } from './types.js';

interface CoinGeckoSearchResult {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank: number | null;
  platforms?: Record<string, string>;
}

interface CoinGeckoPlatformDetail {
  decimal_place: number;
  contract_address: string;
}

// Map CoinGecko platform IDs to Nansen chain names
const PLATFORM_TO_CHAIN: Record<string, string> = {
  ethereum: 'ethereum',
  'binance-smart-chain': 'bnb',
  solana: 'solana',
  'arbitrum-one': 'arbitrum',
  'polygon-pos': 'polygon',
  'optimistic-ethereum': 'optimism',
  avalanche: 'avalanche',
  base: 'base',
  tron: 'tron',
  fantom: 'fantom',
};

const CHAIN_TO_PLATFORM: Record<string, string> = Object.fromEntries(
  Object.entries(PLATFORM_TO_CHAIN).map(([k, v]) => [v, k])
);

/**
 * Resolve a parsed user input to a concrete token with chain + address.
 * Uses CoinGecko search API (free, no key needed) for symbol lookups.
 * For contract addresses, uses CoinGecko contract lookup.
 */
export async function resolveToken(parsed: ParsedInput): Promise<ResolvedToken> {
  if (parsed.isContractAddress) {
    return resolveByAddress(parsed);
  }
  return resolveBySymbol(parsed);
}

async function resolveBySymbol(parsed: ParsedInput): Promise<ResolvedToken> {
  // Search CoinGecko for the symbol
  const res = await fetch(
    `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(parsed.query)}`
  );
  if (!res.ok) throw new Error(`CoinGecko search failed: ${res.status}`);

  const data = await res.json() as { coins: CoinGeckoSearchResult[] };
  const coins = data.coins || [];

  if (coins.length === 0) {
    throw new Error(`No token found matching "${parsed.query}"`);
  }

  // Filter to exact symbol matches (case-insensitive)
  const exactMatches = coins.filter(
    (c) => c.symbol.toUpperCase() === parsed.query.toUpperCase()
  );
  const candidates = exactMatches.length > 0 ? exactMatches : coins.slice(0, 5);

  // Pick the one with the best market cap rank (lowest number = highest cap)
  candidates.sort((a, b) => (a.market_cap_rank ?? 9999) - (b.market_cap_rank ?? 9999));

  // Now get the full coin data to find contract addresses
  for (const coin of candidates) {
    try {
      const detail = await getCoinDetail(coin.id);
      if (!detail) continue;

      const chain = parsed.chainHint || parsed.inferredChain;

      if (chain) {
        // User specified a chain — find the address on that chain
        const platformKey = CHAIN_TO_PLATFORM[chain];
        const addr = detail.platforms?.[platformKey] ||
          detail.detail_platforms?.[platformKey]?.contract_address;
        if (addr) {
          return {
            name: detail.name,
            symbol: detail.symbol.toUpperCase(),
            chain,
            address: addr,
          };
        }
        // Chain specified but no address on that chain — keep searching
        continue;
      }

      // No chain specified — pick the first available platform we support
      // Prefer ethereum > solana > base > bnb > arbitrum > others
      const preferredOrder = ['ethereum', 'solana', 'base', 'bnb', 'arbitrum', 'polygon', 'optimism', 'avalanche'];
      for (const preferred of preferredOrder) {
        const platKey = CHAIN_TO_PLATFORM[preferred];
        if (!platKey) continue;
        const addr = detail.platforms?.[platKey] ||
          detail.detail_platforms?.[platKey]?.contract_address;
        if (addr) {
          return {
            name: detail.name,
            symbol: detail.symbol.toUpperCase(),
            chain: preferred,
            address: addr,
          };
        }
      }

      // Fallback: any platform we recognize
      for (const [platKey, chainName] of Object.entries(PLATFORM_TO_CHAIN)) {
        const addr = detail.platforms?.[platKey] ||
          detail.detail_platforms?.[platKey]?.contract_address;
        if (addr) {
          return {
            name: detail.name,
            symbol: detail.symbol.toUpperCase(),
            chain: chainName,
            address: addr,
          };
        }
      }
    } catch {
      continue;
    }
  }

  throw new Error(
    `Found "${parsed.query}" but no contract address on supported chains. ` +
    `Try providing the contract address directly.`
  );
}

async function resolveByAddress(parsed: ParsedInput): Promise<ResolvedToken> {
  const chain = parsed.chainHint || parsed.inferredChain;

  // For EVM addresses, try common chains
  const chainsToTry = chain
    ? [chain]
    : ['ethereum', 'base', 'arbitrum', 'polygon', 'optimism', 'bnb', 'avalanche'];

  for (const tryChain of chainsToTry) {
    const platKey = CHAIN_TO_PLATFORM[tryChain];
    if (!platKey) continue;

    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/${platKey}/contract/${parsed.query.toLowerCase()}`
      );
      if (!res.ok) continue;

      const data = await res.json() as { name: string; symbol: string };
      return {
        name: data.name,
        symbol: data.symbol.toUpperCase(),
        chain: tryChain,
        address: parsed.query,
      };
    } catch {
      continue;
    }
  }

  // If CoinGecko doesn't know it, still return with what we have
  // The Nansen API might still work with the address
  return {
    name: 'Unknown Token',
    symbol: '???',
    chain: chain || 'ethereum',
    address: parsed.query,
  };
}

interface CoinDetail {
  name: string;
  symbol: string;
  platforms?: Record<string, string>;
  detail_platforms?: Record<string, CoinGeckoPlatformDetail>;
}

async function getCoinDetail(coinId: string): Promise<CoinDetail | null> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`
    );
    if (!res.ok) return null;
    return await res.json() as CoinDetail;
  } catch {
    return null;
  }
}
