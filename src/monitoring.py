import logging
import os
import platform
import shutil
import socket
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional, Tuple, Any

from src import config
from src import db
from src.audit import log_bot_event

logger = logging.getLogger("Monitoring")

MAX_MARKET_DATA_AGE_SECONDS = getattr(config, "MAX_MARKET_DATA_AGE_SECONDS", 60)


class MonitoringService:
    """Collect runtime health information and watchdog observability for the trading bot."""

    def __init__(self) -> None:
        self.started_at = datetime.now(timezone.utc)
        self.last_error_count = 0
        self.last_market_tick_time: Optional[datetime] = None

    def get_uptime_seconds(self) -> float:
        return (datetime.now(timezone.utc) - self.started_at).total_seconds()

    def get_cpu_usage(self) -> Optional[float]:
        try:
            return os.getloadavg()[0] if hasattr(os, "getloadavg") else None
        except Exception:
            return None

    def get_ram_usage_mb(self) -> Optional[float]:
        try:
            return round(shutil.disk_usage(config.BASE_DIR).used / (1024 * 1024), 2)
        except Exception:
            return None

    def check_internet(self) -> Tuple[bool, Optional[float]]:
        try:
            start = time.perf_counter()
            socket.create_connection(("1.1.1.1", 443), timeout=3)
            latency_ms = round((time.perf_counter() - start) * 1000, 2)
            return True, latency_ms
        except OSError:
            return False, None

    def is_market_data_stale(self, last_tick_iso: Optional[str] = None, max_age_seconds: int = MAX_MARKET_DATA_AGE_SECONDS) -> Tuple[bool, float]:
        """Check if market tick is older than configured MAX_MARKET_DATA_AGE_SECONDS."""
        if not last_tick_iso:
            return True, 999999.0
        try:
            dt = datetime.fromisoformat(last_tick_iso.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            age = (datetime.now(timezone.utc) - dt).total_seconds()
            is_stale = age > max_age_seconds
            if is_stale:
                log_bot_event(
                    event_type="MARKET_DATA_STALE",
                    message=f"Market data age {age:.1f}s exceeds limit {max_age_seconds}s",
                    severity="WARNING",
                    reason="STALE_MARKET_DATA"
                )
            return is_stale, round(age, 1)
        except Exception:
            return True, 999999.0

    def collect_health_snapshot(self, balance: Optional[float], equity: Optional[float], current_position: Optional[float]) -> Dict[str, Any]:
        internet_connected, latency_ms = self.check_internet()
        cpu_percent = self.get_cpu_usage()
        ram_mb = self.get_ram_usage_mb()
        status = "RUNNING" if internet_connected else "DEGRADED"

        snapshot = {
            "cpu_percent": cpu_percent,
            "ram_mb": ram_mb,
            "internet_connected": internet_connected,
            "latency_ms": latency_ms,
            "balance": balance,
            "equity": equity,
            "current_position": current_position,
            "status": status,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        return snapshot


# Alias for Watchdog
SystemWatchdog = MonitoringService


def is_market_data_stale(last_tick_iso: Optional[str] = None, max_age_seconds: int = MAX_MARKET_DATA_AGE_SECONDS) -> Tuple[bool, float]:
    """Module-level helper evaluating market data staleness."""
    return MonitoringService().is_market_data_stale(last_tick_iso, max_age_seconds)
