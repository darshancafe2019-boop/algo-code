import json
import logging
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from src import config, db

logger = logging.getLogger("TradeLedger")


def get_db_connection() -> sqlite3.Connection:
    """Acquires SQLite connection with row factory and timeout."""
    return db.get_connection()


def init_trade_ledger_schema() -> None:
    """
    Ensures all tables, columns, views, and indexes for authoritative trade recording,
    partial fills, position lifecycle, and latency profiling are initialized.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Trade Fills Table for recording individual partial and full executions
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS trade_fills (
            fill_id TEXT PRIMARY KEY,
            trade_id INTEGER NOT NULL,
            order_id TEXT NOT NULL,
            broker_order_id TEXT DEFAULT '',
            execution_id TEXT DEFAULT '',
            fill_timestamp TEXT NOT NULL,
            fill_price REAL NOT NULL,
            fill_quantity REAL NOT NULL,
            fee REAL DEFAULT 0.0,
            fee_currency TEXT DEFAULT 'USDT',
            slippage REAL DEFAULT 0.0,
            fill_side TEXT NOT NULL,
            fill_type TEXT DEFAULT 'NORMAL',
            status TEXT DEFAULT 'FILLED',
            created_at TEXT NOT NULL
        )
        """
    )
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trade_fills_trade_id ON trade_fills(trade_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trade_fills_order_id ON trade_fills(order_id)")

    # 2. Position Lifecycle Transitions Table
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS position_transitions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_id INTEGER NOT NULL,
            position_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            from_state TEXT NOT NULL,
            to_state TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            price REAL NOT NULL,
            quantity REAL NOT NULL,
            reason TEXT NOT NULL,
            event_id TEXT DEFAULT '',
            metadata_json TEXT DEFAULT '{}'
        )
        """
    )
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pos_trans_trade_id ON position_transitions(trade_id)")

    # 3. Execution Latencies Table
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS trade_latencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_id INTEGER NOT NULL,
            order_id TEXT NOT NULL,
            signal_time TEXT,
            risk_check_time TEXT,
            order_creation_time TEXT,
            broker_submit_time TEXT,
            broker_ack_time TEXT,
            fill_time TEXT,
            db_write_time TEXT,
            broadcast_time TEXT,
            signal_latency_ms REAL DEFAULT 0.0,
            risk_latency_ms REAL DEFAULT 0.0,
            order_creation_latency_ms REAL DEFAULT 0.0,
            broker_submit_latency_ms REAL DEFAULT 0.0,
            broker_ack_latency_ms REAL DEFAULT 0.0,
            fill_latency_ms REAL DEFAULT 0.0,
            db_write_latency_ms REAL DEFAULT 0.0,
            total_execution_latency_ms REAL DEFAULT 0.0,
            created_at TEXT NOT NULL
        )
        """
    )
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trade_latencies_trade_id ON trade_latencies(trade_id)")

    # 4. Ensure trades_log base table exists
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS trades_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            trade_id TEXT UNIQUE,
            symbol TEXT NOT NULL,
            direction TEXT NOT NULL,
            entry_price REAL NOT NULL,
            exit_price REAL,
            position_size REAL NOT NULL,
            stop_loss REAL,
            take_profit REAL,
            status TEXT NOT NULL DEFAULT 'OPEN',
            gross_pnl REAL,
            net_pnl REAL,
            fees REAL DEFAULT 0.0,
            slippage REAL DEFAULT 0.0,
            result_pnl REAL DEFAULT 0.0,
            pnl_percentage REAL DEFAULT 0.0,
            trade_duration_seconds INTEGER DEFAULT 0,
            trade_result TEXT DEFAULT 'OPEN',
            execution_mode TEXT DEFAULT 'PAPER'
        )
        """
    )

    # 5. Migrate trades_log columns for complete 40-field coverage
    cursor.execute("PRAGMA table_info(trades_log)")
    cols = [row["name"] for row in cursor.fetchall()]
    schema_map = {
        "parent_order_id": "TEXT DEFAULT ''",
        "broker_order_id": "TEXT DEFAULT ''",
        "execution_id": "TEXT DEFAULT ''",
        "bot_id": "TEXT DEFAULT 'bot-1'",
        "bot_instance_id": "TEXT DEFAULT 'bot-1'",
        "bot_instance_name": "TEXT DEFAULT 'Alpha BTC Scalper'",
        "strategy_id": "TEXT DEFAULT 'EMA_MACD_VP'",
        "strategy_name": "TEXT DEFAULT 'EMA_MACD_VP'",
        "strategy_version": "TEXT DEFAULT 'v1.4.2'",
        "symbol": "TEXT NOT NULL DEFAULT 'BTC/USDT'",
        "canonical_symbol": "TEXT DEFAULT 'BTC/USDT'",
        "asset_class": "TEXT DEFAULT 'Crypto'",
        "exchange": "TEXT DEFAULT 'Binance'",
        "market": "TEXT DEFAULT 'Spot'",
        "timeframe": "TEXT DEFAULT '15m'",
        "side": "TEXT DEFAULT 'BUY'",
        "position_side": "TEXT DEFAULT 'LONG'",
        "entry_timestamp": "TEXT",
        "entry_price": "REAL DEFAULT 0.0",
        "entry_quantity": "REAL DEFAULT 0.0",
        "exit_timestamp": "TEXT",
        "exit_price": "REAL DEFAULT 0.0",
        "exit_quantity": "REAL DEFAULT 0.0",
        "remaining_quantity": "REAL DEFAULT 0.0",
        "stop_loss": "REAL DEFAULT 0.0",
        "take_profit": "REAL DEFAULT 0.0",
        "planned_risk": "REAL DEFAULT 0.0",
        "actual_risk": "REAL DEFAULT 0.0",
        "risk_percentage": "REAL DEFAULT 2.0",
        "notional_value": "REAL DEFAULT 0.0",
        "margin_used": "REAL DEFAULT 0.0",
        "leverage": "REAL DEFAULT 1.0",
        "currency": "TEXT DEFAULT 'USDT'",
        "normalized_currency": "TEXT DEFAULT 'USD'",
        "currency_rate": "REAL DEFAULT 1.0",
        "fees": "REAL DEFAULT 0.0",
        "taxes": "REAL DEFAULT 0.0",
        "funding": "REAL DEFAULT 0.0",
        "slippage": "REAL DEFAULT 0.0",
        "gross_pnl": "REAL DEFAULT 0.0",
        "net_pnl": "REAL DEFAULT 0.0",
        "result_pnl": "REAL DEFAULT 0.0",
        "unrealized_pnl": "REAL DEFAULT 0.0",
        "pnl_percentage": "REAL DEFAULT 0.0",
        "risk_reward": "REAL DEFAULT 2.5",
        "r_multiple": "REAL DEFAULT 0.0",
        "mae": "REAL DEFAULT 0.0",
        "mfe": "REAL DEFAULT 0.0",
        "entry_signal": "TEXT DEFAULT 'LONG'",
        "exit_signal": "TEXT DEFAULT ''",
        "signal_confidence": "REAL DEFAULT 75.0",
        "indicator_snapshot_json": "TEXT DEFAULT '{}'",
        "signal_snapshot_json": "TEXT DEFAULT '{}'",
        "market_snapshot_json": "TEXT DEFAULT '{}'",
        "risk_snapshot_json": "TEXT DEFAULT '{}'",
        "exit_snapshot_json": "TEXT DEFAULT '{}'",
        "market_regime": "TEXT DEFAULT 'TRENDING'",
        "trade_quality_score": "REAL DEFAULT 85.0",
        "execution_mode": "TEXT DEFAULT 'PAPER'",
        "trade_status": "TEXT DEFAULT 'OPEN'",
        "trade_result": "TEXT DEFAULT 'OPEN'",
        "entry_reason": "TEXT DEFAULT 'EMA_CROSS'",
        "exit_reason": "TEXT DEFAULT ''",
        "idempotency_key": "TEXT DEFAULT ''",
        "created_at": "TEXT",
        "updated_at": "TEXT"
    }

    for col_name, col_def in schema_map.items():
        if col_name not in cols:
            try:
                cursor.execute(f"ALTER TABLE trades_log ADD COLUMN {col_name} {col_def}")
            except Exception as e:
                logger.debug(f"Notice adding column {col_name}: {e}")

    # Create optimized query indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trades_log_status_id ON trades_log(status, id DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trades_log_bot_strat ON trades_log(bot_id, strategy_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trades_log_sym_mode ON trades_log(symbol, execution_mode)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trades_log_time_exit ON trades_log(exit_timestamp)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trades_log_idempotency ON trades_log(idempotency_key)")

    conn.commit()
    conn.close()


def generate_idempotency_key(bot_id: str, strategy: str, symbol: str, signal_time_str: str) -> str:
    """Deterministic hash key preventing duplicate order submissions."""
    raw = f"{bot_id}:{strategy}:{symbol}:{signal_time_str[:16]}"
    return f"IDEM_{uuid.uuid5(uuid.NAMESPACE_DNS, raw).hex[:16]}"


def compute_trade_quality_score(
    confidence: float,
    risk_reward: float,
    regime: str,
    market_data_fresh: bool = True,
    trend_aligned: bool = True
) -> float:
    """
    Computes an explainable Trade Quality Score (0 - 100) based on:
    - Signal Confidence (40 pts)
    - Risk/Reward Ratio (25 pts)
    - Trend Alignment (15 pts)
    - Market Data Quality (10 pts)
    - Regime Favorability (10 pts)
    """
    score = 0.0

    # 1. Signal Confidence
    score += min(40.0, max(0.0, (confidence / 100.0) * 40.0))

    # 2. Risk/Reward
    if risk_reward >= 3.0:
        score += 25.0
    elif risk_reward >= 2.0:
        score += 20.0
    elif risk_reward >= 1.5:
        score += 15.0
    elif risk_reward >= 1.0:
        score += 10.0

    # 3. Trend Alignment
    if trend_aligned:
        score += 15.0

    # 4. Market Data Quality
    if market_data_fresh:
        score += 10.0

    # 5. Market Regime
    if regime.upper() in ["TRENDING", "VOLATILE_MOMENTUM"]:
        score += 10.0
    elif regime.upper() in ["RANGING", "MEAN_REVERSION"]:
        score += 7.0
    else:
        score += 4.0

    return round(min(100.0, max(0.0, score)), 1)


class AuthoritativeTradeLedger:
    """
    Single Authoritative Trade & Order Ledger.
    Ensures zero trade loss, multi-fill weighted pricing, position lifecycle tracking,
    and complete audit synchronization.
    """

    def __init__(self):
        init_trade_ledger_schema()

    def record_new_trade(self, trade_data: Dict[str, Any]) -> Tuple[bool, int, str]:
        """
        Creates a complete trade record inside an atomic transaction.
        Checks for duplicate submissions via idempotency key.
        """
        now_str = datetime.now(timezone.utc).isoformat()
        bot_id = trade_data.get("bot_id") or trade_data.get("bot_instance_id") or "bot-1"
        strategy_id = trade_data.get("strategy_id") or trade_data.get("strategy") or "EMA_MACD_VP"
        symbol = (trade_data.get("symbol") or "BTC/USDT").upper()
        direction = (trade_data.get("direction") or trade_data.get("side") or "LONG").upper()
        signal_time = trade_data.get("signal_time") or trade_data.get("timestamp") or now_str

        # 1. Idempotency Check
        idem_key = trade_data.get("idempotency_key") or generate_idempotency_key(bot_id, strategy_id, symbol, signal_time)
        existing = db.safe_query("SELECT id FROM trades_log WHERE idempotency_key = ?", (idem_key,))
        if existing:
            return False, existing[0]["id"], f"DUPLICATE_TRADE_IGNORED: Idempotency key '{idem_key}' already recorded (Trade #{existing[0]['id']})."

        entry_price = float(trade_data.get("entry_price") or 0.0)
        position_size = float(trade_data.get("position_size") or trade_data.get("entry_quantity") or 0.0)
        stop_loss = float(trade_data.get("stop_loss") or 0.0)
        take_profit = float(trade_data.get("take_profit") or 0.0)
        conf = float(trade_data.get("signal_confidence") or trade_data.get("confidence_score") or 75.0)

        # Calculate planned risk and risk/reward
        risk_per_unit = abs(entry_price - stop_loss) if stop_loss > 0 else (entry_price * 0.02)
        reward_per_unit = abs(take_profit - entry_price) if take_profit > 0 else (risk_per_unit * 2.0)
        planned_risk = round(risk_per_unit * position_size, 2)
        risk_reward = round(reward_per_unit / max(0.001, risk_per_unit), 2)
        notional = round(entry_price * position_size, 2)

        regime = trade_data.get("market_regime") or "TRENDING"
        quality_score = compute_trade_quality_score(conf, risk_reward, regime)

        conn = None
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO trades_log (
                    timestamp, entry_timestamp, symbol, canonical_symbol, asset_class, exchange,
                    market, timeframe, direction, side, position_side, entry_price, entry_quantity,
                    position_size, remaining_quantity, stop_loss, take_profit, planned_risk,
                    actual_risk, risk_percentage, notional_value, margin_used, leverage,
                    currency, normalized_currency, currency_rate, fees, taxes, funding, slippage,
                    gross_pnl, net_pnl, result_pnl, unrealized_pnl, pnl_percentage, risk_reward,
                    r_multiple, mae, mfe, entry_signal, exit_signal, signal_confidence,
                    indicator_snapshot_json, signal_snapshot_json, market_snapshot_json,
                    risk_snapshot_json, exit_snapshot_json, market_regime, trade_quality_score,
                    execution_mode, status, trade_status, trade_result, entry_reason, exit_reason,
                    idempotency_key, broker_order_id, execution_id, bot_id, bot_instance_id,
                    bot_instance_name, strategy, strategy_id, strategy_name, strategy_version,
                    emotion_tag, remarks, created_at, updated_at
                ) VALUES (
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?,
                    0.0, 0.0, 0.0, 0.0, 0.0, ?,
                    0.0, 0.0, 0.0, ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, 'OPEN', 'OPEN', 'OPEN', ?, '',
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    '🎯 Disciplined', ?, ?, ?
                )
                """,
                (
                    now_str, now_str, symbol, symbol, trade_data.get("asset_class", "Crypto"), trade_data.get("exchange", "Binance"),
                    trade_data.get("market", "Spot"), trade_data.get("timeframe", "15m"), direction, direction, direction, entry_price, position_size,
                    position_size, position_size, stop_loss, take_profit, planned_risk,
                    planned_risk, float(trade_data.get("risk_percentage", 2.0)), notional, notional, float(trade_data.get("leverage", 1.0)),
                    trade_data.get("currency", "USDT"), trade_data.get("normalized_currency", "USD"), float(trade_data.get("currency_rate", 1.0)), float(trade_data.get("fees", 1.50)), 0.0, 0.0, float(trade_data.get("slippage", 0.0)),
                    risk_reward,
                    direction, "", conf,
                    json.dumps(trade_data.get("indicator_snapshot", {})), json.dumps(trade_data.get("signal_snapshot", {})), json.dumps(trade_data.get("market_snapshot", {})),
                    json.dumps(trade_data.get("risk_snapshot", {})), "{}", regime, quality_score,
                    trade_data.get("execution_mode", "PAPER"), trade_data.get("entry_reason", "STRATEGY_SIGNAL"),
                    idem_key, trade_data.get("broker_order_id", ""), trade_data.get("execution_id", ""), bot_id, bot_id,
                    trade_data.get("bot_name", "Alpha BTC Scalper"), strategy_id, strategy_id, strategy_id, trade_data.get("strategy_version", "v1.4.2"),
                    trade_data.get("remarks", "[ALGO ORDER]"), now_str, now_str
                )
            )
            trade_id = cursor.lastrowid

            # Initial fill entry
            fill_id = f"FILL-{trade_id}-001"
            cursor.execute(
                """
                INSERT INTO trade_fills (
                    fill_id, trade_id, order_id, broker_order_id, execution_id,
                    fill_timestamp, fill_price, fill_quantity, fee, fee_currency,
                    slippage, fill_side, fill_type, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ENTRY_FILL', 'FILLED', ?)
                """,
                (
                    fill_id, trade_id, str(trade_data.get("order_id") or trade_id),
                    trade_data.get("broker_order_id", ""), trade_data.get("execution_id", ""),
                    now_str, entry_price, position_size, float(trade_data.get("fees", 1.50)),
                    trade_data.get("currency", "USDT"), float(trade_data.get("slippage", 0.0)),
                    direction, now_str
                )
            )

            # Record Position Transition: NO_POSITION -> OPEN
            cursor.execute(
                """
                INSERT INTO position_transitions (
                    trade_id, position_id, symbol, from_state, to_state,
                    timestamp, price, quantity, reason, event_id, metadata_json
                ) VALUES (?, ?, ?, 'NO_POSITION', 'OPEN', ?, ?, ?, ?, ?, ?)
                """,
                (
                    trade_id, f"POS-{trade_id}", symbol, now_str, entry_price, position_size,
                    trade_data.get("entry_reason", "ENTRY_ORDER_FILLED"), fill_id, json.dumps({"order_id": trade_data.get("order_id")})
                )
            )

            conn.commit()
        except Exception as e:
            if conn:
                try:
                    conn.rollback()
                except Exception:
                    pass
            logger.error(f"Failed to record new trade: {e}")
            return False, 0, str(e)
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

        try:
            from src.audit import log_bot_event
            log_bot_event(
                event_type="TRADE_OPENED",
                message=f"Opened {direction} position (Trade #{trade_id}) for {symbol} @ ${entry_price:,.2f} (Size: {position_size}).",
                bot_instance_id=bot_id,
                bot_instance_name=trade_data.get("bot_name", "Alpha BTC Scalper"),
                symbol=symbol,
                strategy_name=strategy_id,
                trade_id=trade_id,
                severity="INFO"
            )
        except Exception:
            pass

        return True, trade_id, "Trade recorded successfully."

    def record_partial_fill(
        self,
        trade_id: int,
        order_id: str,
        fill_price: float,
        fill_qty: float,
        fee: float = 0.0,
        fill_side: str = "BUY"
    ) -> Tuple[bool, Dict[str, Any]]:
        """
        Records an individual execution fill and recalculates volume-weighted average price (VWAP).
        """
        now_str = datetime.now(timezone.utc).isoformat()
        fill_id = f"FILL-{trade_id}-{uuid.uuid4().hex[:6]}"

        conn = None
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO trade_fills (
                    fill_id, trade_id, order_id, broker_order_id, execution_id,
                    fill_timestamp, fill_price, fill_quantity, fee, fee_currency,
                    slippage, fill_side, fill_type, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'USDT', 0.0, ?, 'PARTIAL_FILL', 'FILLED', ?)
                """,
                (fill_id, trade_id, order_id, order_id, fill_id, now_str, fill_price, fill_qty, fee, fill_side, now_str)
            )

            # Reconstruct VWAP from all fills for this trade
            cursor.execute("SELECT fill_price, fill_quantity, fee FROM trade_fills WHERE trade_id = ?", (trade_id,))
            fills = cursor.fetchall()

            total_qty = sum(float(f["fill_quantity"]) for f in fills)
            weighted_val = sum(float(f["fill_price"]) * float(f["fill_quantity"]) for f in fills)
            total_fees = sum(float(f["fee"]) for f in fills)
            avg_price = (weighted_val / total_qty) if total_qty > 0 else fill_price

            cursor.execute(
                """
                UPDATE trades_log SET
                    entry_price = ?,
                    entry_quantity = ?,
                    position_size = ?,
                    remaining_quantity = ?,
                    fees = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (round(avg_price, 4), total_qty, total_qty, total_qty, total_fees, now_str, trade_id)
            )

            conn.commit()
            return True, {
                "fill_id": fill_id,
                "total_quantity": total_qty,
                "weighted_average_price": avg_price,
                "total_fees": total_fees
            }
        except Exception as e:
            if conn:
                try:
                    conn.rollback()
                except Exception:
                    pass
            logger.error(f"Error recording partial fill: {e}")
            return False, {"error": str(e)}
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    def close_trade(
        self,
        trade_id: int,
        exit_price: float,
        exit_reason: str = "TAKE_PROFIT",
        exit_qty: Optional[float] = None,
        fees_exit: float = 1.50,
        slippage: float = 0.0
    ) -> Tuple[bool, Dict[str, Any]]:
        """
        Finalizes an open trade, calculates authoritative P&L, records position closure transition,
        and synchronizes audit event.
        """
        from src.pnl_engine import compute_authoritative_pnl

        now_str = datetime.now(timezone.utc).isoformat()
        trades = db.safe_query("SELECT * FROM trades_log WHERE id = ?", (trade_id,))
        if not trades:
            return False, {"error": f"Trade #{trade_id} not found."}

        tr = dict(trades[0])
        direction = tr.get("direction", "LONG").upper()
        entry_price = float(tr.get("entry_price") or 0.0)
        size = float(exit_qty or tr.get("position_size") or 0.0)
        total_fees = float(tr.get("fees") or 0.0) + float(fees_exit)

        # Authoritative PnL computation
        pnl_res = compute_authoritative_pnl(
            direction=direction,
            entry_price=entry_price,
            exit_price=exit_price,
            quantity=size,
            fees=total_fees,
            slippage=slippage,
            funding=float(tr.get("funding") or 0.0),
            taxes=float(tr.get("taxes") or 0.0),
            stop_loss=float(tr.get("stop_loss") or 0.0)
        )

        gross_pnl = pnl_res["gross_pnl"]
        net_pnl = pnl_res["net_pnl"]
        pnl_pct = pnl_res["pnl_percentage"]
        r_mult = pnl_res["r_multiple"]

        trade_result = "WIN" if net_pnl > 0 else ("LOSS" if net_pnl < 0 else "BREAKEVEN")

        conn = None
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE trades_log SET
                    status = 'CLOSED',
                    trade_status = 'CLOSED',
                    trade_result = ?,
                    exit_timestamp = ?,
                    exit_price = ?,
                    exit_quantity = ?,
                    remaining_quantity = 0.0,
                    fees = ?,
                    slippage = ?,
                    gross_pnl = ?,
                    net_pnl = ?,
                    result_pnl = ?,
                    unrealized_pnl = 0.0,
                    pnl_percentage = ?,
                    r_multiple = ?,
                    exit_reason = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    trade_result, now_str, exit_price, size, total_fees, slippage,
                    gross_pnl, net_pnl, net_pnl, pnl_pct, r_mult, exit_reason, now_str, trade_id
                )
            )

            # Record Position Transition: OPEN -> CLOSED
            cursor.execute(
                """
                INSERT INTO position_transitions (
                    trade_id, position_id, symbol, from_state, to_state,
                    timestamp, price, quantity, reason, event_id, metadata_json
                ) VALUES (?, ?, ?, 'OPEN', 'CLOSED', ?, ?, ?, ?, '', ?)
                """,
                (
                    trade_id, f"POS-{trade_id}", tr.get("symbol", "BTC/USDT"), now_str, exit_price, size,
                    exit_reason, json.dumps({"net_pnl": net_pnl, "result": trade_result})
                )
            )

            conn.commit()
        except Exception as e:
            if conn:
                try:
                    conn.rollback()
                except Exception:
                    pass
            logger.error(f"Error closing trade {trade_id}: {e}")
            return False, {"error": str(e)}
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

        try:
            from src.audit import log_bot_event
            log_bot_event(
                event_type="TRADE_CLOSED",
                message=f"Closed Trade #{trade_id} ({direction} on {tr.get('symbol')}) @ ${exit_price:,.2f} with Net PnL: ${net_pnl:,.2f} ({pnl_pct:.2f}%). Reason: {exit_reason}.",
                bot_instance_id=tr.get("bot_id", "bot-1"),
                symbol=tr.get("symbol", "BTC/USDT"),
                strategy_name=tr.get("strategy_id", "EMA_MACD_VP"),
                trade_id=trade_id,
                severity="INFO"
            )
        except Exception:
            pass

        return True, {
            "trade_id": trade_id,
            "status": "CLOSED",
            "trade_result": trade_result,
            "gross_pnl": gross_pnl,
            "net_pnl": net_pnl,
            "pnl_percentage": pnl_pct,
            "r_multiple": r_mult
        }


trade_ledger = AuthoritativeTradeLedger()
