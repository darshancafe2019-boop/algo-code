import sqlite3
import json
import uuid
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any, List

from src import config
from src.db import get_connection, get_db_transaction, with_db_retry

logger = logging.getLogger("Audit")

import queue
import atexit

_audit_db_initialized = False
_audit_db_lock = threading.Lock()
_audit_queue: queue.Queue = queue.Queue(maxsize=50000)
_audit_worker_started = False
_audit_worker_lock = threading.Lock()


def _audit_writer_worker():
    """Background worker thread that batches SQLite audit writes for maximum performance."""
    while True:
        items = []
        try:
            item = _audit_queue.get(timeout=0.2)
            if item is None:
                _audit_queue.task_done()
                break
            items.append(item)
            while len(items) < 100:
                try:
                    next_item = _audit_queue.get_nowait()
                    if next_item is None:
                        break
                    items.append(next_item)
                except queue.Empty:
                    break
        except queue.Empty:
            continue

        if items:
            try:
                with get_db_transaction() as conn:
                    cursor = conn.cursor()
                    cursor.executemany(
                        """
                        INSERT INTO bot_event_audit (
                            event_id, timestamp_utc, local_timestamp, bot_instance_id, bot_instance_name,
                            account_id, asset_class, symbol, event_type, event_subtype, severity, status,
                            message, reason, strategy_name, timeframe, confidence_score, threshold, order_id,
                            trade_id, position_id, correlation_id, provider, exchange, latency_ms,
                            error_code, error_message, metadata_json, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        items
                    )
            except Exception as e:
                logger.error("Audit batch write failed: %s", e)
            finally:
                for _ in range(len(items)):
                    _audit_queue.task_done()


def ensure_audit_worker_started():
    """Ensure the background audit writer thread is initialized and running."""
    global _audit_worker_started
    with _audit_worker_lock:
        if not _audit_worker_started:
            init_audit_db()
            t = threading.Thread(target=_audit_writer_worker, name="AuditBatchWriter", daemon=True)
            t.start()
            _audit_worker_started = True


def flush_audit_events():
    """Flushes all queued audit events to disk."""
    if _audit_worker_started:
        _audit_queue.join()


atexit.register(flush_audit_events)


def init_audit_db(force: bool = False):
    """Ensure audit_log, bot_event_audit, and alert_notifications tables exist in the database."""
    global _audit_db_initialized
    with _audit_db_lock:
        if _audit_db_initialized and not force:
            return

        with get_db_transaction() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    action TEXT NOT NULL,
                    user TEXT NOT NULL,
                    details TEXT,
                    ip_address TEXT
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS alert_notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    level TEXT NOT NULL,
                    category TEXT NOT NULL,
                    message TEXT NOT NULL,
                    is_read INTEGER DEFAULT 0
                )
            """)
            cursor.execute("""
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
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_bot_event_audit_ts ON bot_event_audit (id DESC)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_bot_event_audit_type ON bot_event_audit (event_type)")
        _audit_db_initialized = True


def log_bot_event(
    event_type: str,
    message: str,
    bot_instance_id: str = "bot-1",
    bot_instance_name: str = "Alpha BTC Scalper",
    symbol: str = "BTC/USDT",
    severity: str = "INFO",
    status: str = "SUCCESS",
    reason: str = "",
    event_subtype: str = "",
    asset_class: str = "Crypto",
    strategy_name: str = "EMA_MACD_VP",
    timeframe: str = "15m",
    confidence_score: float = 0.0,
    threshold: float = 75.0,
    order_id: str = "",
    trade_id: str = "",
    position_id: str = "",
    correlation_id: str = "",
    provider: str = "Binance",
    exchange: str = "binance",
    latency_ms: float = 0.0,
    error_code: str = "",
    error_message: str = "",
    metadata: Optional[Dict[str, Any]] = None,
    sync: bool = False
) -> str:
    """Immutably record a structured audit event into bot_event_audit with non-blocking batch dispatch."""
    event_uuid = str(uuid.uuid4())
    try:
        ensure_audit_worker_started()
        now_utc = datetime.now(timezone.utc)
        timestamp_utc = now_utc.isoformat()
        local_timestamp = now_utc.astimezone().strftime("%Y-%m-%d %H:%M:%S")
        metadata_str = json.dumps(metadata) if metadata else "{}"

        row_tuple = (
            event_uuid, timestamp_utc, local_timestamp, bot_instance_id, bot_instance_name,
            "default_account", asset_class, symbol, event_type, event_subtype, severity.upper(), status,
            message, reason, strategy_name, timeframe, float(confidence_score), float(threshold),
            str(order_id), str(trade_id), str(position_id), str(correlation_id), provider, exchange, float(latency_ms),
            str(error_code), str(error_message), metadata_str, timestamp_utc
        )

        if sync:
            with get_db_transaction() as conn:
                conn.cursor().execute(
                    """
                    INSERT INTO bot_event_audit (
                        event_id, timestamp_utc, local_timestamp, bot_instance_id, bot_instance_name,
                        account_id, asset_class, symbol, event_type, event_subtype, severity, status,
                        message, reason, strategy_name, timeframe, confidence_score, threshold, order_id,
                        trade_id, position_id, correlation_id, provider, exchange, latency_ms,
                        error_code, error_message, metadata_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    row_tuple
                )
        else:
            try:
                _audit_queue.put_nowait(row_tuple)
            except queue.Full:
                _audit_queue.put(row_tuple, timeout=0.5)

    except Exception as e:
        logger.error("Failed to record bot audit event (%s): %s", event_type, e)
    return event_uuid


log_bot_audit_event = log_bot_event


def log_data_correction(
    entity_name: str,
    record_id: Any,
    field_name: str,
    old_value: Any,
    new_value: Any,
    reason: str,
    bot_instance_id: str = "bot-1"
) -> str:
    """Record an immutable DATA_CORRECTION event when historical values are adjusted via reconciliation."""
    meta = {
        "entity": entity_name,
        "record_id": str(record_id),
        "field": field_name,
        "old_value": str(old_value),
        "new_value": str(new_value),
    }
    return log_bot_audit_event(
        bot_instance_id=bot_instance_id,
        bot_instance_name="Data Reconciliation",
        event_type="DATA_CORRECTION",
        message=f"Adjusted {entity_name} #{record_id} {field_name}: '{old_value}' -> '{new_value}' ({reason})",
        severity="WARNING",
        status="COMPLETED",
        reason=reason,
        metadata=meta
    )


@with_db_retry(max_retries=5)
def get_bot_audit_events(
    bot_id: str = "ALL",
    event_type: str = "ALL",
    severity: str = "ALL",
    symbol: str = "ALL",
    limit: int = 100
) -> List[Dict[str, Any]]:
    """Fetch recent bot audit events matching query filters after flushing pending queue."""
    conn = None
    try:
        flush_audit_events()
        init_audit_db()
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        query = "SELECT * FROM bot_event_audit WHERE 1=1"
        params = []

        if bot_id != "ALL":
            query += " AND bot_instance_id = ?"
            params.append(bot_id)
        if event_type != "ALL":
            query += " AND event_type = ?"
            params.append(event_type)
        if severity != "ALL":
            query += " AND severity = ?"
            params.append(severity.upper())
        if symbol != "ALL":
            query += " AND symbol = ?"
            params.append(symbol)

        query += " ORDER BY id DESC LIMIT ?"
        params.append(limit)

        cursor.execute(query, tuple(params))
        rows = [dict(r) for r in cursor.fetchall()]
        return rows
    except Exception as e:
        logger.error("Failed to fetch bot audit events: %s", e)
        return []
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


get_bot_event_audits = get_bot_audit_events



@with_db_retry(max_retries=5)
def log_audit_event(action: str, user: str = "Trader", details: Optional[Dict[str, Any]] = None, ip_address: str = "127.0.0.1"):
    """Record a dashboard user audit log entry."""
    try:
        init_audit_db()
        now_str = datetime.now(timezone.utc).isoformat()
        details_str = json.dumps(details) if details else ""
        with get_db_transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO audit_log (timestamp, action, user, details, ip_address) VALUES (?, ?, ?, ?, ?)",
                (now_str, action, user, details_str, ip_address)
            )
    except Exception as e:
        logger.error("Failed to record audit event: %s", e)


@with_db_retry(max_retries=5)
def get_audit_logs(limit: int = 50) -> List[Dict[str, Any]]:
    """Fetch recent audit log entries."""
    conn = None
    try:
        init_audit_db()
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,))
        rows = [dict(r) for r in cursor.fetchall()]
        return rows
    except Exception as e:
        logger.error("Failed to fetch audit logs: %s", e)
        return []
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


@with_db_retry(max_retries=5)
def log_notification(level: str, category: str, message: str):
    """Record an in-app notification event."""
    try:
        init_audit_db()
        now_str = datetime.now(timezone.utc).isoformat()
        with get_db_transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO alert_notifications (timestamp, level, category, message, is_read) VALUES (?, ?, ?, ?, 0)",
                (now_str, level.upper(), category, message)
            )
    except Exception as e:
        logger.error("Failed to record notification: %s", e)


@with_db_retry(max_retries=5)
def get_notifications(limit: int = 50) -> List[Dict[str, Any]]:
    """Fetch recent in-app notifications."""
    conn = None
    try:
        init_audit_db()
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM alert_notifications ORDER BY id DESC LIMIT ?", (limit,))
        rows = [dict(r) for r in cursor.fetchall()]
        return rows
    except Exception as e:
        logger.error("Failed to fetch notifications: %s", e)
        return []
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass
