import threading
import pandas as pd
import numpy as np
import logging
from typing import Tuple, Dict, Optional, Any
from src import config

logger = logging.getLogger("Indicators")

# Master Registry for all supported TradingView-style indicators
INDICATOR_REGISTRY: Dict[str, Dict[str, Any]] = {
    # --- TREND ---
    "ema_9": {
        "id": "ema_9", "name": "EMA 9", "category": "Trend", "enabled": True, "favorite": True,
        "timeframe": "15m", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "crossover", "min_confirmations": 1, "priority": 1,
        "parameters": {"length": 9, "source": "close", "offset": 0}
    },
    "ema_20": {
        "id": "ema_20", "name": "EMA 20", "category": "Trend", "enabled": True, "favorite": True,
        "timeframe": "15m", "weight": 20.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "crossover", "min_confirmations": 1, "priority": 2,
        "parameters": {"length": 20, "source": "close", "offset": 0}
    },
    "ema_50": {
        "id": "ema_50", "name": "EMA 50", "category": "Trend", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "crossover", "min_confirmations": 1, "priority": 3,
        "parameters": {"length": 50, "source": "close", "offset": 0}
    },
    "ema_200": {
        "id": "ema_200", "name": "EMA 200", "category": "Trend", "enabled": True, "favorite": True,
        "timeframe": "15m", "weight": 20.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "crossover", "min_confirmations": 1, "priority": 4,
        "parameters": {"length": 200, "source": "close", "offset": 0}
    },
    "sma": {
        "id": "sma", "name": "SMA (Simple Moving Average)", "category": "Trend", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "crossover", "min_confirmations": 1, "priority": 5,
        "parameters": {"length": 20, "source": "close", "offset": 0}
    },
    "hma": {
        "id": "hma", "name": "HMA (Hull Moving Average)", "category": "Trend", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "crossover", "min_confirmations": 1, "priority": 6,
        "parameters": {"length": 20, "source": "close"}
    },
    "vwap": {
        "id": "vwap", "name": "VWAP (Volume Weighted Avg Price)", "category": "Trend", "enabled": True, "favorite": True,
        "timeframe": "15m", "weight": 20.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "threshold", "min_confirmations": 1, "priority": 7,
        "parameters": {"mode": "session"}
    },
    "anchored_vwap": {
        "id": "anchored_vwap", "name": "Anchored VWAP", "category": "Trend", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "threshold", "min_confirmations": 1, "priority": 8,
        "parameters": {"anchor_idx": 0}
    },
    "supertrend": {
        "id": "supertrend", "name": "Supertrend", "category": "Trend", "enabled": True, "favorite": True,
        "timeframe": "15m", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "both", "min_confirmations": 1, "priority": 9,
        "parameters": {"atr_period": 10, "multiplier": 3.0}
    },
    "parabolic_sar": {
        "id": "parabolic_sar", "name": "Parabolic SAR", "category": "Trend", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 10.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "both", "min_confirmations": 1, "priority": 10,
        "parameters": {"af_step": 0.02, "af_max": 0.2}
    },
    "adx": {
        "id": "adx", "name": "ADX (Average Directional Index)", "category": "Trend", "enabled": True, "favorite": True,
        "timeframe": "15m", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "threshold", "min_confirmations": 1, "priority": 11,
        "parameters": {"period": 14, "threshold": 25.0}
    },
    "volume_profile": {
        "id": "volume_profile", "name": "Volume Profile (VPVR)", "category": "Trend", "enabled": True, "favorite": True,
        "timeframe": "1h", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "both", "min_confirmations": 1, "priority": 12,
        "parameters": {"lookback_days": 14, "bin_size": 50.0, "value_area_pct": 70.0}
    },

    # --- MOMENTUM ---
    "macd": {
        "id": "macd", "name": "MACD", "category": "Momentum", "enabled": True, "favorite": True,
        "timeframe": "15m", "weight": 20.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "both", "min_confirmations": 1, "priority": 13,
        "parameters": {"fast": 12, "slow": 26, "signal": 9, "source": "close"}
    },
    "rsi": {
        "id": "rsi", "name": "RSI (Relative Strength Index)", "category": "Momentum", "enabled": True, "favorite": True,
        "timeframe": "15m", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "threshold", "min_confirmations": 1, "priority": 14,
        "parameters": {"period": 14, "source": "close", "oversold": 30.0, "overbought": 70.0, "midline": 50.0}
    },
    "rsi_divergence": {
        "id": "rsi_divergence", "name": "RSI Divergence", "category": "Momentum", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "both", "min_confirmations": 1, "priority": 15,
        "parameters": {"period": 14, "lookback": 14}
    },
    "stoch_rsi": {
        "id": "stoch_rsi", "name": "Stochastic RSI", "category": "Momentum", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "threshold", "min_confirmations": 1, "priority": 16,
        "parameters": {"period": 14, "k": 3, "d": 3, "oversold": 20.0, "overbought": 80.0}
    },
    "stochastic": {
        "id": "stochastic", "name": "Stochastic Oscillator", "category": "Momentum", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 10.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "threshold", "min_confirmations": 1, "priority": 17,
        "parameters": {"k_period": 14, "d_period": 3, "smooth": 3, "oversold": 20.0, "overbought": 80.0}
    },
    "cci": {
        "id": "cci", "name": "CCI (Commodity Channel Index)", "category": "Momentum", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 10.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "threshold", "min_confirmations": 1, "priority": 18,
        "parameters": {"period": 20, "overbought": 100.0, "oversold": -100.0}
    },
    "roc": {
        "id": "roc", "name": "ROC (Rate of Change)", "category": "Momentum", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 10.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "threshold", "min_confirmations": 1, "priority": 19,
        "parameters": {"period": 12, "source": "close"}
    },
    "williams_r": {
        "id": "williams_r", "name": "Williams %R", "category": "Momentum", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 10.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "threshold", "min_confirmations": 1, "priority": 20,
        "parameters": {"period": 14, "overbought": -20.0, "oversold": -80.0}
    },
    "momentum": {
        "id": "momentum", "name": "Momentum", "category": "Momentum", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 10.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "threshold", "min_confirmations": 1, "priority": 21,
        "parameters": {"period": 10, "source": "close"}
    },

    # --- VOLATILITY ---
    "bollinger": {
        "id": "bollinger", "name": "Bollinger Bands", "category": "Volatility", "enabled": True, "favorite": True,
        "timeframe": "15m", "weight": 20.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "both", "min_confirmations": 1, "priority": 22,
        "parameters": {"period": 20, "std_dev": 2.0, "source": "close", "bandwidth_threshold": 0.05}
    },
    "atr": {
        "id": "atr", "name": "ATR (Average True Range)", "category": "Volatility", "enabled": True, "favorite": True,
        "timeframe": "15m", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "threshold", "min_confirmations": 1, "priority": 23,
        "parameters": {"period": 14, "multiplier": 1.5, "volatility_threshold": 1.0}
    },
    "keltner": {
        "id": "keltner", "name": "Keltner Channels", "category": "Volatility", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "both", "min_confirmations": 1, "priority": 24,
        "parameters": {"period": 20, "atr_period": 10, "multiplier": 2.0}
    },
    "donchian": {
        "id": "donchian", "name": "Donchian Channels", "category": "Volatility", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "both", "min_confirmations": 1, "priority": 25,
        "parameters": {"period": 20}
    },
    "std_dev": {
        "id": "std_dev", "name": "Standard Deviation", "category": "Volatility", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 10.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "threshold", "min_confirmations": 1, "priority": 26,
        "parameters": {"period": 20, "source": "close"}
    },

    # --- VOLUME ---
    "volume": {
        "id": "volume", "name": "Volume & Volume SMA", "category": "Volume", "enabled": True, "favorite": True,
        "timeframe": "15m", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "threshold", "min_confirmations": 1, "priority": 27,
        "parameters": {"vol_sma_period": 20, "volume_multiplier": 1.2}
    },
    "obv": {
        "id": "obv", "name": "OBV (On-Balance Volume)", "category": "Volume", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 10.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "both", "min_confirmations": 1, "priority": 28,
        "parameters": {"sma_period": 20}
    },
    "mfi": {
        "id": "mfi", "name": "MFI (Money Flow Index)", "category": "Volume", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "threshold", "min_confirmations": 1, "priority": 29,
        "parameters": {"period": 14, "overbought": 80.0, "oversold": 20.0}
    },
    "cmf": {
        "id": "cmf", "name": "CMF (Chaikin Money Flow)", "category": "Volume", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 10.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "threshold", "min_confirmations": 1, "priority": 30,
        "parameters": {"period": 20, "threshold": 0.0}
    },

    # --- PRICE / STRUCTURE ---
    "pivot": {
        "id": "pivot", "name": "Pivot Points", "category": "Price/Structure", "enabled": True, "favorite": False,
        "timeframe": "1h", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "both", "min_confirmations": 1, "priority": 31,
        "parameters": {"pivot_type": "standard"}
    },
    "fibonacci": {
        "id": "fibonacci", "name": "Fibonacci Retracement Levels", "category": "Price/Structure", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "both", "min_confirmations": 1, "priority": 32,
        "parameters": {"lookback": 50, "levels": [0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]}
    },
    "support_resistance": {
        "id": "support_resistance", "name": "Support & Resistance Levels", "category": "Price/Structure", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "both", "min_confirmations": 1, "priority": 33,
        "parameters": {"lookback": 50, "zone_width_pct": 0.5, "min_touches": 2}
    },
    "breakout_levels": {
        "id": "breakout_levels", "name": "High/Low Breakout Levels", "category": "Price/Structure", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "both", "min_confirmations": 1, "priority": 34,
        "parameters": {"lookback": 20, "buffer_pct": 0.1, "confirm_candles": 1}
    },
    "chart_patterns": {
        "id": "chart_patterns", "name": "Chart Pattern Recognition", "category": "Price/Structure", "enabled": True, "favorite": False,
        "timeframe": "15m", "weight": 15.0, "long_enabled": True, "short_enabled": True,
        "signal_mode": "both", "min_confirmations": 1, "priority": 35,
        "parameters": {"window": 15}
    }
}

INDICATOR_PRESETS: Dict[str, Dict[str, Any]] = {
    "Conservative": {
        "name": "Conservative",
        "description": "High-confidence trend confirmation using EMA 50/200, MACD, ADX, VWAP & Volume.",
        "enabled_ids": ["ema_50", "ema_200", "macd", "adx", "vwap", "volume"],
        "weights": {"ema_50": 15, "ema_200": 25, "macd": 20, "adx": 20, "vwap": 20, "volume": 15}
    },
    "Balanced": {
        "name": "Balanced",
        "description": "Standard multi-indicator confluence strategy for trend and momentum.",
        "enabled_ids": ["ema_9", "ema_20", "macd", "rsi", "adx", "vwap", "volume_profile", "bollinger"],
        "weights": {"ema_9": 10, "ema_20": 15, "macd": 20, "rsi": 15, "adx": 15, "vwap": 15, "volume_profile": 15, "bollinger": 15}
    },
    "Aggressive": {
        "name": "Aggressive",
        "description": "Fast momentum and breakout triggers for high-frequency setups.",
        "enabled_ids": ["ema_9", "rsi", "stoch_rsi", "macd", "supertrend", "volume", "breakout_levels"],
        "weights": {"ema_9": 20, "rsi": 20, "stoch_rsi": 15, "macd": 20, "supertrend": 15, "volume": 15, "breakout_levels": 15}
    },
    "Scalping": {
        "name": "Scalping",
        "description": "Short timeframe scalp triggers using EMA 9/20, RSI, VWAP, Supertrend & ATR.",
        "enabled_ids": ["ema_9", "ema_20", "rsi", "vwap", "supertrend", "volume", "atr"],
        "weights": {"ema_9": 20, "ema_20": 20, "rsi": 15, "vwap": 20, "supertrend": 15, "volume": 15, "atr": 10}
    },
    "Trend Following": {
        "name": "Trend Following",
        "description": "Strong trend tracking with Supertrend, Parabolic SAR, ADX, and EMAs.",
        "enabled_ids": ["ema_20", "ema_50", "ema_200", "supertrend", "parabolic_sar", "adx", "vwap"],
        "weights": {"ema_20": 15, "ema_50": 15, "ema_200": 20, "supertrend": 20, "parabolic_sar": 15, "adx": 15, "vwap": 15}
    },
    "Breakout": {
        "name": "Breakout",
        "description": "Volatile breakout setup using Bollinger Bands, Donchian, ATR, and Volume.",
        "enabled_ids": ["bollinger", "donchian", "atr", "volume", "vwap", "breakout_levels"],
        "weights": {"bollinger": 20, "donchian": 20, "atr": 15, "volume": 20, "vwap": 15, "breakout_levels": 20}
    }
}


def get_timeframe_minutes(timeframe: Optional[str] = None) -> int:
    """Map supported Binance timeframes to approximate minute counts."""
    tf = (timeframe or config.TIMEFRAME or "5m").lower()
    mapping = {
        "1m": 1,
        "3m": 3,
        "5m": 5,
        "15m": 15,
        "30m": 30,
        "1h": 60,
        "2h": 120,
        "4h": 240,
        "6h": 360,
        "8h": 480,
        "12h": 720,
        "1d": 1440,
    }
    if tf not in mapping:
        logger.warning("Unsupported timeframe %s. Falling back to 5m mapping.", tf)
        return mapping.get("1h", 60)
    return mapping[tf]


def get_lookback_candles(timeframe: Optional[str] = None, lookback_days: Optional[int] = None) -> int:
    """Convert a lookback in days to a candle count for the selected timeframe."""
    tf = (timeframe or config.TIMEFRAME or "5m").lower()
    if tf not in {
        "1m",
        "3m",
        "5m",
        "15m",
        "30m",
        "1h",
        "2h",
        "4h",
        "6h",
        "8h",
        "12h",
        "1d",
    }:
        logger.warning("Unsupported timeframe %s. Falling back to a 30-day 1h lookback.", tf)
        return 720

    days = lookback_days if lookback_days is not None else config.VP_LOOKBACK_DAYS
    minutes = get_timeframe_minutes(tf)
    candles = max(24 * 60 // minutes, 1) * int(days)
    return int(candles)


def _ema(series: pd.Series, length: int) -> pd.Series:
    """Calculates Exponential Moving Average with seed initialization safely and fast NumPy vectorization."""
    if series.empty:
        return pd.Series(index=series.index, dtype=float)
    n = len(series)
    if n < length:
        return series.ewm(span=length, adjust=False).mean()

    vals = series.to_numpy(dtype=np.float64, copy=False)
    out = np.full(n, np.nan, dtype=np.float64)
    
    alpha = 2.0 / (length + 1.0)
    seed_idx = min(n - 1, length - 1)
    
    first_chunk = vals[:length]
    valid_mask = ~np.isnan(first_chunk)
    if not np.any(valid_mask):
        return pd.Series(out, index=series.index)
        
    seed_value = float(np.mean(first_chunk[valid_mask]))
    out[seed_idx] = seed_value

    prev_ema = seed_value
    for i in range(seed_idx + 1, n):
        v = vals[i]
        if np.isnan(v):
            continue
        prev_ema = prev_ema + alpha * (v - prev_ema)
        out[i] = prev_ema

    return pd.Series(out, index=series.index)


def calculate_emas(df: pd.DataFrame, fast: Optional[int] = None, slow: Optional[int] = None, support: Optional[int] = None, trend: Optional[int] = None) -> pd.DataFrame:
    """
    Calculates EMA 9, 20, 50, and 200 on closing prices.
    
    Args:
        df (pd.DataFrame): Dataframe with 'close' column.
        
    Returns:
        pd.DataFrame: Dataframe with added EMA columns.
    """
    f_len = fast or getattr(config, "EMA_FAST_CROSS", 9)
    s_len = slow or getattr(config, "EMA_SLOW_CROSS", 20)
    sup_len = support or getattr(config, "EMA_SUPPORT", 50)
    tr_len = trend or getattr(config, "EMA_TREND_FILTER", 200)

    df['ema_9'] = _ema(df['close'], f_len)
    df['ema_20'] = _ema(df['close'], s_len)
    df['ema_50'] = _ema(df['close'], sup_len)
    df['ema_200'] = _ema(df['close'], tr_len)
    return df


def calculate_macd(df: pd.DataFrame, fast: Optional[int] = None, slow: Optional[int] = None, signal: Optional[int] = None, source: str = "close") -> pd.DataFrame:
    """
    Calculates MACD Line, Signal Line, and Histogram with dynamic parameter support.
    Standardizes column names.
    
    Args:
        df (pd.DataFrame): Dataframe with source price column.
        fast (int, optional): Fast EMA period (default 12).
        slow (int, optional): Slow EMA period (default 26).
        signal (int, optional): Signal line EMA period (default 9).
        source (str): Price source column name (default 'close').
        
    Returns:
        pd.DataFrame: Dataframe with standard columns: macd_line, macd_signal, macd_hist.
    """
    f_len = int(fast if fast is not None else getattr(config, "MACD_FAST", 12))
    s_len = int(slow if slow is not None else getattr(config, "MACD_SLOW", 26))
    sig_len = int(signal if signal is not None else getattr(config, "MACD_SIGNAL", 9))
    src_col = source if source in df.columns else "close"

    fast_ema = _ema(df[src_col], f_len)
    slow_ema = _ema(df[src_col], s_len)
    macd_line = fast_ema - slow_ema
    signal_line = macd_line.ewm(span=sig_len, adjust=False, min_periods=sig_len).mean()
    hist_line = macd_line - signal_line

    df['macd_line'] = macd_line
    df['macd_signal'] = signal_line
    df['macd_hist'] = hist_line
    return df


def calculate_rsi(df: pd.DataFrame, length: int = 14, source: str = 'close', col_name: Optional[str] = None) -> pd.DataFrame:
    """
    Calculates RSI on the given source price series.

    Args:
        df (pd.DataFrame): Dataframe with source column.
        length (int): RSI lookback length.
        source (str): Column name to use for RSI calculation.
        col_name (str, optional): Target column name to store RSI series.

    Returns:
        pd.DataFrame: Dataframe with added RSI column.
    """
    delta = df[source].diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)

    avg_gain = gain.rolling(window=length, min_periods=length).mean()
    avg_loss = loss.rolling(window=length, min_periods=length).mean()

    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    rsi = 100.0 - (100.0 / (1.0 + rs))

    target_col = col_name or 'rsi'
    df[target_col] = rsi
    if target_col != 'rsi' and 'rsi' not in df.columns:
        df['rsi'] = rsi
    return df


def calculate_sma(df: pd.DataFrame, length: int = 20, source: str = 'close') -> pd.DataFrame:
    """Calculates Simple Moving Average (SMA) on source price series."""
    df[f'sma_{length}'] = df[source].rolling(window=length, min_periods=length).mean()
    return df


def calculate_bollinger_bands(df: pd.DataFrame, length: int = 20, std_dev: float = 2.0, source: str = 'close') -> pd.DataFrame:
    """Calculates Bollinger Bands (Middle SMA, Upper Band, Lower Band, %B)."""
    sma = df[source].rolling(window=length, min_periods=length).mean()
    std = df[source].rolling(window=length, min_periods=length).std()
    
    upper = sma + (std_dev * std)
    lower = sma - (std_dev * std)
    pct_b = (df[source] - lower) / (upper - lower).replace(0, np.nan)
    
    df['bb_middle'] = sma
    df['bb_upper'] = upper
    df['bb_lower'] = lower
    df['bb_pct_b'] = pct_b
    df['bollinger_ub'] = upper
    df['bollinger_lb'] = lower
    return df


def calculate_adx(df: pd.DataFrame, length: int = 14, col_suffix: str = "") -> pd.DataFrame:
    """Calculates Average Directional Index (ADX), +DI, and -DI."""
    high = df['high']
    low = df['low']
    close = df['close']
    
    tr1 = high - low
    tr2 = (high - close.shift(1)).abs()
    tr3 = (low - close.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    
    up_move = high - high.shift(1)
    down_move = low.shift(1) - low
    
    pos_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    neg_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
    
    atr = tr.rolling(window=length, min_periods=length).mean()
    pos_di = 100.0 * (pd.Series(pos_dm, index=df.index).rolling(window=length).mean() / atr.replace(0, np.nan))
    neg_di = 100.0 * (pd.Series(neg_dm, index=df.index).rolling(window=length).mean() / atr.replace(0, np.nan))
    
    dx = 100.0 * (pos_di - neg_di).abs() / (pos_di + neg_di).replace(0, np.nan)
    adx = dx.rolling(window=length, min_periods=length).mean()
    
    sfx = col_suffix or (f"_{length}" if length != 14 else "")
    df[f'adx{sfx}'] = adx.fillna(15.0)
    df[f'plus_di{sfx}'] = pos_di.fillna(0.0)
    df[f'minus_di{sfx}'] = neg_di.fillna(0.0)

    if sfx != "":
        df['adx'] = df[f'adx{sfx}']
        df['plus_di'] = df[f'plus_di{sfx}']
        df['minus_di'] = df[f'minus_di{sfx}']

    df['pos_di'] = df['plus_di']
    df['neg_di'] = df['minus_di']

    return df


def calculate_momentum(df: pd.DataFrame, length: int = 10, source: str = 'close') -> pd.DataFrame:
    """Calculates Momentum (Rate of Change / Price Difference over lookback period)."""
    df['momentum'] = df[source] - df[source].shift(length)
    return df


def calculate_auto_fib(df: pd.DataFrame, lookback: int = 50) -> pd.DataFrame:
    """Calculates Auto Fibonacci Retracement levels (0.236, 0.382, 0.500, 0.618, 0.786)."""
    highs = df['high'].rolling(window=lookback, min_periods=5).max()
    lows = df['low'].rolling(window=lookback, min_periods=5).min()
    diff = highs - lows
    
    df['fib_0'] = lows
    df['fib_236'] = lows + (diff * 0.236)
    df['fib_382'] = lows + (diff * 0.382)
    df['fib_500'] = lows + (diff * 0.500)
    df['fib_618'] = lows + (diff * 0.618)
    df['fib_786'] = lows + (diff * 0.786)
    df['fib_100'] = highs
    return df


def calculate_pivot_points(df: pd.DataFrame) -> pd.DataFrame:
    """Calculates Standard Pivot Points (Pivot, R1, R2, S1, S2) based on recent High, Low, Close."""
    high = df['high'].shift(1)
    low = df['low'].shift(1)
    close = df['close'].shift(1)
    
    pivot = (high + low + close) / 3.0
    r1 = (2.0 * pivot) - low
    s1 = (2.0 * pivot) - high
    r2 = pivot + (high - low)
    s2 = pivot - (high - low)
    
    df['pivot_p'] = pivot.bfill().ffill()
    df['pivot_point'] = df['pivot_p']
    df['pivot_r1'] = r1.bfill().ffill()
    df['pivot_s1'] = s1.bfill().ffill()
    df['pivot_r2'] = r2.bfill().ffill()
    df['pivot_s2'] = s2.bfill().ffill()
    return df


def calculate_auto_key_levels(df: pd.DataFrame, lookback: int = 100) -> pd.DataFrame:
    """Calculates dynamic Key Support and Resistance levels by detecting local extrema clusters."""
    n = len(df)
    res_level = float(df['high'].max()) if n > 0 else 66000.0
    sup_level = float(df['low'].min()) if n > 0 else 64000.0
    if n >= 20:
        recent = df.iloc[-min(n, lookback):]
        res_level = float(recent['high'].max())
        sup_level = float(recent['low'].min())
    df['key_resistance'] = res_level
    df['key_support'] = sup_level
    return df


def calculate_rsi_momentum_trend(df: pd.DataFrame, rsi_length: int = 14, smooth_length: int = 9) -> pd.DataFrame:
    """Calculates RSI Momentum Trend (RSI value + smoothed RSI EMA trend)."""
    df = calculate_rsi(df, length=rsi_length)
    rsi_series = df['rsi'].fillna(50.0)
    rsi_smooth = _ema(rsi_series, smooth_length)
    df['rsi_momentum_trend'] = rsi_series - rsi_smooth
    return df


def detect_chart_patterns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Best-effort chart pattern recognition (Double Top/Bottom, Head & Shoulders, Bull/Bear Flags, Triangles).
    Flags pattern detections as lightweight string tags.
    """
    patterns = ["None"] * len(df)
    n = len(df)
    if n >= 15:
        closes = df['close'].values
        highs = df['high'].values
        lows = df['low'].values
        for i in range(10, n):
            sub_h = highs[i-10:i+1]
            sub_l = lows[i-10:i+1]
            sub_c = closes[i-10:i+1]
            if abs(sub_h[-1] - sub_h[5]) / max(sub_h[5], 1) < 0.003 and sub_h[5] > sub_h[0]:
                patterns[i] = "Double Top"
            elif abs(sub_l[-1] - sub_l[5]) / max(sub_l[5], 1) < 0.003 and sub_l[5] < sub_l[0]:
                patterns[i] = "Double Bottom"
            elif sub_c[-1] > sub_c[-5] > sub_c[-10] and sub_h[-1] > sub_h[-3]:
                patterns[i] = "Bull Flag"
            elif sub_c[-1] < sub_c[-5] < sub_c[-10] and sub_l[-1] < sub_l[-3]:
                patterns[i] = "Bear Flag"
            elif (sub_h[0] > sub_h[5] and sub_h[5] < sub_h[10]) and (sub_l[0] < sub_l[5] and sub_l[5] > sub_l[10]):
                patterns[i] = "Triangle"
    df['chart_pattern'] = patterns
    return df


def _calculate_value_area(bin_volumes: Dict[int, float], value_area_pct: float) -> Tuple[Optional[int], Optional[int], Optional[int]]:
    """
    Helper function to calculate POC, VAL, VAH from a volume-by-bin dictionary.
    
    Args:
        bin_volumes (dict): Map of bin start price (int) to volume (float).
        value_area_pct (float): Percentage of volume within the Value Area (e.g. 0.70).
        
    Returns:
        tuple: (poc, val, vah) representing POC price, VAL price, and VAH price.
    """
    # Remove bins with negligible volumes to optimize search
    active_bins = {k: v for k, v in bin_volumes.items() if v > 1e-5}
    if not active_bins:
        return None, None, None

    sorted_bins = sorted(active_bins.keys())
    
    # POC (Point of Control) is the bin with the highest volume
    poc_bin = max(active_bins, key=active_bins.get)
    poc_idx = sorted_bins.index(poc_bin)
    
    total_volume = sum(active_bins.values())
    target_volume = total_volume * value_area_pct
    
    current_volume = active_bins[poc_bin]
    
    # Expansion pointers starting at POC
    low_idx = poc_idx
    high_idx = poc_idx
    
    while current_volume < target_volume:
        vol_below = 0.0
        vol_above = 0.0
        
        if low_idx > 0:
            vol_below = active_bins[sorted_bins[low_idx - 1]]
        if high_idx < len(sorted_bins) - 1:
            vol_above = active_bins[sorted_bins[high_idx + 1]]
            
        if vol_below == 0.0 and vol_above == 0.0:
            break  # No more volume to expand to
            
        # Add the larger volume bin and move pointer
        if vol_below >= vol_above:
            low_idx -= 1
            current_volume += vol_below
        else:
            high_idx += 1
            current_volume += vol_above
            
    val = sorted_bins[low_idx]
    vah = sorted_bins[high_idx]
    
    return int(poc_bin), int(val), int(vah)

def calculate_volume_profile(df: pd.DataFrame, timeframe: Optional[str] = None, lookback_days: Optional[int] = None, value_area_pct: Optional[float] = None, bin_size: Optional[float] = None) -> pd.DataFrame:
    """
    Calculates Point of Control (POC), Value Area Low (VAL), and Value Area High (VAH)
    over a rolling lookback window using the High-Low range split method with fast array indexing.
    Supports dynamic lookback_days, value_area_pct, and bin_size.
    """
    if df.empty:
        df['poc'] = np.nan
        df['val'] = np.nan
        df['vah'] = np.nan
        return df

    # 1. Determine lookback window size in candles
    tf = (timeframe or config.TIMEFRAME or "5m").lower()
    mins = get_timeframe_minutes(tf)
    days = int(lookback_days if lookback_days is not None else getattr(config, "VP_LOOKBACK_DAYS", 14))
    lookback_candles = int((days * 1440) / max(1, mins))
        
    bin_sz = float(bin_size if bin_size is not None else getattr(config, "VP_BIN_SIZE_USDT", 50.0))
    va_pct = float(value_area_pct if value_area_pct is not None else getattr(config, "VP_VALUE_AREA_PCT", 70.0))
    bin_size = bin_sz
    value_area_pct = va_pct
    n = len(df)

    pocs = [np.nan] * n
    vals = [np.nan] * n
    vahs = [np.nan] * n
    
    highs_arr = df['high'].to_numpy(dtype=np.float64, copy=False)
    lows_arr = df['low'].to_numpy(dtype=np.float64, copy=False)
    vols_arr = df['volume'].to_numpy(dtype=np.float64, copy=False)

    # Pre-distribute each candle's volume to avoid repeating this calculation
    candle_distributions = []
    for idx in range(n):
        high = highs_arr[idx]
        low = lows_arr[idx]
        vol = vols_arr[idx]
        dist = {}
        
        # If High-Low range is 0 (or close to it), place all volume in one bin
        if high <= low + 1e-4:
            bin_val = int(low // bin_size) * int(bin_size)
            dist[bin_val] = vol
        else:
            low_bin = int(low // bin_size) * int(bin_size)
            high_bin = int(high // bin_size) * int(bin_size)
            
            # Find the range of bins
            num_bins = int((high_bin - low_bin) / bin_size) + 1
            vol_per_bin = vol / num_bins
            for b in range(low_bin, high_bin + int(bin_size), int(bin_size)):
                dist[b] = vol_per_bin
                
        candle_distributions.append(dist)
        
    # Running volume profile dictionary
    running_profile = {}
    
    # 2. Build initial window
    initial_limit = min(lookback_candles, n)
    for idx in range(initial_limit):
        dist = candle_distributions[idx]
        for b, vol in dist.items():
            running_profile[b] = running_profile.get(b, 0.0) + vol
            
    # Calculate indicators for the end of the initial window
    if initial_limit > 0:
        poc, val, vah = _calculate_value_area(running_profile, value_area_pct)
        target_idx = initial_limit - 1
        pocs[target_idx] = poc
        vals[target_idx] = val
        vahs[target_idx] = vah
        
    # 3. Slide the window
    for idx in range(initial_limit, n):
        # Remove the candle that fell out of lookback
        if idx >= lookback_candles:
            out_dist = candle_distributions[idx - lookback_candles]
            for b, vol in out_dist.items():
                if b in running_profile:
                    running_profile[b] -= vol
                    if running_profile[b] <= 1e-5:
                        del running_profile[b]
                    
        # Add the new candle entering the window
        in_dist = candle_distributions[idx]
        for b, vol in in_dist.items():
            running_profile[b] = running_profile.get(b, 0.0) + vol
            
        # Calculate new profile boundaries
        poc, val, vah = _calculate_value_area(running_profile, value_area_pct)
        pocs[idx] = poc
        vals[idx] = val
        vahs[idx] = vah
        
    df['poc'] = pocs
    df['val'] = vals
    df['vah'] = vahs
    
    # Forward fill POC, VAL, VAH for initial rows
    df['poc'] = df['poc'].bfill().ffill()
    df['val'] = df['val'].bfill().ffill()
    df['vah'] = df['vah'].bfill().ffill()
    
    return df

def calculate_atr(df: pd.DataFrame, length: int = 14) -> pd.DataFrame:
    """Calculate Average True Range (ATR)."""
    high_low = df['high'] - df['low']
    high_close = (df['high'] - df['close'].shift(1)).abs()
    low_close = (df['low'] - df['close'].shift(1)).abs()
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    df['atr'] = tr.rolling(window=length).mean()
    return df


def calculate_hma(df: pd.DataFrame, length: int = 20, source: str = 'close') -> pd.DataFrame:
    """Calculate Hull Moving Average (HMA)."""
    src = df[source]
    half_length = int(length / 2)
    sqrt_length = int(np.sqrt(length))
    wma_half = src.rolling(window=half_length).mean()
    wma_full = src.rolling(window=length).mean()
    raw_hma = 2 * wma_half - wma_full
    df['hma'] = raw_hma.rolling(window=max(1, sqrt_length)).mean()
    return df


def calculate_vwap(df: pd.DataFrame) -> pd.DataFrame:
    """Calculate Volume Weighted Average Price (VWAP)."""
    typical_price = (df['high'] + df['low'] + df['close']) / 3.0
    tp_vol = typical_price * df['volume']
    cum_vol = df['volume'].cumsum().replace(0, 1e-5)
    df['vwap'] = tp_vol.cumsum() / cum_vol
    return df


def calculate_supertrend(df: pd.DataFrame, period: int = 10, multiplier: float = 3.0) -> pd.DataFrame:
    """Calculate Supertrend indicator (Trend direction + trailing band) with fast NumPy vectorization."""
    if df.empty:
        df['supertrend'] = np.nan
        df['supertrend_dir'] = 1
        return df
    hl2 = (df['high'] + df['low']) / 2.0
    df = calculate_atr(df, length=period)
    atr = df['atr']

    basic_ub = (hl2 + (multiplier * atr)).to_numpy(dtype=np.float64, copy=False)
    basic_lb = (hl2 - (multiplier * atr)).to_numpy(dtype=np.float64, copy=False)
    closes = df['close'].to_numpy(dtype=np.float64, copy=False)
    n = len(df)

    final_ub = np.zeros(n, dtype=np.float64)
    final_lb = np.zeros(n, dtype=np.float64)
    trend = np.ones(n, dtype=np.int32)

    for i in range(1, n):
        if basic_ub[i] < final_ub[i - 1] or closes[i - 1] > final_ub[i - 1]:
            final_ub[i] = basic_ub[i]
        else:
            final_ub[i] = final_ub[i - 1]

        if basic_lb[i] > final_lb[i - 1] or closes[i - 1] < final_lb[i - 1]:
            final_lb[i] = basic_lb[i]
        else:
            final_lb[i] = final_lb[i - 1]

        if trend[i - 1] == 1 and closes[i] < final_lb[i]:
            trend[i] = -1
        elif trend[i - 1] == -1 and closes[i] > final_ub[i]:
            trend[i] = 1
        else:
            trend[i] = trend[i - 1]

    df['supertrend'] = np.where(trend == 1, final_lb, final_ub)
    df['supertrend_dir'] = trend
    return df


def calculate_stoch_rsi(df: pd.DataFrame, period: int = 14, rsi_period: int = 14, k: int = 3, d: int = 3) -> pd.DataFrame:
    """Calculate Stochastic RSI (%K and %D)."""
    df = calculate_rsi(df, length=rsi_period)
    rsi = df['rsi']
    rsi_min = rsi.rolling(window=period).min()
    rsi_max = rsi.rolling(window=period).max()
    stoch_rsi_raw = ((rsi - rsi_min) / (rsi_max - rsi_min).replace(0, 1e-5)) * 100.0
    df['stoch_rsi_k'] = stoch_rsi_raw.rolling(window=k).mean()
    df['stoch_rsi_d'] = df['stoch_rsi_k'].rolling(window=d).mean()
    return df


def calculate_stochastic(df: pd.DataFrame, k_period: int = 14, d_period: int = 3) -> pd.DataFrame:
    """Calculate Stochastic Oscillator (%K and %D)."""
    low_min = df['low'].rolling(window=k_period).min()
    high_max = df['high'].rolling(window=k_period).max()
    df['stoch_k'] = ((df['close'] - low_min) / (high_max - low_min).replace(0, 1e-5)) * 100.0
    df['stoch_d'] = df['stoch_k'].rolling(window=d_period).mean()
    return df


def calculate_cci(df: pd.DataFrame, period: int = 20) -> pd.DataFrame:
    """Calculate Commodity Channel Index (CCI)."""
    tp = (df['high'] + df['low'] + df['close']) / 3.0
    sma_tp = tp.rolling(window=period).mean()
    mean_dev = tp.rolling(window=period).apply(lambda x: np.mean(np.abs(x - np.mean(x))), raw=True)
    df['cci'] = (tp - sma_tp) / (0.015 * mean_dev.replace(0, 1e-5))
    return df


def calculate_roc(df: pd.DataFrame, period: int = 12, source: str = 'close') -> pd.DataFrame:
    """Calculate Rate of Change (ROC)."""
    src = df[source]
    df['roc'] = ((src - src.shift(period)) / src.shift(period).replace(0, 1e-5)) * 100.0
    return df


def calculate_williams_r(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    """Calculate Williams %R."""
    high_max = df['high'].rolling(window=period).max()
    low_min = df['low'].rolling(window=period).min()
    df['williams_r'] = ((high_max - df['close']) / (high_max - low_min).replace(0, 1e-5)) * -100.0
    return df


def calculate_keltner_channels(df: pd.DataFrame, period: int = 20, atr_period: int = 10, multiplier: float = 2.0) -> pd.DataFrame:
    """Calculate Keltner Channels."""
    ema_mid = _ema(df['close'], period)
    df = calculate_atr(df, length=atr_period)
    atr = df['atr']
    df['keltner_mid'] = ema_mid
    df['keltner_upper'] = ema_mid + (multiplier * atr)
    df['keltner_lower'] = ema_mid - (multiplier * atr)
    return df


def calculate_donchian_channels(df: pd.DataFrame, period: int = 20) -> pd.DataFrame:
    """Calculate Donchian Channels."""
    df['donchian_high'] = df['high'].rolling(window=period).max()
    df['donchian_low'] = df['low'].rolling(window=period).min()
    df['donchian_mid'] = (df['donchian_high'] + df['donchian_low']) / 2.0
    return df


def calculate_std_dev(df: pd.DataFrame, period: int = 20, source: str = 'close') -> pd.DataFrame:
    """Calculate Rolling Standard Deviation."""
    df['std_dev'] = df[source].rolling(window=period).std()
    return df


def calculate_obv(df: pd.DataFrame) -> pd.DataFrame:
    """Calculate On-Balance Volume (OBV)."""
    close_diff = df['close'].diff()
    direction = np.where(close_diff > 0, 1, np.where(close_diff < 0, -1, 0))
    df['obv'] = (direction * df['volume']).cumsum()
    return df


def calculate_mfi(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    """Calculate Money Flow Index (MFI)."""
    tp = (df['high'] + df['low'] + df['close']) / 3.0
    mf = tp * df['volume']
    pos_mf = np.where(tp > tp.shift(1), mf, 0.0)
    neg_mf = np.where(tp < tp.shift(1), mf, 0.0)
    pos_sum = pd.Series(pos_mf, index=df.index).rolling(window=period).sum()
    neg_sum = pd.Series(neg_mf, index=df.index).rolling(window=period).sum().replace(0, 1e-5)
    mfr = pos_sum / neg_sum
    df['mfi'] = 100.0 - (100.0 / (1.0 + mfr))
    return df


def calculate_cmf(df: pd.DataFrame, period: int = 20) -> pd.DataFrame:
    """Calculate Chaikin Money Flow (CMF)."""
    clv = ((df['close'] - df['low']) - (df['high'] - df['close'])) / (df['high'] - df['low']).replace(0, 1e-5)
    vol_clv = clv * df['volume']
    df['cmf'] = vol_clv.rolling(window=period).sum() / df['volume'].rolling(window=period).sum().replace(0, 1e-5)
    return df


def calculate_support_resistance(df: pd.DataFrame, lookback: int = 50) -> pd.DataFrame:
    """Calculate Dynamic Support and Resistance Levels."""
    df['support_level'] = df['low'].rolling(window=lookback).min()
    df['resistance_level'] = df['high'].rolling(window=lookback).max()
    return df


def calculate_breakout_levels(df: pd.DataFrame, lookback: int = 20) -> pd.DataFrame:
    """Calculate High/Low Breakout Levels."""
    df['breakout_high'] = df['high'].shift(1).rolling(window=lookback).max()
    df['breakout_low'] = df['low'].shift(1).rolling(window=lookback).min()
    return df


def calculate_parabolic_sar(df: pd.DataFrame, af_step: float = 0.02, af_max: float = 0.2) -> pd.DataFrame:
    """Calculate Parabolic SAR (Stop and Reverse)."""
    if df.empty or len(df) < 5:
        df['parabolic_sar'] = df['close'] if not df.empty else pd.Series(dtype=float)
        df['psar_dir'] = 1
        return df

    highs = df['high'].values
    lows = df['low'].values
    closes = df['close'].values
    n = len(df)

    sar = np.zeros(n)
    psar_dir = np.ones(n, dtype=int)  # 1 = Long, -1 = Short

    is_long = closes[1] >= closes[0]
    psar_dir[0] = 1 if is_long else -1
    sar[0] = lows[0] if is_long else highs[0]
    ep = highs[0] if is_long else lows[0]
    af = af_step

    for i in range(1, n):
        prev_sar = sar[i - 1]
        if is_long:
            current_sar = prev_sar + af * (ep - prev_sar)
            current_sar = min(current_sar, lows[i - 1], lows[i - 2] if i >= 2 else lows[i - 1])
            if lows[i] < current_sar:
                is_long = False
                current_sar = ep
                ep = lows[i]
                af = af_step
            else:
                if highs[i] > ep:
                    ep = highs[i]
                    af = min(af + af_step, af_max)
        else:
            current_sar = prev_sar + af * (ep - prev_sar)
            current_sar = max(current_sar, highs[i - 1], highs[i - 2] if i >= 2 else highs[i - 1])
            if highs[i] > current_sar:
                is_long = True
                current_sar = ep
                ep = highs[i]
                af = af_step
            else:
                if lows[i] < ep:
                    ep = lows[i]
                    af = min(af + af_step, af_max)

        sar[i] = current_sar
        psar_dir[i] = 1 if is_long else -1

    df['parabolic_sar'] = sar
    df['psar_dir'] = psar_dir
    return df


def calculate_anchored_vwap(df: pd.DataFrame, anchor_idx: int = 0) -> pd.DataFrame:
    """Calculate Anchored VWAP starting from a specific candle index or session start."""
    anchor = max(0, min(anchor_idx, len(df) - 1))
    sub_df = df.iloc[anchor:]
    typical_price = (sub_df['high'] + sub_df['low'] + sub_df['close']) / 3.0
    tp_vol = typical_price * sub_df['volume']
    cum_vol = sub_df['volume'].cumsum().replace(0, 1e-5)
    anchored_val = tp_vol.cumsum() / cum_vol

    avwap = pd.Series(index=df.index, dtype=float)
    avwap.iloc[anchor:] = anchored_val
    avwap.iloc[:anchor] = df['close'].iloc[:anchor]
    df['anchored_vwap'] = avwap.bfill().ffill()
    return df


def detect_rsi_divergence(df: pd.DataFrame, rsi_length: int = 14, lookback: int = 14) -> pd.DataFrame:
    """Detect Bullish and Bearish RSI Divergences (Bullish: Price Lower Low + RSI Higher Low)."""
    if 'rsi' not in df.columns:
        df = calculate_rsi(df, length=rsi_length)

    divergences = ["None"] * len(df)
    n = len(df)
    if n >= lookback + 5:
        closes = df['close'].values
        rsi_vals = df['rsi'].fillna(50.0).values
        for i in range(lookback, n):
            p_curr, p_prev = closes[i], closes[i - lookback]
            r_curr, r_prev = rsi_vals[i], rsi_vals[i - lookback]
            if p_curr < p_prev and r_curr > r_prev:
                divergences[i] = "Bullish Divergence"
            elif p_curr > p_prev and r_curr < r_prev:
                divergences[i] = "Bearish Divergence"

    df['rsi_divergence'] = divergences
    return df


def detect_market_regime(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Classifies market regime into TRENDING_BULL, TRENDING_BEAR, SIDEWAYS_RANGE, HIGH_VOLATILITY, LOW_VOLATILITY, BREAKOUT, or PULLBACK.
    Calculates regime metrics strictly using closed candles.
    """
    if df.empty or len(df) < 30:
        return {"regime": "RANGING", "volatility": "Moderate", "bias": "Neutral", "adx": 20.0, "atr_pct": 1.0}

    if 'adx' not in df.columns:
        df = calculate_adx(df)
    if 'atr' not in df.columns:
        df = calculate_atr(df)
    if 'ema_20' not in df.columns:
        df = calculate_emas(df)
    if 'bollinger_ub' not in df.columns:
        df = calculate_bollinger_bands(df)

    latest = df.iloc[-1]
    adx_val = float(latest.get('adx', 20.0))
    close_p = float(latest['close'])
    ema_20 = float(latest.get('ema_20', close_p))
    ema_50 = float(latest.get('ema_50', close_p))
    atr_val = float(latest.get('atr', close_p * 0.01))
    atr_pct = (atr_val / close_p) * 100.0

    bb_ub = float(latest.get('bollinger_ub', close_p * 1.02))
    bb_lb = float(latest.get('bollinger_lb', close_p * 0.98))
    bb_width = (bb_ub - bb_lb) / close_p * 100.0

    # Determine regime
    if close_p > bb_ub or close_p < bb_lb:
        regime = "BREAKOUT"
    elif adx_val >= 25.0:
        if ema_20 > ema_50 and close_p > ema_20:
            regime = "TRENDING_BULL"
        elif ema_20 < ema_50 and close_p < ema_20:
            regime = "TRENDING_BEAR"
        else:
            regime = "PULLBACK"
    elif bb_width > 4.0 or atr_pct > 2.0:
        regime = "HIGH_VOLATILITY"
    elif bb_width < 1.5:
        regime = "LOW_VOLATILITY"
    else:
        regime = "SIDEWAYS_RANGE"

    volatility = "High" if atr_pct > 2.0 or bb_width > 3.5 else ("Low" if atr_pct < 0.8 or bb_width < 1.5 else "Moderate")
    bias = "Bullish" if close_p > ema_50 else ("Bearish" if close_p < ema_50 else "Neutral")

    return {
        "regime": regime,
        "volatility": volatility,
        "bias": bias,
        "adx": round(adx_val, 1),
        "atr_pct": round(atr_pct, 2),
        "bb_width": round(bb_width, 2)
    }


def evaluate_profile_confluence(df: pd.DataFrame, profile_config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Evaluates dynamic weighted indicator confluence scoring based on DB indicator configurations or active profile.
    Zero lookahead bias: evaluates strictly on completed candle df.iloc[-1].
    """
    if df.empty or len(df) < 50:
        return {"decision": "HOLD", "bull_score": 0.0, "bear_score": 0.0, "confluence_pct": 0.0, "indicators": {}}

    # Compute indicator series
    df = calculate_emas(df)
    df = calculate_macd(df)
    df = calculate_rsi(df)
    df = calculate_sma(df)
    df = calculate_bollinger_bands(df)
    df = calculate_adx(df)
    df = calculate_momentum(df)
    df = calculate_vwap(df)
    df = calculate_supertrend(df)
    df = calculate_stoch_rsi(df)
    df = calculate_stochastic(df)
    df = calculate_cci(df)
    df = calculate_roc(df)
    df = calculate_williams_r(df)
    df = calculate_keltner_channels(df)
    df = calculate_donchian_channels(df)
    df = calculate_std_dev(df)
    df = calculate_obv(df)
    df = calculate_mfi(df)
    df = calculate_cmf(df)
    df = calculate_pivot_points(df)
    df = calculate_support_resistance(df)
    df = calculate_breakout_levels(df)
    df = calculate_parabolic_sar(df)
    df = calculate_anchored_vwap(df)
    df = detect_rsi_divergence(df)

    latest = df.iloc[-1]
    
    # Load configuration
    cfg = {}
    if profile_config and isinstance(profile_config, dict):
        if "config" in profile_config and isinstance(profile_config["config"], dict):
            cfg = profile_config["config"]
        else:
            cfg = profile_config

    if not cfg:
        try:
            from src import db
            db_configs = db.get_all_indicator_configs()
            cfg = {c["indicator_id"]: c for c in db_configs}
        except Exception:
            cfg = INDICATOR_REGISTRY

    regime_info = detect_market_regime(df)
    regime = regime_info["regime"]
    volatility = regime_info["volatility"]

    total_weight = 0.0
    bull_weighted = 0.0
    bear_weighted = 0.0
    eval_indicators = {}

    for ind_key, ind_cfg in cfg.items():
        if not isinstance(ind_cfg, dict) or not ind_cfg.get("enabled", True):
            continue

        w = float(ind_cfg.get("weight", 15.0))
        long_enabled = ind_cfg.get("long_enabled", True)
        short_enabled = ind_cfg.get("short_enabled", True)

        # Apply regime-aware dynamic weight adjustment
        if regime in ["TRENDING_BULL", "TRENDING_BEAR"]:
            if ind_key in ["ema_9", "ema_20", "ema_50", "ema_200", "ema", "macd", "adx", "vwap", "supertrend", "parabolic_sar", "anchored_vwap"]:
                w *= 1.25
            elif ind_key in ["rsi", "stoch_rsi", "stochastic", "cci", "williams_r"]:
                w *= 0.75
        elif regime in ["SIDEWAYS_RANGE", "LOW_VOLATILITY"]:
            if ind_key in ["bollinger", "volume_profile", "support_resistance", "pivot", "rsi_divergence", "stoch_rsi", "stochastic"]:
                w *= 1.25
            elif ind_key in ["ema_9", "ema_20", "macd"]:
                w *= 0.75

        bias = 0  # +1 Bull, -1 Bear, 0 Neutral
        reason = "Neutral"

        # Match indicator ID
        if ind_key in ["ema_9", "ema_20", "ema_50", "ema_200", "ema"]:
            length = int(ind_cfg.get("parameters", {}).get("length", 20 if ind_key == "ema_20" else (9 if ind_key == "ema_9" else (50 if ind_key == "ema_50" else 200))))
            ema_col = f"ema_{length}"
            val = float(latest.get(ema_col, latest.get('ema_20', latest['close'])))
            if latest['close'] > val:
                bias = 1
                reason = f"Price > {ema_col.upper()} ({val:.2f})"
            elif latest['close'] < val:
                bias = -1
                reason = f"Price < {ema_col.upper()} ({val:.2f})"

        elif ind_key == "sma":
            val = float(latest.get('sma_20', latest['close']))
            if latest['close'] > val:
                bias = 1
                reason = f"Price > SMA 20 ({val:.2f})"
            elif latest['close'] < val:
                bias = -1
                reason = f"Price < SMA 20 ({val:.2f})"

        elif ind_key == "rsi":
            r_val = float(latest.get('rsi', 50.0))
            params = ind_cfg.get("parameters") or ind_cfg
            os_lvl = float(params.get('oversold', 30.0))
            ob_lvl = float(params.get('overbought', 70.0))
            if r_val <= os_lvl:
                bias = 1
                reason = f"RSI({r_val:.1f}) <= Oversold({os_lvl})"
            elif r_val >= ob_lvl:
                bias = -1
                reason = f"RSI({r_val:.1f}) >= Overbought({ob_lvl})"
            elif r_val > 55:
                bias = 1
                reason = f"RSI({r_val:.1f}) > 55 Bullish"
            elif r_val < 45:
                bias = -1
                reason = f"RSI({r_val:.1f}) < 45 Bearish"

        elif ind_key == "macd":
            hist = float(latest.get('macd_hist', 0.0))
            line = float(latest.get('macd_line', 0.0))
            sig = float(latest.get('macd_signal', 0.0))
            if hist > 0 and line > sig:
                bias = 1
                reason = "MACD Hist > 0 & Line > Signal"
            elif hist < 0 and line < sig:
                bias = -1
                reason = "MACD Hist < 0 & Line < Signal"

        elif ind_key == "adx":
            adx_val = float(latest.get('adx', 20.0))
            pdi = float(latest.get('pos_di', 20.0))
            ndi = float(latest.get('neg_di', 20.0))
            params = ind_cfg.get("parameters") or ind_cfg
            thresh = float(params.get('threshold', 25.0))
            if adx_val >= thresh and pdi > ndi:
                bias = 1
                reason = f"ADX({adx_val:.1f}) >= {thresh} & +DI > -DI"
            elif adx_val >= thresh and ndi > pdi:
                bias = -1
                reason = f"ADX({adx_val:.1f}) >= {thresh} & -DI > +DI"

        elif ind_key == "supertrend":
            st_dir = float(latest.get('supertrend_dir', 1))
            if st_dir == 1:
                bias = 1
                reason = "Supertrend Bullish"
            elif st_dir == -1:
                bias = -1
                reason = "Supertrend Bearish"

        elif ind_key == "vwap":
            vwap_val = float(latest.get('vwap', latest['close']))
            if latest['close'] > vwap_val:
                bias = 1
                reason = "Price > VWAP"
            elif latest['close'] < vwap_val:
                bias = -1
                reason = "Price < VWAP"

        elif ind_key == "bollinger":
            ub = float(latest.get('bollinger_ub', latest['close']))
            lb = float(latest.get('bollinger_lb', latest['close']))
            if latest['close'] <= lb:
                bias = 1
                reason = "Price <= Lower Bollinger Band"
            elif latest['close'] >= ub:
                bias = -1
                reason = "Price >= Upper Bollinger Band"

        elif ind_key in ["volume", "volume_profile"]:
            vol = float(latest.get('volume', 100.0))
            vol_sma = float(df['volume'].rolling(20).mean().iloc[-1] if len(df) >= 20 else vol)
            if vol > vol_sma * 1.2:
                bias = 1 if latest['close'] > df['open'].iloc[-1] else -1
                reason = "Volume > 1.2x 20-period Volume SMA"

        elif ind_key == "parabolic_sar":
            psar_dir = int(latest.get('psar_dir', 1))
            if psar_dir == 1:
                bias = 1
                reason = "Parabolic SAR Bullish"
            elif psar_dir == -1:
                bias = -1
                reason = "Parabolic SAR Bearish"

        elif ind_key == "anchored_vwap":
            avwap_val = float(latest.get('anchored_vwap', latest['close']))
            if latest['close'] > avwap_val:
                bias = 1
                reason = "Price > Anchored VWAP"
            elif latest['close'] < avwap_val:
                bias = -1
                reason = "Price < Anchored VWAP"

        elif ind_key == "rsi_divergence":
            div_val = str(latest.get('rsi_divergence', 'None'))
            if div_val == "Bullish Divergence":
                bias = 1
                reason = "RSI Bullish Divergence"
            elif div_val == "Bearish Divergence":
                bias = -1
                reason = "RSI Bearish Divergence"

        elif ind_key == "stoch_rsi":
            k_val = float(latest.get('stoch_rsi_k', 50.0))
            d_val = float(latest.get('stoch_rsi_d', 50.0))
            if k_val < 20 and k_val > d_val:
                bias = 1
                reason = "Stoch RSI Oversold Cross Up"
            elif k_val > 80 and k_val < d_val:
                bias = -1
                reason = "Stoch RSI Overbought Cross Down"

        elif ind_key == "stochastic":
            k_val = float(latest.get('stoch_k', 50.0))
            d_val = float(latest.get('stoch_d', 50.0))
            if k_val < 20:
                bias = 1
                reason = "Stochastic Oversold"
            elif k_val > 80:
                bias = -1
                reason = "Stochastic Overbought"

        elif ind_key == "mfi":
            mfi_val = float(latest.get('mfi', 50.0))
            if mfi_val <= 20:
                bias = 1
                reason = "MFI Oversold <= 20"
            elif mfi_val >= 80:
                bias = -1
                reason = "MFI Overbought >= 80"

        elif ind_key == "cmf":
            cmf_val = float(latest.get('cmf', 0.0))
            if cmf_val > 0.05:
                bias = 1
                reason = "CMF Inflow > +0.05"
            elif cmf_val < -0.05:
                bias = -1
                reason = "CMF Outflow < -0.05"

        elif ind_key == "pivot":
            p = float(latest.get('pivot_point', latest['close']))
            if latest['close'] > p:
                bias = 1
                reason = "Price > Pivot Point"
            elif latest['close'] < p:
                bias = -1
                reason = "Price < Pivot Point"

        elif ind_key == "support_resistance":
            sup = float(latest.get('support_level', latest['close'] * 0.98))
            res = float(latest.get('resistance_level', latest['close'] * 1.02))
            if abs(latest['close'] - sup) / latest['close'] < 0.005:
                bias = 1
                reason = "Price near Support level"
            elif abs(latest['close'] - res) / latest['close'] < 0.005:
                bias = -1
                reason = "Price near Resistance level"

        elif ind_key == "breakout_levels":
            bh = float(latest.get('breakout_high', latest['close'] * 1.01))
            bl = float(latest.get('breakout_low', latest['close'] * 0.99))
            if latest['close'] > bh:
                bias = 1
                reason = "High Breakout Triggered"
            elif latest['close'] < bl:
                bias = -1
                reason = "Low Breakout Triggered"

        # Apply Long/Short direction flags
        if bias == 1 and not long_enabled:
            bias = 0
            reason += " (Long Disabled)"
        elif bias == -1 and not short_enabled:
            bias = 0
            reason += " (Short Disabled)"

        if bias == 1:
            bull_weighted += w
            total_weight += w
        elif bias == -1:
            bear_weighted += w
            total_weight += w
        else:
            total_weight += w

        eval_indicators[ind_key] = {
            "bias": bias,
            "bias_label": "BULLISH" if bias == 1 else ("BEARISH" if bias == -1 else "NEUTRAL"),
            "weight": w,
            "reason": reason
        }

    total_w = max(total_weight, 1.0)
    bull_score = round((bull_weighted / total_w) * 100.0, 1)
    bear_score = round((bear_weighted / total_w) * 100.0, 1)

    default_thresh = 78.0 if volatility == "High" else 75.0
    thresh_long = float(profile_config.get("signal_threshold_long", default_thresh)) if profile_config else default_thresh
    thresh_short = float(profile_config.get("signal_threshold_short", default_thresh)) if profile_config else default_thresh

    if bull_score >= thresh_long:
        decision = "LONG"
    elif bear_score >= thresh_short:
        decision = "SHORT"
    else:
        decision = "HOLD"

    regime_info = detect_market_regime(df)

    return {
        "decision": decision,
        "bull_score": bull_score,
        "bear_score": bear_score,
        "confluence_pct": bull_score if decision == "LONG" else (bear_score if decision == "SHORT" else max(bull_score, bear_score)),
        "threshold_long": thresh_long,
        "threshold_short": thresh_short,
        "regime": regime_info["regime"],
        "volatility": regime_info["volatility"],
        "bias": regime_info["bias"],
        "indicators": eval_indicators
    }


_indicator_cache: Dict[Any, pd.DataFrame] = {}
_indicator_cache_lock = threading.Lock()


def clear_indicator_cache():
    """Clears the in-memory indicator cache."""
    with _indicator_cache_lock:
        _indicator_cache.clear()


def generate_indicators(df: pd.DataFrame, timeframe: Optional[str] = None, use_cache: bool = True) -> pd.DataFrame:
    """
    Computes EMAs, MACD, Volume Profile, ADX, Bollinger Bands, RSI, SMA, Momentum, Fibs, Pivots, Key Levels, and Patterns
    with thread-safe memoization to eliminate duplicate recomputations across concurrent bots.
    """
    if df.empty:
        return df

    cache_key = None
    if use_cache and len(df) > 0 and 'timestamp' in df.columns:
        try:
            last_ts = df['timestamp'].iloc[-1]
            last_close = df['close'].iloc[-1]
            cache_key = (
                str(timeframe or config.TIMEFRAME),
                int(last_ts) if not pd.isna(last_ts) else 0,
                round(float(last_close), 4) if not pd.isna(last_close) else 0.0,
                len(df)
            )
            with _indicator_cache_lock:
                cached = _indicator_cache.get(cache_key)
                if cached is not None:
                    return cached.copy()
        except Exception:
            cache_key = None

    df = calculate_emas(df)
    df = calculate_macd(df)
    df = calculate_rsi(df, length=14)
    df = calculate_sma(df, length=20)
    df = calculate_bollinger_bands(df, length=20, std_dev=2.0)
    df = calculate_adx(df, length=14)
    df = calculate_momentum(df, length=10)
    df = calculate_auto_fib(df, lookback=50)
    df = calculate_pivot_points(df)
    df = calculate_auto_key_levels(df, lookback=100)
    df = calculate_rsi_momentum_trend(df)
    df = detect_chart_patterns(df)
    df = calculate_parabolic_sar(df)
    df = calculate_anchored_vwap(df)
    df = detect_rsi_divergence(df)
    df = calculate_volume_profile(df, timeframe=timeframe)

    if cache_key is not None:
        with _indicator_cache_lock:
            if len(_indicator_cache) > 200:
                _indicator_cache.clear()
            _indicator_cache[cache_key] = df

    if config.PRINT_INDICATORS:
        latest = df.iloc[-1]
        logger.info(
            "Indicators computed | close=%.2f ema_9=%.2f ema_20=%.2f ema_50=%.2f ema_200=%.2f macd=%.4f poc=%s val=%s vah=%s",
            float(latest['close']),
            float(latest['ema_9']),
            float(latest['ema_20']),
            float(latest['ema_50']),
            float(latest['ema_200']),
            float(latest['macd_line']),
            latest['poc'],
            latest['val'],
            latest['vah'],
        )
    return df
