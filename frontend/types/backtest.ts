export interface BacktestRequest {
  symbol?: string;
  timeframe?: string;
  start_date: string;
  end_date: string;
  strategy_name: string;
  initial_cash: number;
  allow_shorts?: boolean;
}

export interface BacktestTrade {
  trade_id?: number;
  symbol?: string;
  side?: "LONG" | "SHORT" | string;
  entry_time?: string;
  exit_time?: string;
  entry_price?: number;
  exit_price?: number;
  quantity?: number;
  pnl?: number;
  return_pct?: number;
  duration?: string;
  exit_reason?: string;
}

export interface BacktestResult {
  total_net_profit: number;
  return_pct: number;
  total_trades: number;
  win_rate_pct: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  trades?: BacktestTrade[];
}

export interface BacktestResponse {
  status: "success" | "error";
  backtest?: BacktestResult;
  message?: string;
}

export interface BacktestPreset {
  id: string;
  name: string;
  strategy_name: string;
  timeframe: string;
  description: string;
  recommended_capital: number;
  category: "Trend" | "Scalp" | "MeanReversion" | "Breakout";
}
