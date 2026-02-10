import type { NansenClient } from '../nansen/client.js';
import type { ResolvedToken, TokenReport, FlowSegment } from './types.js';
import type { NansenFlowIntelligence, NansenTokenInfo } from '../nansen/client.js';

/**
 * Build a full token report by firing parallel Nansen API calls.
 * Partial failures produce partial reports — never all-or-nothing.
 */
export async function buildTokenReport(
  token: ResolvedToken,
  nansen: NansenClient
): Promise<TokenReport> {
  // Fire all API calls in parallel
  const [tokenInfoResult, flowsResult] = await Promise.allSettled([
    nansen.getTokenInfo(token.chain, token.address, '1d'),
    nansen.getFlowIntelligence(token.chain, token.address, '1d'),
  ]);

  const tokenInfo = tokenInfoResult.status === 'fulfilled' ? tokenInfoResult.value : null;
  const flowsData = flowsResult.status === 'fulfilled' ? flowsResult.value : null;

  const report: TokenReport = {
    token,
    priceUsd: tokenInfo?.price ?? null,
    marketCapUsd: tokenInfo?.market_cap ?? null,
    fdvUsd: tokenInfo?.fdv ?? null,
    priceChange24h: tokenInfo?.price_change ?? null,
    volume24hUsd: tokenInfo?.volume ?? null,
    liquidityUsd: tokenInfo?.liquidity ?? null,
    tokenAgeDays: computeTokenAge(tokenInfo?.deployment_date ?? null),
    holderCount: tokenInfo?.holder_count ?? null,
    flows: flowsData ? extractFlows(flowsData) : [],
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
  return `https://app.nansen.ai/token/${token.chain}/${token.address}`;
}
