export interface ParsedInput {
  query: string;
  isContractAddress: boolean;
  chainHint: string | null;
  inferredChain: string | null;
}

export interface ResolvedToken {
  name: string;
  symbol: string;
  chain: string;
  address: string;
  coingeckoId?: string; // For native tokens where CoinGecko can't look up by contract
}

export interface FlowSegment {
  name: string;
  netFlowUsd: number;
  avgFlowUsd: number;
  walletCount: number;
}

export interface SmartMoneyBuySell {
  boughtVolumeUsd: number;
  soldVolumeUsd: number;
  netFlowUsd: number;
  buyerCount: number;
  sellerCount: number;
}

export interface TopTrader {
  label: string;
  volumeUsd: number;
  side: 'BUY' | 'SELL';
}

export interface SmartMoneySection {
  buySell: SmartMoneyBuySell | null;
  topBuyers: TopTrader[];
  topSellers: TopTrader[];
}

export interface TokenReport {
  token: ResolvedToken;

  // Market data
  priceUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  priceChange24h: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  tokenAgeDays: number | null;
  holderCount: number | null;

  // Holder flows
  flows: FlowSegment[];

  // Smart money
  smartMoney: SmartMoneySection;

  // Links
  nansenUrl: string;

  // Data source indicator
  dataSource: 'nansen' | 'coingecko' | 'both' | 'none';
}
