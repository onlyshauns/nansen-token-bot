/**
 * Hardcoded watchlist of top tokens to scan for interesting activity.
 * Pre-resolved to avoid CoinGecko lookups on every scan cycle.
 */

import type { ResolvedToken } from '../core/types.js';

const WATCHLIST: ResolvedToken[] = [
  // Blue chips
  { name: 'Ethereum', symbol: 'ETH', chain: 'ethereum', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
  { name: 'Bitcoin', symbol: 'BTC', chain: 'ethereum', address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599' }, // WBTC
  { name: 'Solana', symbol: 'SOL', chain: 'solana', address: 'So11111111111111111111111111111111111111112' },
  { name: 'BNB', symbol: 'BNB', chain: 'bnb', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },

  // DeFi
  { name: 'Chainlink', symbol: 'LINK', chain: 'ethereum', address: '0x514910771af9ca656af840dff83e8264ecf986ca' },
  { name: 'Uniswap', symbol: 'UNI', chain: 'ethereum', address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984' },
  { name: 'Aave', symbol: 'AAVE', chain: 'ethereum', address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9' },
  { name: 'Lido DAO', symbol: 'LDO', chain: 'ethereum', address: '0x5a98fcbea516cf06857215779fd812ca3bef1b32' },
  { name: 'Maker', symbol: 'MKR', chain: 'ethereum', address: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2' },
  { name: 'Pendle', symbol: 'PENDLE', chain: 'ethereum', address: '0x808507121b80c02388fad14726482e061b8da827' },

  // L2s / Alt-L1s
  { name: 'Arbitrum', symbol: 'ARB', chain: 'arbitrum', address: '0x912ce59144191c1204e64559fe8253a0e49e6548' },
  { name: 'Optimism', symbol: 'OP', chain: 'optimism', address: '0x4200000000000000000000000000000000000042' },
  { name: 'Hyperliquid', symbol: 'HYPE', chain: 'hyperevm', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
  { name: 'Sui', symbol: 'SUI', chain: 'sui', address: '0x2::sui::SUI' },
  { name: 'Avalanche', symbol: 'AVAX', chain: 'avalanche', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },

  // Memecoins
  { name: 'Pepe', symbol: 'PEPE', chain: 'ethereum', address: '0x6982508145454ce325ddbe47a25d4ec3d2311933' },
  { name: 'Dogecoin', symbol: 'DOGE', chain: 'ethereum', address: '0x4206931337dc273a630d328da6441786bfad668f' }, // DOGE on ETH
  { name: 'dogwifhat', symbol: 'WIF', chain: 'solana', address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm' },
  { name: 'Bonk', symbol: 'BONK', chain: 'solana', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
  { name: 'Floki', symbol: 'FLOKI', chain: 'ethereum', address: '0xcf0c122c6b73ff809c693db761e7baebe62b6a2e' },

  // Trending / High volume
  { name: 'Render', symbol: 'RNDR', chain: 'ethereum', address: '0x6de037ef9ad2725eb40118bb1702ebb27e4aeb24' },
  { name: 'Virtuals Protocol', symbol: 'VIRTUAL', chain: 'base', address: '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b' },
  { name: 'Ondo Finance', symbol: 'ONDO', chain: 'ethereum', address: '0xfaba6f8e4a5e8ab82f62fe7c39859fa577269be3' },
  { name: 'Ethena', symbol: 'ENA', chain: 'ethereum', address: '0x57e114b691db790c35207b2e685d4a43181e6061' },
  { name: 'Jupiter', symbol: 'JUP', chain: 'solana', address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' },
];

export function getWatchlistTokens(): ResolvedToken[] {
  return WATCHLIST;
}
