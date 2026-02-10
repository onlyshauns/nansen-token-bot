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
}

export interface FlowSegment {
  name: string;
  netFlowUsd: number;
  avgFlowUsd: number;
  walletCount: number;
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

  // Links
  nansenUrl: string;
}
