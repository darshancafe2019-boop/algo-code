export interface SystemErrorRecord {
  id: number;
  timestamp: string;
  error_message: string;
}

export interface AuditEventRecord {
  id: number;
  timestamp_utc: string;
  local_timestamp?: string;
  event_type: string;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL" | string;
  message: string;
  bot_instance_id?: string;
  bot_instance_name?: string;
  symbol?: string;
  metadata_json?: string;
  status?: string;
  latency_ms?: number;
  account_id?: string;
  exchange?: string;
  provider?: string;
  reason?: string;
}

export interface LogsResponse {
  status: string;
  log_count: number;
  logs: string[];
  system_errors?: SystemErrorRecord[];
}

export interface AuditEventsResponse {
  status: string;
  count: number;
  events: AuditEventRecord[];
}

export interface DiagnosticReportResponse {
  status: string;
  report: string;
}

export interface LatencyMetric {
  avg_ms: number;
  max_ms: number;
  median_ms: number;
  p95_ms: number;
  p99_ms: number;
}

export interface LatencySummary {
  broker_latency?: LatencyMetric;
  db_write_latency?: LatencyMetric;
  fill_latency?: LatencyMetric;
  order_creation_latency?: LatencyMetric;
  risk_latency?: LatencyMetric;
  signal_latency?: LatencyMetric;
  total_execution_latency?: LatencyMetric;
  status?: string;
  target_threshold_ms?: number;
}

export interface DiagnosticsStateResponse {
  timestamp: string;
  total_bots: number;
  open_positions: number;
  kill_switch_active: boolean;
  live_trading_enabled: boolean;
  latencies: LatencySummary;
}
