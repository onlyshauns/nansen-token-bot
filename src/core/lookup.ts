import type { NansenClient } from '../nansen/client.js';
import type { ResolvedToken, TokenReport, FlowSegment, SmartMoneyBuySell, TopTrader, SmartMoneySection } from './types.js';
import type { NansenFlowIntelligence, NansenTokenInfo, NansenSmartMoneyTrader } from '../nansen/client.js';

// Map Nansen chain names → CoinGecko platform IDs
const CHAIN_TO_CG_PLATFORM: Record<string, string> = {
  ethereum: 'ethereum',
  solana: 'solana',
  base: 'base',
  bnb: 'binance-smart-chain',
  arbitrum: 'arbitrum-one',
  polygon: 'polygon-pos',
  optimism: 'optimistic-ethereum',
  avalanche: 'avalanche',
  tron: 'tron',
  fantom: 'fantom',
  blast: 'blast',
  scroll: 'scroll',
  linea: 'linea',
  mantle: 'mantle',
  ronin: 'ronin',
  sei: 'sei-v2',
  zksync: 'zksync',
  unichain: 'unichain',
  sonic: 'sonic',
  iotaevm: 'iota-evm',
  hyperevm: 'hyperevm',
  near: 'near-protocol',
  starknet: 'starknet',
  sui: 'sui',
  ton: 'the-open-network',
  plasma: 'plasma',
  monad: 'monad',
};

interface CoinGeckoMarketData {
  priceUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  volume24hUsd: number | null;
  priceChange24h: number | null;
}

/**
 * Well-known native token addresses → CoinGecko coin IDs.
 * Handles tokens that come from watchlist/external sources without coingeckoId set.
 */
const NATIVE_CG_IDS: Record<string, string> = {
  'ethereum:0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': 'ethereum',
  'ethereum:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'bitcoin',       // WBTC
  'solana:So11111111111111111111111111111111111111112': 'solana',
  'bnb:0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': 'binancecoin',
  'avalanche:0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': 'avalanche-2',
  'polygon:0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': 'matic-network',
  'fantom:0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': 'fantom',
  'hyperevm:0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': 'hyperliquid',
  'tron:0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': 'tron',
  'mantle:0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': 'mantle',
  'sonic:0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': 'sonic-3',
  'sei:0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': 'sei-network',
  'monad:0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': 'monad',
  'ton:0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': 'the-open-network',
  'sui:0x2::sui::SUI': 'sui',
  'sui:0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI': 'sui',
  'near:wrap.near': 'near',
};

/**
 * Fetch market data from CoinGecko for a token.
 * For native tokens with a coingeckoId, uses the /simple/price endpoint (by coin ID).
 * For contract tokens, uses the /simple/token_price endpoint (by address).
 */
async function fetchCoinGeckoData(
  token: ResolvedToken
): Promise<CoinGeckoMarketData | null> {
  // Check explicit coingeckoId first, then fallback to well-known native addresses
  const cgId = token.coingeckoId || NATIVE_CG_IDS[`${token.chain}:${token.address}`];
  if (cgId) {
    return fetchCoinGeckoByCoinId(cgId);
  }

  // Otherwise look up by contract address on the chain's platform
  return fetchCoinGeckoByContract(token.chain, token.address);
}

/**
 * Fetch market data by CoinGecko coin ID (for native tokens like ETH, BTC, HYPE).
 */
async function fetchCoinGeckoByCoinId(coinId: string): Promise<CoinGeckoMarketData | null> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}` +
      `&vs_currencies=usd` +
      `&include_market_cap=true` +
      `&include_24hr_vol=true` +
      `&include_24hr_change=true`
    );
    if (!res.ok) return null;

    const data = await res.json() as Record<string, {
      usd?: number;
      usd_market_cap?: number;
      usd_24h_vol?: number;
      usd_24h_change?: number;
    }>;
    const entry = data[coinId];
    if (entry && entry.usd) {
      return {
        priceUsd: entry.usd ?? null,
        marketCapUsd: entry.usd_market_cap && entry.usd_market_cap > 0 ? entry.usd_market_cap : null,
        fdvUsd: null,
        volume24hUsd: entry.usd_24h_vol && entry.usd_24h_vol > 0 ? entry.usd_24h_vol : null,
        priceChange24h: entry.usd_24h_change ?? null,
      };
    }
  } catch { /* fall through */ }
  return null;
}

/**
 * Fetch market data by contract address on a CoinGecko platform.
 * Tries the simple endpoint first (fast), then the detailed endpoint (FDV, etc.)
 */
async function fetchCoinGeckoByContract(
  chain: string,
  address: string
): Promise<CoinGeckoMarketData | null> {
  const platform = CHAIN_TO_CG_PLATFORM[chain];
  if (!platform) return null;

  // Try simple endpoint first (faster, gives price + mcap + volume + 24h change)
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/${platform}` +
      `?contract_addresses=${address.toLowerCase()}` +
      `&vs_currencies=usd` +
      `&include_market_cap=true` +
      `&include_24hr_vol=true` +
      `&include_24hr_change=true`
    );
    if (res.ok) {
      const data = await res.json() as Record<string, {
        usd?: number;
        usd_market_cap?: number;
        usd_24h_vol?: number;
        usd_24h_change?: number;
      }>;
      const entry = data[address.toLowerCase()];
      if (entry && entry.usd) {
        return {
          priceUsd: entry.usd ?? null,
          marketCapUsd: entry.usd_market_cap && entry.usd_market_cap > 0 ? entry.usd_market_cap : null,
          fdvUsd: null, // simple endpoint doesn't return FDV
          volume24hUsd: entry.usd_24h_vol && entry.usd_24h_vol > 0 ? entry.usd_24h_vol : null,
          priceChange24h: entry.usd_24h_change ?? null,
        };
      }
    }
  } catch { /* fall through to detailed endpoint */ }

  // Try detailed endpoint (slower, but returns FDV + more)
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${platform}/contract/${address.toLowerCase()}`
    );
    if (!res.ok) return null;

    const data = await res.json() as {
      market_data?: {
        current_price?: { usd?: number };
        market_cap?: { usd?: number };
        fully_diluted_valuation?: { usd?: number };
        total_volume?: { usd?: number };
        price_change_percentage_24h?: number;
      };
    };
    const md = data.market_data;
    if (!md) return null;

    return {
      priceUsd: md.current_price?.usd ?? null,
      marketCapUsd: md.market_cap?.usd ?? null,
      fdvUsd: md.fully_diluted_valuation?.usd ?? null,
      volume24hUsd: md.total_volume?.usd ?? null,
      priceChange24h: md.price_change_percentage_24h ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Build a full token report by firing parallel Nansen + CoinGecko API calls.
 * CoinGecko provides baseline price/market data; Nansen provides analytics.
 * Partial failures produce partial reports — never all-or-nothing.
 */
export async function buildTokenReport(
  token: ResolvedToken,
  nansen: NansenClient
): Promise<TokenReport> {
  // Fire ALL API calls in parallel: Nansen (analytics) + CoinGecko (market data)
  const [tokenInfoResult, flowsResult, smartMoneyResult, cgResult] = await Promise.allSettled([
    nansen.getTokenInfo(token.chain, token.address, '1d'),
    nansen.getFlowIntelligence(token.chain, token.address, '1d'),
    nansen.getSmartMoneyBuySell(token.chain, token.address),
    fetchCoinGeckoData(token),
  ]);

  const tokenInfo = tokenInfoResult.status === 'fulfilled' ? tokenInfoResult.value : null;
  const flowsData = flowsResult.status === 'fulfilled' ? flowsResult.value : null;
  const smartMoneyData = smartMoneyResult.status === 'fulfilled' ? smartMoneyResult.value : null;
  const cgData = cgResult.status === 'fulfilled' ? cgResult.value : null;

  // Use Nansen data first, fall back to CoinGecko for any gaps
  const report: TokenReport = {
    token,
    priceUsd: tokenInfo?.price ?? cgData?.priceUsd ?? null,
    marketCapUsd: tokenInfo?.market_cap ?? cgData?.marketCapUsd ?? null,
    fdvUsd: tokenInfo?.fdv ?? cgData?.fdvUsd ?? null,
    priceChange24h: cgData?.priceChange24h ?? null,
    volume24hUsd: tokenInfo?.volume ?? cgData?.volume24hUsd ?? null,
    liquidityUsd: tokenInfo?.liquidity ?? null,
    tokenAgeDays: computeTokenAge(tokenInfo?.deployment_date ?? null),
    holderCount: tokenInfo?.holder_count ?? null,
    flows: flowsData ? extractFlows(flowsData) : [],
    smartMoney: buildSmartMoneySection(smartMoneyData),
    nansenUrl: buildNansenUrl(token),
    dataSource: determineDataSource(tokenInfo, cgData),
  };

  // If token info returned name/symbol, update from Nansen's data
  // Also update if current name is just the symbol (from Nansen screener fallback)
  if (tokenInfo?.name && (token.name === 'Unknown Token' || token.name === token.symbol)) {
    report.token = { ...token, name: tokenInfo.name };
  }
  if (tokenInfo?.symbol) {
    report.token = { ...report.token, symbol: tokenInfo.symbol.toUpperCase() };
  }

  return report;
}

/**
 * Determine which data source(s) contributed to the report.
 */
function determineDataSource(
  nansen: NansenTokenInfo | null,
  cg: CoinGeckoMarketData | null
): 'nansen' | 'coingecko' | 'both' | 'none' {
  const hasNansen = nansen !== null && (nansen.price != null || nansen.market_cap != null);
  const hasCG = cg !== null && (cg.priceUsd != null || cg.marketCapUsd != null);
  if (hasNansen && hasCG) return 'both';
  if (hasNansen) return 'nansen';
  if (hasCG) return 'coingecko';
  return 'none';
}

function buildSmartMoneySection(
  data: { buyers: NansenSmartMoneyTrader[]; sellers: NansenSmartMoneyTrader[] } | null
): SmartMoneySection {
  if (!data) {
    return { buySell: null, topBuyers: [], topSellers: [] };
  }

  const boughtVolumeUsd = data.buyers.reduce((sum, t) => sum + (t.bought_volume_usd || 0), 0);
  const soldVolumeUsd = data.sellers.reduce((sum, t) => sum + (t.sold_volume_usd || 0), 0);

  const buySell: SmartMoneyBuySell = {
    boughtVolumeUsd,
    soldVolumeUsd,
    netFlowUsd: boughtVolumeUsd - soldVolumeUsd,
    buyerCount: data.buyers.filter(b => b.bought_volume_usd > 0).length,
    sellerCount: data.sellers.filter(s => s.sold_volume_usd > 0).length,
  };

  // Top 3 buyers by USD volume
  const topBuyers: TopTrader[] = data.buyers
    .filter(b => b.bought_volume_usd > 0)
    .sort((a, b) => b.bought_volume_usd - a.bought_volume_usd)
    .slice(0, 3)
    .map(t => ({
      label: t.address_label || shortenAddress(t.address),
      volumeUsd: t.bought_volume_usd,
      side: 'BUY' as const,
    }));

  // Top 3 sellers by USD volume
  const topSellers: TopTrader[] = data.sellers
    .filter(s => s.sold_volume_usd > 0)
    .sort((a, b) => b.sold_volume_usd - a.sold_volume_usd)
    .slice(0, 3)
    .map(t => ({
      label: t.address_label || shortenAddress(t.address),
      volumeUsd: t.sold_volume_usd,
      side: 'SELL' as const,
    }));

  return { buySell, topBuyers, topSellers };
}

function shortenAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function extractFlows(data: NansenFlowIntelligence): FlowSegment[] {
  return [
    {
      name: 'Smart Traders',
      netFlowUsd: data.smart_trader_net_flow_usd,
      avgFlowUsd: data.smart_trader_avg_flow_usd,
      walletCount: data.smart_trader_wallet_count,
    },
    {
      name: 'Whales',
      netFlowUsd: data.whale_net_flow_usd,
      avgFlowUsd: data.whale_avg_flow_usd,
      walletCount: data.whale_wallet_count,
    },
    {
      name: 'Public Figures',
      netFlowUsd: data.public_figure_net_flow_usd,
      avgFlowUsd: data.public_figure_avg_flow_usd,
      walletCount: data.public_figure_wallet_count,
    },
    {
      name: 'Exchanges',
      netFlowUsd: data.exchange_net_flow_usd,
      avgFlowUsd: data.exchange_avg_flow_usd,
      walletCount: data.exchange_wallet_count,
    },
    {
      name: 'Top PnL Traders',
      netFlowUsd: data.top_pnl_net_flow_usd,
      avgFlowUsd: data.top_pnl_avg_flow_usd,
      walletCount: data.top_pnl_wallet_count,
    },
    {
      name: 'Fresh Wallets',
      netFlowUsd: data.fresh_wallets_net_flow_usd,
      avgFlowUsd: data.fresh_wallets_avg_flow_usd,
      walletCount: data.fresh_wallets_wallet_count,
    },
  ];
}

function computeTokenAge(deploymentDate: string | null): number | null {
  if (!deploymentDate) return null;
  const deployed = new Date(deploymentDate);
  if (isNaN(deployed.getTime())) return null;
  const diffMs = Date.now() - deployed.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function buildNansenUrl(token: ResolvedToken): string {
  return `https://app.nansen.ai/token-god-mode?tokenAddress=${token.address}&chain=${token.chain}`;
}
