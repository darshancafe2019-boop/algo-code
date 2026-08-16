import hashlib
import json
import logging
import threading
import time
from collections import OrderedDict
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger("IndicatorCache")


class IndicatorCalculationCache:
    """
    High-performance thread-safe LRU & TTL Cache for Technical Indicator Calculations.
    Prevents repeated expensive mathematical recalculations on identical candle timestamps.
    """

    def __init__(self, max_entries: int = 5000, default_ttl_sec: int = 300):
        self.max_entries = max_entries
        self.default_ttl = default_ttl_sec
        self._cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()
        self._lock = threading.Lock()
        self._hits = 0
        self._misses = 0

    def _make_key(
        self,
        symbol: str,
        timeframe: str,
        candle_timestamp: Any,
        indicator_name: str,
        params: Optional[Dict[str, Any]] = None
    ) -> str:
        param_str = json.dumps(params or {}, sort_keys=True)
        param_hash = hashlib.md5(param_str.encode("utf-8")).hexdigest()[:8]
        return f"{symbol.upper()}:{timeframe}:{candle_timestamp}:{indicator_name.upper()}:{param_hash}"

    def get(
        self,
        symbol: str,
        timeframe: str,
        candle_timestamp: Any,
        indicator_name: str,
        params: Optional[Dict[str, Any]] = None
    ) -> Optional[Any]:
        key = self._make_key(symbol, timeframe, candle_timestamp, indicator_name, params)
        now = time.time()
        with self._lock:
            if key in self._cache:
                entry = self._cache[key]
                if now < entry["expires_at"]:
                    self._cache.move_to_end(key)
                    self._hits += 1
                    return entry["value"]
                else:
                    del self._cache[key]
            self._misses += 1
            return None

    def set(
        self,
        symbol: str,
        timeframe: str,
        candle_timestamp: Any,
        indicator_name: str,
        value: Any,
        params: Optional[Dict[str, Any]] = None,
        ttl_sec: Optional[int] = None
    ) -> None:
        key = self._make_key(symbol, timeframe, candle_timestamp, indicator_name, params)
        now = time.time()
        ttl = ttl_sec or self.default_ttl
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = {
                "value": value,
                "expires_at": now + ttl,
                "created_at": now
            }
            if len(self._cache) > self.max_entries:
                self._cache.popitem(last=False)

    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            total = self._hits + self._misses
            hit_rate = (self._hits / total * 100.0) if total > 0 else 0.0
            return {
                "total_cached_entries": len(self._cache),
                "max_capacity": self.max_entries,
                "cache_hits": self._hits,
                "cache_misses": self._misses,
                "hit_rate_pct": round(hit_rate, 2)
            }

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()
            self._hits = 0
            self._misses = 0


# Global singleton cache instance
indicator_cache = IndicatorCalculationCache()
