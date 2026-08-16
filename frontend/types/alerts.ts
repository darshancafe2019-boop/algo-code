export type AlertSeverity = "ALL" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export interface AlertItem {
  id: number;
  category: string;
  level: "INFO" | "WARNING" | "ERROR" | "CRITICAL" | string;
  message: string;
  timestamp: string;
  is_read: number;
  icon?: string;
  bot_id?: string;
  symbol?: string;
}

export interface AlertsResponse {
  status: "success" | "error";
  notifications: AlertItem[];
  message?: string;
}

export interface TestAlertResponse {
  status: "success" | "error";
  message: string;
  telegram_response?: any;
}
