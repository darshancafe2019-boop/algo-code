export interface TradeSummary {
  start_balance: number;
  current_balance: number;
  total_pnl: number;
  closed_pnl: number;
  unrealized_pnl: number;
  total_trades: number;
  open_trades: number;
  win_rate_pct: number;
  winning_count: number;
  losing_count: number;
  breakeven_count: number;
  avg_win: number;
  avg_loss: number;
  avg_win_pct: number;
  avg_loss_pct: number;
  max_gain: number;
  max_loss: number;
  avg_pnl_per_trade: number;
  profit_factor: number;
  max_drawdown_pct: number;
}

export interface RealizedPnLSymbol {
  symbol: string;
  pnl: number;
}

export interface WinLossDonutData {
  winning: number;
  losing: number;
  breakeven: number;
  ratio_str: string;
}

export interface OpenClosedDonutData {
  open: number;
  closed: number;
}

export interface StrategyWinRate {
  strategy: string;
  win_rate: number;
  total_trades: number;
}

export interface DirectionDonut {
  long_count: number;
  short_count: number;
  long_pct: number;
  short_pct: number;
}

export interface StrategyCombo {
  strategy: string;
  wins: number;
  losses: number;
  pnl: number;
}

export interface EquityPoint {
  time: string;
  equity: number;
  drawdown: number;
}

export interface HorizontalBarStat {
  label: string;
  win: number;
  loss: number;
}

export interface BotLeaderboardRow {
  bot_id: string;
  name: string;
  symbol: string;
  strategy: string;
  timeframe: string;
  status: string;
  allocated_capital: number;
  indicators?: string[];
  net_pnl: number;
  roi_pct: number;
  total_trades: number;
  win_rate_pct: number;
  open_trades: number;
}

export interface AnalyticsPayload {
  success: boolean;
  status: string;
  generated_at: string;
  trade_count: number;
  trade_summary: TradeSummary;
  charts: {
    realized_pnl_by_symbol: RealizedPnLSymbol[];
    win_loss_donut: WinLossDonutData;
    open_closed_donut: OpenClosedDonutData;
    strategy_winrate_donut: StrategyWinRate[];
    direction_donut: DirectionDonut;
    horizontal_bar_stats: HorizontalBarStat[];
    strategy_combo: StrategyCombo[];
    equity_curve: EquityPoint[];
  };
  equity_curve: EquityPoint[];
  bot_comparison: BotLeaderboardRow[];
}
