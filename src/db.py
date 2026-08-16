import json
import logging
import random
import shutil
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple, TypeVar

from src import config

logger = logging.getLogger("DB")

_db_initialized = False
_db_init_lock = threading.Lock()
F = TypeVar("F", bound=Callable[..., Any])


def with_db_retry(max_retries: int = 5, base_delay: float = 0.05, max_delay: float = 1.0) -> Callable[[F], F]:
    """
    Decorator that catches transient SQLite lock/busy errors and retries with jittered exponential backoff.
    Logs DB_LOCK_DETECTED, DB_LOCK_RETRY, and DB_LOCK_RECOVERED.
    """
    def decorator(func: F) -> F:
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            retries = 0
            while True:
                try:
                    res = func(*args, **kwargs)
                    if retries > 0:
                        logger.info(f"DB_LOCK_RECOVERED: Function '{func.__name__}' succeeded after {retries} retries.")
                    return res
                except sqlite3.OperationalError as e:
                    err_msg = str(e).lower()
                    if "locked" in err_msg or "busy" in err_msg:
                        retries += 1
                        if retries > max_retries:
                            logger.error(f"DB_LOCK_FAILURE: Function '{func.__name__}' failed after {max_retries} retries: {e}")
                            raise
                        # Exponential backoff with random jitter
                        sleep_time = min(max_delay, base_delay * (2 ** (retries - 1))) + random.uniform(0.01, 0.05)
                        logger.warning(f"DB_LOCK_DETECTED / DB_LOCK_RETRY: '{func.__name__}' hit '{e}', retry {retries}/{max_retries} in {sleep_time:.3f}s")
                        time.sleep(sleep_time)
                    else:
                        raise
                except Exception:
                    raise
        return wrapper  # type: ignore
    return decorator


def get_connection() -> sqlite3.Connection:
    """
    Create and return an optimized SQLite connection with 30s timeout and busy_timeout=10000ms.
    Does NOT change journal_mode on every connect to avoid exclusive lock contention.
    """
    conn = sqlite3.connect(str(config.DB_PATH), timeout=30.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA busy_timeout=10000;")
        conn.execute("PRAGMA foreign_keys=ON;")
    except Exception:
        pass
    return conn


@contextmanager
def get_db_transaction():
    """
    Context manager for short, safe, atomic SQLite transactions.
    Automatically commits on success, rolls back on exception, and ensures the connection is closed.
    """
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception as exc:
        try:
            conn.rollback()
        except Exception:
            pass
        raise exc
    finally:
        try:
            conn.close()
        except Exception:
            pass


@with_db_retry(max_retries=5)
def safe_execute(sql: str, params: tuple = ()) -> bool:
    """Execute a mutating statement (INSERT, UPDATE, DELETE) inside a committed transaction."""
    with get_db_transaction() as conn:
        cursor = conn.cursor()
        cursor.execute(sql, params)
    return True


@with_db_retry(max_retries=5)
def safe_query(sql: str, params: tuple = ()) -> list:
    """Execute a read-only query safely and return dict rows."""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(sql, params)
        rows = [dict(r) for r in cursor.fetchall()]
        return rows
    except Exception as e:
        logger.error("safe_query error: %s", e)
        return []
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


def safe_query_one(sql: str, params: tuple = ()) -> Optional[dict]:
    """Execute a read-only query safely and return first dict row or None."""
    rows = safe_query(sql, params)
    return rows[0] if rows else None


def init_db(force: bool = False) -> None:
    """Create or verify SQLite tables and configure WAL journal mode once at startup."""
    global _db_initialized
    with _db_init_lock:
        if _db_initialized and not force:
            return

        for attempt in range(5):
            try:
                conn = get_connection()
                cursor = conn.cursor()
                try:
                    cursor.execute("PRAGMA journal_mode=WAL;")
                    cursor.execute("PRAGMA synchronous=NORMAL;")
                    cursor.execute("PRAGMA busy_timeout=10000;")
                except Exception as pragma_err:
                    logger.debug("WAL pragma setup notice: %s", pragma_err)

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS signals_log (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        symbol TEXT NOT NULL,
                        signal_type TEXT NOT NULL,
                        price REAL NOT NULL,
                        filters_status TEXT,
                        is_blocked INTEGER DEFAULT 0,
                        reason TEXT,
                        context TEXT
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS trades_log (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        symbol TEXT NOT NULL,
                        direction TEXT NOT NULL,
                        entry_price REAL NOT NULL,
                        stop_loss REAL NOT NULL,
                        take_profit REAL NOT NULL,
                        position_size REAL NOT NULL,
                        status TEXT DEFAULT 'OPEN',
                        exit_price REAL,
                        exit_timestamp TEXT,
                        result_pnl REAL DEFAULT 0.0,
                        metadata TEXT
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS system_errors (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        error_message TEXT NOT NULL,
                        stack_trace TEXT,
                        module TEXT,
                        function_name TEXT,
                        retry_count INTEGER DEFAULT 0
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS heartbeat_log (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        status TEXT NOT NULL,
                        details TEXT
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS bot_status (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        status TEXT NOT NULL,
                        exchange_status TEXT,
                        telegram_status TEXT,
                        database_status TEXT,
                        details TEXT
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS performance_stats (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        win_rate REAL,
                        total_trades INTEGER,
                        total_pnl REAL,
                        max_drawdown REAL,
                        sharpe_ratio REAL,
                        profit_factor REAL
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS api_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        endpoint TEXT NOT NULL,
                        method TEXT NOT NULL,
                        status_code INTEGER NOT NULL,
                        response_time_ms REAL,
                        error_message TEXT
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS telegram_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        message_type TEXT NOT NULL,
                        status TEXT NOT NULL,
                        recipient TEXT,
                        error_message TEXT
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS bot_instances (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        symbol TEXT NOT NULL,
                        strategy TEXT NOT NULL,
                        timeframe TEXT NOT NULL,
                        allocated_capital REAL NOT NULL,
                        risk_per_trade REAL DEFAULT 2.0,
                        status TEXT DEFAULT 'STOPPED',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS candles_cache (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        symbol TEXT NOT NULL,
                        timeframe TEXT NOT NULL,
                        timestamp INTEGER NOT NULL,
                        open REAL NOT NULL,
                        high REAL NOT NULL,
                        low REAL NOT NULL,
                        close REAL NOT NULL,
                        volume REAL NOT NULL,
                        UNIQUE(symbol, timeframe, timestamp)
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS system_health (
                        component_name TEXT PRIMARY KEY,
                        status TEXT NOT NULL,
                        last_updated TEXT NOT NULL,
                        consecutive_failures INTEGER DEFAULT 0,
                        last_error TEXT,
                        metrics_json TEXT
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS daily_statistics (
                        date TEXT PRIMARY KEY,
                        total_trades INTEGER DEFAULT 0,
                        winning_trades INTEGER DEFAULT 0,
                        losing_trades INTEGER DEFAULT 0,
                        net_pnl REAL DEFAULT 0.0,
                        start_balance REAL DEFAULT 10000.0,
                        end_balance REAL DEFAULT 10000.0,
                        max_drawdown REAL DEFAULT 0.0
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS bot_activity_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        bot_id TEXT NOT NULL,
                        activity_type TEXT NOT NULL,
                        message TEXT NOT NULL,
                        details_json TEXT
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS bot_decision_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        bot_id TEXT NOT NULL,
                        candle_timestamp TEXT NOT NULL,
                        action_taken TEXT NOT NULL,
                        confidence_score REAL NOT NULL,
                        threshold_used REAL NOT NULL,
                        market_regime TEXT NOT NULL,
                        long_score REAL NOT NULL,
                        short_score REAL NOT NULL,
                        reasoning_plain_english TEXT NOT NULL,
                        indicators_summary_json TEXT,
                        UNIQUE(bot_id, candle_timestamp)
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS indicator_profiles (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        market_regime TEXT NOT NULL DEFAULT 'ALL',
                        description TEXT,
                        is_preset INTEGER DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS indicator_profile_versions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        profile_id TEXT NOT NULL,
                        version INTEGER NOT NULL,
                        config_snapshot_json TEXT NOT NULL,
                        saved_by TEXT DEFAULT 'system',
                        created_at TEXT NOT NULL
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS bot_indicator_profiles (
                        bot_id TEXT PRIMARY KEY,
                        profile_id TEXT NOT NULL,
                        assigned_at TEXT NOT NULL
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS scenario_profiles (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        regime TEXT NOT NULL,
                        description TEXT,
                        default_adaptive_mode TEXT DEFAULT 'BALANCED',
                        confluence_long_min REAL DEFAULT 75.0,
                        confluence_short_min REAL DEFAULT 75.0,
                        recommended_indicators_json TEXT
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS indicator_configs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        indicator_id TEXT UNIQUE NOT NULL,
                        name TEXT NOT NULL,
                        category TEXT NOT NULL DEFAULT 'General',
                        enabled INTEGER NOT NULL DEFAULT 1,
                        favorite INTEGER NOT NULL DEFAULT 0,
                        timeframe TEXT NOT NULL DEFAULT '15m',
                        weight REAL NOT NULL DEFAULT 15.0,
                        long_enabled INTEGER NOT NULL DEFAULT 1,
                        short_enabled INTEGER NOT NULL DEFAULT 1,
                        signal_mode TEXT NOT NULL DEFAULT 'both',
                        min_confirmations INTEGER NOT NULL DEFAULT 1,
                        parameters_json TEXT NOT NULL DEFAULT '{}',
                        display_json TEXT NOT NULL DEFAULT '{}',
                        signal_rules_json TEXT NOT NULL DEFAULT '{}',
                        symbol_override TEXT DEFAULT '',
                        timeframe_override TEXT DEFAULT '',
                        bot_id TEXT DEFAULT '',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS indicator_presets (
                        preset_id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        category TEXT NOT NULL DEFAULT 'General',
                        description TEXT DEFAULT '',
                        config_json TEXT NOT NULL DEFAULT '{}',
                        is_system INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS indicator_config_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        indicator_id TEXT NOT NULL,
                        bot_id TEXT DEFAULT 'bot-1',
                        symbol TEXT DEFAULT 'BTC/USDT',
                        timeframe TEXT DEFAULT '15m',
                        action TEXT NOT NULL DEFAULT 'UPDATE',
                        user_source TEXT DEFAULT 'Web Dashboard',
                        old_config_json TEXT DEFAULT '{}',
                        new_config_json TEXT DEFAULT '{}'
                    )
                    """
                )

                cursor.execute("CREATE INDEX IF NOT EXISTS idx_ind_cfg_hist_ind ON indicator_config_history(indicator_id, id DESC)")

                # =============================================================
                # UNIVERSAL RISK MANAGEMENT ENGINE TABLES
                # =============================================================
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS risk_profiles (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        profile_id TEXT UNIQUE NOT NULL,
                        name TEXT NOT NULL,
                        category TEXT NOT NULL DEFAULT 'General',
                        description TEXT DEFAULT '',
                        is_default INTEGER NOT NULL DEFAULT 0,
                        is_system INTEGER NOT NULL DEFAULT 0,
                        config_json TEXT NOT NULL DEFAULT '{}',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS risk_rules (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        rule_id TEXT UNIQUE NOT NULL,
                        name TEXT NOT NULL,
                        scope TEXT NOT NULL DEFAULT 'global',
                        target TEXT NOT NULL DEFAULT '*',
                        condition_json TEXT NOT NULL DEFAULT '{}',
                        action TEXT NOT NULL DEFAULT 'BLOCK_ORDER',
                        is_enabled INTEGER NOT NULL DEFAULT 1,
                        priority INTEGER NOT NULL DEFAULT 10,
                        description TEXT DEFAULT '',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS risk_limits (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        key TEXT UNIQUE NOT NULL,
                        value_json TEXT NOT NULL DEFAULT '{}',
                        updated_at TEXT NOT NULL
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS risk_events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        event_type TEXT NOT NULL,
                        severity TEXT NOT NULL DEFAULT 'WARNING',
                        symbol TEXT DEFAULT 'BTC/USDT',
                        bot_id TEXT DEFAULT 'bot-1',
                        message TEXT NOT NULL,
                        details_json TEXT DEFAULT '{}'
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS risk_snapshots (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        portfolio_equity REAL NOT NULL,
                        available_capital REAL NOT NULL,
                        margin_used REAL NOT NULL,
                        gross_exposure REAL NOT NULL,
                        net_exposure REAL NOT NULL,
                        daily_pnl REAL NOT NULL,
                        portfolio_risk_pct REAL NOT NULL,
                        risk_score TEXT NOT NULL,
                        open_positions_count INTEGER NOT NULL,
                        positions_json TEXT DEFAULT '[]'
                    )
                    """
                )

                cursor.execute("CREATE INDEX IF NOT EXISTS idx_risk_events_ts ON risk_events(timestamp DESC)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_risk_rules_scope ON risk_rules(scope, target)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_risk_snapshots_ts ON risk_snapshots(timestamp DESC)")

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS market_universe (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        symbol TEXT UNIQUE NOT NULL,
                        canonical_symbol TEXT NOT NULL,
                        display_name TEXT NOT NULL,
                        category TEXT NOT NULL,
                        asset_class TEXT NOT NULL,
                        exchange TEXT NOT NULL,
                        region TEXT NOT NULL,
                        volatility_group TEXT NOT NULL,
                        provider_id TEXT DEFAULT 'system',
                        is_active INTEGER DEFAULT 1,
                        watch_enabled INTEGER DEFAULT 1,
                        paper_enabled INTEGER DEFAULT 1,
                        strategy_enabled INTEGER DEFAULT 1,
                        live_enabled INTEGER DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS system_session (
                        id INTEGER PRIMARY KEY CHECK (id = 1),
                        last_seen_at TEXT NOT NULL,
                        is_active INTEGER NOT NULL DEFAULT 1
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS pending_signal_approvals (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        bot_id TEXT NOT NULL,
                        symbol TEXT NOT NULL,
                        timeframe TEXT DEFAULT '15m',
                        strategy TEXT DEFAULT 'EMA_MACD_VP',
                        signal_type TEXT NOT NULL,
                        price REAL NOT NULL,
                        confidence REAL NOT NULL,
                        reason TEXT,
                        status TEXT DEFAULT 'WAITING_APPROVAL',
                        created_at TEXT NOT NULL,
                        decided_at TEXT,
                        executed_action TEXT,
                        decision_source TEXT,
                        expires_at TEXT
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS bot_event_audit (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        event_id TEXT UNIQUE NOT NULL,
                        timestamp_utc TEXT NOT NULL,
                        local_timestamp TEXT NOT NULL,
                        bot_instance_id TEXT NOT NULL DEFAULT 'bot-1',
                        bot_instance_name TEXT NOT NULL DEFAULT 'System Bot',
                        account_id TEXT DEFAULT 'default_account',
                        asset_class TEXT DEFAULT 'Crypto',
                        symbol TEXT DEFAULT 'BTC/USDT',
                        event_type TEXT NOT NULL,
                        event_subtype TEXT DEFAULT '',
                        severity TEXT DEFAULT 'INFO',
                        status TEXT DEFAULT 'SUCCESS',
                        message TEXT NOT NULL,
                        reason TEXT DEFAULT '',
                        strategy_name TEXT DEFAULT '',
                        timeframe TEXT DEFAULT '',
                        confidence_score REAL DEFAULT 0.0,
                        threshold REAL DEFAULT 75.0,
                        order_id TEXT DEFAULT '',
                        trade_id INTEGER,
                        position_id TEXT DEFAULT '',
                        correlation_id TEXT DEFAULT '',
                        parent_event_id TEXT DEFAULT '',
                        request_id TEXT DEFAULT '',
                        provider TEXT DEFAULT '',
                        exchange TEXT DEFAULT '',
                        latency_ms REAL DEFAULT 0.0,
                        error_code TEXT DEFAULT '',
                        error_message TEXT DEFAULT '',
                        metadata_json TEXT DEFAULT '{}',
                        created_at TEXT NOT NULL
                    )
                    """
                )

                # Check and alter trades_log for extended columns
                try:
                    cursor.execute("PRAGMA table_info(trades_log)")
                    cols = [row["name"] for row in cursor.fetchall()]
                    alter_map = [
                        ("bot_id", "ALTER TABLE trades_log ADD COLUMN bot_id TEXT DEFAULT 'bot-1'"),
                        ("bot_instance_id", "ALTER TABLE trades_log ADD COLUMN bot_instance_id TEXT DEFAULT 'bot-1'"),
                        ("bot_instance_name", "ALTER TABLE trades_log ADD COLUMN bot_instance_name TEXT DEFAULT 'Alpha BTC Scalper'"),
                        ("account_id", "ALTER TABLE trades_log ADD COLUMN account_id TEXT DEFAULT 'default_account'"),
                        ("canonical_symbol", "ALTER TABLE trades_log ADD COLUMN canonical_symbol TEXT DEFAULT ''"),
                        ("display_name", "ALTER TABLE trades_log ADD COLUMN display_name TEXT DEFAULT ''"),
                        ("asset_class", "ALTER TABLE trades_log ADD COLUMN asset_class TEXT DEFAULT 'Crypto'"),
                        ("exchange", "ALTER TABLE trades_log ADD COLUMN exchange TEXT DEFAULT 'Binance'"),
                        ("provider", "ALTER TABLE trades_log ADD COLUMN provider TEXT DEFAULT 'CCXT'"),
                        ("side", "ALTER TABLE trades_log ADD COLUMN side TEXT DEFAULT 'BUY'"),
                        ("position_side", "ALTER TABLE trades_log ADD COLUMN position_side TEXT DEFAULT 'LONG'"),
                        ("strategy", "ALTER TABLE trades_log ADD COLUMN strategy TEXT DEFAULT 'EMA_MACD_VP'"),
                        ("strategy_name", "ALTER TABLE trades_log ADD COLUMN strategy_name TEXT DEFAULT 'EMA_MACD_VP'"),
                        ("timeframe", "ALTER TABLE trades_log ADD COLUMN timeframe TEXT DEFAULT '15m'"),
                        ("signal_time", "ALTER TABLE trades_log ADD COLUMN signal_time TEXT"),
                        ("order_creation_time", "ALTER TABLE trades_log ADD COLUMN order_creation_time TEXT"),
                        ("order_submission_time", "ALTER TABLE trades_log ADD COLUMN order_submission_time TEXT"),
                        ("order_ack_time", "ALTER TABLE trades_log ADD COLUMN order_ack_time TEXT"),
                        ("first_fill_time", "ALTER TABLE trades_log ADD COLUMN first_fill_time TEXT"),
                        ("last_fill_time", "ALTER TABLE trades_log ADD COLUMN last_fill_time TEXT"),
                        ("requested_quantity", "ALTER TABLE trades_log ADD COLUMN requested_quantity REAL DEFAULT 0.0"),
                        ("filled_quantity", "ALTER TABLE trades_log ADD COLUMN filled_quantity REAL DEFAULT 0.0"),
                        ("remaining_quantity", "ALTER TABLE trades_log ADD COLUMN remaining_quantity REAL DEFAULT 0.0"),
                        ("average_entry_price", "ALTER TABLE trades_log ADD COLUMN average_entry_price REAL DEFAULT 0.0"),
                        ("average_exit_price", "ALTER TABLE trades_log ADD COLUMN average_exit_price REAL DEFAULT 0.0"),
                        ("confidence_score", "ALTER TABLE trades_log ADD COLUMN confidence_score REAL DEFAULT 0.0"),
                        ("confidence_threshold", "ALTER TABLE trades_log ADD COLUMN confidence_threshold REAL DEFAULT 75.0"),
                        ("risk_amount", "ALTER TABLE trades_log ADD COLUMN risk_amount REAL DEFAULT 0.0"),
                        ("leverage", "ALTER TABLE trades_log ADD COLUMN leverage REAL DEFAULT 1.0"),
                        ("gross_pnl", "ALTER TABLE trades_log ADD COLUMN gross_pnl REAL DEFAULT 0.0"),
                        ("fees", "ALTER TABLE trades_log ADD COLUMN fees REAL DEFAULT 1.50"),
                        ("commission", "ALTER TABLE trades_log ADD COLUMN commission REAL DEFAULT 0.0"),
                        ("slippage", "ALTER TABLE trades_log ADD COLUMN slippage REAL DEFAULT 0.0"),
                        ("pnl_percent", "ALTER TABLE trades_log ADD COLUMN pnl_percent REAL DEFAULT 0.0"),
                        ("emotion_tag", "ALTER TABLE trades_log ADD COLUMN emotion_tag TEXT DEFAULT '🎯 Disciplined'"),
                        ("remarks", "ALTER TABLE trades_log ADD COLUMN remarks TEXT DEFAULT ''"),
                        ("signal_id", "ALTER TABLE trades_log ADD COLUMN signal_id INTEGER"),
                        ("approval_id", "ALTER TABLE trades_log ADD COLUMN approval_id INTEGER"),
                        ("user_selected_action", "ALTER TABLE trades_log ADD COLUMN user_selected_action TEXT"),
                        ("requested_price", "ALTER TABLE trades_log ADD COLUMN requested_price REAL"),
                        ("execution_mode", "ALTER TABLE trades_log ADD COLUMN execution_mode TEXT DEFAULT 'PAPER'"),
                        ("entry_reason", "ALTER TABLE trades_log ADD COLUMN entry_reason TEXT DEFAULT ''"),
                        ("exit_reason", "ALTER TABLE trades_log ADD COLUMN exit_reason TEXT DEFAULT ''"),
                        ("net_pnl", "ALTER TABLE trades_log ADD COLUMN net_pnl REAL DEFAULT 0.0"),
                        ("unrealized_pnl", "ALTER TABLE trades_log ADD COLUMN unrealized_pnl REAL DEFAULT 0.0"),
                        ("broker_order_id", "ALTER TABLE trades_log ADD COLUMN broker_order_id TEXT DEFAULT ''"),
                        ("exchange_order_id", "ALTER TABLE trades_log ADD COLUMN exchange_order_id TEXT DEFAULT ''"),
                        ("fill_id", "ALTER TABLE trades_log ADD COLUMN fill_id TEXT DEFAULT ''"),
                        ("correlation_id", "ALTER TABLE trades_log ADD COLUMN correlation_id TEXT DEFAULT ''"),
                        ("trade_ref_id", "ALTER TABLE trades_log ADD COLUMN trade_ref_id TEXT DEFAULT ''"),
                        ("indicator_snapshot_json", "ALTER TABLE trades_log ADD COLUMN indicator_snapshot_json TEXT DEFAULT '{}'"),
                        ("market_snapshot_json", "ALTER TABLE trades_log ADD COLUMN market_snapshot_json TEXT DEFAULT '{}'"),
                        ("risk_snapshot_json", "ALTER TABLE trades_log ADD COLUMN risk_snapshot_json TEXT DEFAULT '{}'"),
                        ("exit_snapshot_json", "ALTER TABLE trades_log ADD COLUMN exit_snapshot_json TEXT DEFAULT '{}'"),
                        ("mae", "ALTER TABLE trades_log ADD COLUMN mae REAL DEFAULT 0.0"),
                        ("mfe", "ALTER TABLE trades_log ADD COLUMN mfe REAL DEFAULT 0.0"),
                        ("r_multiple", "ALTER TABLE trades_log ADD COLUMN r_multiple REAL DEFAULT 0.0"),
                        ("config_version", "ALTER TABLE trades_log ADD COLUMN config_version TEXT DEFAULT 'EMA_MACD_VP v1.4.2'"),
                        ("pre_trade_analysis_id", "ALTER TABLE trades_log ADD COLUMN pre_trade_analysis_id TEXT DEFAULT ''"),
                        ("global_scan_id", "ALTER TABLE trades_log ADD COLUMN global_scan_id TEXT DEFAULT ''")
                    ]
                    for col_name, stmt in alter_map:
                        if col_name not in cols:
                            try:
                                cursor.execute(stmt)
                            except Exception:
                                pass
                except Exception:
                    pass

                # Create authoritative trade_history view
                cursor.execute("DROP VIEW IF EXISTS trade_history")
                cursor.execute("CREATE VIEW IF NOT EXISTS trade_history AS SELECT * FROM trades_log")

                # Create indexes for analytics, audit, and trade query performance
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_trades_log_bot_id ON trades_log(bot_id)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_trades_log_bot_inst_id ON trades_log(bot_instance_id)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_trades_log_symbol ON trades_log(symbol)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_trades_log_status ON trades_log(status)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_trades_log_strategy ON trades_log(strategy)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_trades_log_strategy_name ON trades_log(strategy_name)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_trades_log_timestamp ON trades_log(timestamp)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_trades_log_exit_ts ON trades_log(exit_timestamp)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_bot_id ON bot_event_audit(bot_instance_id)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_symbol ON bot_event_audit(symbol)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_event_type ON bot_event_audit(event_type)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON bot_event_audit(timestamp_utc)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_correlation_id ON bot_event_audit(correlation_id)")

                # Check and alter indicator_configs for universal schema columns
                try:
                    cursor.execute("PRAGMA table_info(indicator_configs)")
                    ic_cols = [row["name"] for row in cursor.fetchall()]
                    ic_alter_map = [
                        ("category", "ALTER TABLE indicator_configs ADD COLUMN category TEXT DEFAULT 'General'"),
                        ("enabled", "ALTER TABLE indicator_configs ADD COLUMN enabled INTEGER DEFAULT 1"),
                        ("favorite", "ALTER TABLE indicator_configs ADD COLUMN favorite INTEGER DEFAULT 0"),
                        ("long_enabled", "ALTER TABLE indicator_configs ADD COLUMN long_enabled INTEGER DEFAULT 1"),
                        ("short_enabled", "ALTER TABLE indicator_configs ADD COLUMN short_enabled INTEGER DEFAULT 1"),
                        ("signal_mode", "ALTER TABLE indicator_configs ADD COLUMN signal_mode TEXT DEFAULT 'both'"),
                        ("min_confirmations", "ALTER TABLE indicator_configs ADD COLUMN min_confirmations INTEGER DEFAULT 1"),
                        ("parameters_json", "ALTER TABLE indicator_configs ADD COLUMN parameters_json TEXT DEFAULT '{}'"),
                        ("display_json", "ALTER TABLE indicator_configs ADD COLUMN display_json TEXT DEFAULT '{}'"),
                        ("signal_rules_json", "ALTER TABLE indicator_configs ADD COLUMN signal_rules_json TEXT DEFAULT '{}'"),
                        ("symbol_override", "ALTER TABLE indicator_configs ADD COLUMN symbol_override TEXT DEFAULT ''"),
                        ("timeframe_override", "ALTER TABLE indicator_configs ADD COLUMN timeframe_override TEXT DEFAULT ''"),
                        ("bot_id", "ALTER TABLE indicator_configs ADD COLUMN bot_id TEXT DEFAULT ''")
                    ]
                    for col_name, stmt in ic_alter_map:
                        if col_name not in ic_cols:
                            try:
                                cursor.execute(stmt)
                            except Exception:
                                pass
                except Exception:
                    pass

                # Check and alter pending_signal_approvals for extended columns
                cursor.execute("PRAGMA table_info(pending_signal_approvals)")
                psa_cols = [row["name"] for row in cursor.fetchall()]
                if "timeframe" not in psa_cols:
                    cursor.execute("ALTER TABLE pending_signal_approvals ADD COLUMN timeframe TEXT DEFAULT '15m'")
                if "strategy" not in psa_cols:
                    cursor.execute("ALTER TABLE pending_signal_approvals ADD COLUMN strategy TEXT DEFAULT 'EMA_MACD_VP'")
                if "expires_at" not in psa_cols:
                    cursor.execute("ALTER TABLE pending_signal_approvals ADD COLUMN expires_at TEXT")

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS bot_templates (
                        template_id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        category TEXT NOT NULL,
                        asset_class TEXT NOT NULL,
                        symbol TEXT NOT NULL,
                        timeframe TEXT NOT NULL,
                        strategy TEXT NOT NULL,
                        description TEXT,
                        config_json TEXT NOT NULL DEFAULT '{}',
                        is_active INTEGER NOT NULL DEFAULT 1,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )

                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS bot_groups (
                        group_id TEXT PRIMARY KEY,
                        name TEXT UNIQUE NOT NULL,
                        description TEXT,
                        color TEXT DEFAULT '#00b4d8',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_bot_groups_name ON bot_groups(name)")

                # Check and alter bot_instances for full registry schema
                cursor.execute("PRAGMA table_info(bot_instances)")
                bot_cols = [row["name"] for row in cursor.fetchall()]
                bot_schema_cols = {
                    "asset_class": "TEXT DEFAULT 'Crypto'",
                    "exchange": "TEXT DEFAULT 'Binance'",
                    "execution_mode": "TEXT DEFAULT 'PAPER'",
                    "group_name": "TEXT DEFAULT 'Crypto Scalping Bots'",
                    "template_id": "TEXT DEFAULT ''",
                    "started_at": "TEXT",
                    "stopped_at": "TEXT",
                    "paused_at": "TEXT",
                    "resumed_at": "TEXT",
                    "last_heartbeat": "TEXT",
                    "last_scan_at": "TEXT",
                    "next_scan_at": "TEXT",
                    "scan_count": "INTEGER DEFAULT 0",
                    "trade_count": "INTEGER DEFAULT 0",
                    "open_position_count": "INTEGER DEFAULT 0",
                    "current_signal": "TEXT DEFAULT 'HOLD'",
                    "signal_confidence": "REAL DEFAULT 0.0",
                    "required_confidence": "REAL DEFAULT 75.0",
                    "current_equity": "REAL DEFAULT 10000.0",
                    "realized_pnl": "REAL DEFAULT 0.0",
                    "unrealized_pnl": "REAL DEFAULT 0.0",
                    "error_count": "INTEGER DEFAULT 0",
                    "last_error": "TEXT DEFAULT ''",
                    "process_id": "TEXT DEFAULT ''",
                    "last_checked_at": "TEXT",
                    "stuck_explanation": "TEXT DEFAULT ''",
                    "is_deleted": "INTEGER DEFAULT 0",
                    "deleted_at": "TEXT",
                    "deleted_by": "TEXT",
                    "deletion_reason": "TEXT"
                }
                for col_name, col_def in bot_schema_cols.items():
                    if col_name not in bot_cols:
                        cursor.execute(f"ALTER TABLE bot_instances ADD COLUMN {col_name} {col_def}")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_bot_instances_is_deleted ON bot_instances(is_deleted)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_bot_instances_active_group ON bot_instances(is_deleted, status, group_name)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_trades_log_status_id ON trades_log(status, id DESC)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_trades_log_symbol ON trades_log(symbol)")
                # Check and alter bot_activity_logs for both event_type and activity_type
                try:
                    cursor.execute("PRAGMA table_info(bot_activity_logs)")
                    act_cols = [row["name"] for row in cursor.fetchall()]
                    if "event_type" not in act_cols:
                        cursor.execute("ALTER TABLE bot_activity_logs ADD COLUMN event_type TEXT DEFAULT 'EVENT'")
                    if "activity_type" not in act_cols:
                        cursor.execute("ALTER TABLE bot_activity_logs ADD COLUMN activity_type TEXT DEFAULT 'EVENT'")
                except Exception:
                    pass

                cursor.execute("UPDATE bot_instances SET group_name = 'Crypto Scalping Bots' WHERE group_name IS NULL OR group_name = ''")

                conn.commit()
                conn.close()
                _db_initialized = True
                try:
                    from src.trade_ledger import init_trade_ledger_schema
                    init_trade_ledger_schema()
                except Exception as tl_err:
                    logger.debug("trade ledger schema init notice: %s", tl_err)
                logger.info("SQLite database tables verified/created.")
                seed_demo_data_if_needed()
                return
            except sqlite3.OperationalError as exc:
                if attempt == 4:
                    logger.warning("DB init operational lock warning: %s", exc)
                    _db_initialized = True
                    return
                time.sleep(0.5)


def seed_market_universe_if_needed() -> None:
    """Auto-sync market universe instruments on startup if table is empty."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as count FROM market_universe")
        cnt = cursor.fetchone()["count"]
        conn.close()
        if cnt == 0:
            import importlib
            try:
                mu_module = importlib.import_module("src.market_universe")
            except ImportError:
                mu_module = importlib.import_module("market_universe")
            mu_module.MarketUniverseManager.sync_all_markets()
    except Exception as exc:
        logger.error(f"Error seeding market universe: {exc}")


def seed_bot_templates_if_needed() -> None:
    """Seed default pre-configured trading bot templates if table is empty."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as count FROM bot_templates")
        if cursor.fetchone()["count"] == 0:
            now_str = datetime.now(timezone.utc).isoformat()
            templates = [
                (
                    "tpl-btc-scalper",
                    "Alpha BTC Scalper",
                    "Scalping",
                    "Crypto",
                    "BTC/USDT",
                    "5m",
                    "Scalping",
                    "High-frequency 5m scalper utilizing EMA 9/20 crossovers, VWAP mean-reversion, and fast RSI pullbacks.",
                    json.dumps({
                        "risk_pct": 0.02,
                        "required_confidence": 75.0,
                        "indicators": ["ema_9", "ema_20", "rsi", "vwap", "supertrend", "atr"]
                    }),
                    1, now_str, now_str
                ),
                (
                    "tpl-trend-breakout",
                    "Trend Breakout Pro",
                    "Trend Following",
                    "Crypto",
                    "BTC/USDT",
                    "15m",
                    "Trend Following",
                    "Institutional 15m trend breakout strategy combining Supertrend, 200 EMA filter, and Volume Profile Value Area breakouts.",
                    json.dumps({
                        "risk_pct": 0.015,
                        "required_confidence": 75.0,
                        "indicators": ["ema_20", "ema_50", "ema_200", "supertrend", "adx", "vwap"]
                    }),
                    1, now_str, now_str
                ),
                (
                    "tpl-altcoin-momentum",
                    "Altcoin Momentum Hunter",
                    "Momentum",
                    "Crypto",
                    "ETH/USDT",
                    "1h",
                    "Aggressive",
                    "Multi-hour momentum strategy capturing high-conviction breakout expansions across major altcoins.",
                    json.dumps({
                        "risk_pct": 0.02,
                        "required_confidence": 75.0,
                        "indicators": ["ema_9", "rsi", "stoch_rsi", "macd", "supertrend", "volume"]
                    }),
                    1, now_str, now_str
                ),
                (
                    "tpl-nifty-momentum",
                    "NSE Nifty Trend Surfer",
                    "Equities",
                    "Indian Equities",
                    "RELIANCE",
                    "15m",
                    "Trend Following",
                    "Intraday momentum strategy designed for Indian large-cap equities with Supertrend and Volume confirmation.",
                    json.dumps({
                        "risk_pct": 0.015,
                        "required_confidence": 75.0,
                        "indicators": ["ema_20", "ema_50", "supertrend", "volume", "vwap"]
                    }),
                    1, now_str, now_str
                ),
                (
                    "tpl-global-tech",
                    "US Tech Titan Swing",
                    "Global Equities",
                    "Global Equities",
                    "AAPL",
                    "1h",
                    "Balanced",
                    "Multi-session swing strategy utilizing daily bias alignment, Bollinger Bands, and MACD divergence.",
                    json.dumps({
                        "risk_pct": 0.015,
                        "required_confidence": 75.0,
                        "indicators": ["ema_9", "ema_20", "macd", "rsi", "adx", "bollinger"]
                    }),
                    1, now_str, now_str
                ),
                (
                    "tpl-forex-eurusd",
                    "FX London-NY Breakout",
                    "Forex",
                    "Forex",
                    "EURUSD",
                    "15m",
                    "Breakout",
                    "London and New York session overlap breakout strategy targeting high-liquidity currency pairs.",
                    json.dumps({
                        "risk_pct": 0.01,
                        "required_confidence": 75.0,
                        "indicators": ["bollinger", "donchian", "atr", "volume", "vwap"]
                    }),
                    1, now_str, now_str
                )
            ]
            cursor.executemany(
                """
                INSERT INTO bot_templates
                (template_id, name, category, asset_class, symbol, timeframe, strategy, description, config_json, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                templates
            )
            conn.commit()
        conn.close()
    except Exception as exc:
        logger.error(f"Error seeding bot templates: {exc}")


def seed_demo_data_if_needed() -> None:
    """Seed demo bot instances and realistic sample trades if database is newly initialized."""
    seed_indicator_configs_if_needed()
    seed_market_universe_if_needed()
    seed_bot_templates_if_needed()
    conn = get_connection()
    cursor = conn.cursor()
    
    # Seed default bot instances
    cursor.execute("SELECT COUNT(*) as count FROM bot_instances")
    if cursor.fetchone()["count"] == 0:
        now_str = datetime.now(timezone.utc).isoformat()
        bot1_config = {
            "risk_pct": 0.02,
            "indicators": [
                {"id": "ema", "name": "EMA (Exponential Moving Average)", "params": {"period": 20}},
                {"id": "macd", "name": "MACD (Moving Average Convergence Divergence)", "params": {"fast": 12, "slow": 26, "signal": 9}},
                {"id": "vp", "name": "Visible Range Volume Profile", "params": {"bins": 50}}
            ]
        }
        bot2_config = {
            "risk_pct": 0.015,
            "indicators": [
                {"id": "ema", "name": "EMA (Exponential Moving Average)", "params": {"period": 9}},
                {"id": "rsi", "name": "RSI (Relative Strength Index)", "params": {"period": 14}},
                {"id": "adx", "name": "Average Directional Index (ADX)", "params": {"period": 14}}
            ]
        }
        bot3_config = {
            "risk_pct": 0.025,
            "indicators": [
                {"id": "rsi", "name": "RSI (Relative Strength Index)", "params": {"period": 14}},
                {"id": "momentum", "name": "Momentum", "params": {"period": 10}},
                {"id": "bollinger", "name": "Bollinger Bands", "params": {"period": 20, "stdDev": 2.0}}
            ]
        }
        bots = [
            ("bot-1", "Alpha BTC Scalper", "BTC/USDT", "EMA_MACD_VP", "5m", 10000.0, "RUNNING", now_str, json.dumps(bot1_config)),
            ("bot-2", "Trend Breakout Pro", "BTC/USDT", "EMA9_RSI", "15m", 10000.0, "RUNNING", now_str, json.dumps(bot2_config)),
            ("bot-3", "Altcoin Momentum", "ETH/USDT", "RSI_MEAN_REVERSION", "1h", 15000.0, "STOPPED", now_str, json.dumps(bot3_config)),
        ]
        cursor.executemany(
            "INSERT INTO bot_instances (id, name, symbol, strategy, timeframe, allocated_capital, status, created_at, config_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            bots
        )
        conn.commit()

    # Seed default Indicator Profiles if empty
    cursor.execute("SELECT COUNT(*) as count FROM indicator_profiles")
    if cursor.fetchone()["count"] == 0:
        now_str = datetime.now(timezone.utc).isoformat()
        profiles = [
            (
                "profile-btc-15m-trend", "BTC 15m Trend", 1, 1, "TRENDING", "BALANCED", 75.0, 75.0, "WEIGHTED",
                json.dumps({
                    "ema": {"enabled": True, "weight": 20, "timeframe": "15m", "fast": 20, "slow": 50, "source": "close"},
                    "rsi": {"enabled": True, "weight": 15, "timeframe": "15m", "period": 14, "oversold": 30, "overbought": 70},
                    "macd": {"enabled": True, "weight": 20, "timeframe": "15m", "fast": 12, "slow": 26, "signal": 9},
                    "adx": {"enabled": True, "weight": 15, "timeframe": "15m", "period": 14, "threshold": 25.0},
                    "supertrend": {"enabled": True, "weight": 15, "timeframe": "15m", "atr_period": 10, "multiplier": 3.0},
                    "vwap": {"enabled": True, "weight": 15, "timeframe": "15m", "mode": "session"},
                    "volume": {"enabled": True, "weight": 10, "timeframe": "15m", "vol_sma_period": 20}
                }),
                "Optimized trend-following profile for BTC on 15m timeframe.",
                now_str, now_str
            ),
            (
                "profile-btc-15m-scalping", "BTC 15m Scalping", 1, 1, "TRENDING", "AGGRESSIVE", 70.0, 70.0, "WEIGHTED",
                json.dumps({
                    "ema": {"enabled": True, "weight": 25, "timeframe": "15m", "fast": 9, "slow": 21, "source": "close"},
                    "rsi": {"enabled": True, "weight": 20, "timeframe": "15m", "period": 7, "oversold": 25, "overbought": 75},
                    "vwap": {"enabled": True, "weight": 20, "timeframe": "15m", "mode": "session"},
                    "supertrend": {"enabled": True, "weight": 15, "timeframe": "15m", "atr_period": 7, "multiplier": 2.0},
                    "volume": {"enabled": True, "weight": 10, "timeframe": "15m", "vol_sma_period": 10},
                    "atr": {"enabled": True, "weight": 10, "timeframe": "15m", "period": 14, "multiplier": 1.5}
                }),
                "Fast momentum scalping profile with tight EMA crosses & RSI(7).",
                now_str, now_str
            ),
            (
                "profile-btc-15m-breakout", "BTC 15m Breakout", 1, 1, "BREAKOUT", "BALANCED", 75.0, 75.0, "WEIGHTED",
                json.dumps({
                    "ema": {"enabled": True, "weight": 15, "timeframe": "15m", "fast": 20, "slow": 50, "source": "close"},
                    "bollinger": {"enabled": True, "weight": 25, "timeframe": "15m", "period": 20, "std_dev": 2.0},
                    "atr": {"enabled": True, "weight": 15, "timeframe": "15m", "period": 14, "multiplier": 2.0},
                    "volume": {"enabled": True, "weight": 20, "timeframe": "15m", "vol_sma_period": 20},
                    "vwap": {"enabled": True, "weight": 15, "timeframe": "15m", "mode": "session"},
                    "donchian": {"enabled": True, "weight": 10, "timeframe": "15m", "period": 20}
                }),
                "Volatile expansion and channel breakout detection profile.",
                now_str, now_str
            ),
            (
                "profile-conservative-trend", "Conservative Trend", 1, 1, "TRENDING", "CONSERVATIVE", 80.0, 80.0, "WEIGHTED",
                json.dumps({
                    "ema": {"enabled": True, "weight": 25, "timeframe": "15m", "fast": 50, "slow": 200, "source": "close"},
                    "macd": {"enabled": True, "weight": 20, "timeframe": "15m", "fast": 12, "slow": 26, "signal": 9},
                    "adx": {"enabled": True, "weight": 20, "timeframe": "15m", "period": 14, "threshold": 25.0},
                    "vwap": {"enabled": True, "weight": 15, "timeframe": "15m", "mode": "session"},
                    "volume": {"enabled": True, "weight": 10, "timeframe": "15m", "vol_sma_period": 20},
                    "rsi": {"enabled": True, "weight": 10, "timeframe": "15m", "period": 14, "oversold": 30, "overbought": 70}
                }),
                "High-confidence trend confirmation profile requiring EMA 50/200 & ADX.",
                now_str, now_str
            ),
            (
                "profile-mean-reversion", "Mean Reversion", 1, 1, "RANGING", "BALANCED", 75.0, 75.0, "WEIGHTED",
                json.dumps({
                    "rsi": {"enabled": True, "weight": 25, "timeframe": "15m", "period": 14, "oversold": 30, "overbought": 70},
                    "bollinger": {"enabled": True, "weight": 25, "timeframe": "15m", "period": 20, "std_dev": 2.0},
                    "vwap": {"enabled": True, "weight": 20, "timeframe": "15m", "mode": "session"},
                    "stoch_rsi": {"enabled": True, "weight": 15, "timeframe": "15m", "period": 14, "k": 3, "d": 3, "oversold": 20, "overbought": 80},
                    "pivot": {"enabled": True, "weight": 15, "timeframe": "15m", "type": "standard"}
                }),
                "Oscillator & envelope profile for sideways / ranging markets.",
                now_str, now_str
            )
        ]
        cursor.executemany(
            """
            INSERT INTO indicator_profiles 
            (profile_id, name, version, is_active, market_regime, adaptive_mode, signal_threshold_long, signal_threshold_short, scoring_mode, config_json, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            profiles
        )
        
        # Seed version history
        for p in profiles:
            cursor.execute(
                "INSERT INTO indicator_profile_versions (profile_id, version, name, config_json, created_at, change_notes) VALUES (?, 1, ?, ?, ?, 'Initial default release')",
                (p[0], p[1], p[9], now_str)
            )

        # Bind bot-1 to profile-btc-15m-trend
        cursor.execute("INSERT OR IGNORE INTO bot_indicator_profiles (bot_id, profile_id, applied_at) VALUES ('bot-1', 'profile-btc-15m-trend', ?)", (now_str,))
        cursor.execute("INSERT OR IGNORE INTO bot_indicator_profiles (bot_id, profile_id, applied_at) VALUES ('bot-2', 'profile-btc-15m-breakout', ?)", (now_str,))
        cursor.execute("INSERT OR IGNORE INTO bot_indicator_profiles (bot_id, profile_id, applied_at) VALUES ('bot-3', 'profile-mean-reversion', ?)", (now_str,))

        conn.commit()

    # Seed default Scenario Profiles if empty
    cursor.execute("SELECT COUNT(*) as count FROM scenario_profiles")
    if cursor.fetchone()["count"] == 0:
        scenarios = [
            ("sc-trending-bull", "Trending Bull Market", json.dumps(["ema", "macd", "adx", "supertrend", "vwap", "volume"]), json.dumps({"ema": {"fast": 20, "slow": 50}, "adx": {"threshold": 25}}), "Strong upward momentum trend preferred indicators."),
            ("sc-trending-bear", "Trending Bear Market", json.dumps(["ema", "macd", "adx", "supertrend", "vwap", "volume"]), json.dumps({"ema": {"fast": 20, "slow": 50}, "adx": {"threshold": 25}}), "Strong downward trend preferred indicators."),
            ("sc-sideways-range", "Sideways / Range Market", json.dumps(["rsi", "stoch_rsi", "bollinger", "vwap", "support_resistance"]), json.dumps({"rsi": {"oversold": 30, "overbought": 70}}), "Oscillator and band-reversion preferred indicators."),
            ("sc-high-volatility", "High Volatility", json.dumps(["atr", "bollinger", "adx", "volume", "supertrend"]), json.dumps({"atr": {"multiplier": 2.0}}), "Expansion and volatility envelope preferred indicators."),
            ("sc-low-volatility", "Low Volatility", json.dumps(["bollinger", "vwap", "rsi", "volume"]), json.dumps({"bollinger": {"period": 20, "std_dev": 2.0}}), "Contraction and range building preferred indicators."),
            ("sc-breakout", "Breakout Scenario", json.dumps(["volume", "bollinger", "atr", "donchian", "vwap", "ema"]), json.dumps({"donchian": {"period": 20}}), "Channel breakout & volume expansion preferred indicators."),
            ("sc-pullback", "Pullback Scenario", json.dumps(["ema", "vwap", "rsi", "macd", "volume"]), json.dumps({"rsi": {"period": 14}}), "Trend retracement entry preferred indicators.")
        ]
        cursor.executemany(
            "INSERT INTO scenario_profiles (scenario_id, name, preferred_indicators_json, default_params_json, description) VALUES (?, ?, ?, ?, ?)",
            scenarios
        )
        conn.commit()

    # Seed demo trades if trade history has fewer than 10 trades
    cursor.execute("SELECT COUNT(*) as count FROM trades_log")
    if cursor.fetchone()["count"] < 5:
        now = datetime.now(timezone.utc)
        sample_trades = [
            (
                (now - timedelta(days=14, hours=3)).isoformat(), "BTC/USDT", "LONG", 62500.0, 61250.0, 65000.0, 0.25, "CLOSED", 64800.0,
                (now - timedelta(days=14, hours=1)).isoformat(), 575.0, "bot-1", "EMA_MACD_VP", 2.50, "🎯 Disciplined", "Perfect EMA cross + VP confirmation"
            ),
            (
                (now - timedelta(days=12, hours=5)).isoformat(), "BTC/USDT", "SHORT", 64200.0, 65500.0, 61600.0, 0.20, "CLOSED", 65500.0,
                (now - timedelta(days=12, hours=3)).isoformat(), -260.0, "bot-1", "EMA_MACD_VP", 2.20, "😤 FOMO", "Entered early before RSI rejection confirmed"
            ),
            (
                (now - timedelta(days=10, hours=8)).isoformat(), "BTC/USDT", "LONG", 63100.0, 62000.0, 66000.0, 0.30, "CLOSED", 65900.0,
                (now - timedelta(days=9, hours=14)).isoformat(), 840.0, "bot-2", "EMA9_RSI", 3.10, "🎯 Disciplined", "Clean trend retest at 9 EMA"
            ),
            (
                (now - timedelta(days=8, hours=2)).isoformat(), "ETH/USDT", "LONG", 3400.0, 3300.0, 3650.0, 3.5, "CLOSED", 3620.0,
                (now - timedelta(days=7, hours=19)).isoformat(), 770.0, "bot-3", "RSI_MEAN_REVERSION", 4.50, "🧘 Calm", "Oversold RSI dip play hit target"
            ),
            (
                (now - timedelta(days=6, hours=10)).isoformat(), "BTC/USDT", "SHORT", 66500.0, 67800.0, 64000.0, 0.18, "CLOSED", 67800.0,
                (now - timedelta(days=6, hours=8)).isoformat(), -234.0, "bot-1", "EMA_MACD_VP", 1.80, "⚡ Impulsive", "Breakout stop hunted"
            ),
            (
                (now - timedelta(days=4, hours=12)).isoformat(), "BTC/USDT", "LONG", 65200.0, 64100.0, 68000.0, 0.25, "CLOSED", 67600.0,
                (now - timedelta(days=3, hours=22)).isoformat(), 600.0, "bot-2", "EMA9_RSI", 2.80, "🎯 Disciplined", "Solid risk reward follow through"
            ),
            (
                (now - timedelta(days=2, hours=6)).isoformat(), "ETH/USDT", "SHORT", 3550.0, 3650.0, 3350.0, 4.0, "CLOSED", 3550.0,
                (now - timedelta(days=2, hours=4)).isoformat(), 0.0, "bot-3", "RSI_MEAN_REVERSION", 3.20, "🧘 Calm", "Breakeven exit after momentum stalled"
            ),
            (
                (now - timedelta(hours=14)).isoformat(), "BTC/USDT", "LONG", 66800.0, 65800.0, 69500.0, 0.22, "CLOSED", 68500.0,
                (now - timedelta(hours=4)).isoformat(), 374.0, "bot-1", "EMA_MACD_VP", 2.10, "🎯 Disciplined", "Trail stop hit at profit zone"
            ),
            (
                (now - timedelta(hours=2)).isoformat(), "BTC/USDT", "LONG", 68200.0, 67000.0, 71000.0, 0.20, "OPEN", None,
                None, 0.0, "bot-1", "EMA_MACD_VP", 0.0, "🎯 Disciplined", "Active trade trailing SL"
            )
        ]
        cursor.executemany(
            """
            INSERT INTO trades_log (timestamp, symbol, direction, entry_price, stop_loss, take_profit, position_size, status, exit_price, exit_timestamp, result_pnl, bot_id, strategy, fees, emotion_tag, remarks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            sample_trades
        )
        conn.commit()
    conn.close()


def _json_dumps(value: Optional[Dict[str, Any]]) -> str:
    return json.dumps(value or {}, default=str)


def log_signal(
    symbol: str,
    signal_type: str,
    price: float,
    filters_status: dict,
    is_blocked: bool,
    reason: str,
    context: Optional[Dict[str, Any]] = None,
) -> None:
    """Persist a strategy signal evaluation to the database."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            """
            INSERT INTO signals_log (timestamp, symbol, signal_type, price, filters_status, is_blocked, reason, context)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (now_str, symbol, signal_type, price, _json_dumps(filters_status), 1 if is_blocked else 0, reason, _json_dumps(context)),
        )
        conn.commit()
        conn.close()
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error("Error logging signal to DB: %s", exc)


def log_trade_entry(
    symbol: str,
    direction: str,
    entry_price: float,
    stop_loss: float,
    take_profit: float,
    position_size: float,
    metadata: Optional[Dict[str, Any]] = None,
    bot_id: str = "bot-1",
    strategy: str = "EMA_MACD_VP",
) -> int:
    """Log a new trade entry and return the generated trade row ID."""
    trade_id = -1
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            """
            INSERT INTO trades_log (timestamp, symbol, direction, entry_price, stop_loss, take_profit, position_size, status, metadata, bot_id, strategy)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)
            """,
            (now_str, symbol, direction, entry_price, stop_loss, take_profit, position_size, _json_dumps(metadata), bot_id, strategy),
        )
        conn.commit()
        trade_id = cursor.lastrowid
        conn.close()
        logger.info("Logged trade entry in DB. ID: %s (Bot: %s, Strategy: %s)", trade_id, bot_id, strategy)
    except Exception as exc:
        logger.error("Error logging trade entry to DB: %s", exc)
    return trade_id


def log_trade_exit(trade_id: int, exit_price: float, result_pnl: float, reason: str = "") -> None:
    """Close an open trade and persist its finalized PnL."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            """
            UPDATE trades_log
            SET status = 'CLOSED', exit_price = ?, exit_timestamp = ?, result_pnl = ?, metadata = COALESCE(metadata, '{}') || ?
            WHERE id = ?
            """,
            (exit_price, now_str, result_pnl, json.dumps({"exit_reason": reason}), trade_id),
        )
        conn.commit()
        conn.close()
        logger.info("Updated trade exit in DB for ID: %s", trade_id)
    except Exception as exc:
        logger.error("Error logging trade exit to DB: %s", exc)


def close_all_open_positions_and_cancel_orders(reason: str = "TRADING HALTED: Emergency Kill Switch Triggered") -> Dict[str, int]:
    """
    Cancel all pending orders, close all open positions, block pending signals,
    and update all bot instances status to HALTED.
    """
    closed_positions_count = 0
    cancelled_orders_count = 0
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()

        # Find open positions
        cursor.execute("SELECT id, symbol, entry_price FROM trades_log WHERE status = 'OPEN'")
        open_trades = cursor.fetchall()
        for t in open_trades:
            trade_id = t["id"]
            entry_p = float(t["entry_price"])
            cursor.execute(
                """
                UPDATE trades_log
                SET status = 'CLOSED', exit_price = ?, exit_timestamp = ?, result_pnl = 0.0,
                    remarks = ?
                WHERE id = ?
                """,
                (entry_p, now_str, f"[KILL SWITCH] {reason}", trade_id),
            )
            closed_positions_count += 1

        # Block any pending unblocked signals
        cursor.execute("UPDATE signals_log SET is_blocked = 1, reason = ? WHERE is_blocked = 0", (f"[KILL SWITCH] {reason}",))
        cancelled_orders_count = cursor.rowcount if cursor.rowcount > 0 else 0

        # Update bot_instances status to HALTED
        cursor.execute("UPDATE bot_instances SET status = 'HALTED'")

        conn.commit()
        conn.close()

        log_bot_activity(
            bot_id="system",
            event_type="KILL_SWITCH",
            message=f"🔴 TRADING HALTED: Closed {closed_positions_count} open position(s) & cancelled pending orders.",
            details={"closed_positions": closed_positions_count, "reason": reason}
        )
    except Exception as exc:
        logger.error("Error during Kill Switch position close & order cancellation: %s", exc)

    return {"closed_positions": closed_positions_count, "cancelled_orders": cancelled_orders_count}


def create_pending_signal_approval(
    bot_id: str,
    symbol: str,
    signal_type: str,
    price: float,
    confluence_pct: float,
    threshold_pct: float = 75.0,
    sl_price: float = 0.0,
    tp_price: float = 0.0,
    position_size: float = 0.0,
    strategy_details: Optional[Dict[str, Any]] = None,
    timeframe: str = "15m",
    strategy: str = "EMA_MACD_VP",
    expires_in_seconds: int = 1800,
) -> int:
    """Create a new pending signal approval entry for trader decision."""
    sig_id = -1
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_dt = datetime.now(timezone.utc)
        now_str = now_dt.isoformat()
        expires_at_str = (now_dt + timedelta(seconds=expires_in_seconds)).isoformat()
        cursor.execute(
            """
            INSERT INTO pending_signal_approvals 
            (timestamp, bot_id, symbol, timeframe, signal_type, price, confluence_pct, threshold_pct, sl_price, tp_price, position_size, strategy, strategy_details, status, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'WAITING_APPROVAL', ?)
            """,
            (now_str, bot_id, symbol, timeframe, signal_type, price, confluence_pct, threshold_pct, sl_price, tp_price, position_size, strategy, _json_dumps(strategy_details), expires_at_str),
        )
        conn.commit()
        sig_id = cursor.lastrowid
        conn.close()
        logger.info("Created pending signal approval ID %s for bot %s (%s @ $%.2f, status: WAITING_APPROVAL)", sig_id, bot_id, signal_type, price)
    except Exception as exc:
        logger.error("Error creating pending signal approval: %s", exc)
    return sig_id


def get_pending_signal_approvals(bot_id: Optional[str] = None) -> list[Dict[str, Any]]:
    """Retrieve active pending signal approvals waiting for decision."""
    results = []
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()
        # Automatically mark expired signals
        cursor.execute("UPDATE pending_signal_approvals SET status = 'EXPIRED' WHERE status IN ('WAITING_APPROVAL', 'PENDING') AND expires_at IS NOT NULL AND expires_at < ?", (now_str,))
        conn.commit()

        if bot_id:
            cursor.execute("SELECT * FROM pending_signal_approvals WHERE status IN ('WAITING_APPROVAL', 'PENDING') AND bot_id = ? ORDER BY id DESC", (bot_id,))
        else:
            cursor.execute("SELECT * FROM pending_signal_approvals WHERE status IN ('WAITING_APPROVAL', 'PENDING') ORDER BY id DESC")
        rows = cursor.fetchall()
        results = [dict(r) for r in rows]
        conn.close()
    except Exception as exc:
        logger.error("Error fetching pending signal approvals: %s", exc)
    return results


def resolve_pending_signal_approval(signal_id: int, action: str, decision_source: str = "Trader", new_status: Optional[str] = None) -> bool:
    """Update status of a pending signal approval once trader makes decision or state transitions."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()
        final_status = new_status or ("APPROVED" if action in ["BUY_LONG", "SELL_SHORT", "SQUARE_OFF"] else ("REJECTED" if action == "IGNORE" else f"RESOLVED_{action}"))
        cursor.execute(
            """
            UPDATE pending_signal_approvals
            SET status = ?, executed_action = ?, decided_at = ?, decision_source = ?
            WHERE id = ? AND status IN ('WAITING_APPROVAL', 'PENDING', 'EXECUTING')
            """,
            (final_status, action, now_str, decision_source, signal_id),
        )
        affected = cursor.rowcount
        conn.commit()
        conn.close()
        return affected > 0
    except Exception as exc:
        logger.error("Error resolving pending signal approval %s: %s", signal_id, exc)
        return False




def log_error(error_message: str, stack_trace: str = "", module: str = "", function_name: str = "", retry_count: int = 0) -> None:
    """Persist an unexpected error or API failure."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            """
            INSERT INTO system_errors (timestamp, error_message, stack_trace, module, function_name, retry_count)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (now_str, error_message, stack_trace, module, function_name, retry_count),
        )
        conn.commit()
        conn.close()
    except Exception as exc:
        logger.error("Error logging system error to DB: %s", exc)


def log_heartbeat(status: str, details: Optional[Dict[str, Any]] = None) -> None:
    """Record a heartbeat from the runner cycle."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            """
            INSERT INTO heartbeat_log (timestamp, status, details)
            VALUES (?, ?, ?)
            """,
            (now_str, status, _json_dumps(details)),
        )
        conn.commit()
        conn.close()
    except Exception as exc:
        logger.error("Error logging heartbeat to DB: %s", exc)


def log_bot_status(status: str, exchange_status: str, telegram_status: str, database_status: str, details: Optional[Dict[str, Any]] = None) -> None:
    """Persist a snapshot of the bot health."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            """
            INSERT INTO bot_status (timestamp, status, exchange_status, telegram_status, database_status, details)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (now_str, status, exchange_status, telegram_status, database_status, _json_dumps(details)),
        )
        conn.commit()
        conn.close()
    except Exception as exc:
        logger.error("Error logging bot status: %s", exc)


def log_api_event(endpoint: str, success: bool, latency_ms: Optional[float], details: Optional[Dict[str, Any]] = None) -> None:
    """Record exchange or API interactions."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            """
            INSERT INTO api_logs (timestamp, endpoint, success, latency_ms, details)
            VALUES (?, ?, ?, ?, ?)
            """,
            (now_str, endpoint, 1 if success else 0, latency_ms, _json_dumps(details)),
        )
        conn.commit()
        conn.close()
    except Exception as exc:
        logger.error("Error logging API event: %s", exc)


def log_telegram_event(success: bool, message: str, error: str = "") -> None:
    """Persist Telegram delivery attempts."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            """
            INSERT INTO telegram_logs (timestamp, success, message, error)
            VALUES (?, ?, ?, ?)
            """,
            (now_str, 1 if success else 0, message[:400], error[:400]),
        )
        conn.commit()
        conn.close()
    except Exception as exc:
        logger.error("Error logging Telegram event: %s", exc)


def log_bot_activity(bot_id: str, event_type: str, message: str, details: Optional[Dict[str, Any]] = None) -> None:
    """Log plain-language granular bot execution event and update last_checked_at timestamp."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            """
            INSERT INTO bot_activity_logs (timestamp, bot_id, event_type, activity_type, message, details_json)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (now_str, bot_id, event_type, event_type, message, _json_dumps(details or {})),
        )
        cursor.execute(
            "UPDATE bot_instances SET last_checked_at = ? WHERE id = ?",
            (now_str, bot_id)
        )
        conn.commit()
        conn.close()
    except Exception as exc:
        logger.error(f"Error logging bot activity for {bot_id}: {exc}")


def get_bot_activity_logs(bot_id: str, limit: int = 30) -> list[Dict[str, Any]]:
    """Fetch recent granular bot activity log entries for a bot instance."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT * FROM bot_activity_logs WHERE bot_id = ? ORDER BY id DESC LIMIT ?
            """,
            (bot_id, limit),
        )
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error(f"Error fetching bot activity logs for {bot_id}: {exc}")
        return []


def log_bot_decision(
    bot_id: str,
    price: float,
    timeframe: str,
    regime: str,
    adx: float,
    bullish_count: int,
    bearish_count: int,
    neutral_count: int,
    total_indicators: int,
    confluence_pct: float,
    threshold_pct: float,
    decision: str,
    reason: str,
    indicators_details: list,
    candle_timestamp: Optional[str] = None
) -> None:
    """Log complete plain-language decision breakdown for every evaluation cycle (candle close)."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()
        log_ts = candle_timestamp or now_str
        cursor.execute(
            """
            INSERT INTO bot_decision_logs 
            (timestamp, bot_id, price, timeframe, regime, adx, bullish_count, bearish_count, neutral_count, total_indicators, confluence_pct, threshold_pct, decision, reason, indicators_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (log_ts, bot_id, price, timeframe, regime, adx, bullish_count, bearish_count, neutral_count, total_indicators, confluence_pct, threshold_pct, decision, reason, _json_dumps(indicators_details)),
        )
        cursor.execute(
            "UPDATE bot_instances SET last_checked_at = ? WHERE id = ?",
            (now_str, bot_id)
        )
        conn.commit()
        conn.close()
    except Exception as exc:

        logger.error(f"Error logging bot decision for {bot_id}: {exc}")


def get_bot_decisions(bot_id: str, limit: int = 50) -> list[Dict[str, Any]]:
    """Fetch recent decision log entries for a specific bot instance."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT * FROM bot_decision_logs WHERE bot_id = ? ORDER BY id DESC LIMIT ?
            """,
            (bot_id, limit),
        )
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.error(f"Error fetching bot decisions for {bot_id}: {exc}")
        return []


def get_bot_strategy_diagnosis(bot_id: str) -> Dict[str, Any]:
    """Generates plain-language explanation analyzing recent evaluation cycles and why trades are/aren't happening."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM bot_decision_logs WHERE bot_id = ? ORDER BY id DESC LIMIT 50",
            (bot_id,)
        )
        decisions = [dict(r) for r in cursor.fetchall()]
        
        # Fetch open or recent trade count
        cursor.execute(
            "SELECT COUNT(*) as count FROM trades_log WHERE bot_id = ? AND status = 'CLOSED'",
            (bot_id,)
        )
        trade_count_row = cursor.fetchone()
        closed_trades = trade_count_row["count"] if trade_count_row else 0
        conn.close()
        
        total_scans = len(decisions)
        if total_scans == 0:
            return {
                "total_scans": 0,
                "max_confluence_pct": 0.0,
                "threshold_pct": 75.0,
                "summary": "Bot has not evaluated any market candle cycles yet. Start the bot to begin scanning."
            }
            
        max_score = max(float(d.get("confluence_pct") or 0.0) for d in decisions)
        threshold = float(decisions[0].get("threshold_pct") or 75.0)
        
        # Analyze decisions
        trade_decisions = [d for d in decisions if d.get("decision") in ["LONG", "SHORT"]]
        
        if closed_trades > 0 or len(trade_decisions) > 0:
            summary = f"Checked market {total_scans} times in recent scans. {closed_trades} closed trade(s) executed. Bot is actively executing when threshold ({threshold:.0f}%) is met."
        elif threshold >= 100.0:
            summary = f"Checked market {total_scans} times in recent scans. No trades yet — this bot requires 100% agreement across all indicators, which is rare. Best score reached: {max_score:.0f}% (consider lowering threshold for more frequent trades)."
        elif max_score < threshold:
            summary = f"Checked market {total_scans} times in recent scans. No trades yet — indicators haven't agreed strongly enough (best score reached: {max_score:.0f}%, {threshold:.0f}% required)."
        else:
            summary = f"Checked market {total_scans} times in recent scans. Best score reached {max_score:.0f}% (threshold {threshold:.0f}%). Strategy is evaluating setups."

        return {
            "total_scans": total_scans,
            "max_confluence_pct": max_score,
            "threshold_pct": threshold,
            "summary": summary
        }
    except Exception as exc:
        logger.error(f"Error generating strategy diagnosis for {bot_id}: {exc}")
        return {
            "total_scans": 0,
            "max_confluence_pct": 0.0,
            "threshold_pct": 75.0,
            "summary": "Actively scanning market cycles..."
        }


def log_system_health(
    cpu_percent: Optional[float],
    ram_mb: Optional[float],
    internet_connected: bool,
    latency_ms: Optional[float],
    balance: Optional[float],
    equity: Optional[float],
    current_position: Optional[float],
    running_time_seconds: Optional[float],
    status: str,
) -> None:
    """Persist a health snapshot containing runtime and connectivity metrics."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            """
            INSERT INTO system_health (timestamp, cpu_percent, ram_mb, internet_connected, latency_ms, balance, equity, current_position, running_time_seconds, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (now_str, cpu_percent, ram_mb, 1 if internet_connected else 0, latency_ms, balance, equity, current_position, running_time_seconds, status),
        )
        conn.commit()
        conn.close()
    except Exception as exc:
        logger.error("Error logging system health: %s", exc)


def log_daily_statistics(stats: Dict[str, Any]) -> None:
    """Persist a daily summary snapshot."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()
        date_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        cursor.execute(
            """
            INSERT INTO daily_statistics (timestamp, date_key, total_trades, winning_trades, losing_trades, win_rate, daily_pnl, balance, equity)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                now_str,
                date_key,
                stats.get("total_trades", 0),
                stats.get("winning_trades", 0),
                stats.get("losing_trades", 0),
                stats.get("win_rate", 0.0),
                stats.get("daily_pnl", 0.0),
                stats.get("balance"),
                stats.get("equity"),
            ),
        )
        conn.commit()
        conn.close()
    except Exception as exc:
        logger.error("Error logging daily statistics: %s", exc)


def backup_database() -> Optional[Path]:
    """Create a timestamped backup copy of the SQLite database."""
    if not config.DB_BACKUP_ENABLED:
        return None
    try:
        backup_dir = config.BACKUP_PATH
        backup_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        destination = backup_dir / f"trading_bot_{timestamp}.db"
        shutil.copy2(str(config.DB_PATH), str(destination))
        logger.info("Database backup created at %s", destination)
        return destination
    except Exception as exc:
        logger.error("Database backup failed: %s", exc)
        return None


def check_database_integrity() -> Tuple[bool, str]:
    """Run a SQLite integrity check and return the status."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        row = cursor.execute("PRAGMA quick_check").fetchone()
        conn.close()
        if row and row[0] == "ok":
            return True, "ok"
        return False, str(row[0]) if row else "unknown"
    except Exception as exc:
        logger.error("Database integrity check failed: %s", exc)
        return False, str(exc)


def get_todays_pnl(symbol: str = config.SYMBOL) -> float:
    """Aggregate finalized PnL for trades closed today (UTC)."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        today_date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        cursor.execute(
            """
            SELECT SUM(result_pnl) as total_pnl
            FROM trades_log
            WHERE symbol = ? AND status = 'CLOSED' AND exit_timestamp LIKE ?
            """,
            (symbol, f"{today_date_str}%"),
        )
        row = cursor.fetchone()
        conn.close()
        total_pnl = row["total_pnl"]
        return float(total_pnl) if total_pnl is not None else 0.0
    except Exception as exc:
        logger.error("Error getting today's PnL from DB: %s", exc)
        return 0.0


def get_daily_summary_stats() -> dict:
    """Retrieve execution stats for the last 24 hours (UTC)."""
    stats = {"cycles_run": 0, "signals_fired": [], "errors_count": 0}
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now = datetime.now(timezone.utc)
        day_ago = (now - timedelta(days=1)).isoformat()
        cursor.execute("SELECT COUNT(*) as count FROM heartbeat_log WHERE timestamp >= ?", (day_ago,))
        row = cursor.fetchone()
        stats["cycles_run"] = row["count"] if row else 0
        cursor.execute("SELECT timestamp, signal_type, price, reason FROM signals_log WHERE timestamp >= ? AND signal_type != 'HOLD'", (day_ago,))
        stats["signals_fired"] = [dict(r) for r in cursor.fetchall()]
        cursor.execute("SELECT COUNT(*) as count FROM system_errors WHERE timestamp >= ?", (day_ago,))
        row = cursor.fetchone()
        stats["errors_count"] = row["count"] if row else 0
        conn.close()
    except Exception as exc:
        logger.error("Error fetching daily summary stats: %s", exc)
    return stats


def update_server_heartbeat() -> None:
    """Touch server heartbeat record every cycle."""
    for attempt in range(3):
        try:
            conn = get_connection()
            cursor = conn.cursor()
            now_str = datetime.now(timezone.utc).isoformat()
            cursor.execute("SELECT id FROM system_session WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1")
            row = cursor.fetchone()
            if row:
                cursor.execute("UPDATE system_session SET last_heartbeat = ? WHERE id = ?", (now_str, row['id']))
            else:
                cursor.execute("INSERT INTO system_session (server_start_time, last_heartbeat, status) VALUES (?, ?, 'ACTIVE')", (now_str, now_str))
            conn.commit()
            conn.close()
            break
        except Exception as exc:
            if attempt == 2:
                logger.debug("Server heartbeat update retry skipped: %s", exc)
            time.sleep(0.1)


@with_db_retry(max_retries=5)
def reconcile_stale_bot_statuses() -> Dict[str, Any]:
    """
    On server startup, check for bots marked RUNNING or PAUSED that don't have active background sub-processes.
    Correct DB status to STOPPED and attach a clear explanation.
    Uses discrete atomic transactions to prevent nested self-deadlocks.
    """
    summary = {
        "last_seen_at": None,
        "offline_seconds": 0,
        "status_changes": [],
        "trades_completed_away": [],
        "net_pnl_away": 0.0,
        "disclaimer": "IMPORTANT: Bots do NOT continue running when your PC is off or the dashboard server is closed — trading only happens while dashboard.py is actively running."
    }

    try:
        now_utc = datetime.now(timezone.utc)
        now_str = now_utc.isoformat()

        # Step 1: Session heartbeat update in a short atomic transaction
        with get_db_transaction() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM system_session ORDER BY id DESC LIMIT 1")
            last_session = cursor.fetchone()

            if last_session:
                last_hb_str = last_session["last_heartbeat"] or last_session["server_start_time"]
                summary["last_seen_at"] = last_hb_str
                try:
                    last_dt = datetime.fromisoformat(last_hb_str.replace("Z", "+00:00"))
                    if last_dt.tzinfo is None:
                        last_dt = last_dt.replace(tzinfo=timezone.utc)
                    summary["offline_seconds"] = max(0, int((now_utc - last_dt).total_seconds()))
                except Exception:
                    summary["offline_seconds"] = 0

                cursor.execute("UPDATE system_session SET status = 'CLOSED' WHERE status = 'ACTIVE'")

            cursor.execute("INSERT INTO system_session (server_start_time, last_heartbeat, status) VALUES (?, ?, 'ACTIVE')", (now_str, now_str))

        # Step 2: Read bot instances (read-only)
        bot_rows = safe_query("SELECT id, name, status FROM bot_instances")
        
        # Step 3: Check OS process liveness in-memory without holding SQLite transaction
        from src.process_manager import multi_bot_manager
        updates_needed = []
        for b in bot_rows:
            bot_id = b["id"]
            name = b["name"]
            current_db_status = b["status"]

            mgr = multi_bot_manager.get_manager(bot_id)
            actual_alive = mgr.is_running()

            if (current_db_status in ["RUNNING", "PAUSED"]) and not actual_alive:
                stuck_msg = "⚠️ This bot was marked RUNNING but its process is no longer active — likely stopped when the server was closed. Click Start to resume."
                updates_needed.append((bot_id, name, current_db_status, stuck_msg))

        # Step 4: Batch apply status updates in a short atomic transaction
        if updates_needed:
            with get_db_transaction() as conn:
                cursor = conn.cursor()
                for bot_id, name, current_db_status, stuck_msg in updates_needed:
                    cursor.execute(
                        "UPDATE bot_instances SET status = 'STOPPED', stuck_explanation = ? WHERE id = ?",
                        (stuck_msg, bot_id)
                    )
                    summary["status_changes"].append({
                        "bot_id": bot_id,
                        "name": name,
                        "old_status": current_db_status,
                        "new_status": "STOPPED",
                        "reason": "process ended when server/PC shut down"
                    })
                    cursor.execute(
                        "INSERT INTO bot_activity_logs (timestamp, bot_id, event_type, message, details_json) VALUES (?, ?, 'STATUS_RECONCILED', ?, ?)",
                        (now_str, bot_id, f"Bot status reconciled from {current_db_status} to STOPPED on server restart.", json.dumps({"stuck_msg": stuck_msg}))
                    )

        # Step 5: Fetch recent trades
        if summary["last_seen_at"]:
            recent_trades = safe_query("SELECT * FROM trades_log WHERE status = 'CLOSED' AND exit_timestamp >= ? ORDER BY id DESC", (summary["last_seen_at"],))
        else:
            recent_trades = safe_query("SELECT * FROM trades_log WHERE status = 'CLOSED' ORDER BY id DESC LIMIT 5")

        summary["trades_completed_away"] = recent_trades
        summary["net_pnl_away"] = sum(float(t.get("result_pnl") or 0.0) for t in recent_trades)

    except Exception as exc:
        logger.error("Error during bot status reconciliation: %s", exc)

    return summary


def compute_bot_health(
    bot_id: str,
    live_market_price: Optional[Any] = None,
    bot_dict: Optional[Dict[str, Any]] = None,
    latest_decisions: Optional[Dict[str, Any]] = None,
    **kwargs: Any
) -> Dict[str, Any]:

    """
    Computes a non-falsifiable health indicator for a bot instance quickly in memory without external network calls.
    1. Process survival (actual process state vs DB status)
    2. Evaluation timestamp freshness vs timeframe expected interval
    3. Symbol-specific price accuracy
    4. Reasoning continuity
    """
    reasons = []

    if bot_dict is None:
        conn = get_connection()
        c = conn.cursor()
        c.execute("SELECT * FROM bot_instances WHERE id = ?", (bot_id,))
        row = c.fetchone()
        conn.close()
        if not row:
            return {
                "bot_id": bot_id,
                "health_status": "UNRELIABLE",
                "is_process_alive": False,
                "reasons": ["Bot instance record not found"],
                "last_checked_at": None,
                "last_logged_price": None,
                "live_market_price": None,
                "age_seconds": None,
                "info": "Bot instance not found"
            }
        bot = dict(row)
    else:
        bot = bot_dict

    symbol = bot.get("symbol", "BTC/USDT").upper()
    timeframe = bot.get("timeframe", "5m")
    last_checked_str = bot.get("last_checked_at")
    status = bot.get("status", "STOPPED")

    # 1. Process Survival Check
    from src.process_manager import multi_bot_manager
    mgr = multi_bot_manager.get_manager(bot_id)
    is_alive = mgr.is_running()

    if status in ["RUNNING", "PAUSED"] and not is_alive:
        reasons.append(f"Process is DEAD/Missing while marked {status}")

    # 2. Evaluation Timestamp Freshness Check
    from src.indicators import get_timeframe_minutes
    mins = get_timeframe_minutes(timeframe)
    max_interval_sec = max(mins * 60 * 2 + 60, 300)

    now_utc = datetime.now(timezone.utc)
    age_seconds = None

    if last_checked_str:
        try:
            last_dt = datetime.fromisoformat(last_checked_str.replace("Z", "+00:00"))
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            age_seconds = int((now_utc - last_dt).total_seconds())
        except Exception:
            age_seconds = 999999

    if status == "RUNNING":
        if age_seconds is None or age_seconds > max_interval_sec:
            reasons.append(f"Evaluation Stalled: Last cycle was {age_seconds if age_seconds is not None else 'N/A'}s ago (expected <{max_interval_sec}s)")

    # 3. Decision Reasoning Check
    last_logged_price = None
    dec_row = None
    if latest_decisions and bot_id in latest_decisions:
        dec_row = dict(latest_decisions[bot_id]) if latest_decisions[bot_id] else None
    elif bot_dict is None:
        conn = get_connection()
        c = conn.cursor()
        c.execute("SELECT price, timestamp, reason, indicators_json FROM bot_decision_logs WHERE bot_id = ? ORDER BY id DESC LIMIT 1", (bot_id,))
        row = c.fetchone()
        dec_row = dict(row) if row else None
        conn.close()

    if dec_row:
        last_logged_price = float(dec_row["price"]) if dec_row.get("price") else None

    # Determine live market price
    target_live_price = None
    if isinstance(live_market_price, dict):
        target_live_price = live_market_price.get(symbol)
    elif isinstance(live_market_price, (int, float)) and symbol in ["BTC/USDT", "BTCUSDT"]:
        target_live_price = float(live_market_price)

    if status == "RUNNING":
        if not dec_row and not last_checked_str:
            reasons.append("Reasoning Missing: Zero decision logs recorded for this bot")
        elif dec_row:
            dec_time_str = dec_row.get("timestamp")
            if dec_time_str:
                try:
                    dec_dt = datetime.fromisoformat(dec_time_str.replace("Z", "+00:00"))
                    if dec_dt.tzinfo is None:
                        dec_dt = dec_dt.replace(tzinfo=timezone.utc)
                    dec_age = int((now_utc - dec_dt).total_seconds())
                    if dec_age > max_interval_sec:
                        reasons.append(f"Reasoning Stale: Last reasoning update was {dec_age}s ago")
                except Exception:
                    pass


        if target_live_price and last_logged_price:
            price_diff_pct = abs(last_logged_price - target_live_price) / target_live_price * 100.0
            if price_diff_pct > 5.0:
                reasons.append(f"Price Discrepancy ({symbol}): Logged ${last_logged_price:,.2f} vs Live ${target_live_price:,.2f} ({price_diff_pct:.1f}% deviation)")

    if status == "STOPPED":
        health_status = "STOPPED"
        if last_logged_price and age_seconds is not None:
            hours_ago = round(age_seconds / 3600.0, 1)
            info_msg = f"Bot is stopped (last evaluated {hours_ago}h ago on {symbol} at ${last_logged_price:,.2f})"
        else:
            info_msg = f"Bot is stopped on {symbol}"
    elif len(reasons) > 0:
        health_status = "UNRELIABLE"
        info_msg = " | ".join(reasons)
    else:
        health_status = "HEALTHY"
        info_msg = f"Evaluating actively on {symbol}"

    return {
        "bot_id": bot_id,
        "name": bot.get("name"),
        "symbol": symbol,
        "status": status,
        "health_status": health_status,
        "is_process_alive": is_alive,
        "reasons": reasons,
        "last_checked_at": last_checked_str,
        "age_seconds": age_seconds,
        "last_logged_price": last_logged_price,
        "live_market_price": target_live_price,
        "info": info_msg
    }




def audit_and_clean_db() -> Dict[str, Any]:
    """
    Audit trade history and bot logs in the database for corruption, duplicates, or inconsistencies.
    Removes duplicate trades from multiple server runs and reports findings.
    """
    report = {
        "trades_audited": 0,
        "duplicate_trades_removed": 0,
        "inconsistent_trades_fixed": 0,
        "details": []
    }
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM trades_log ORDER BY id ASC")
        trades = [dict(r) for r in cursor.fetchall()]
        report["trades_audited"] = len(trades)

        seen_trades = []
        duplicate_ids = []

        for t in trades:
            t_time_str = t.get("timestamp") or ""
            t_dt = None
            if t_time_str:
                try:
                    t_dt = datetime.fromisoformat(t_time_str.replace("Z", "+00:00"))
                except Exception:
                    pass

            is_dup = False
            for prev in seen_trades:
                if (t["symbol"] == prev["symbol"] and
                    t["direction"] == prev["direction"] and
                    abs(float(t["entry_price"]) - float(prev["entry_price"])) < 0.01 and
                    abs(float(t["position_size"]) - float(prev["position_size"])) < 0.00001):

                    if t_dt and prev["dt"]:
                        diff_sec = abs((t_dt - prev["dt"]).total_seconds())
                        if diff_sec <= 15:
                            is_dup = True
                            break
                    elif t_time_str == prev["timestamp"]:
                        is_dup = True
                        break

            if is_dup:
                duplicate_ids.append(t["id"])
                report["details"].append(f"Duplicate trade ID {t['id']} ({t['symbol']} {t['direction']} @ ${t['entry_price']})")
            else:
                seen_trades.append({
                    "id": t["id"],
                    "symbol": t["symbol"],
                    "direction": t["direction"],
                    "entry_price": t["entry_price"],
                    "position_size": t["position_size"],
                    "timestamp": t_time_str,
                    "dt": t_dt
                })

        if duplicate_ids:
            for did in duplicate_ids:
                cursor.execute("DELETE FROM trades_log WHERE id = ?", (did,))
            report["duplicate_trades_removed"] = len(duplicate_ids)
            logger.info("DB Audit: Removed %d duplicate trade records: %s", len(duplicate_ids), duplicate_ids)

        conn.commit()
        conn.close()
    except Exception as exc:
        logger.error("Error during DB audit and clean: %s", exc)
        report["error"] = str(exc)

    return report


def get_indicator_profiles() -> list[Dict[str, Any]]:
    """Fetch all saved indicator profiles."""
    results = []
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM indicator_profiles ORDER BY updated_at DESC")
        rows = cursor.fetchall()
        for r in rows:
            d = dict(r)
            d["config"] = json.loads(d.get("config_json") or "{}")
            results.append(d)
        conn.close()
    except Exception as exc:
        logger.error(f"Error fetching indicator profiles: {exc}")
    return results


def get_indicator_profile_by_id(profile_id: str) -> Optional[Dict[str, Any]]:
    """Fetch single indicator profile by ID."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM indicator_profiles WHERE profile_id = ?", (profile_id,))
        row = cursor.fetchone()
        conn.close()
        if row:
            d = dict(row)
            d["config"] = json.loads(d.get("config_json") or "{}")
            return d
    except Exception as exc:
        logger.error(f"Error fetching profile {profile_id}: {exc}")
    return None


def save_indicator_profile(profile_data: Dict[str, Any]) -> Tuple[bool, str]:
    """Create or update an indicator profile and record version history."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()

        pid = profile_data.get("profile_id") or f"profile-{int(time.time())}"
        name = profile_data.get("name", "Custom Profile")
        market_regime = profile_data.get("market_regime", "ALL")
        adaptive_mode = profile_data.get("adaptive_mode", "BALANCED")
        threshold_long = float(profile_data.get("signal_threshold_long", 75.0))
        threshold_short = float(profile_data.get("signal_threshold_short", 75.0))
        scoring_mode = profile_data.get("scoring_mode", "WEIGHTED")
        config_dict = profile_data.get("config") or profile_data.get("config_json") or {}
        config_json = json.dumps(config_dict) if isinstance(config_dict, dict) else str(config_dict)
        description = profile_data.get("description", "")

        cursor.execute("SELECT version FROM indicator_profiles WHERE profile_id = ?", (pid,))
        existing = cursor.fetchone()

        if existing:
            new_ver = existing["version"] + 1
            cursor.execute(
                """
                UPDATE indicator_profiles
                SET name = ?, version = ?, market_regime = ?, adaptive_mode = ?, signal_threshold_long = ?, signal_threshold_short = ?, scoring_mode = ?, config_json = ?, description = ?, updated_at = ?
                WHERE profile_id = ?
                """,
                (name, new_ver, market_regime, adaptive_mode, threshold_long, threshold_short, scoring_mode, config_json, description, now_str, pid),
            )
        else:
            new_ver = 1
            cursor.execute(
                """
                INSERT INTO indicator_profiles
                (profile_id, name, version, is_active, market_regime, adaptive_mode, signal_threshold_long, signal_threshold_short, scoring_mode, config_json, description, created_at, updated_at)
                VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (pid, name, new_ver, market_regime, adaptive_mode, threshold_long, threshold_short, scoring_mode, config_json, description, now_str, now_str),
            )

        # Record version history
        notes = profile_data.get("change_notes", f"Saved version {new_ver}")
        cursor.execute(
            "INSERT INTO indicator_profile_versions (profile_id, version, name, config_json, created_at, change_notes) VALUES (?, ?, ?, ?, ?, ?)",
            (pid, new_ver, name, config_json, now_str, notes),
        )

        conn.commit()
        conn.close()
        return True, pid
    except Exception as exc:
        logger.error(f"Error saving indicator profile: {exc}")
        return False, str(exc)


def get_bot_indicator_profile(bot_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve active indicator profile assigned to a specific bot instance."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT ip.* FROM indicator_profiles ip
            JOIN bot_indicator_profiles bip ON ip.profile_id = bip.profile_id
            WHERE bip.bot_id = ?
            """,
            (bot_id,),
        )
        row = cursor.fetchone()
        conn.close()
        if row:
            d = dict(row)
            d["config"] = json.loads(d.get("config_json") or "{}")
            return d
    except Exception as exc:
        logger.error(f"Error fetching bot indicator profile for {bot_id}: {exc}")
    return get_indicator_profile_by_id("profile-btc-15m-trend")


def apply_profile_to_bot(bot_id: str, profile_id: str) -> bool:
    """Assign an indicator profile to a bot instance."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()
        cursor.execute("INSERT OR REPLACE INTO bot_indicator_profiles (bot_id, profile_id, applied_at) VALUES (?, ?, ?)", (bot_id, profile_id, now_str))
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.error(f"Error applying profile {profile_id} to bot {bot_id}: {exc}")
        return False


def get_scenario_profiles() -> list[Dict[str, Any]]:
    """Retrieve scenario profiles."""
    results = []
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM scenario_profiles")
        rows = cursor.fetchall()
        for r in rows:
            d = dict(r)
            d["preferred_indicators"] = json.loads(d.get("preferred_indicators_json") or "[]")
            d["default_params"] = json.loads(d.get("default_params_json") or "{}")
            results.append(d)
        conn.close()
    except Exception as exc:
        logger.error(f"Error fetching scenario profiles: {exc}")
    return results


def save_bot_indicators(bot_id: str, indicators: list) -> bool:
    """Update indicators configuration inside bot_instances.config_json for a specific bot instance."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT config_json FROM bot_instances WHERE id = ?", (bot_id,))
        row = cursor.fetchone()
        cfg = {}
        if row and row["config_json"]:
            try:
                cfg = json.loads(row["config_json"])
                if isinstance(cfg, str):
                    cfg = json.loads(cfg)
            except Exception:
                cfg = {}
        if not isinstance(cfg, dict):
            cfg = {}

        cfg["indicators"] = indicators
        cfg_str = json.dumps(cfg)
        now_str = datetime.now(timezone.utc).isoformat()

        cursor.execute(
            "UPDATE bot_instances SET config_json = ? WHERE id = ?",
            (cfg_str, bot_id)
        )
        conn.commit()
        conn.close()
        logger.info("Saved indicators configuration for bot instance '%s': %s", bot_id, indicators)
        return True
    except Exception as exc:
        logger.error("Error saving bot indicators for %s: %s", bot_id, exc)
        return False


def cleanup_bot_instances() -> Dict[str, Any]:
    """
    Remove all duplicate and temporary test bot instances from bot_instances table,
    retaining only the 3 primary core bots (bot-1, bot-2, bot-3).
    Returns a report detailing removed and retained bot IDs.
    """
    report = {
        "retained_bots": [],
        "removed_bots": []
    }
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM bot_instances")
        all_bots = cursor.fetchall()

        allowed_bot_ids = {"bot-1", "bot-2", "bot-3"}
        for b in all_bots:
            b_id = b["id"]
            b_name = b["name"]
            if b_id in allowed_bot_ids:
                report["retained_bots"].append(f"{b_id} ({b_name})")
            else:
                cursor.execute("DELETE FROM bot_instances WHERE id = ?", (b_id,))
                report["removed_bots"].append(f"{b_id} ({b_name})")

        conn.commit()
        conn.close()
        logger.info(f"Bot Instances Cleanup: Retained {len(report['retained_bots'])}, Removed {len(report['removed_bots'])} test bots.")
    except Exception as exc:
        logger.error(f"Error during bot instances cleanup: {exc}")
        report["error"] = str(exc)

    return report


def seed_indicator_configs_if_needed() -> None:
    """Seed default indicator configuration records and presets from universal schemas if not present."""
    try:
        from src.indicator_schema import UNIVERSAL_INDICATOR_SCHEMAS, UNIVERSAL_INDICATOR_PRESETS
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()

        # Seed indicator configs
        for ind_id, schema in UNIVERSAL_INDICATOR_SCHEMAS.items():
            cursor.execute("SELECT id FROM indicator_configs WHERE indicator_id = ?", (ind_id,))
            row = cursor.fetchone()
            if not row:
                params_json = json.dumps(schema.get("default_parameters", {}))
                disp_json = json.dumps(schema.get("default_display", {}))
                sig_json = json.dumps(schema.get("default_signal", {}))
                cursor.execute(
                    """
                    INSERT INTO indicator_configs 
                    (indicator_id, name, category, enabled, favorite, timeframe, weight, long_enabled, short_enabled, signal_mode, min_confirmations, parameters_json, display_json, signal_rules_json, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        ind_id,
                        schema.get("name", ind_id),
                        schema.get("category", "General"),
                        1,
                        0,
                        schema.get("default_timeframe", "15m"),
                        float(schema.get("default_weight", 15.0)),
                        1 if schema.get("default_signal", {}).get("long_enabled", True) else 0,
                        1 if schema.get("default_signal", {}).get("short_enabled", True) else 0,
                        schema.get("default_signal", {}).get("signal_mode", "both"),
                        int(schema.get("default_signal", {}).get("min_confirmations", 1)),
                        params_json,
                        disp_json,
                        sig_json,
                        now_str,
                        now_str
                    )
                )

        # Seed system presets
        for preset_name, preset_data in UNIVERSAL_INDICATOR_PRESETS.items():
            preset_id = preset_name.lower().replace(" ", "_").replace("/", "_")
            cursor.execute("SELECT preset_id FROM indicator_presets WHERE preset_id = ?", (preset_id,))
            if not cursor.fetchone():
                cursor.execute(
                    """
                    INSERT INTO indicator_presets (preset_id, name, category, description, config_json, is_system, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
                    """,
                    (
                        preset_id,
                        preset_data.get("name", preset_name),
                        preset_data.get("category", "General"),
                        preset_data.get("description", ""),
                        json.dumps(preset_data),
                        now_str,
                        now_str
                    )
                )

        conn.commit()
        conn.close()
    except Exception as exc:
        logger.error(f"Error seeding indicator configs: {exc}")


def get_all_indicator_configs() -> list[Dict[str, Any]]:
    """Retrieve all indicator configuration records from DB enriched with schema definitions."""
    results = []
    try:
        seed_indicator_configs_if_needed()
        from src.indicator_schema import UNIVERSAL_INDICATOR_SCHEMAS
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM indicator_configs ORDER BY category ASC, name ASC")
        rows = cursor.fetchall()
        for r in rows:
            d = dict(r)
            iid = d.get("indicator_id")
            d["id"] = iid
            d["enabled"] = bool(d.get("enabled", 1))
            d["favorite"] = bool(d.get("favorite", 0))
            d["long_enabled"] = bool(d.get("long_enabled", 1))
            d["short_enabled"] = bool(d.get("short_enabled", 1))
            d["parameters"] = json.loads(d.get("parameters_json") or "{}")
            d["display"] = json.loads(d.get("display_json") or "{}")
            d["signal_rules"] = json.loads(d.get("signal_rules_json") or "{}")

            # Attach schema metadata
            schema = UNIVERSAL_INDICATOR_SCHEMAS.get(iid, {})
            d["parameter_schema"] = schema.get("parameter_schema", [])
            d["description"] = schema.get("description", "")
            d["version"] = schema.get("version", "1.0.0")
            d["default_parameters"] = schema.get("default_parameters", {})
            results.append(d)
        conn.close()
    except Exception as exc:
        logger.error(f"Error fetching indicator configs: {exc}")
    return results


def get_indicator_config(indicator_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a single indicator configuration record by indicator_id with full schema metadata."""
    try:
        seed_indicator_configs_if_needed()
        from src.indicator_schema import UNIVERSAL_INDICATOR_SCHEMAS
        r = safe_query_one("SELECT * FROM indicator_configs WHERE indicator_id = ?", (indicator_id,))
        if r:
            d = dict(r)
            iid = d.get("indicator_id")
            d["id"] = iid
            d["enabled"] = bool(d.get("enabled", 1))
            d["favorite"] = bool(d.get("favorite", 0))
            d["long_enabled"] = bool(d.get("long_enabled", 1))
            d["short_enabled"] = bool(d.get("short_enabled", 1))
            d["parameters"] = json.loads(d.get("parameters_json") or "{}")
            d["display"] = json.loads(d.get("display_json") or "{}")
            d["signal_rules"] = json.loads(d.get("signal_rules_json") or "{}")

            schema = UNIVERSAL_INDICATOR_SCHEMAS.get(iid, {})
            d["parameter_schema"] = schema.get("parameter_schema", [])
            d["description"] = schema.get("description", "")
            d["version"] = schema.get("version", "1.0.0")
            d["default_parameters"] = schema.get("default_parameters", {})
            return d
    except Exception as exc:
        logger.error(f"Error fetching indicator config {indicator_id}: {exc}")
    return None


def save_indicator_config(cfg_data: Dict[str, Any]) -> Tuple[bool, str]:
    """Create or update a specific indicator configuration record in database after schema validation."""
    try:
        from src.indicator_schema import validate_indicator_parameters
        ind_id = cfg_data.get("id") or cfg_data.get("indicator_id")
        if not ind_id:
            return False, "Missing indicator_id"

        params = cfg_data.get("parameters") or cfg_data.get("params") or {}
        if isinstance(params, str):
            try: params = json.loads(params)
            except Exception: params = {}

        # Validate parameters against schema
        is_valid, err_msg = validate_indicator_parameters(ind_id, params)
        if not is_valid:
            return False, err_msg

        # Capture old config for history tracking
        old_cfg = get_indicator_config(ind_id)

        now_str = datetime.now(timezone.utc).isoformat()
        name = cfg_data.get("name", ind_id)
        category = cfg_data.get("category", "General")
        enabled = 1 if cfg_data.get("enabled", True) else 0
        favorite = 1 if cfg_data.get("favorite", False) else 0
        timeframe = cfg_data.get("timeframe", "15m")
        weight = float(cfg_data.get("weight", 15.0))
        long_enabled = 1 if cfg_data.get("long_enabled", True) else 0
        short_enabled = 1 if cfg_data.get("short_enabled", True) else 0
        signal_mode = cfg_data.get("signal_mode", "both")
        min_confirmations = int(cfg_data.get("min_confirmations", 1))

        disp = cfg_data.get("display") or {}
        disp_json = json.dumps(disp) if isinstance(disp, dict) else str(disp)
        sig_rules = cfg_data.get("signal_rules") or {}
        sig_rules_json = json.dumps(sig_rules) if isinstance(sig_rules, dict) else str(sig_rules)
        params_json = json.dumps(params) if isinstance(params, dict) else str(params)

        with get_db_transaction() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM indicator_configs WHERE indicator_id = ?", (ind_id,))
            exists = cursor.fetchone()

            if exists:
                cursor.execute(
                    """
                    UPDATE indicator_configs
                    SET name = ?, category = ?, enabled = ?, favorite = ?, timeframe = ?, weight = ?,
                        long_enabled = ?, short_enabled = ?, signal_mode = ?, min_confirmations = ?,
                        parameters_json = ?, display_json = ?, signal_rules_json = ?, updated_at = ?
                    WHERE indicator_id = ?
                    """,
                    (name, category, enabled, favorite, timeframe, weight, long_enabled, short_enabled, signal_mode, min_confirmations, params_json, disp_json, sig_rules_json, now_str, ind_id),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO indicator_configs
                    (indicator_id, name, category, enabled, favorite, timeframe, weight, long_enabled, short_enabled, signal_mode, min_confirmations, parameters_json, display_json, signal_rules_json, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (ind_id, name, category, enabled, favorite, timeframe, weight, long_enabled, short_enabled, signal_mode, min_confirmations, params_json, disp_json, sig_rules_json, now_str, now_str),
                )

        # Log configuration change history
        new_cfg = get_indicator_config(ind_id)
        log_indicator_config_history(
            indicator_id=ind_id,
            old_cfg=old_cfg or {},
            new_cfg=new_cfg or {},
            bot_id=cfg_data.get("bot_id", "bot-1"),
            symbol=cfg_data.get("symbol", "BTC/USDT"),
            timeframe=timeframe,
            user_source=cfg_data.get("user_source", "Web Dashboard"),
            action="UPDATE"
        )

        logger.info(f"Saved universal indicator config for {ind_id} (Enabled: {enabled}, Weight: {weight}, TF: {timeframe})")
        return True, ind_id
    except Exception as exc:
        logger.error(f"Error saving indicator config: {exc}")
        return False, str(exc)


def log_indicator_config_history(indicator_id: str, old_cfg: Dict[str, Any], new_cfg: Dict[str, Any], bot_id: str = "bot-1", symbol: str = "BTC/USDT", timeframe: str = "15m", user_source: str = "Web Dashboard", action: str = "UPDATE") -> None:
    """Record an audit trail entry for indicator configuration changes."""
    try:
        now_str = datetime.now(timezone.utc).isoformat()
        safe_execute(
            """
            INSERT INTO indicator_config_history 
            (timestamp, indicator_id, bot_id, symbol, timeframe, action, user_source, old_config_json, new_config_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (now_str, indicator_id, bot_id, symbol, timeframe, action, user_source, json.dumps(old_cfg), json.dumps(new_cfg))
        )
    except Exception as exc:
        logger.error(f"Error logging indicator config history: {exc}")


def get_indicator_config_history(indicator_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    """Fetch chronological history of indicator configuration changes."""
    try:
        if indicator_id:
            rows = safe_query("SELECT * FROM indicator_config_history WHERE indicator_id = ? ORDER BY id DESC LIMIT ?", (indicator_id, limit))
        else:
            rows = safe_query("SELECT * FROM indicator_config_history ORDER BY id DESC LIMIT ?", (limit,))
        for r in rows:
            try: r["old_config"] = json.loads(r.get("old_config_json") or "{}")
            except Exception: r["old_config"] = {}
            try: r["new_config"] = json.loads(r.get("new_config_json") or "{}")
            except Exception: r["new_config"] = {}
        return rows
    except Exception as exc:
        logger.error(f"Error fetching indicator config history: {exc}")
        return []


def set_indicator_enabled(indicator_id: str, enabled: bool) -> bool:
    """Set enabled status (True/False) for an indicator in database."""
    try:
        now_str = datetime.now(timezone.utc).isoformat()
        val = 1 if enabled else 0
        return safe_execute("UPDATE indicator_configs SET enabled = ?, updated_at = ? WHERE indicator_id = ?", (val, now_str, indicator_id))
    except Exception as exc:
        logger.error(f"Error setting indicator enabled {indicator_id}: {exc}")
        return False


def toggle_indicator_favorite(indicator_id: str) -> Tuple[bool, bool]:
    """Toggle favorite status (⭐) for an indicator in database. Returns (success, new_favorite_state)."""
    try:
        now_str = datetime.now(timezone.utc).isoformat()
        row = safe_query_one("SELECT favorite FROM indicator_configs WHERE indicator_id = ?", (indicator_id,))
        current_fav = bool(row["favorite"]) if row else False
        new_fav = not current_fav
        val = 1 if new_fav else 0
        ok = safe_execute("UPDATE indicator_configs SET favorite = ?, updated_at = ? WHERE indicator_id = ?", (val, now_str, indicator_id))
        return ok, new_fav
    except Exception as exc:
        logger.error(f"Error toggling favorite for {indicator_id}: {exc}")
        return False, False


def reset_indicator_config(indicator_id: str) -> bool:
    """Reset a single indicator to default universal schema configuration."""
    try:
        from src.indicator_schema import UNIVERSAL_INDICATOR_SCHEMAS
        schema = UNIVERSAL_INDICATOR_SCHEMAS.get(indicator_id)
        if not schema:
            return False

        default_cfg = {
            "id": indicator_id,
            "indicator_id": indicator_id,
            "name": schema.get("name", indicator_id),
            "category": schema.get("category", "General"),
            "enabled": True,
            "favorite": False,
            "timeframe": schema.get("default_timeframe", "15m"),
            "weight": schema.get("default_weight", 15.0),
            "long_enabled": schema.get("default_signal", {}).get("long_enabled", True),
            "short_enabled": schema.get("default_signal", {}).get("short_enabled", True),
            "signal_mode": schema.get("default_signal", {}).get("signal_mode", "both"),
            "min_confirmations": schema.get("default_signal", {}).get("min_confirmations", 1),
            "parameters": schema.get("default_parameters", {}),
            "display": schema.get("default_display", {})
        }
        ok, _ = save_indicator_config(default_cfg)
        return ok
    except Exception as exc:
        logger.error(f"Error resetting indicator config {indicator_id}: {exc}")
        return False


def reset_all_indicator_configs() -> bool:
    """Reset all indicators to default universal schema configurations."""
    try:
        safe_execute("DELETE FROM indicator_configs")
        seed_indicator_configs_if_needed()
        return True
    except Exception as exc:
        logger.error(f"Error resetting all indicator configs: {exc}")
        return False


def get_indicator_presets() -> List[Dict[str, Any]]:
    """Retrieve list of all saved system and user indicator presets."""
    try:
        seed_indicator_configs_if_needed()
        rows = safe_query("SELECT * FROM indicator_presets ORDER BY is_system DESC, name ASC")
        for r in rows:
            try: r["config"] = json.loads(r.get("config_json") or "{}")
            except Exception: r["config"] = {}
        return rows
    except Exception as exc:
        logger.error(f"Error fetching indicator presets: {exc}")
        return []


def save_indicator_preset(name: str, config_dict: Dict[str, Any], category: str = "General", description: str = "") -> Tuple[bool, str]:
    """Create or update a custom reusable indicator preset."""
    try:
        preset_id = name.lower().strip().replace(" ", "_").replace("/", "_")
        now_str = datetime.now(timezone.utc).isoformat()

        with get_db_transaction() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT preset_id FROM indicator_presets WHERE preset_id = ?", (preset_id,))
            exists = cursor.fetchone()

            if exists:
                cursor.execute(
                    """
                    UPDATE indicator_presets
                    SET name = ?, category = ?, description = ?, config_json = ?, updated_at = ?
                    WHERE preset_id = ?
                    """,
                    (name, category, description, json.dumps(config_dict), now_str, preset_id)
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO indicator_presets (preset_id, name, category, description, config_json, is_system, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
                    """,
                    (preset_id, name, category, description, json.dumps(config_dict), now_str, now_str)
                )
        return True, preset_id
    except Exception as exc:
        logger.error(f"Error saving indicator preset: {exc}")
        return False, str(exc)


def delete_indicator_preset(preset_id: str) -> Tuple[bool, str]:
    """Delete a user custom preset (system presets protected)."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT is_system FROM indicator_presets WHERE preset_id = ?", (preset_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return False, f"Preset '{preset_id}' not found."
        if bool(row["is_system"]):
            conn.close()
            return False, "Cannot delete default system presets."

        cursor.execute("DELETE FROM indicator_presets WHERE preset_id = ?", (preset_id,))
        conn.commit()
        conn.close()
        return True, preset_id
    except Exception as exc:
        logger.error(f"Error deleting preset: {exc}")
        return False, str(exc)


def apply_indicator_preset(preset_name_or_id: str) -> Tuple[bool, str]:
    """Apply a preset configuration to indicator_configs table."""
    try:
        presets = get_indicator_presets()
        target = None
        for p in presets:
            if p.get("preset_id") == preset_name_or_id or p.get("name").lower() == preset_name_or_id.lower():
                target = p
                break

        if not target:
            # Fallback to schema presets
            from src.indicator_schema import UNIVERSAL_INDICATOR_PRESETS
            for k, v in UNIVERSAL_INDICATOR_PRESETS.items():
                if k.lower() == preset_name_or_id.lower() or k.lower().replace(" ", "_") == preset_name_or_id.lower():
                    target = {"config": v, "name": k}
                    break

        if not target:
            return False, f"Preset '{preset_name_or_id}' not found."

        cfg_obj = target.get("config", {})
        enabled_ids = set(cfg_obj.get("enabled_ids", []))
        weights = cfg_obj.get("weights", {})
        custom_params_map = cfg_obj.get("parameters", {})

        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()

        all_configs = get_all_indicator_configs()
        for cfg in all_configs:
            ind_id = cfg["indicator_id"]
            is_enabled = ind_id in enabled_ids
            w = float(weights.get(ind_id, cfg.get("weight", 15.0)))
            val_enabled = 1 if is_enabled else 0
            
            # Apply any specific parameter overrides in the preset
            p_json = json.dumps(custom_params_map.get(ind_id, cfg.get("parameters", {})))

            cursor.execute(
                "UPDATE indicator_configs SET enabled = ?, weight = ?, parameters_json = ?, updated_at = ? WHERE indicator_id = ?",
                (val_enabled, w, p_json, now_str, ind_id),
            )

        conn.commit()
        conn.close()
        logger.info(f"Applied universal indicator preset '{target.get('name')}'. Enabled {len(enabled_ids)} indicators.")
        return True, target.get("name", preset_name_or_id)
    except Exception as exc:
        logger.error(f"Error applying indicator preset {preset_name_or_id}: {exc}")
        return False, str(exc)


def bulk_upsert_market_universe(instruments: list[Dict[str, Any]]) -> Tuple[int, int]:
    """Bulk upsert instruments into market_universe table. Returns (inserted_count, updated_count)."""
    inserted = 0
    updated = 0
    if not instruments:
        return inserted, updated

    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()

        for inst in instruments:
            iid = inst.get("instrument_id") or inst.get("symbol")
            if not iid:
                continue

            symbol = inst.get("symbol", iid)
            canonical = inst.get("canonical_symbol", symbol)
            display_name = inst.get("display_name", symbol)
            company_name = inst.get("company_name", "")
            asset_class = inst.get("asset_class", "Crypto")
            inst_type = inst.get("instrument_type", "SPOT")
            exchange = inst.get("exchange", "")
            country = inst.get("country", "")
            region = inst.get("region", "")
            sector = inst.get("sector", "")
            base_curr = inst.get("base_currency", "")
            quote_curr = inst.get("quote_currency", "")
            broker_sym = inst.get("broker_symbol", symbol)
            data_prov = inst.get("data_provider", "CCXT")
            exec_prov = inst.get("execution_provider", "")
            inst_token = inst.get("instrument_token", "")
            tick_size = float(inst.get("tick_size", 0.01))
            lot_size = float(inst.get("lot_size", 1.0))
            min_qty = float(inst.get("minimum_quantity", 0.001))
            trading_status = inst.get("trading_status", "ACTIVE")
            data_avail = 1 if inst.get("data_available", True) else 0
            exec_avail = 1 if inst.get("execution_available", False) else 0

            watch_en = 1 if inst.get("watch_enabled", False) else 0
            paper_en = 1 if inst.get("paper_enabled", False) else 0
            strat_en = 1 if inst.get("strategy_enabled", False) else 0
            live_en = 1 if inst.get("live_enabled", False) else 0

            vol_score = float(inst.get("volatility_score", 0.0))
            vol_cat = inst.get("volatility_category", "Medium")
            liq_score = float(inst.get("liquidity_score", 0.0))
            mom_score = float(inst.get("momentum_score", 0.0))
            last_p = float(inst.get("last_price", 0.0))
            last_chg = float(inst.get("last_change", 0.0))
            last_vol = float(inst.get("last_volume", 0.0))

            cursor.execute("SELECT id FROM market_universe WHERE instrument_id = ?", (iid,))
            existing = cursor.fetchone()

            if existing:
                cursor.execute(
                    """
                    UPDATE market_universe
                    SET symbol=?, canonical_symbol=?, display_name=?, company_name=?, asset_class=?,
                        instrument_type=?, exchange=?, country=?, region=?, sector=?, base_currency=?,
                        quote_currency=?, broker_symbol=?, data_provider=?, execution_provider=?,
                        instrument_token=?, tick_size=?, lot_size=?, minimum_quantity=?, trading_status=?,
                        data_available=?, execution_available=?, volatility_score=?, volatility_category=?,
                        liquidity_score=?, momentum_score=?, last_price=?, last_change=?, last_volume=?,
                        last_updated=?
                    WHERE instrument_id=?
                    """,
                    (
                        symbol, canonical, display_name, company_name, asset_class,
                        inst_type, exchange, country, region, sector, base_curr,
                        quote_curr, broker_sym, data_prov, exec_prov,
                        inst_token, tick_size, lot_size, min_qty, trading_status,
                        data_avail, exec_avail, vol_score, vol_cat,
                        liq_score, mom_score, last_p, last_chg, last_vol,
                        now_str, iid
                    )
                )
                updated += 1
            else:
                cursor.execute(
                    """
                    INSERT INTO market_universe
                    (instrument_id, symbol, canonical_symbol, display_name, company_name, asset_class,
                     instrument_type, exchange, country, region, sector, base_currency, quote_currency,
                     broker_symbol, data_provider, execution_provider, instrument_token, tick_size,
                     lot_size, minimum_quantity, trading_status, data_available, execution_available,
                     watch_enabled, paper_enabled, strategy_enabled, live_enabled, volatility_score,
                     volatility_category, liquidity_score, momentum_score, last_price, last_change,
                     last_volume, last_updated, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        iid, symbol, canonical, display_name, company_name, asset_class,
                        inst_type, exchange, country, region, sector, base_curr, quote_curr,
                        broker_sym, data_prov, exec_prov, inst_token, tick_size,
                        lot_size, min_qty, trading_status, data_avail, exec_avail,
                        watch_en, paper_en, strat_en, live_en, vol_score,
                        vol_cat, liq_score, mom_score, last_p, last_chg,
                        last_vol, now_str, now_str
                    )
                )
                inserted += 1

        conn.commit()
        conn.close()
    except Exception as exc:
        logger.error(f"Error during bulk upsert market universe: {exc}")

    return inserted, updated


def get_market_universe(
    asset_class: Optional[str] = None,
    category: Optional[str] = None,
    volatility: Optional[str] = None,
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 500,
    offset: int = 0
) -> Dict[str, Any]:
    """Retrieve filtered, searched, and paginated market universe instruments."""
    results = []
    total_count = 0
    try:
        conn = get_connection()
        cursor = conn.cursor()

        query_conditions = ["1=1"]
        params = []

        if asset_class and asset_class.upper() != "ALL":
            query_conditions.append("LOWER(asset_class) = LOWER(?)")
            params.append(asset_class)

        if volatility and volatility.upper() != "ALL":
            query_conditions.append("LOWER(volatility_category) = LOWER(?)")
            params.append(volatility)

        if category and category.upper() not in ["ALL", "ALL STOCKS", "ALL CRYPTO", "ALL FOREX", "ALL INDICES"]:
            cat_upper = category.upper()
            if cat_upper in ["INDIAN STOCKS", "INDIAN INDICES"]:
                query_conditions.append("country = 'IN'")
            elif cat_upper in ["GLOBAL STOCKS", "GLOBAL INDICES"]:
                query_conditions.append("country != 'IN'")
            elif cat_upper in ["MAJOR CRYPTO", "TOP MARKET CAP"]:
                query_conditions.append("asset_class = 'Crypto' AND (symbol LIKE 'BTC%' OR symbol LIKE 'ETH%' OR symbol LIKE 'SOL%' OR symbol LIKE 'BNB%' OR symbol LIKE 'XRP%' OR symbol LIKE 'ADA%' OR symbol LIKE 'AVAX%' OR symbol LIKE 'DOGE%')")
            elif cat_upper in ["HIGH VOLATILITY", "VOLATILE CRYPTO", "VOLATILE FOREX", "VOLATILE INDIAN STOCKS", "VOLATILE GLOBAL STOCKS"]:
                query_conditions.append("volatility_category IN ('High', 'Extreme')")

        if status_filter:
            sf_upper = status_filter.upper()
            if sf_upper == "WATCH":
                query_conditions.append("watch_enabled = 1")
            elif sf_upper == "PAPER":
                query_conditions.append("paper_enabled = 1")
            elif sf_upper == "STRATEGY":
                query_conditions.append("strategy_enabled = 1")
            elif sf_upper == "LIVE":
                query_conditions.append("live_enabled = 1")
            elif sf_upper == "DATA_ONLY":
                query_conditions.append("data_available = 1 AND execution_available = 0")
            elif sf_upper == "AVAILABLE":
                query_conditions.append("execution_available = 1")

        if search and search.strip():
            s = f"%{search.strip().lower()}%"
            query_conditions.append(
                "(LOWER(symbol) LIKE ? OR LOWER(canonical_symbol) LIKE ? OR LOWER(display_name) LIKE ? OR LOWER(company_name) LIKE ? OR LOWER(exchange) LIKE ? OR LOWER(asset_class) LIKE ?)"
            )
            params.extend([s, s, s, s, s, s])

        where_clause = " AND ".join(query_conditions)

        cursor.execute(f"SELECT COUNT(*) as cnt FROM market_universe WHERE {where_clause}", params)
        row_cnt = cursor.fetchone()
        total_count = row_cnt["cnt"] if row_cnt else 0

        fetch_params = params + [limit, offset]
        cursor.execute(
            f"SELECT * FROM market_universe WHERE {where_clause} ORDER BY asset_class ASC, volatility_score DESC, symbol ASC LIMIT ? OFFSET ?",
            fetch_params
        )
        rows = cursor.fetchall()
        for r in rows:
            d = dict(r)
            d["data_available"] = bool(d.get("data_available", 1))
            d["execution_available"] = bool(d.get("execution_available", 0))
            d["watch_enabled"] = bool(d.get("watch_enabled", 0))
            d["paper_enabled"] = bool(d.get("paper_enabled", 0))
            d["strategy_enabled"] = bool(d.get("strategy_enabled", 0))
            d["live_enabled"] = bool(d.get("live_enabled", 0))
            results.append(d)

        conn.close()
    except Exception as exc:
        logger.error(f"Error querying market universe: {exc}")

    return {"instruments": results, "total_count": total_count, "limit": limit, "offset": offset}


def get_market_instrument(identifier: str) -> Optional[Dict[str, Any]]:
    """Retrieve a single instrument by instrument_id, symbol, or canonical_symbol."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM market_universe WHERE instrument_id = ? OR symbol = ? OR canonical_symbol = ?",
            (identifier, identifier, identifier)
        )
        r = cursor.fetchone()
        conn.close()
        if r:
            d = dict(r)
            d["data_available"] = bool(d.get("data_available", 1))
            d["execution_available"] = bool(d.get("execution_available", 0))
            d["watch_enabled"] = bool(d.get("watch_enabled", 0))
            d["paper_enabled"] = bool(d.get("paper_enabled", 0))
            d["strategy_enabled"] = bool(d.get("strategy_enabled", 0))
            d["live_enabled"] = bool(d.get("live_enabled", 0))
            return d
    except Exception as exc:
        logger.error(f"Error fetching instrument {identifier}: {exc}")
    return None


def update_instrument_controls(
    identifier: str,
    watch: Optional[bool] = None,
    paper: Optional[bool] = None,
    strategy: Optional[bool] = None,
    live: Optional[bool] = None
) -> Tuple[bool, str]:
    """Update user activation controls (Watch, Paper, Strategy, Live) for an instrument."""
    try:
        inst = get_market_instrument(identifier)
        if not inst:
            return False, f"Instrument '{identifier}' not found."

        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()

        w_val = (1 if watch else 0) if watch is not None else (1 if inst["watch_enabled"] else 0)
        p_val = (1 if paper else 0) if paper is not None else (1 if inst["paper_enabled"] else 0)
        s_val = (1 if strategy else 0) if strategy is not None else (1 if inst["strategy_enabled"] else 0)
        l_val = (1 if live else 0) if live is not None else (1 if inst["live_enabled"] else 0)

        cursor.execute(
            """
            UPDATE market_universe
            SET watch_enabled = ?, paper_enabled = ?, strategy_enabled = ?, live_enabled = ?, last_updated = ?
            WHERE instrument_id = ? OR symbol = ?
            """,
            (w_val, p_val, s_val, l_val, now_str, inst["instrument_id"], inst["symbol"])
        )
        conn.commit()
        conn.close()
        logger.info(f"Updated controls for {identifier}: Watch={bool(w_val)}, Paper={bool(p_val)}, Strategy={bool(s_val)}, Live={bool(l_val)}")
        return True, inst["instrument_id"]
    except Exception as exc:
        logger.error(f"Error updating instrument controls for {identifier}: {exc}")
        return False, str(exc)


def get_universe_summary_stats() -> Dict[str, Any]:
    """Returns total counts by asset class, volatility, trading status, and last sync timestamp."""
    stats = {
        "total_instruments": 0,
        "indices_count": 0,
        "indian_stocks_count": 0,
        "global_stocks_count": 0,
        "crypto_count": 0,
        "forex_count": 0,
        "high_volatility_count": 0,
        "live_enabled_count": 0,
        "paper_trading_count": 0,
        "data_only_count": 0,
        "last_sync": "Never"
    }
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) as c FROM market_universe")
        stats["total_instruments"] = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) as c FROM market_universe WHERE asset_class = 'Indices'")
        stats["indices_count"] = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) as c FROM market_universe WHERE asset_class = 'Stock' AND country = 'IN'")
        stats["indian_stocks_count"] = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) as c FROM market_universe WHERE asset_class = 'Stock' AND country != 'IN'")
        stats["global_stocks_count"] = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) as c FROM market_universe WHERE asset_class = 'Crypto'")
        stats["crypto_count"] = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) as c FROM market_universe WHERE asset_class = 'Forex'")
        stats["forex_count"] = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) as c FROM market_universe WHERE volatility_category IN ('High', 'Extreme')")
        stats["high_volatility_count"] = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) as c FROM market_universe WHERE live_enabled = 1")
        stats["live_enabled_count"] = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) as c FROM market_universe WHERE paper_enabled = 1")
        stats["paper_trading_count"] = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) as c FROM market_universe WHERE data_available = 1 AND execution_available = 0")
        stats["data_only_count"] = cursor.fetchone()["c"]

        cursor.execute("SELECT MAX(last_updated) as mx FROM market_universe")
        row_mx = cursor.fetchone()
        if row_mx and row_mx["mx"]:
            stats["last_sync"] = row_mx["mx"]

        conn.close()
    except Exception as exc:
        logger.error(f"Error fetching universe summary stats: {exc}")
    return stats


def get_top_market_opportunities(limit: int = 10) -> list[Dict[str, Any]]:
    """Retrieve top ranked opportunities sorted by strategy & momentum score."""
    opps = []
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT * FROM market_universe
            WHERE trading_status = 'ACTIVE'
            ORDER BY (volatility_score * 0.4 + momentum_score * 0.6) DESC
            LIMIT ?
            """,
            (limit,)
        )
        rows = cursor.fetchall()
        for r in rows:
            d = dict(r)
            d["strategy_score"] = round(float(d.get("momentum_score", 50.0)) * 0.7 + float(d.get("volatility_score", 50.0)) * 0.3, 1)
            opps.append(d)
        conn.close()
    except Exception as exc:
        logger.error(f"Error fetching top market opportunities: {exc}")
    return opps


def batch_update_universe_controls(
    category: str,
    control_name: str,
    enable_val: bool
) -> Tuple[bool, int, str]:
    """
    Executes server-side SQL batch activation/deactivation for market universe categories
    (e.g., 'ALL INDIAN STOCKS', 'ALL CRYPTO', 'ALL FOREX', 'ALL INDICES', 'HIGH VOLATILITY').
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()
        bit_val = 1 if enable_val else 0

        col_map = {
            "watch": "watch_enabled",
            "paper": "paper_enabled",
            "strategy": "strategy_enabled",
            "live": "live_enabled"
        }
        col_name = col_map.get(control_name.lower())
        if not col_name:
            return False, 0, f"Invalid control name '{control_name}'"

        cat_upper = category.upper()
        where_clause = "1=1"

        if cat_upper in ["INDIAN STOCKS", "ALL INDIAN STOCKS"]:
            where_clause = "asset_class = 'Stock' AND country = 'IN'"
        elif cat_upper in ["GLOBAL STOCKS", "ALL GLOBAL STOCKS"]:
            where_clause = "asset_class = 'Stock' AND country != 'IN'"
        elif cat_upper in ["CRYPTO", "ALL CRYPTO"]:
            where_clause = "asset_class = 'Crypto'"
        elif cat_upper in ["FOREX", "ALL FOREX"]:
            where_clause = "asset_class = 'Forex'"
        elif cat_upper in ["INDICES", "ALL INDICES"]:
            where_clause = "asset_class = 'Indices'"
        elif cat_upper in ["HIGH VOLATILITY", "VOLATILE"]:
            where_clause = "volatility_category IN ('High', 'Extreme')"

        if col_name == "live_enabled" and bit_val == 1:
            where_clause += " AND execution_available = 1"

        query = f"UPDATE market_universe SET {col_name} = ?, last_updated = ? WHERE {where_clause}"
        cursor.execute(query, [bit_val, now_str])
        affected = cursor.rowcount
        conn.commit()
        conn.close()

        logger.info(f"Batch updated {affected} instruments in '{category}' -> {col_name}={bit_val}")
        return True, affected, category
    except Exception as exc:
        logger.error(f"Error in batch_update_universe_controls: {exc}")
        return False, 0, str(exc)


# =============================================================================
# UNIVERSAL RISK MANAGEMENT CENTER PERSISTENCE & CRUD
# =============================================================================
DEFAULT_RISK_PROFILES = {
    "conservative": {
        "profile_id": "conservative",
        "name": "Conservative",
        "category": "Capital Preservation",
        "description": "Strict capital preservation mode: 1% risk per trade, 3% max daily loss, low leverage (max 3x), and tight exposure limits.",
        "is_default": 0,
        "is_system": 1,
        "config": {
            "max_risk_per_trade_pct": 1.0,
            "max_risk_per_trade_dollars": 100.0,
            "max_daily_loss_pct": 3.0,
            "max_weekly_loss_pct": 7.0,
            "max_monthly_drawdown_pct": 12.0,
            "max_open_positions": 3,
            "max_positions_per_symbol": 1,
            "max_exposure_per_asset_pct": 15.0,
            "max_exposure_per_sector_pct": 20.0,
            "max_leverage": 3.0,
            "max_margin_usage_pct": 40.0,
            "max_consecutive_losses": 3,
            "max_order_value": 15000.0,
            "consecutive_loss_action": "PAUSE_NEW_TRADES",
            "drawdown_action": "PAUSE_ALL_BOTS",
            "position_sizing_method": "percent_equity",
            "stop_loss_method": "tighter"
        }
    },
    "balanced": {
        "profile_id": "balanced",
        "name": "Balanced",
        "category": "Standard Quantitative",
        "description": "Standard institutional balance: 2% risk per trade, 5% max daily loss, moderate leverage (max 10x), and 5 concurrent positions.",
        "is_default": 1,
        "is_system": 1,
        "config": {
            "max_risk_per_trade_pct": 2.0,
            "max_risk_per_trade_dollars": 200.0,
            "max_daily_loss_pct": 5.0,
            "max_weekly_loss_pct": 12.0,
            "max_monthly_drawdown_pct": 20.0,
            "max_open_positions": 5,
            "max_positions_per_symbol": 2,
            "max_exposure_per_asset_pct": 30.0,
            "max_exposure_per_sector_pct": 35.0,
            "max_leverage": 10.0,
            "max_margin_usage_pct": 65.0,
            "max_consecutive_losses": 4,
            "max_order_value": 50000.0,
            "consecutive_loss_action": "PAUSE_NEW_TRADES",
            "drawdown_action": "PAUSE_ALL_BOTS",
            "position_sizing_method": "percent_equity",
            "stop_loss_method": "tighter"
        }
    },
    "aggressive": {
        "profile_id": "aggressive",
        "name": "Aggressive",
        "category": "High Growth / Scalping",
        "description": "High growth momentum: 3% risk per trade, 10% daily drawdown tolerance, max 20x leverage, and expanded position limits.",
        "is_default": 0,
        "is_system": 1,
        "config": {
            "max_risk_per_trade_pct": 3.0,
            "max_risk_per_trade_dollars": 300.0,
            "max_daily_loss_pct": 10.0,
            "max_weekly_loss_pct": 20.0,
            "max_monthly_drawdown_pct": 35.0,
            "max_open_positions": 8,
            "max_positions_per_symbol": 3,
            "max_exposure_per_asset_pct": 45.0,
            "max_exposure_per_sector_pct": 50.0,
            "max_leverage": 20.0,
            "max_margin_usage_pct": 85.0,
            "max_consecutive_losses": 5,
            "max_order_value": 100000.0,
            "consecutive_loss_action": "PAUSE_STRATEGY",
            "drawdown_action": "PAUSE_ALL_BOTS",
            "position_sizing_method": "percent_equity",
            "stop_loss_method": "atr"
        }
    },
    "crypto_conservative": {
        "profile_id": "crypto_conservative",
        "name": "Crypto Conservative",
        "category": "Crypto Specific",
        "description": "Tailored for digital asset volatility: 1.5% risk per trade, 6% daily loss, 25% single-coin exposure cap, max 5x leverage.",
        "is_default": 0,
        "is_system": 1,
        "config": {
            "max_risk_per_trade_pct": 1.5,
            "max_risk_per_trade_dollars": 150.0,
            "max_daily_loss_pct": 6.0,
            "max_weekly_loss_pct": 15.0,
            "max_monthly_drawdown_pct": 25.0,
            "max_open_positions": 4,
            "max_positions_per_symbol": 1,
            "max_exposure_per_asset_pct": 25.0,
            "max_exposure_per_sector_pct": 40.0,
            "max_leverage": 5.0,
            "max_margin_usage_pct": 60.0,
            "max_consecutive_losses": 3,
            "max_order_value": 40000.0,
            "consecutive_loss_action": "PAUSE_NEW_TRADES",
            "drawdown_action": "PAUSE_ALL_BOTS",
            "position_sizing_method": "atr_based",
            "stop_loss_method": "tighter"
        }
    },
    "futures_conservative": {
        "profile_id": "futures_conservative",
        "name": "Futures Conservative",
        "category": "Derivatives",
        "description": "High margin protection: 1.0% risk per trade, strict liquidation buffers, 50% max margin utilization, max 5x leverage.",
        "is_default": 0,
        "is_system": 1,
        "config": {
            "max_risk_per_trade_pct": 1.0,
            "max_risk_per_trade_dollars": 100.0,
            "max_daily_loss_pct": 4.0,
            "max_weekly_loss_pct": 10.0,
            "max_monthly_drawdown_pct": 18.0,
            "max_open_positions": 3,
            "max_positions_per_symbol": 1,
            "max_exposure_per_asset_pct": 20.0,
            "max_exposure_per_sector_pct": 30.0,
            "max_leverage": 5.0,
            "max_margin_usage_pct": 50.0,
            "max_consecutive_losses": 3,
            "max_order_value": 30000.0,
            "consecutive_loss_action": "PAUSE_NEW_TRADES",
            "drawdown_action": "PAUSE_ALL_BOTS",
            "position_sizing_method": "fixed_risk",
            "stop_loss_method": "tighter"
        }
    },
    "equity_swing": {
        "profile_id": "equity_swing",
        "name": "Equity Swing (₹ / $)",
        "category": "Stocks",
        "description": "Stock delivery and multi-day swing mode: 2% risk, zero leverage (1x Cash Delivery), 20% max per stock, sector cap 30%.",
        "is_default": 0,
        "is_system": 1,
        "config": {
            "max_risk_per_trade_pct": 2.0,
            "max_risk_per_trade_dollars": 200.0,
            "max_daily_loss_pct": 5.0,
            "max_weekly_loss_pct": 10.0,
            "max_monthly_drawdown_pct": 18.0,
            "max_open_positions": 6,
            "max_positions_per_symbol": 1,
            "max_exposure_per_asset_pct": 20.0,
            "max_exposure_per_sector_pct": 30.0,
            "max_leverage": 1.0,
            "max_margin_usage_pct": 95.0,
            "max_consecutive_losses": 4,
            "max_order_value": 50000.0,
            "consecutive_loss_action": "PAUSE_NEW_TRADES",
            "drawdown_action": "PAUSE_ALL_BOTS",
            "position_sizing_method": "percent_equity",
            "stop_loss_method": "atr"
        }
    }
}


def seed_risk_profiles_and_rules_if_needed():
    """Seeds default risk profiles, rules, and global limits into SQLite."""
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # 1. Seed Profiles
        cursor.execute("SELECT COUNT(*) as cnt FROM risk_profiles")
        row = cursor.fetchone()
        count = row["cnt"] if row else 0

        now_str = datetime.now(timezone.utc).isoformat()
        if count == 0:
            for p_id, p_data in DEFAULT_RISK_PROFILES.items():
                cursor.execute(
                    """
                    INSERT OR REPLACE INTO risk_profiles (
                        profile_id, name, category, description, is_default, is_system, config_json, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        p_id, p_data["name"], p_data["category"], p_data["description"],
                        p_data["is_default"], p_data["is_system"], json.dumps(p_data["config"]),
                        now_str, now_str
                    )
                )

        # 2. Seed Default Rules
        cursor.execute("SELECT COUNT(*) as cnt FROM risk_rules")
        r_cnt = cursor.fetchone()["cnt"]
        if r_cnt == 0:
            default_rules = [
                ("rule_drawdown_lock", "Emergency Drawdown Lock", "global", "*", json.dumps({"metric": "daily_drawdown_pct", "operator": ">=", "value": 5.0}), "PAUSE_ALL_BOTS", 1, 100, "Pauses all bots when daily loss hits 5%"),
                ("rule_btc_exp_cap", "BTC Concentration Limit", "symbol", "BTC/USDT", json.dumps({"metric": "symbol_exposure_pct", "operator": ">=", "value": 35.0}), "BLOCK_ORDER", 1, 80, "Blocks new BTC orders if aggregate exposure across all bots exceeds 35%"),
                ("rule_margin_warning", "High Margin Utilization Guard", "global", "*", json.dumps({"metric": "margin_usage_pct", "operator": ">=", "value": 80.0}), "BLOCK_ORDER", 1, 90, "Blocks new leveraged orders when margin usage exceeds 80%"),
                ("rule_loss_streak_pause", "Consecutive Loss Circuit Breaker", "strategy", "*", json.dumps({"metric": "consecutive_losses", "operator": ">=", "value": 3}), "PAUSE_STRATEGY", 1, 75, "Pauses a strategy if it encounters 3 consecutive losing trades")
            ]
            for r_id, r_name, scope, target, cond, act, en, prio, desc in default_rules:
                cursor.execute(
                    """
                    INSERT OR REPLACE INTO risk_rules (
                        rule_id, name, scope, target, condition_json, action, is_enabled, priority, description, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (r_id, r_name, scope, target, cond, act, en, prio, desc, now_str, now_str)
                )

        # 3. Seed Default Active Limits
        cursor.execute("SELECT COUNT(*) as cnt FROM risk_limits WHERE key = 'active_limits'")
        if cursor.fetchone()["cnt"] == 0:
            cursor.execute(
                """
                INSERT OR REPLACE INTO risk_limits (key, value_json, updated_at)
                VALUES ('active_limits', ?, ?)
                """,
                (json.dumps(DEFAULT_RISK_PROFILES["balanced"]["config"]), now_str)
            )

        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error seeding risk profiles/rules: {e}")


def get_all_risk_profiles() -> List[Dict[str, Any]]:
    """Fetches all risk profiles from the database."""
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM risk_profiles ORDER BY is_default DESC, is_system DESC, name ASC")
        rows = cursor.fetchall()
        conn.close()

        profiles = []
        for r in rows:
            profiles.append({
                "profile_id": r["profile_id"],
                "name": r["name"],
                "category": r["category"],
                "description": r["description"],
                "is_default": bool(r["is_default"]),
                "is_system": bool(r["is_system"]),
                "config": json.loads(r["config_json"]) if r["config_json"] else {},
                "created_at": r["created_at"],
                "updated_at": r["updated_at"]
            })
        return profiles
    except Exception as e:
        logger.error(f"Error fetching risk profiles: {e}")
        return list(DEFAULT_RISK_PROFILES.values())


def get_risk_profile(profile_id: str) -> Optional[Dict[str, Any]]:
    """Fetches single risk profile by ID."""
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM risk_profiles WHERE profile_id = ?", (profile_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        return {
            "profile_id": row["profile_id"],
            "name": row["name"],
            "category": row["category"],
            "description": row["description"],
            "is_default": bool(row["is_default"]),
            "is_system": bool(row["is_system"]),
            "config": json.loads(row["config_json"]) if row["config_json"] else {},
            "created_at": row["created_at"],
            "updated_at": row["updated_at"]
        }
    except Exception as e:
        logger.error(f"Error fetching profile {profile_id}: {e}")
        return None


def save_risk_profile(data: Dict[str, Any]) -> Tuple[bool, str]:
    """Creates or updates a risk profile in SQLite."""
    try:
        p_id = data.get("profile_id") or data.get("name", "").lower().replace(" ", "_")
        name = data.get("name", "Custom Profile")
        category = data.get("category", "Custom")
        description = data.get("description", "")
        is_def = 1 if data.get("is_default") else 0
        cfg = data.get("config", {})

        now_str = datetime.now(timezone.utc).isoformat()
        conn = get_connection()
        cursor = conn.cursor()

        if is_def == 1:
            cursor.execute("UPDATE risk_profiles SET is_default = 0")

        cursor.execute(
            """
            INSERT OR REPLACE INTO risk_profiles (
                profile_id, name, category, description, is_default, is_system, config_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
            """,
            (p_id, name, category, description, is_def, json.dumps(cfg), now_str, now_str)
        )
        conn.commit()
        conn.close()
        return True, p_id
    except Exception as e:
        logger.error(f"Error saving risk profile: {e}")
        return False, str(e)


def delete_risk_profile(profile_id: str) -> Tuple[bool, str]:
    """Deletes custom risk profile (system profiles protected)."""
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT is_system FROM risk_profiles WHERE profile_id = ?", (profile_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return False, "Profile not found"
        if row["is_system"] == 1:
            conn.close()
            return False, "System profiles cannot be deleted"

        cursor.execute("DELETE FROM risk_profiles WHERE profile_id = ?", (profile_id,))
        conn.commit()
        conn.close()
        return True, profile_id
    except Exception as e:
        logger.error(f"Error deleting profile {profile_id}: {e}")
        return False, str(e)


def set_default_risk_profile(profile_id: str) -> Tuple[bool, str]:
    """Marks chosen profile as default and synchronizes active limits."""
    try:
        p = get_risk_profile(profile_id)
        if not p:
            return False, "Profile not found"

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE risk_profiles SET is_default = 0")
        cursor.execute("UPDATE risk_profiles SET is_default = 1 WHERE profile_id = ?", (profile_id,))

        now_str = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            "INSERT OR REPLACE INTO risk_limits (key, value_json, updated_at) VALUES ('active_limits', ?, ?)",
            (json.dumps(p["config"]), now_str)
        )
        conn.commit()
        conn.close()
        return True, profile_id
    except Exception as e:
        logger.error(f"Error setting default profile {profile_id}: {e}")
        return False, str(e)


def get_all_risk_rules() -> List[Dict[str, Any]]:
    """Fetches all visual risk rules."""
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM risk_rules ORDER BY priority DESC, created_at DESC")
        rows = cursor.fetchall()
        conn.close()

        rules = []
        for r in rows:
            rules.append({
                "rule_id": r["rule_id"],
                "name": r["name"],
                "scope": r["scope"],
                "target": r["target"],
                "condition": json.loads(r["condition_json"]) if r["condition_json"] else {},
                "action": r["action"],
                "is_enabled": bool(r["is_enabled"]),
                "priority": r["priority"],
                "description": r["description"],
                "created_at": r["created_at"],
                "updated_at": r["updated_at"]
            })
        return rules
    except Exception as e:
        logger.error(f"Error fetching risk rules: {e}")
        return []


def save_risk_rule(data: Dict[str, Any]) -> Tuple[bool, str]:
    """Saves or updates visual risk rule in SQLite."""
    try:
        r_id = data.get("rule_id") or f"rule_{uuid.uuid4().hex[:8]}"
        name = data.get("name", "Custom Rule")
        scope = data.get("scope", "global")
        target = data.get("target", "*")
        condition = data.get("condition", {})
        action = data.get("action", "BLOCK_ORDER")
        is_en = 1 if data.get("is_enabled", True) else 0
        prio = int(data.get("priority", 10))
        desc = data.get("description", "")

        now_str = datetime.now(timezone.utc).isoformat()
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT OR REPLACE INTO risk_rules (
                rule_id, name, scope, target, condition_json, action, is_enabled, priority, description, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (r_id, name, scope, target, json.dumps(condition), action, is_en, prio, desc, now_str, now_str)
        )
        conn.commit()
        conn.close()
        return True, r_id
    except Exception as e:
        logger.error(f"Error saving risk rule: {e}")
        return False, str(e)


def delete_risk_rule(rule_id: str) -> Tuple[bool, str]:
    """Deletes a risk rule."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM risk_rules WHERE rule_id = ?", (rule_id,))
        conn.commit()
        conn.close()
        return True, rule_id
    except Exception as e:
        logger.error(f"Error deleting risk rule {rule_id}: {e}")
        return False, str(e)


def toggle_risk_rule(rule_id: str, enabled: bool) -> Tuple[bool, bool]:
    """Toggles enabled state of a risk rule."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE risk_rules SET is_enabled = ? WHERE rule_id = ?", (1 if enabled else 0, rule_id))
        conn.commit()
        conn.close()
        return True, enabled
    except Exception as e:
        logger.error(f"Error toggling risk rule {rule_id}: {e}")
        return False, enabled


def get_active_risk_limits() -> Dict[str, Any]:
    """Returns the authoritative active risk limits."""
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT value_json FROM risk_limits WHERE key = 'active_limits'")
        row = cursor.fetchone()
        conn.close()
        if row and row["value_json"]:
            return json.loads(row["value_json"])
        return DEFAULT_RISK_PROFILES["balanced"]["config"]
    except Exception as e:
        logger.error(f"Error fetching active risk limits: {e}")
        return DEFAULT_RISK_PROFILES["balanced"]["config"]


def save_active_risk_limits(limits_dict: Dict[str, Any]) -> bool:
    """Updates active risk limits in SQLite."""
    try:
        now_str = datetime.now(timezone.utc).isoformat()
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT OR REPLACE INTO risk_limits (key, value_json, updated_at) VALUES ('active_limits', ?, ?)",
            (json.dumps(limits_dict), now_str)
        )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Error saving active risk limits: {e}")
        return False


def log_risk_event(
    event_type: str,
    message: str,
    severity: str = "WARNING",
    symbol: str = "BTC/USDT",
    bot_id: str = "bot-1",
    details: Optional[Dict[str, Any]] = None
) -> bool:
    """Logs real-time risk events to the database and global audit queue."""
    try:
        now_str = datetime.now(timezone.utc).isoformat()
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO risk_events (
                timestamp, event_type, severity, symbol, bot_id, message, details_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (now_str, event_type, severity, symbol, bot_id, message, json.dumps(details or {}))
        )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Error logging risk event: {e}")
        return False


def get_risk_events(limit: int = 50, event_type: Optional[str] = None) -> List[Dict[str, Any]]:
    """Queries risk events history."""
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        if event_type:
            cursor.execute("SELECT * FROM risk_events WHERE event_type = ? ORDER BY id DESC LIMIT ?", (event_type, limit))
        else:
            cursor.execute("SELECT * FROM risk_events ORDER BY id DESC LIMIT ?", (limit,))
        rows = cursor.fetchall()
        conn.close()

        events = []
        for r in rows:
            events.append({
                "id": r["id"],
                "timestamp": r["timestamp"],
                "event_type": r["event_type"],
                "severity": r["severity"],
                "symbol": r["symbol"],
                "bot_id": r["bot_id"],
                "message": r["message"],
                "details": json.loads(r["details_json"]) if r["details_json"] else {}
            })
        return events
    except Exception as e:
        logger.error(f"Error fetching risk events: {e}")
        return []


# =============================================================================
# BOT CONTROL CENTER PERSISTENCE & DATA SERVICES
# =============================================================================

DEFAULT_BOT_TEMPLATES = [
    {
        "template_id": "tpl_btc_trend_master",
        "name": "Alpha BTC Trend Master",
        "category": "Trend Following",
        "asset_class": "CRYPTO",
        "symbol": "BTC/USDT",
        "timeframe": "15m",
        "strategy": "Trend Following",
        "description": "Multi-indicator confluence trend breakout using EMA ribbon, MACD momentum, and Volume Profile value areas.",
        "config": {
            "execution_mode": "PAPER",
            "allocated_capital": 10000.0,
            "required_confidence": 75.0,
            "risk_per_trade_pct": 2.0,
            "take_profit_rr": 2.0,
            "indicators": ["ema", "macd", "vp", "supertrend"]
        }
    },
    {
        "template_id": "tpl_eth_scalper_pro",
        "name": "ETH Quick Scalper Pro",
        "category": "Scalping",
        "asset_class": "CRYPTO",
        "symbol": "ETH/USDT",
        "timeframe": "5m",
        "strategy": "Scalping",
        "description": "High-frequency mean-reversion and micro-momentum scalper with tight stop losses.",
        "config": {
            "execution_mode": "PAPER",
            "allocated_capital": 5000.0,
            "required_confidence": 78.0,
            "risk_per_trade_pct": 1.5,
            "take_profit_rr": 1.5,
            "indicators": ["rsi", "bollinger", "stochastic", "vwap"]
        }
    },
    {
        "template_id": "tpl_sol_breakout",
        "name": "Solana High-Vol Hunter",
        "category": "Volatility Breakout",
        "asset_class": "CRYPTO",
        "symbol": "SOL/USDT",
        "timeframe": "15m",
        "strategy": "Volatility",
        "description": "Catches high-volatility momentum surges when ADX indicates a strong trending regime.",
        "config": {
            "execution_mode": "PAPER",
            "allocated_capital": 5000.0,
            "required_confidence": 75.0,
            "risk_per_trade_pct": 2.0,
            "take_profit_rr": 2.5,
            "indicators": ["adx", "supertrend", "atr", "volume"]
        }
    },
    {
        "template_id": "tpl_nifty_intraday",
        "name": "Nifty 50 Momentum Core",
        "category": "Intraday",
        "asset_class": "INDIAN_STOCKS",
        "symbol": "NIFTY50",
        "timeframe": "15m",
        "strategy": "Intraday",
        "description": "Intraday trend filter with dynamic VWAP support/resistance and Floor Pivots.",
        "config": {
            "execution_mode": "PAPER",
            "allocated_capital": 200000.0,
            "required_confidence": 75.0,
            "risk_per_trade_pct": 1.0,
            "take_profit_rr": 2.0,
            "indicators": ["ema", "vwap", "supertrend", "pivots"]
        }
    },
    {
        "template_id": "tpl_aapl_swing",
        "name": "Apple Global Equity Swing",
        "category": "Swing",
        "asset_class": "GLOBAL_STOCKS",
        "symbol": "AAPL",
        "timeframe": "1h",
        "strategy": "Swing",
        "description": "1-Hour swing momentum tracking institutionally significant auto Fibonacci levels.",
        "config": {
            "execution_mode": "PAPER",
            "allocated_capital": 10000.0,
            "required_confidence": 75.0,
            "risk_per_trade_pct": 1.5,
            "take_profit_rr": 3.0,
            "indicators": ["macd", "rsi", "bollinger", "auto_fib"]
        }
    },
    {
        "template_id": "tpl_mean_reversion_master",
        "name": "Multi-Asset Mean Reversion",
        "category": "Mean Reversion",
        "asset_class": "CRYPTO",
        "symbol": "BTC/USDT",
        "timeframe": "15m",
        "strategy": "Mean Reversion",
        "description": "Capitalizes on price overextensions beyond Bollinger 2.0 standard deviations.",
        "config": {
            "execution_mode": "PAPER",
            "allocated_capital": 10000.0,
            "required_confidence": 75.0,
            "risk_per_trade_pct": 1.5,
            "take_profit_rr": 1.8,
            "indicators": ["bollinger", "rsi", "keltner", "cci"]
        }
    }
]

DEFAULT_BOT_GROUPS = [
    {
        "group_id": "grp_crypto_core",
        "name": "Crypto Scalping Bots",
        "description": "Core high-frequency crypto trading algorithms and automated scalpers.",
        "color": "#f7931a"
    },
    {
        "group_id": "grp_equity_swing",
        "name": "Equities & Global Indices",
        "description": "Intraday and swing trading bots for Indian & US stocks and index futures.",
        "color": "#00b4d8"
    },
    {
        "group_id": "grp_sandbox_test",
        "name": "Experimental Sandbox",
        "description": "Testing new indicator combinations and confluence regimes safely in paper mode.",
        "color": "#9b59b6"
    }
]


def seed_bot_templates_and_groups_if_needed() -> None:
    """Seeds pre-configured bot templates and logical bot groups if tables are empty."""
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # 1. Seed Templates
        cursor.execute("SELECT COUNT(*) as cnt FROM bot_templates")
        if cursor.fetchone()["cnt"] == 0:
            now_str = datetime.now(timezone.utc).isoformat()
            for tpl in DEFAULT_BOT_TEMPLATES:
                cursor.execute(
                    """
                    INSERT INTO bot_templates (
                        template_id, name, category, asset_class, symbol, timeframe, strategy,
                        description, config_json, is_active, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                    """,
                    (
                        tpl["template_id"], tpl["name"], tpl["category"], tpl["asset_class"],
                        tpl["symbol"], tpl["timeframe"], tpl["strategy"], tpl["description"],
                        json.dumps(tpl["config"]), now_str, now_str
                    )
                )

        # 2. Seed Groups
        cursor.execute("SELECT COUNT(*) as cnt FROM bot_groups")
        if cursor.fetchone()["cnt"] == 0:
            now_str = datetime.now(timezone.utc).isoformat()
            for grp in DEFAULT_BOT_GROUPS:
                cursor.execute(
                    """
                    INSERT OR IGNORE INTO bot_groups (
                        group_id, name, description, color, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (grp["group_id"], grp["name"], grp["description"], grp["color"], now_str, now_str)
                )

        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error seeding bot templates and groups: {e}")


def get_all_bot_templates() -> List[Dict[str, Any]]:
    """Fetches all active bot templates."""
    try:
        seed_bot_templates_and_groups_if_needed()
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM bot_templates WHERE is_active = 1 ORDER BY created_at ASC")
        rows = cursor.fetchall()
        conn.close()

        templates = []
        for r in rows:
            cfg = {}
            if r["config_json"]:
                try:
                    cfg = json.loads(r["config_json"])
                except Exception:
                    cfg = {}
            templates.append({
                "template_id": r["template_id"],
                "name": r["name"],
                "category": r["category"],
                "asset_class": r["asset_class"],
                "symbol": r["symbol"],
                "timeframe": r["timeframe"],
                "strategy": r["strategy"],
                "description": r["description"],
                "config": cfg,
                "created_at": r["created_at"],
                "updated_at": r["updated_at"]
            })
        return templates
    except Exception as e:
        logger.error(f"Error fetching bot templates: {e}")
        return []


def get_bot_template(template_id: str) -> Optional[Dict[str, Any]]:
    """Fetches single bot template by ID."""
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM bot_templates WHERE template_id = ?", (template_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        cfg = {}
        if row["config_json"]:
            try:
                cfg = json.loads(row["config_json"])
            except Exception:
                cfg = {}
        return {
            "template_id": row["template_id"],
            "name": row["name"],
            "category": row["category"],
            "asset_class": row["asset_class"],
            "symbol": row["symbol"],
            "timeframe": row["timeframe"],
            "strategy": row["strategy"],
            "description": row["description"],
            "config": cfg,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"]
        }
    except Exception as e:
        logger.error(f"Error fetching bot template {template_id}: {e}")
        return None


def save_bot_template(data: Dict[str, Any]) -> Tuple[bool, str]:
    """Creates or updates a bot template."""
    try:
        template_id = data.get("template_id") or f"tpl_{uuid.uuid4().hex[:8]}"
        name = data.get("name", "").strip()
        if not name:
            return False, "Template name is required."

        category = data.get("category", "General")
        asset_class = data.get("asset_class", "CRYPTO")
        symbol = data.get("symbol", "BTC/USDT").upper()
        timeframe = data.get("timeframe", "15m")
        strategy = data.get("strategy", "Trend Following")
        description = data.get("description", "")
        config_data = data.get("config", {})
        now_str = datetime.now(timezone.utc).isoformat()

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO bot_templates (
                template_id, name, category, asset_class, symbol, timeframe, strategy,
                description, config_json, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(template_id) DO UPDATE SET
                name = excluded.name,
                category = excluded.category,
                asset_class = excluded.asset_class,
                symbol = excluded.symbol,
                timeframe = excluded.timeframe,
                strategy = excluded.strategy,
                description = excluded.description,
                config_json = excluded.config_json,
                updated_at = excluded.updated_at
            """,
            (template_id, name, category, asset_class, symbol, timeframe, strategy,
             description, json.dumps(config_data), now_str, now_str)
        )
        conn.commit()
        conn.close()
        return True, template_id
    except Exception as e:
        logger.error(f"Error saving bot template: {e}")
        return False, str(e)


def delete_bot_template(template_id: str) -> Tuple[bool, str]:
    """Deletes a bot template."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM bot_templates WHERE template_id = ?", (template_id,))
        conn.commit()
        conn.close()
        return True, template_id
    except Exception as e:
        logger.error(f"Error deleting bot template {template_id}: {e}")
        return False, str(e)


def get_all_bot_groups() -> List[Dict[str, Any]]:
    """Fetches all bot groups with member bots count and aggregate statuses."""
    try:
        seed_bot_templates_and_groups_if_needed()
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM bot_groups ORDER BY name ASC")
        groups = [dict(r) for r in cursor.fetchall()]

        # Query bot counts per group
        cursor.execute(
            """
            SELECT group_name, status, COUNT(*) as cnt
            FROM bot_instances
            WHERE COALESCE(is_deleted, 0) = 0
            GROUP BY group_name, status
            """
        )
        status_rows = cursor.fetchall()
        conn.close()

        group_map = {}
        for g in groups:
            group_map[g["name"]] = {
                "group_id": g["group_id"],
                "name": g["name"],
                "description": g["description"] or "",
                "color": g["color"] or "#00b4d8",
                "total_bots": 0,
                "running_bots": 0,
                "paused_bots": 0,
                "stopped_bots": 0,
                "created_at": g["created_at"]
            }

        for sr in status_rows:
            g_name = sr["group_name"]
            if g_name in group_map:
                st = sr["status"].upper()
                c = sr["cnt"]
                group_map[g_name]["total_bots"] += c
                if st == "RUNNING":
                    group_map[g_name]["running_bots"] += c
                elif st == "PAUSED":
                    group_map[g_name]["paused_bots"] += c
                else:
                    group_map[g_name]["stopped_bots"] += c

        return list(group_map.values())
    except Exception as e:
        logger.error(f"Error fetching bot groups: {e}")
        return []


def save_bot_group(data: Dict[str, Any]) -> Tuple[bool, str]:
    """Creates or updates a bot group."""
    try:
        name = data.get("name", "").strip()
        if not name:
            return False, "Group name is required."

        group_id = data.get("group_id") or f"grp_{uuid.uuid4().hex[:8]}"
        description = data.get("description", "")
        color = data.get("color", "#00b4d8")
        now_str = datetime.now(timezone.utc).isoformat()

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO bot_groups (group_id, name, description, color, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                description = excluded.description,
                color = excluded.color,
                updated_at = excluded.updated_at
            """,
            (group_id, name, description, color, now_str, now_str)
        )
        conn.commit()
        conn.close()
        return True, name
    except Exception as e:
        logger.error(f"Error saving bot group: {e}")
        return False, str(e)


def delete_bot_group(group_id_or_name: str) -> Tuple[bool, str]:
    """Deletes a bot group and resets bot assignments to 'Unassigned'."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM bot_groups WHERE group_id = ? OR name = ?", (group_id_or_name, group_id_or_name))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return False, "Group not found."
        
        g_name = row["name"]
        cursor.execute("DELETE FROM bot_groups WHERE name = ?", (g_name,))
        cursor.execute("UPDATE bot_instances SET group_name = 'Crypto Scalping Bots' WHERE group_name = ?", (g_name,))
        conn.commit()
        conn.close()
        return True, g_name
    except Exception as e:
        logger.error(f"Error deleting bot group: {e}")
        return False, str(e)


def get_paper_portfolio_overview() -> Dict[str, Any]:
    """Calculates comprehensive paper trading account metrics."""
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Query all paper trades
        cursor.execute("SELECT * FROM trades_log WHERE execution_mode = 'PAPER' OR execution_mode IS NULL")
        trades = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT * FROM bot_instances WHERE execution_mode = 'PAPER' AND COALESCE(is_deleted, 0) = 0")
        paper_bots = [dict(r) for r in cursor.fetchall()]
        conn.close()

        base_balance = 10000.0
        realized_pnl = sum(float(t.get("result_pnl") or 0.0) for t in trades if t.get("status") == "CLOSED")
        
        open_trades = [t for t in trades if t.get("status") == "OPEN"]
        unrealized_pnl = sum(float(t.get("unrealized_pnl") or 0.0) for t in open_trades)
        used_capital = sum(float(t.get("position_size") or 0.0) * float(t.get("entry_price") or 0.0) for t in open_trades)
        margin_used = sum(float(t.get("position_size") or 0.0) * float(t.get("entry_price") or 0.0) / max(1.0, float(t.get("leverage") or 1.0)) for t in open_trades)

        current_equity = base_balance + realized_pnl + unrealized_pnl
        available_balance = max(0.0, current_equity - margin_used)

        total_closed = sum(1 for t in trades if t.get("status") == "CLOSED")
        win_count = sum(1 for t in trades if t.get("status") == "CLOSED" and float(t.get("result_pnl") or 0.0) > 0)
        win_rate = (win_count / total_closed * 100.0) if total_closed > 0 else 0.0

        return {
            "status": "success",
            "balance": round(base_balance + realized_pnl, 2),
            "equity": round(current_equity, 2),
            "available_balance": round(available_balance, 2),
            "margin_used": round(margin_used, 2),
            "used_capital": round(used_capital, 2),
            "realized_pnl": round(realized_pnl, 2),
            "unrealized_pnl": round(unrealized_pnl, 2),
            "open_positions_count": len(open_trades),
            "total_trades_count": len(trades),
            "win_rate_pct": round(win_rate, 1),
            "paper_bots_count": len(paper_bots),
            "open_positions": open_trades,
            "recent_trades": trades[-10:] if len(trades) > 10 else trades
        }
    except Exception as e:
        logger.error(f"Error calculating paper portfolio overview: {e}")
        return {
            "status": "error",
            "message": str(e),
            "balance": 10000.0,
            "equity": 10000.0,
            "available_balance": 10000.0,
            "margin_used": 0.0,
            "used_capital": 0.0,
            "realized_pnl": 0.0,
            "unrealized_pnl": 0.0,
            "open_positions_count": 0,
            "total_trades_count": 0,
            "win_rate_pct": 0.0,
            "paper_bots_count": 0,
            "open_positions": [],
            "recent_trades": []
        }


def reset_paper_sandbox() -> Tuple[bool, str]:
    """Resets paper trading history cleanly while preserving bot definitions."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM trades_log WHERE execution_mode = 'PAPER' OR execution_mode IS NULL")
        cursor.execute("UPDATE bot_instances SET current_equity = allocated_capital, realized_pnl = 0.0, unrealized_pnl = 0.0, trade_count = 0 WHERE execution_mode = 'PAPER'")
        conn.commit()
        conn.close()

        log_standard_bot_event(
            event_type="PAPER_SANDBOX_RESET",
            bot_id="ALL",
            message="Paper trading sandbox reset to initial balance ($10,000.00).",
            severity="WARNING",
            strategy_id="SYSTEM",
            symbol="ALL",
            metadata={"reset_balance": 10000.0}
        )
        return True, "Paper trading sandbox reset successfully."
    except Exception as e:
        logger.error(f"Error resetting paper sandbox: {e}")
        return False, str(e)


def log_standard_bot_event(
    event_type: str,
    bot_id: str = "bot-1",
    message: str = "",
    severity: str = "INFO",
    strategy_id: str = "EMA_MACD_VP",
    symbol: str = "BTC/USDT",
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Logs standard format event to bot_event_audit and bot_activity_logs."""
    event_id = f"evt_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"
    now_utc = datetime.now(timezone.utc).isoformat()
    meta = metadata or {}

    event_payload = {
        "event_id": event_id,
        "timestamp": now_utc,
        "timestamp_utc": now_utc,
        "event_type": event_type,
        "severity": severity,
        "bot_id": bot_id,
        "bot_instance_id": bot_id,
        "strategy_id": strategy_id,
        "symbol": symbol,
        "message": message,
        "metadata": meta
    }

    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO bot_event_audit (
                event_id, timestamp_utc, local_timestamp, bot_instance_id, bot_instance_name,
                symbol, event_type, severity, status, message, strategy_name, metadata_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', ?, ?, ?, ?)
            """,
            (
                event_id, now_utc, now_utc, bot_id, bot_id, symbol,
                event_type, severity, message, strategy_id, json.dumps(meta), now_utc
            )
        )
        cursor.execute(
            """
            INSERT INTO bot_activity_logs (timestamp, bot_id, event_type, activity_type, message, details_json)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (now_utc, bot_id, event_type, event_type, message, json.dumps(meta))
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error inserting standard bot event: {e}")

    return event_payload






