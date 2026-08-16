export interface MarketInstrument {
  id: number;
  instrument_id?: string;
  symbol: string;
  canonical_symbol?: string;
  display_name?: string;
  company_name?: string;
  asset_class?: string;
  exchange?: string;
  base_currency?: string;
  quote_currency?: string;
  trading_status?: string;
  last_price?: number;
  last_change?: number;
  last_volume?: number;
  last_updated?: string;
  volatility_score?: number;
  liquidity_score?: number;
  is_live_quote?: boolean;
}

export interface MarketUniverseResponse {
  status: string;
  instruments?: MarketInstrument[];
  data?: MarketInstrument[];
  total_count?: number;
}
