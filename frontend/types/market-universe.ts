export interface MarketInstrument {
  id?: number;
  instrument_id: string;
  provider_symbol: string;
  canonical_symbol: string;
  display_symbol: string;
  company_name: string;
  exchange: string;
  mic: string;
  country: string;
  currency: string;
  asset_class: string;
  canonical_asset_class?: string;
  instrument_type: string;
  underlying_id?: string;
  underlying_symbol?: string;
  series?: string;
  isin?: string;
  lot_size: number;
  tick_size: number;
  contract_size: number;
  price_multiplier: number;
  expiry?: string;
  option_type?: string;
  strike?: number;
  segment: string;
  market_status: string;
  tradability: string;
  data_status: string;
  data_source: string;
  broker_symbol_mappings?: Record<string, string> | string;
  contract_status: string;
  paper_enabled: number | boolean;
  live_enabled: number | boolean;
  strategy_enabled: number | boolean;
  last_price: number;
  change_24h: number;
  volume_24h: number;
  open_interest?: number;
  oi_change?: number;
  implied_volatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  volatility_score: number;
  volatility_category: "Low" | "Medium" | "High" | "Extreme";
  momentum_score: number;
  directional_bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  is_swing_candidate: number | boolean;
  is_scalping_candidate: number | boolean;
  is_hedge_candidate: number | boolean;
  created_at?: string;
  updated_at?: string;
  active_from?: string;
  active_to?: string;

  // Backwards compatibility legacy fields
  symbol?: string;
  display_name?: string;
  watch_enabled?: boolean;
  last_change?: number;
  last_volume?: number;
}

export interface UniverseSummaryStats {
  total_instruments: number;
  indian_stocks: number;
  indices: number;
  global_stocks: number;
  crypto: number;
  forex: number;
  commodities: number;
  futures: number;
  options: number;
  high_volatility: number;
  nse_total: number;
  bse_total: number;
  paper_enabled: number;
  live_enabled: number;
  tradable: number;
}

export interface MarketUniverseResponse {
  status: string;
  total?: number;
  limit?: number;
  offset?: number;
  instruments?: MarketInstrument[];
  data?: MarketInstrument[];
  stats?: UniverseSummaryStats;
  total_count?: number;
}

export interface OptionLegData extends MarketInstrument {
  call_premium?: number;
  put_premium?: number;
}

export interface OptionStrike {
  strike: number;
  call: OptionLegData | null;
  put: OptionLegData | null;
}

export interface OptionChainData {
  underlying: string;
  spot_price: number;
  selected_expiry: string;
  available_expiries: string[];
  strikes: OptionStrike[];
}

export interface FuturesContract extends MarketInstrument {
  basis: number;
  spot_price: number;
  days_to_expiry: number;
}

export interface ProviderHealth {
  provider_id: string;
  name: string;
  status: "CONNECTED" | "DEGRADED" | "LIMITED" | "DISCONNECTED";
  latency_ms: number;
  instrument_count: number;
  last_sync: string;
  last_quote_at?: string;
  last_error?: string;
  coverage: string;
  realtime_capable: boolean;
  historical_capable: boolean;
  entitlement_status: string;
}

export interface StrategyPermission {
  id?: number;
  bot_id: string;
  asset_class: string;
  strategy_name: string;
  is_allowed: number | boolean;
  restriction_reason?: string;
  updated_at?: string;
}

export interface UserWatchlistItem extends MarketInstrument {
  notes?: string;
  added_at?: string;
}

export interface UserWatchlist {
  id: string;
  watchlist_id?: string;
  name: string;
  description: string;
  is_default: number | boolean;
  items: UserWatchlistItem[];
  items_count?: number;
}

export interface MarketIntelligenceResponse {
  top_volatility: MarketInstrument[];
  top_momentum: MarketInstrument[];
  top_bullish: MarketInstrument[];
  top_bearish: MarketInstrument[];
  top_swing: MarketInstrument[];
  top_scalping: MarketInstrument[];
  top_hedging: MarketInstrument[];
  generated_at?: string;
}
