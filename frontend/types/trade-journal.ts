export interface TradeJournalRecord {
  id: number;
  timestamp: string;
  symbol: string;
  direction: string;
  entry_price: number;
  stop_loss?: number;
  take_profit?: number;
  position_size: number;
  status: string;
  exit_price?: number;
  exit_timestamp?: string;
  result_pnl?: number;
  net_pnl?: number;
  fees?: number;
  bot_id?: string;
  bot_instance_name?: string;
  strategy?: string;
  execution_mode?: string;
  emotion_tag?: string;
  remarks?: string;
  exit_reason?: string;
  metadata?: string;
  risk_amount?: number;
  leverage?: number;
  config_version?: string;
}

export interface TradeListResponse {
  status: string;
  total_count: number;
  page: number;
  per_page: number;
  total_pages: number;
  trades: TradeJournalRecord[];
}
