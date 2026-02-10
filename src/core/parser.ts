import type { ParsedInput } from './types.js';

const CHAIN_ALIASES: Record<string, string> = {
  eth: 'ethereum',
  ethereum: 'ethereum',
  sol: 'solana',
  solana: 'solana',
  bsc: 'bnb',
  bnb: 'bnb',
  binance: 'bnb',
  base: 'base',
  arb: 'arbitrum',
  arbitrum: 'arbitrum',
  poly: 'polygon',
  polygon: 'polygon',
  avax: 'avalanche',
  avalanche: 'avalanche',
  op: 'optimism',
  optimism: 'optimism',
  tron: 'tron',
  fantom: 'fantom',
  ftm: 'fantom',
};

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TRON_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export function parseUserInput(raw: string): ParsedInput | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/);
  let query = parts[0];
  let chainHint: string | null = null;

  // Strip $ prefix from query
  if (query.startsWith('$')) {
    query = query.slice(1);
  }

  if (!query) return null;

  // Check remaining parts for chain hint
  for (let i = 1; i < parts.length; i++) {
    let part = parts[i].toLowerCase();
    if (part.startsWith('$')) part = part.slice(1);
    if (CHAIN_ALIASES[part]) {
      chainHint = CHAIN_ALIASES[part];
      break;
    }
  }

  // Detect contract address format
  if (EVM_ADDRESS_RE.test(query)) {
    return {
      query,
      isContractAddress: true,
      chainHint,
      inferredChain: null, // Could be any EVM chain
    };
  }

  if (TRON_ADDRESS_RE.test(query)) {
    return {
      query,
      isContractAddress: true,
      chainHint,
      inferredChain: 'tron',
    };
  }

  // Solana addresses are base58, 32-44 chars
  // Symbols are typically 2-10 chars — use length to disambiguate
  if (query.length >= 32 && SOLANA_ADDRESS_RE.test(query)) {
    return {
      query,
      isContractAddress: true,
      chainHint,
      inferredChain: 'solana',
    };
  }

  // It's a symbol
  return {
    query: query.toUpperCase(),
    isContractAddress: false,
    chainHint,
    inferredChain: null,
  };
}

/**
 * Check if a raw message looks like a token query we should respond to.
 * Matches: $SYMBOL, 0x... addresses, long base58 strings
 */
export function isTokenQuery(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.startsWith('$') && trimmed.length >= 2) return true;
  if (EVM_ADDRESS_RE.test(trimmed.split(/\s+/)[0])) return true;
  const first = trimmed.split(/\s+/)[0];
  if (first.length >= 32 && SOLANA_ADDRESS_RE.test(first)) return true;
  if (TRON_ADDRESS_RE.test(first)) return true;
  return false;
}
