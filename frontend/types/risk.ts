export interface ActiveRiskLimits {
  max_daily_loss_pct?: number;
  max_portfolio_risk_pct?: number;
  max_single_trade_risk_pct?: number;
  max_leverage?: number;
  max_symbol_concentration_pct?: number;
  max_asset_class_concentration_pct?: number;
  drawdown_halt_threshold_pct?: number;
  circuit_breaker_cooldown_mins?: number;
  max_daily_loss?: number;
  max_position_size?: number;
  max_order_value?: number;
  max_open_positions?: number;
  confluence_threshold?: number;
  max_market_data_age_seconds?: number;
  kill_switch_active?: boolean;
  position_mismatch_locked?: boolean;
}

export interface RiskPosition {
  id: number | string;
  bot_id: string;
  symbol: string;
  direction: "LONG" | "SHORT" | string;
  quantity: number;
  entry_price: number;
  stop_loss: number;
  position_value: number;
  margin_used: number;
  risk_amount: number;
  leverage: number;
  asset_class: string;
  unrealized_pnl: number;
}

export interface RiskHeatmapItem {
  entity: string;
  type: "Symbol" | "Asset Class" | string;
  exposure: number;
  exposure_pct: number;
  risk_level: "LOW" | "MODERATE" | "HIGH" | string;
}

export interface RiskOverviewState {
  account_balance: number;
  available_capital: number;
  capital_used: number;
  margin_used: number;
  margin_usage_pct: number;
  gross_exposure: number;
  net_exposure: number;
  portfolio_risk_dollars: number;
  portfolio_risk_pct: number;
  daily_pnl: number;
  daily_drawdown_pct: number;
  open_positions_count: number;
  risk_score: "LOW" | "MODERATE" | "HIGH" | "CRITICAL" | string;
  risk_status: "OPTIMAL" | "NORMAL" | "HIGH RISK WARNING" | "CRITICAL RISK" | "TRADING BLOCKED" | string;
  score_factors: string[];
  kill_switch_active: boolean;
  active_limits?: ActiveRiskLimits;
}

export interface RiskOverviewResponse {
  status: string;
  overview: RiskOverviewState;
  positions: RiskPosition[];
  symbol_exposure: Record<string, number>;
  asset_class_exposure: Record<string, number>;
  heatmap: RiskHeatmapItem[];
}

export interface RiskProfile {
  id?: number;
  profile_id: string;
  name: string;
  description?: string;
  is_default: boolean;
  max_daily_loss_pct: number;
  max_portfolio_risk_pct: number;
  max_single_trade_risk_pct: number;
  max_leverage: number;
  max_symbol_concentration_pct: number;
  max_asset_class_concentration_pct: number;
  drawdown_halt_threshold_pct: number;
  circuit_breaker_cooldown_mins: number;
}

export interface RiskRule {
  id?: number;
  rule_id: string;
  name: string;
  category: string;
  condition_type: string;
  threshold: number;
  action: string;
  is_enabled: boolean;
  description?: string;
}

export interface RiskEvent {
  id: number;
  timestamp: string;
  event_type: string;
  message: string;
  severity: "INFO" | "WARNING" | "CRITICAL" | "EMERGENCY" | string;
  symbol?: string;
  bot_id?: string;
  details?: any;
}

export interface PositionSizeResult {
  status: string;
  method: string;
  position_quantity: number;
  risk_amount: number;
  notional_value: number;
  margin_required: number;
  is_capital_capped?: boolean;
  capital_used?: number;
  maximum_loss?: number;
  potential_profit?: number;
  suggested_take_profit?: number;
  risk_reward_ratio?: number;
  cap_reason?: string;
  parameters_evaluated?: Record<string, any>;
}


export interface WhatIfResult {
  status: string;
  mode: string;
  current: {
    exposure: number;
    exposure_pct: number;
    margin_used: number;
    margin_used_pct: number;
    portfolio_risk: number;
    portfolio_risk_pct: number;
  };
  after_trade: {
    exposure: number;
    exposure_pct: number;
    margin_used: number;
    margin_used_pct: number;
    portfolio_risk: number;
    portfolio_risk_pct: number;
  };
  change: {
    exposure_diff: number;
    exposure_pct_diff: number;
    margin_diff: number;
    risk_diff: number;
    risk_pct_diff: number;
  };
}
