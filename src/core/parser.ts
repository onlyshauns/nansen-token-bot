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
  blast: 'blast',
  scroll: 'scroll',
  linea: 'linea',
  mantle: 'mantle',
  ronin: 'ronin',
  sei: 'sei',
  zksync: 'zksync',
  zk: 'zksync',
  unichain: 'unichain',
  sonic: 'sonic',
  monad: 'monad',
  mon: 'monad',
  near: 'near',
  starknet: 'starknet',
  stark: 'starknet',
  sui: 'sui',
  ton: 'ton',
  hyperevm: 'hyperevm',
  plasma: 'plasma',
  iotaevm: 'iotaevm',
  iota: 'iotaevm',
};

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TRON_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

// Non-anchored versions for matching CAs anywhere in surrounding text
const EVM_ADDRESS_ANYWHERE_RE = /(?:^|\s)(0x[a-fA-F0-9]{40})(?:\s|$)/;
const SOLANA_ADDRESS_ANYWHERE_RE = /(?:^|\s)([1-9A-HJ-NP-Za-km-z]{32,44})(?:\s|$)/;
const TRON_ADDRESS_ANYWHERE_RE = /(?:^|\s)(T[1-9A-HJ-NP-Za-km-z]{33})(?:\s|$)/;

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
  // Also match $SYMBOL anywhere in the message (e.g. "tell me about $PEPE")
  if (DOLLAR_SYMBOL_RE.test(trimmed)) return true;
  // Match contract addresses anywhere in surrounding text
  if (EVM_ADDRESS_ANYWHERE_RE.test(trimmed)) return true;
  if (TRON_ADDRESS_ANYWHERE_RE.test(trimmed)) return true;
  // Solana: only match long base58 strings (32+ chars) to avoid false positives
  const solMatch = trimmed.match(SOLANA_ADDRESS_ANYWHERE_RE);
  if (solMatch && solMatch[1].length >= 32) return true;
  return false;
}

const DOLLAR_SYMBOL_RE = /\$[A-Za-z]{2,10}(?:\s|$)/;

/**
 * Extract a token query from a message that may contain surrounding text.
 * e.g. "tell me about $PEPE on solana" → "$PEPE solana"
 * Returns null if no token query found.
 */
export function extractTokenQuery(text: string): string | null {
  const trimmed = text.trim();

  // Direct queries: starts with $ or is a contract address
  if (trimmed.startsWith('$') && trimmed.length >= 2) return trimmed;
  const first = trimmed.split(/\s+/)[0];
  if (EVM_ADDRESS_RE.test(first)) return trimmed;
  if (first.length >= 32 && SOLANA_ADDRESS_RE.test(first)) return trimmed;
  if (TRON_ADDRESS_RE.test(first)) return trimmed;

  // Extract $SYMBOL from surrounding text
  const symbolMatch = trimmed.match(/(\$[A-Za-z]{2,10})/);
  if (symbolMatch) {
    const symbol = symbolMatch[1];
    // Check if there's a chain hint anywhere in the text
    const words = trimmed.split(/\s+/);
    for (const word of words) {
      const lower = word.toLowerCase().replace(/^\$/, '');
      if (CHAIN_ALIASES[lower] && `$${lower.toUpperCase()}` !== symbol.toUpperCase()) {
        return `${symbol} ${lower}`;
      }
    }
    return symbol;
  }

  // Extract contract address from surrounding text (e.g. "look up 0x6982...")
  const evmMatch = trimmed.match(EVM_ADDRESS_ANYWHERE_RE);
  if (evmMatch) {
    const ca = evmMatch[1];
    const words = trimmed.split(/\s+/);
    for (const word of words) {
      const lower = word.toLowerCase();
      if (CHAIN_ALIASES[lower] && lower !== ca.toLowerCase()) {
        return `${ca} ${lower}`;
      }
    }
    return ca;
  }

  const tronMatch = trimmed.match(TRON_ADDRESS_ANYWHERE_RE);
  if (tronMatch) return tronMatch[1];

  const solMatch = trimmed.match(SOLANA_ADDRESS_ANYWHERE_RE);
  if (solMatch && solMatch[1].length >= 32) return solMatch[1];

  return null;
}

// ============================================
// Keyword-Based Query Detection (Twitter only)
// ============================================

const KEYWORD_TRIGGERS = [
  'smart money',
  'whales',
  'whale',
  'flows',
  'flow',
  'holders',
  'buying',
  'selling',
  'accumulating',
  'dumping',
];

/** Map canonical chain name → native token symbol for keyword queries */
const CHAIN_TO_SYMBOL: Record<string, string> = {
  ethereum: 'ETH',
  solana: 'SOL',
  bnb: 'BNB',
  arbitrum: 'ARB',
  optimism: 'OP',
  polygon: 'MATIC',
  avalanche: 'AVAX',
  base: 'ETH',
  fantom: 'FTM',
  tron: 'TRX',
  sui: 'SUI',
  near: 'NEAR',
  ton: 'TON',
  hyperevm: 'HYPE',
  sei: 'SEI',
  mantle: 'MNT',
  sonic: 'S',
  monad: 'MON',
  blast: 'ETH',
  scroll: 'ETH',
  linea: 'ETH',
  zksync: 'ETH',
  unichain: 'ETH',
  ronin: 'RON',
  starknet: 'STRK',
  plasma: 'ETH',
  iotaevm: 'IOTA',
};

/**
 * Fallback for Twitter mentions that don't contain $SYMBOL or contract address.
 * Detects keyword + chain/token name combos like "smart money on Solana".
 * Returns { query, context } or null if no match.
 */
export function extractKeywordQuery(text: string): { query: string; context: string } | null {
  const lower = text.toLowerCase();

  // 1. Find a keyword trigger
  let matchedKeyword: string | null = null;
  for (const kw of KEYWORD_TRIGGERS) {
    if (lower.includes(kw)) {
      matchedKeyword = kw;
      break;
    }
  }
  if (!matchedKeyword) return null;

  // 2. Find a chain/token name in the text
  const words = lower.replace(/[^a-z0-9\s]/g, '').split(/\s+/);
  for (const word of words) {
    const chain = CHAIN_ALIASES[word];
    if (chain) {
      const symbol = CHAIN_TO_SYMBOL[chain];
      if (symbol) {
        return { query: `$${symbol}`, context: matchedKeyword };
      }
    }
  }

  return null;
}
