export interface NansenFlowIntelligence {
  whale_net_flow_usd: number;
  whale_avg_flow_usd: number;
  whale_wallet_count: number;
  smart_trader_net_flow_usd: number;
  smart_trader_avg_flow_usd: number;
  smart_trader_wallet_count: number;
  public_figure_net_flow_usd: number;
  public_figure_avg_flow_usd: number;
  public_figure_wallet_count: number;
  top_pnl_net_flow_usd: number;
  top_pnl_avg_flow_usd: number;
  top_pnl_wallet_count: number;
  exchange_net_flow_usd: number;
  exchange_avg_flow_usd: number;
  exchange_wallet_count: number;
  fresh_wallets_net_flow_usd: number;
  fresh_wallets_avg_flow_usd: number;
  fresh_wallets_wallet_count: number;
}

export interface NansenTokenInfo {
  name?: string;
  symbol?: string;
  logo_url?: string;
  deployment_date?: string;
  market_cap?: number;
  fdv?: number;
  volume?: number;
  buy_volume?: number;
  sell_volume?: number;
  liquidity?: number;
  holder_count?: number;
  price?: number;
  price_change?: number;
  unique_traders?: number;
}

export interface NansenScreenerItem {
  token_address: string;
  token_symbol: string;
  chain: string;
  price_usd: number;
  price_change: number;
  market_cap_usd: number;
  volume: number;
  netflow: number;
  liquidity: number;
  fdv: number;
  token_age_days: number;
  sectors: string[];
  buy_volume: number;
  sell_volume: number;
}

export class NansenClient {
  private baseUrl = 'https://api.nansen.ai/api/v1';
  private apiKey: string;
  private maxRetries = 3;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Get token information (name, price, market cap, volume, etc.)
   */
  async getTokenInfo(
    chain: string,
    tokenAddress: string,
    timeframe: string = '1d'
  ): Promise<NansenTokenInfo | null> {
    try {
      const response = await this.post<{ data: NansenTokenInfo }>('/tgm/token-information', {
        chain,
        token_address: tokenAddress,
        timeframe,
      });
      return response.data || null;
    } catch (error) {
      console.error('[Nansen] getTokenInfo error:', error);
      return null;
    }
  }

  /**
   * Get flow intelligence (whale, smart money, exchange flows)
   */
  async getFlowIntelligence(
    chain: string,
    tokenAddress: string,
    timeframe: string = '1d'
  ): Promise<NansenFlowIntelligence | null> {
    try {
      const response = await this.post<{ data: NansenFlowIntelligence[] }>(
        '/tgm/flow-intelligence',
        {
          chain,
          token_address: tokenAddress,
          timeframe,
        }
      );
      return response.data?.[0] || null;
    } catch (error) {
      console.error('[Nansen] getFlowIntelligence error:', error);
      return null;
    }
  }

  /**
   * Get token screener data for a specific token.
   * Since the screener returns a list, we filter for our target address.
   */
  async getScreenerForToken(
    chain: string,
    tokenAddress: string
  ): Promise<NansenScreenerItem | null> {
    try {
      const response = await this.post<{ data: NansenScreenerItem[] }>(
        '/token-screener',
        {
          chains: [chain],
          timeframe: '24h',
          filters: {
            volume: { min: 0 },
            liquidity: { min: 0 },
          },
          pagination: { page: 1, per_page: 25 },
          order_by: [{ field: 'volume', direction: 'DESC' }],
        }
      );

      // Find our token in the results
      const normalizedTarget = tokenAddress.toLowerCase();
      const match = (response.data || []).find(
        (item) => item.token_address?.toLowerCase() === normalizedTarget
      );
      return match || null;
    } catch (error) {
      console.error('[Nansen] getScreenerForToken error:', error);
      return null;
    }
  }

  private async post<T>(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<T> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.apiKey,
          },
          body: JSON.stringify(body),
        });

        if (response.status === 429) {
          const backoff = Math.pow(2, attempt) * 1000;
          console.warn(`[Nansen] Rate limited, retrying in ${backoff}ms`);
          await this.sleep(backoff);
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Nansen API ${response.status}: ${errorText.slice(0, 200)}`);
        }

        return (await response.json()) as T;
      } catch (error) {
        if (attempt === this.maxRetries - 1) throw error;
        await this.sleep(1000 * (attempt + 1));
      }
    }

    throw new Error('Max retries exceeded');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
