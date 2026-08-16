export interface ApiKeysResponse {
  status: string;
  api_key_masked: string;
  exchange: string;
  mode: string;
}

export interface SecurityAuditLog {
  id: number;
  timestamp: string;
  action: string;
  user: string;
  ip_address: string;
  details: string;
}

export interface SecurityAuditResponse {
  status: string;
  audit_logs: SecurityAuditLog[];
}

export interface ExecutionGateResponse {
  status: string;
  bot_running: boolean;
  trading_mode: string;
  live_trading_enabled: boolean;
  live_trading_armed: boolean;
  kill_switch_active: boolean;
  position_mismatch_locked: boolean;
  market_data_stale: boolean;
  market_data_age_seconds: number;
  database_connected: boolean;
}

export interface LiveOverviewResponse {
  status: string;
  live_trading_enabled: boolean;
  kill_switch_active: boolean;
  broker_connected: boolean;
  exchange: string;
  live_bots_count: number;
  live_open_positions_count: number;
  safety_checks: {
    broker_api_verified: boolean;
    confidence_threshold_enforced: boolean;
    kill_switch_offline: boolean;
    risk_engine_active: boolean;
  };
}

export interface ProviderItem {
  provider_id: string;
  name: string;
  coverage: string;
  status: "CONNECTED" | "DEGRADED" | "DISCONNECTED" | "UNKNOWN";
  instrument_count: number;
  data_available: boolean;
  execution_available: boolean;
  message: string;
  last_sync: string | null;
  last_error: string | null;
}

export interface ProvidersResponse {
  providers: ProviderItem[];
}
