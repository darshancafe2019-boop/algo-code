# Project Architecture Audit Document — Algo Trading Bot

**Author**: Senior Algorithmic-Trading Systems Engineer, Database Architect & QA Lead  
**Date**: 2026-08-13  
**System Status**: Production-Grade, Multi-Asset, High-Observability Algo Trading Platform

---

## 1. System Overview & Core Architecture Map

```
                               ┌────────────────────────────────────────┐
                               │           FLASK DASHBOARD              │
                               │             (dashboard.py)             │
                               └───────────────────┬────────────────────┘
                                                   │ REST APIs & WebSocket
                                                   ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       BOT CORE ENGINE                                             │
│                                                                                                  │
│   ┌─────────────────────┐       ┌──────────────────────┐       ┌─────────────────────────────┐   │
│   │   Market Providers  │ ────> │   Data Fetcher Engine│ ────> │   Technical Indicators      │   │
│   │(CCXT, NSE, Yahoo, etc)      │  (data_fetcher.py)   │       │     (indicators.py)         │   │
│   └─────────────────────┘       └──────────────────────┘       └──────────────┬──────────────┘   │
│                                                                               │                  │
│                                                                               ▼                  │
│   ┌─────────────────────┐       ┌──────────────────────┐       ┌─────────────────────────────┐   │
│   │     Risk Manager    │ <──── │    Strategy Engine   │ <──── │ Confluence Scoring (>=75%)  │   │
│   │  (risk_manager.py)  │       │     (strategy.py)    │       │        (config.py)           │   │
│   └──────────┬──────────┘       └──────────────────────┘       └─────────────────────────────┘   │
│              │                                                                                   │
│              ▼                                                                                   │
│   ┌─────────────────────┐       ┌──────────────────────┐       ┌─────────────────────────────┐   │
│   │  Multi-Asset Router │ ────> │   Execution Engine   │ ────> │  Telegram & Observability   │   │
│   │  (order_router.py)  │       │    (execution.py)    │       │ (monitoring.py / audit.py)  │   │
│   └─────────────────────┘       └──────────────────────┘       └─────────────────────────────┘   │
└──────────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                           │
                                           ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    PERSISTENT STORAGE LAYER                                      │
│                                           (db.py)                                                │
│                                                                                                  │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌──────────────────────────────────┐ │
│  │     bot_event_audit     │  │      trades_log         │  │          trade_history           │ │
│  │ (32-field Audit Ledger) │  │ (46-field Trade Ledger) │  │   (Authoritative DB View)        │ │
│  └─────────────────────────┘  └─────────────────────────┘  └──────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Identified Python Modules & Primary Responsibilities

| Module | Location | Primary Responsibility |
| :--- | :--- | :--- |
| `dashboard.py` | Root | Flask Web Server, REST APIs, Analytics Calculations, CSV Exports, Multi-Bot Management. |
| `src/config.py` | `src/` | Central System Configuration, Feature Flags, Risk Parameters, Thresholds (`CONFLUENCE_THRESHOLD = 0.75`). |
| `src/db.py` | `src/` | SQLite Database Layer, WAL Mode Fallback, Thread Lock Retries, Authoritative `trade_history` View. |
| `src/audit.py` | `src/` | Central Audit Event Ledger Manager (`log_bot_event`, `get_bot_event_audits`, `log_data_correction`). |
| `src/monitoring.py` | `src/` | System Watchdog, Staleness Checks (`MAX_MARKET_DATA_AGE_SECONDS`), CPU, RAM, Latency Metrics. |
| `src/risk_manager.py` | `src/` | Swing Level Calculations, Position Sizing, Daily Loss Limit Enforcement, Global Kill Switch Controls. |
| `src/strategy.py` | `src/` | Strategy Evaluation, Indicator Confluence Scoring, 75% Confidence Threshold Checks. |
| `src/indicators.py` | `src/` | Technical Indicators Engine (EMA, MACD, VP, RSI, ATR, BB, ADX, Supertrend, etc.). |
| `src/execution.py` | `src/` | CCXT Execution Engine Wrapper for Spot Market Orders. |
| `src/order_router.py` | `src/` | Multi-Asset Order Router (Crypto, Indian Equities, Global Equities, Forex) with Live Protection. |
| `src/live_runner.py` | `src/` | Scheduled Evaluation Loop, Signal Generation, Position Monitoring, SL/TP Exits, Heartbeats. |
| `src/market_universe.py` | `src/` | Universe Manager (628+ instruments across 5 asset classes). |
| `src/market_providers.py` | `src/` | Dynamic Market Data Providers (Binance, NSE, Yahoo Finance, OANDA, Indices). |
| `src/process_manager.py` | `src/` | Process Controller for Multi-Bot Instance Subprocesses. |
| `src/backtester.py` | `src/` | Historical Backtesting Engine. |
| `src/backup.py` | `src/` | Automated SQLite Database Backup Service. |
| `src/telegram_alert.py` | `src/` | Telegram Alert Dispatcher & Interactive Buttons. |

---

## 3. Comprehensive Database Schema Overview

1. **`bot_event_audit`**: Immutably stores 32 fields per event (`event_id`, `timestamp_utc`, `local_timestamp`, `bot_instance_id`, `asset_class`, `symbol`, `event_type`, `event_subtype`, `severity`, `status`, `message`, `reason`, `strategy_name`, `timeframe`, `confidence_score`, `threshold`, `order_id`, `trade_id`, `position_id`, `correlation_id`, `provider`, `exchange`, `latency_ms`, `error_code`, `metadata_json`, etc.).
2. **`trades_log`**: Complete trade ledger table containing 46 fields with partial fill support (`requested_quantity`, `filled_quantity`, `remaining_quantity`, `average_entry_price`), fees, slippage, and unique order ID indexing.
3. **`trade_history`**: Authoritative view over `trades_log` used for performance analytics calculation.
4. **`bot_instances`**: Configuration records for multi-bot instances (`allocated_capital`, `risk_per_trade`, `symbol`, `timeframe`, `status`, `last_checked_at`).
5. **`market_universe`**: 628+ instruments with watch/paper/strategy/live flags.
6. **`pending_signal_approvals`**: Interactive signal queue waiting for trader confirmation.
7. **`signals_log`**: Historical trace of generated strategy signals.
8. **`bot_activity_logs`**: Step-by-step bot activity logs.
9. **`bot_decision_logs`**: Granular indicator breakdown for transparent auditing.

---

## 4. End-to-End Execution & Trading Paths

```
[Market Data Fetch] ──> [Staleness & Health Check] ──> [Indicator Calculation]
                                                               │
                                                               ▼
[Trade Journal / Analytics] <── [Audit Event] <── [Order Exec] <── [Risk Check & 75% Confidence]
```

1. **Signal Generation**: `live_runner.py` fetches OHLCV candles via `market_providers.py`, computes indicators via `indicators.py`, and passes them to `strategy.py`.
2. **Confidence Verification**: `Strategy.evaluate_confluence` evaluates signals and enforces $\ge 0.75$ (75%) confidence score threshold.
3. **Risk Management & Kill Switch**: `risk_manager.py` verifies global kill switch (`GLOBAL_TRADING_KILL_SWITCH`), daily loss limits, position sizing, and maximum position caps.
4. **Order Execution & Idempotency**: `order_router.py` verifies execution mode (`PAPER` default / `LIVE` protected), checks for duplicate order IDs, logs audit events via `audit.py`, and records trade entry in `trades_log`.
5. **Position Exit & P&L Calculation**: `live_runner.py` monitors open positions against SL/TP levels, executes exits, computes realized P&L, fees, and slippage, and updates `trades_log` and `bot_event_audit`.

---

## 5. Safety Mechanisms & Risk Mitigation Audit

- **75% Confidence Threshold**: Enforced strictly by `Strategy.evaluate_confluence` ($\ge 0.75$).
- **Live Trading Safety Guardrails**: `MASTER_LIVE_TRADING = False` default; multi-asset safety flags in `order_router.py`.
- **Global Trading Kill Switch**: Flag file `data/kill_switch.flag` & `GLOBAL_TRADING_KILL_SWITCH` in `config.py`.
- **Daily Loss Limit**: Enforced by `check_daily_loss_limit`.
- **Market Data Staleness Check**: Enforced by `is_market_data_stale` (`MAX_MARKET_DATA_AGE_SECONDS = 60`).
- **Idempotency & Duplicate Order Shield**: Parameterized unique constraint checking on `exchange_order_id`, `broker_order_id`, `fill_id`, and `correlation_id`.
- **Automated SQLite Backups**: `backup.py` creates snapshot copies of `trading_bot.db` in `backup/`.

---

## 6. Audit Matrix Summary

| Audit Area | Implementation Details | Risk Assessment | Integration Status |
| :--- | :--- | :--- | :--- |
| **Audit Event Ledger** | `bot_event_audit` table with 32 fields | Low Risk (Append-Only) | 🟢 Complete |
| **Trade Ledger** | `trades_log` table + `trade_history` view | Low Risk (Indexed) | 🟢 Complete |
| **Duplicate Protection** | Unique order IDs + Idempotency checks | Low Risk | 🟢 Complete |
| **Partial Fills** | Weighted average price & quantity tracking | Low Risk | 🟢 Complete |
| **Kill Switch** | File flag & API endpoint (`/api/kill-switch`) | Low Risk | 🟢 Complete |
| **Automated Backups** | `backup.py` automated SQLite snapshots | Low Risk | 🟢 Complete |
