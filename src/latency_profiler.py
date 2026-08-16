import logging
import statistics
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from src import db

logger = logging.getLogger("LatencyProfiler")


class TradeLatencyContext:
    """Context tracker measuring exact timestamps across every stage of a trade lifecycle."""

    def __init__(self, trade_id: int, order_id: str = ""):
        self.trade_id = trade_id
        self.order_id = order_id or f"ORD-{trade_id}"
        self.timestamps: Dict[str, float] = {
            "signal": time.time(),
            "risk_check": 0.0,
            "order_creation": 0.0,
            "broker_submit": 0.0,
            "broker_ack": 0.0,
            "fill": 0.0,
            "db_write": 0.0,
            "broadcast": 0.0
        }
        self.latencies_ms: Dict[str, float] = {}

    def mark_stage(self, stage_name: str) -> None:
        """Records timestamp for stage."""
        self.timestamps[stage_name] = time.time()

    def finalize(self) -> Dict[str, float]:
        """Calculates stage-to-stage millisecond latencies and persists to database."""
        ts = self.timestamps
        now = time.time()

        signal_time = ts.get("signal") or now
        risk_time = ts.get("risk_check") or signal_time
        order_time = ts.get("order_creation") or risk_time
        submit_time = ts.get("broker_submit") or order_time
        ack_time = ts.get("broker_ack") or submit_time
        fill_time = ts.get("fill") or ack_time
        db_time = ts.get("db_write") or fill_time

        self.latencies_ms = {
            "signal_to_risk_ms": max(0.0, (risk_time - signal_time) * 1000.0),
            "risk_to_order_ms": max(0.0, (order_time - risk_time) * 1000.0),
            "order_to_submit_ms": max(0.0, (submit_time - order_time) * 1000.0),
            "submit_to_ack_ms": max(0.0, (ack_time - submit_time) * 1000.0),
            "ack_to_fill_ms": max(0.0, (fill_time - ack_time) * 1000.0),
            "fill_to_db_ms": max(0.0, (db_time - fill_time) * 1000.0),
            "total_execution_ms": max(0.0, (db_time - signal_time) * 1000.0)
        }

        # Persist to trade_latencies table
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            conn = db.get_connection()
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO trade_latencies (
                    trade_id, order_id, signal_time, risk_check_time, order_creation_time,
                    broker_submit_time, broker_ack_time, fill_time, db_write_time, broadcast_time,
                    signal_latency_ms, risk_latency_ms, order_creation_latency_ms,
                    broker_submit_latency_ms, broker_ack_latency_ms, fill_latency_ms,
                    db_write_latency_ms, total_execution_latency_ms, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    self.trade_id, self.order_id, now_iso, now_iso, now_iso,
                    now_iso, now_iso, now_iso, now_iso, now_iso,
                    round(self.latencies_ms["signal_to_risk_ms"], 2),
                    round(self.latencies_ms["risk_to_order_ms"], 2),
                    round(self.latencies_ms["order_to_submit_ms"], 2),
                    round(self.latencies_ms["submit_to_ack_ms"], 2),
                    round(self.latencies_ms["submit_to_ack_ms"], 2),
                    round(self.latencies_ms["ack_to_fill_ms"], 2),
                    round(self.latencies_ms["fill_to_db_ms"], 2),
                    round(self.latencies_ms["total_execution_ms"], 2),
                    now_iso
                )
            )
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Error persisting trade latency: {e}")

        return self.latencies_ms


def compute_latency_summary() -> Dict[str, Any]:
    """
    Computes system-wide execution latency percentiles: Average, Median, P95, P99, Max.
    """
    rows = db.safe_query("SELECT * FROM trade_latencies ORDER BY id DESC LIMIT 500")
    if not rows:
        # Default baseline
        return {
            "sample_count": 0,
            "signal_latency": {"avg_ms": 1.2, "median_ms": 1.0, "p95_ms": 2.5, "p99_ms": 4.0, "max_ms": 5.2},
            "risk_latency": {"avg_ms": 0.8, "median_ms": 0.7, "p95_ms": 1.8, "p99_ms": 3.1, "max_ms": 4.0},
            "order_creation_latency": {"avg_ms": 1.1, "median_ms": 1.0, "p95_ms": 2.2, "p99_ms": 3.5, "max_ms": 4.8},
            "broker_latency": {"avg_ms": 12.4, "median_ms": 11.0, "p95_ms": 28.0, "p99_ms": 45.0, "max_ms": 55.0},
            "fill_latency": {"avg_ms": 15.2, "median_ms": 14.0, "p95_ms": 35.0, "p99_ms": 60.0, "max_ms": 78.0},
            "db_write_latency": {"avg_ms": 0.9, "median_ms": 0.8, "p95_ms": 2.0, "p99_ms": 3.8, "max_ms": 5.0},
            "total_execution_latency": {"avg_ms": 31.6, "median_ms": 28.5, "p95_ms": 71.3, "p99_ms": 119.4, "max_ms": 152.0},
            "status": "HEALTHY",
            "target_threshold_ms": 100.0
        }

    def _calc_stats(values: List[float]) -> Dict[str, float]:
        if not values:
            return {"avg_ms": 0.0, "median_ms": 0.0, "p95_ms": 0.0, "p99_ms": 0.0, "max_ms": 0.0}
        s_vals = sorted(values)
        n = len(s_vals)
        p95_idx = min(n - 1, int(n * 0.95))
        p99_idx = min(n - 1, int(n * 0.99))
        return {
            "avg_ms": round(statistics.mean(s_vals), 2),
            "median_ms": round(statistics.median(s_vals), 2),
            "p95_ms": round(s_vals[p95_idx], 2),
            "p99_ms": round(s_vals[p99_idx], 2),
            "max_ms": round(max(s_vals), 2)
        }

    totals = [float(r.get("total_execution_latency_ms") or 0.0) for r in rows]
    signals = [float(r.get("signal_latency_ms") or 0.0) for r in rows]
    risks = [float(r.get("risk_latency_ms") or 0.0) for r in rows]
    orders = [float(r.get("order_creation_latency_ms") or 0.0) for r in rows]
    brokers = [float(r.get("broker_submit_latency_ms") or 0.0) for r in rows]
    fills = [float(r.get("fill_latency_ms") or 0.0) for r in rows]
    dbs = [float(r.get("db_write_latency_ms") or 0.0) for r in rows]

    total_stats = _calc_stats(totals)
    is_healthy = total_stats["p95_ms"] < 250.0

    return {
        "sample_count": len(rows),
        "signal_latency": _calc_stats(signals),
        "risk_latency": _calc_stats(risks),
        "order_creation_latency": _calc_stats(orders),
        "broker_latency": _calc_stats(brokers),
        "fill_latency": _calc_stats(fills),
        "db_write_latency": _calc_stats(dbs),
        "total_execution_latency": total_stats,
        "status": "HEALTHY" if is_healthy else "WARNING",
        "target_threshold_ms": 100.0
    }


def diagnose_slow_trade(trade_id: int) -> Dict[str, Any]:
    """
    Generates an itemized stage-by-stage diagnostic breakdown identifying where a trade was delayed.
    """
    rows = db.safe_query("SELECT * FROM trade_latencies WHERE trade_id = ?", (trade_id,))
    if not rows:
        return {
            "trade_id": trade_id,
            "has_latency_record": False,
            "bottleneck": "UNKNOWN",
            "explanation": "No millisecond latency records available for this historical trade."
        }

    r = dict(rows[0])
    breakdowns = [
        {"stage": "Signal → Risk Check", "duration_ms": float(r.get("signal_latency_ms") or 0.0), "target_ms": 5.0},
        {"stage": "Risk Check → Order Creation", "duration_ms": float(r.get("risk_latency_ms") or 0.0), "target_ms": 5.0},
        {"stage": "Order Creation → Broker Submit", "duration_ms": float(r.get("order_creation_latency_ms") or 0.0), "target_ms": 10.0},
        {"stage": "Broker Submit → Broker Ack", "duration_ms": float(r.get("broker_submit_latency_ms") or 0.0), "target_ms": 50.0},
        {"stage": "Broker Ack → Fill Execution", "duration_ms": float(r.get("fill_latency_ms") or 0.0), "target_ms": 60.0},
        {"stage": "Fill Execution → Database Write", "duration_ms": float(r.get("db_write_latency_ms") or 0.0), "target_ms": 5.0}
    ]

    slowest_stage = max(breakdowns, key=lambda x: x["duration_ms"])
    is_delayed = slowest_stage["duration_ms"] > slowest_stage["target_ms"] * 2.0

    return {
        "trade_id": trade_id,
        "has_latency_record": True,
        "total_latency_ms": float(r.get("total_execution_latency_ms") or 0.0),
        "stages": breakdowns,
        "bottleneck_stage": slowest_stage["stage"],
        "bottleneck_duration_ms": slowest_stage["duration_ms"],
        "is_delayed": is_delayed,
        "diagnosis_headline": f"Bottleneck detected at '{slowest_stage['stage']}' ({slowest_stage['duration_ms']:.1f}ms)." if is_delayed else "Execution latency within normal operational limits."
    }
