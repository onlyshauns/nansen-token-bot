import type { NansenClient } from '../nansen/client.js';
import type { ResolvedToken, TokenReport, FlowSegment, SmartMoneyBuySell, TopTrader, SmartMoneySection } from './types.js';
import type { NansenFlowIntelligence, NansenTokenInfo, NansenSmartMoneyTrader } from '../nansen/client.js';

/**
 * Fetch 24h price change from CoinGecko (free, no key).
 */
async function fetchPriceChange(chain: string, address: string): Promise<number | null> {
  try {
    const platformMap: Record<string, string> = {
      ethereum: 'ethereum',
      solana: 'solana',
      base: 'base',
      bnb: 'binance-smart-chain',
      arbitrum: 'arbitrum-one',
      polygon: 'polygon-pos',
      optimism: 'optimistic-ethereum',
      avalanche: 'avalanche',
    };
    const platform = platformMap[chain];
    if (!platform) return null;

    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${address}&vs_currencies=usd&include_24hr_change=true`
    );
    if (!res.ok) return null;

    const data = await res.json() as Record<string, { usd_24h_change?: number }>;
    const entry = data[address.toLowerCase()];
    return entry?.usd_24h_change ?? null;
  } catch {
    return null;
  }
}

/**
 * Build a full token report by firing parallel Nansen API calls.
 * Partial failures produce partial reports — never all-or-nothing.
 */
export async function buildTokenReport(
  token: ResolvedToken,
  nansen: NansenClient
): Promise<TokenReport> {
  // Fire all API calls in parallel (including CoinGecko for price change)
  const [tokenInfoResult, flowsResult, smartMoneyResult, priceChangeResult] = await Promise.allSettled([
    nansen.getTokenInfo(token.chain, token.address, '1d'),
    nansen.getFlowIntelligence(token.chain, token.address, '1d'),
    nansen.getSmartMoneyBuySell(token.chain, token.address),
    fetchPriceChange(token.chain, token.address),
  ]);

  const tokenInfo = tokenInfoResult.status === 'fulfilled' ? tokenInfoResult.value : null;
  const flowsData = flowsResult.status === 'fulfilled' ? flowsResult.value : null;
  const smartMoneyData = smartMoneyResult.status === 'fulfilled' ? smartMoneyResult.value : null;
  const priceChange = priceChangeResult.status === 'fulfilled' ? priceChangeResult.value : null;

  const report: TokenReport = {
    token,
    priceUsd: tokenInfo?.price ?? null,
    marketCapUsd: tokenInfo?.market_cap ?? null,
    fdvUsd: tokenInfo?.fdv ?? null,
    priceChange24h: priceChange,
    volume24hUsd: tokenInfo?.volume ?? null,
    liquidityUsd: tokenInfo?.liquidity ?? null,
    tokenAgeDays: computeTokenAge(tokenInfo?.deployment_date ?? null),
    holderCount: tokenInfo?.holder_count ?? null,
    flows: flowsData ? extractFlows(flowsData) : [],
    smartMoney: buildSmartMoneySection(smartMoneyData),
    nansenUrl: buildNansenUrl(token),
  };

  // If token info returned name/symbol, update from Nansen's data
  if (tokenInfo?.name && token.name === 'Unknown Token') {
    report.token = { ...token, name: tokenInfo.name };
  }
  if (tokenInfo?.symbol) {
    report.token = { ...report.token, symbol: tokenInfo.symbol.toUpperCase() };
  }

  return report;
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
