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

// Actual API response structure from /tgm/token-information
export interface NansenTokenInfoResponse {
  name?: string;
  symbol?: string;
  contract_address?: string;
  logo?: string;
  token_details?: {
    token_deployment_date?: string;
    website?: string;
    market_cap_usd?: number;
    fdv_usd?: number;
    circulating_supply?: number;
    total_supply?: number;
  };
  spot_metrics?: {
    volume_total_usd?: number;
    buy_volume_usd?: number;
    sell_volume_usd?: number;
    total_buys?: number;
    total_sells?: number;
    unique_buyers?: number;
    unique_sellers?: number;
    liquidity_usd?: number;
    total_holders?: number;
  };
}

// Flattened version for internal use
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
  unique_buyers?: number;
  unique_sellers?: number;
  total_buys?: number;
  total_sells?: number;
}

export interface NansenSmartMoneyTrader {
  address: string;
  address_label: string;
  bought_token_volume: number;
  sold_token_volume: number;
  token_trade_volume: number;
  bought_volume_usd: number;
  sold_volume_usd: number;
  trade_volume_usd: number;
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
   * Flattens the nested API response into a simpler structure.
   */
  async getTokenInfo(
    chain: string,
    tokenAddress: string,
    timeframe: string = '1d'
  ): Promise<NansenTokenInfo | null> {
    try {
      const response = await this.post<{ data: NansenTokenInfoResponse }>('/tgm/token-information', {
        chain,
        token_address: tokenAddress,
        timeframe,
      });

      const raw = response.data;
      if (!raw) return null;

      const td = raw.token_details;
      const sm = raw.spot_metrics;

      // Calculate price from market cap / circulating supply
      let price: number | undefined;
      if (td?.market_cap_usd && td?.circulating_supply && td.circulating_supply > 0) {
        price = td.market_cap_usd / td.circulating_supply;
      }

      return {
        name: raw.name,
        symbol: raw.symbol,
        logo_url: raw.logo,
        deployment_date: td?.token_deployment_date,
        market_cap: td?.market_cap_usd,
        fdv: td?.fdv_usd,
        volume: sm?.volume_total_usd,
        buy_volume: sm?.buy_volume_usd,
        sell_volume: sm?.sell_volume_usd,
        liquidity: sm?.liquidity_usd,
        holder_count: sm?.total_holders,
        price,
        unique_buyers: sm?.unique_buyers,
        unique_sellers: sm?.unique_sellers,
        total_buys: sm?.total_buys,
        total_sells: sm?.total_sells,
      };
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
   * Get who bought/sold a token on DEX.
   * Uses date range (yesterday to today) for 24h window.
   */
  async getWhoBoughtSold(
    chain: string,
    tokenAddress: string,
    buyOrSell: 'BUY' | 'SELL'
  ): Promise<NansenSmartMoneyTrader[]> {
    try {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const toDate = today.toISOString().split('T')[0];
      const fromDate = yesterday.toISOString().split('T')[0];

      const response = await this.post<{ data: NansenSmartMoneyTrader[] }>('/tgm/who-bought-sold', {
        chain,
        token_address: tokenAddress,
        date: { from: fromDate, to: toDate },
        buy_or_sell: buyOrSell,
        pagination: { page: 1, per_page: 10 },
      });

      return response.data || [];
    } catch (error) {
      console.error(`[Nansen] getWhoBoughtSold (${buyOrSell}) error:`, error);
      return [];
    }
  }

  /**
   * Get top buyers and sellers for a token (parallel calls)
   */
  async getSmartMoneyBuySell(
    chain: string,
    tokenAddress: string
  ): Promise<{ buyers: NansenSmartMoneyTrader[]; sellers: NansenSmartMoneyTrader[] } | null> {
    try {
      const [buyRes, sellRes] = await Promise.allSettled([
        this.getWhoBoughtSold(chain, tokenAddress, 'BUY'),
        this.getWhoBoughtSold(chain, tokenAddress, 'SELL'),
      ]);

      const buyers = buyRes.status === 'fulfilled' ? buyRes.value : [];
      const sellers = sellRes.status === 'fulfilled' ? sellRes.value : [];
      return { buyers, sellers };
    } catch (error) {
      console.error('[Nansen] getSmartMoneyBuySell error:', error);
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
