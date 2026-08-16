"""
Universal Indicator Configuration Schema & Master Definitions
=============================================================
Provides a unified, TradingView-style generic configuration schema for all indicators.
Supports Trend, Momentum, Volatility, Volume, and Price/Structure categories with
field types, validation rules, signal rules, display defaults, and presets.
"""

from typing import Dict, Any, List, Optional, Tuple
import copy
import json

SUPPORTED_PRICE_SOURCES = [
    {"value": "close", "label": "Close Price"},
    {"value": "open", "label": "Open Price"},
    {"value": "high", "label": "High Price"},
    {"value": "low", "label": "Low Price"},
    {"value": "hl2", "label": "HL2 (High + Low) / 2"},
    {"value": "hlc3", "label": "HLC3 (High + Low + Close) / 3"},
    {"value": "ohlc4", "label": "OHLC4 (Open + High + Low + Close) / 4"}
]

SUPPORTED_TIMEFRAMES = [
    {"value": "chart", "label": "Same as Chart"},
    {"value": "1m", "label": "1 Minute (1m)"},
    {"value": "3m", "label": "3 Minutes (3m)"},
    {"value": "5m", "label": "5 Minutes (5m)"},
    {"value": "15m", "label": "15 Minutes (15m)"},
    {"value": "30m", "label": "30 Minutes (30m)"},
    {"value": "1h", "label": "1 Hour (1h)"},
    {"value": "2h", "label": "2 Hours (2h)"},
    {"value": "4h", "label": "4 Hours (4h)"},
    {"value": "1d", "label": "1 Day (1d)"},
    {"value": "1w", "label": "1 Week (1w)"}
]

SUPPORTED_SIGNAL_MODES = [
    {"value": "both", "label": "Both Long & Short Signals"},
    {"value": "crossover", "label": "Crossover Trigger Only"},
    {"value": "threshold", "label": "Level Threshold Breach"},
    {"value": "reversal", "label": "Reversal / Divergence Detection"},
    {"value": "regime", "label": "Market Regime / Direction Filter"}
]

# Master Registry with Full Universal Parameter Schema
UNIVERSAL_INDICATOR_SCHEMAS: Dict[str, Dict[str, Any]] = {
    # =========================================================================
    # 1. TREND INDICATORS
    # =========================================================================
    "ema_9": {
        "indicator_id": "ema_9",
        "name": "EMA 9 (Fast Exponential Moving Average)",
        "category": "Trend",
        "version": "1.0.0",
        "description": "Short-term momentum EMA for fast pullbacks and aggressive trend triggers.",
        "default_timeframe": "15m",
        "default_weight": 15.0,
        "default_parameters": {"length": 9, "source": "close", "offset": 0},
        "default_display": {"color": "#00e676", "line_width": 2, "line_style": "solid", "panel": "overlay", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "crossover", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "length", "label": "Length (Bars)", "type": "integer", "default": 9, "minimum": 1, "maximum": 500, "step": 1, "tab": "inputs", "description": "Period length of EMA."},
            {"name": "source", "label": "Price Source", "type": "select", "default": "close", "options": SUPPORTED_PRICE_SOURCES, "tab": "inputs", "description": "Price source used for calculation."},
            {"name": "offset", "label": "Offset (Bars)", "type": "integer", "default": 0, "minimum": -50, "maximum": 50, "step": 1, "tab": "inputs", "description": "Horizontal bar shift."}
        ],
        "validation_rules": {"length": {"min": 1, "max": 500}}
    },
    "ema_20": {
        "indicator_id": "ema_20",
        "name": "EMA 20 (Short-Term Trend EMA)",
        "category": "Trend",
        "version": "1.0.0",
        "description": "Standard 20-period exponential moving average for pullback entries.",
        "default_timeframe": "15m",
        "default_weight": 20.0,
        "default_parameters": {"length": 20, "source": "close", "offset": 0},
        "default_display": {"color": "#29b6f6", "line_width": 2, "line_style": "solid", "panel": "overlay", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "crossover", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "length", "label": "Length (Bars)", "type": "integer", "default": 20, "minimum": 1, "maximum": 500, "step": 1, "tab": "inputs", "description": "Period length of EMA."},
            {"name": "source", "label": "Price Source", "type": "select", "default": "close", "options": SUPPORTED_PRICE_SOURCES, "tab": "inputs", "description": "Price source."},
            {"name": "offset", "label": "Offset", "type": "integer", "default": 0, "minimum": -50, "maximum": 50, "step": 1, "tab": "inputs", "description": "Bar offset."}
        ],
        "validation_rules": {"length": {"min": 1, "max": 500}}
    },
    "ema_50": {
        "indicator_id": "ema_50",
        "name": "EMA 50 (Medium-Term Trend EMA)",
        "category": "Trend",
        "version": "1.0.0",
        "description": "Intermediate trend filter to establish structural bullish/bearish bias.",
        "default_timeframe": "15m",
        "default_weight": 15.0,
        "default_parameters": {"length": 50, "source": "close", "offset": 0},
        "default_display": {"color": "#ab47bc", "line_width": 2, "line_style": "solid", "panel": "overlay", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "crossover", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "length", "label": "Length (Bars)", "type": "integer", "default": 50, "minimum": 1, "maximum": 500, "step": 1, "tab": "inputs", "description": "Period length of EMA."},
            {"name": "source", "label": "Price Source", "type": "select", "default": "close", "options": SUPPORTED_PRICE_SOURCES, "tab": "inputs", "description": "Price source."}
        ],
        "validation_rules": {"length": {"min": 1, "max": 500}}
    },
    "ema_200": {
        "indicator_id": "ema_200",
        "name": "EMA 200 (Long-Term Macro Trend)",
        "category": "Trend",
        "version": "1.0.0",
        "description": "Macro bull/bear dividing line. Price above EMA 200 favors longs, below favors shorts.",
        "default_timeframe": "15m",
        "default_weight": 20.0,
        "default_parameters": {"length": 200, "source": "close", "offset": 0},
        "default_display": {"color": "#ff7043", "line_width": 3, "line_style": "solid", "panel": "overlay", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "crossover", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "length", "label": "Length (Bars)", "type": "integer", "default": 200, "minimum": 1, "maximum": 1000, "step": 1, "tab": "inputs", "description": "Period length of EMA."},
            {"name": "source", "label": "Price Source", "type": "select", "default": "close", "options": SUPPORTED_PRICE_SOURCES, "tab": "inputs", "description": "Price source."}
        ],
        "validation_rules": {"length": {"min": 1, "max": 1000}}
    },
    "sma": {
        "indicator_id": "sma",
        "name": "SMA (Simple Moving Average)",
        "category": "Trend",
        "version": "1.0.0",
        "description": "Standard arithmetic moving average across N past bars.",
        "default_timeframe": "15m",
        "default_weight": 15.0,
        "default_parameters": {"length": 20, "source": "close", "offset": 0},
        "default_display": {"color": "#ffd54f", "line_width": 2, "line_style": "solid", "panel": "overlay", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "crossover", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "length", "label": "Length (Bars)", "type": "integer", "default": 20, "minimum": 1, "maximum": 500, "step": 1, "tab": "inputs", "description": "Period length of SMA."},
            {"name": "source", "label": "Price Source", "type": "select", "default": "close", "options": SUPPORTED_PRICE_SOURCES, "tab": "inputs", "description": "Price source."}
        ],
        "validation_rules": {"length": {"min": 1, "max": 500}}
    },
    "hma": {
        "indicator_id": "hma",
        "name": "HMA (Hull Moving Average)",
        "category": "Trend",
        "version": "1.0.0",
        "description": "Extremely responsive moving average with virtually eliminated lag.",
        "default_timeframe": "15m",
        "default_weight": 15.0,
        "default_parameters": {"length": 20, "source": "close"},
        "default_display": {"color": "#26a69a", "line_width": 2, "line_style": "solid", "panel": "overlay", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "crossover", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "length", "label": "Length (Bars)", "type": "integer", "default": 20, "minimum": 2, "maximum": 200, "step": 1, "tab": "inputs", "description": "HMA Period."}
        ],
        "validation_rules": {"length": {"min": 2, "max": 200}}
    },
    "vwap": {
        "indicator_id": "vwap",
        "name": "VWAP (Volume Weighted Average Price)",
        "category": "Trend",
        "version": "1.0.0",
        "description": "Benchmark price reflecting true intraday volume weighting.",
        "default_timeframe": "15m",
        "default_weight": 20.0,
        "default_parameters": {"mode": "session", "band_mult": 1.0},
        "default_display": {"color": "#ffca28", "line_width": 2, "line_style": "solid", "panel": "overlay", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "threshold", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "mode", "label": "Anchor Session", "type": "select", "default": "session", "options": [{"value": "session", "label": "Daily Session"}, {"value": "week", "label": "Weekly"}, {"value": "month", "label": "Monthly"}], "tab": "inputs", "description": "Session reset anchor."},
            {"name": "band_mult", "label": "Standard Deviation Band", "type": "decimal", "default": 1.0, "minimum": 0.1, "maximum": 5.0, "step": 0.1, "tab": "inputs", "description": "Multiplier for VWAP standard deviation bands."}
        ],
        "validation_rules": {"band_mult": {"min": 0.1, "max": 5.0}}
    },
    "supertrend": {
        "indicator_id": "supertrend",
        "name": "Supertrend",
        "category": "Trend",
        "version": "1.0.0",
        "description": "ATR-based dynamic trailing support and resistance line.",
        "default_timeframe": "15m",
        "default_weight": 20.0,
        "default_parameters": {"period": 10, "multiplier": 3.0, "source": "hl2"},
        "default_display": {"color": "#00c076", "line_width": 2, "line_style": "solid", "panel": "overlay", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "both", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "period", "label": "ATR Period", "type": "integer", "default": 10, "minimum": 1, "maximum": 100, "step": 1, "tab": "inputs", "description": "ATR period used for band calculation."},
            {"name": "multiplier", "label": "ATR Multiplier", "type": "decimal", "default": 3.0, "minimum": 0.5, "maximum": 10.0, "step": 0.1, "tab": "inputs", "description": "Multiplier for ATR distance from price."}
        ],
        "validation_rules": {"period": {"min": 1, "max": 100}, "multiplier": {"min": 0.5, "max": 10.0}}
    },
    "parabolic_sar": {
        "indicator_id": "parabolic_sar",
        "name": "Parabolic SAR (Stop and Reverse)",
        "category": "Trend",
        "version": "1.0.0",
        "description": "Trailing stop dots establishing trend direction and acceleration.",
        "default_timeframe": "15m",
        "default_weight": 10.0,
        "default_parameters": {"af_step": 0.02, "af_max": 0.2},
        "default_display": {"color": "#e040fb", "line_width": 2, "line_style": "solid", "panel": "overlay", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "both", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "af_step", "label": "Acceleration Step (AF)", "type": "decimal", "default": 0.02, "minimum": 0.001, "maximum": 0.1, "step": 0.005, "tab": "inputs", "description": "Acceleration factor increment."},
            {"name": "af_max", "label": "Max Acceleration (Max AF)", "type": "decimal", "default": 0.2, "minimum": 0.05, "maximum": 0.5, "step": 0.05, "tab": "inputs", "description": "Upper cap on acceleration factor."}
        ],
        "validation_rules": {"af_step": {"min": 0.001, "max": 0.1}, "af_max": {"min": 0.05, "max": 0.5}}
    },
    "adx": {
        "indicator_id": "adx",
        "name": "ADX (Average Directional Index)",
        "category": "Trend",
        "version": "1.0.0",
        "description": "Quantifies trend strength regardless of bullish or bearish direction.",
        "default_timeframe": "15m",
        "default_weight": 15.0,
        "default_parameters": {"period": 14, "trend_threshold": 25.0},
        "default_display": {"color": "#ff9800", "line_width": 2, "line_style": "solid", "panel": "separate", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "threshold", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "period", "label": "ADX Period", "type": "integer", "default": 14, "minimum": 2, "maximum": 100, "step": 1, "tab": "inputs", "description": "Smoothing period for ADX & DI lines."},
            {"name": "trend_threshold", "label": "Trend Strength Threshold", "type": "decimal", "default": 25.0, "minimum": 10.0, "maximum": 60.0, "step": 1.0, "tab": "inputs", "description": "Threshold above which market is considered trending."}
        ],
        "validation_rules": {"period": {"min": 2, "max": 100}, "trend_threshold": {"min": 10.0, "max": 60.0}}
    },
    "volume_profile": {
        "indicator_id": "volume_profile",
        "name": "Volume Profile (VPVR / POC / Value Area)",
        "category": "Trend",
        "version": "1.0.0",
        "description": "Identifies Point of Control (POC), Value Area High (VAH), and Value Area Low (VAL).",
        "default_timeframe": "1h",
        "default_weight": 20.0,
        "default_parameters": {"lookback_days": 14, "bin_size": 50.0, "value_area_pct": 70.0},
        "default_display": {"color": "#00e5ff", "line_width": 2, "line_style": "solid", "panel": "overlay", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "both", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "lookback_days", "label": "Lookback Period (Days)", "type": "integer", "default": 14, "minimum": 1, "maximum": 90, "step": 1, "tab": "inputs", "description": "Number of days of volume distribution."},
            {"name": "value_area_pct", "label": "Value Area (%)", "type": "decimal", "default": 70.0, "minimum": 50.0, "maximum": 90.0, "step": 1.0, "tab": "inputs", "description": "Percentage of total volume comprising the Value Area."}
        ],
        "validation_rules": {"lookback_days": {"min": 1, "max": 90}, "value_area_pct": {"min": 50.0, "max": 90.0}}
    },

    # =========================================================================
    # 2. MOMENTUM INDICATORS
    # =========================================================================
    "rsi": {
        "indicator_id": "rsi",
        "name": "RSI (Relative Strength Index)",
        "category": "Momentum",
        "version": "1.0.0",
        "description": "Measures speed and magnitude of recent price changes to evaluate overbought or oversold conditions.",
        "default_timeframe": "15m",
        "default_weight": 20.0,
        "default_parameters": {"period": 14, "source": "close", "oversold": 30.0, "overbought": 70.0, "midline": 50.0},
        "default_display": {"color": "#7e57c2", "line_width": 2, "line_style": "solid", "panel": "separate", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "threshold", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "period", "label": "RSI Period", "type": "integer", "default": 14, "minimum": 2, "maximum": 100, "step": 1, "tab": "inputs", "description": "Lookback length for RSI calculation."},
            {"name": "source", "label": "Price Source", "type": "select", "default": "close", "options": SUPPORTED_PRICE_SOURCES, "tab": "inputs", "description": "Price source."},
            {"name": "overbought", "label": "Overbought Threshold", "type": "decimal", "default": 70.0, "minimum": 50.0, "maximum": 95.0, "step": 1.0, "tab": "inputs", "description": "Level above which asset is overbought."},
            {"name": "oversold", "label": "Oversold Threshold", "type": "decimal", "default": 30.0, "minimum": 5.0, "maximum": 50.0, "step": 1.0, "tab": "inputs", "description": "Level below which asset is oversold."},
            {"name": "midline", "label": "Midline Level", "type": "decimal", "default": 50.0, "minimum": 40.0, "maximum": 60.0, "step": 1.0, "tab": "inputs", "description": "Bull/bear neutral equilibrium line."}
        ],
        "validation_rules": {"period": {"min": 2, "max": 100}, "comparison": {"field1": "oversold", "operator": "<", "field2": "overbought", "message": "RSI oversold must be strictly less than overbought."}}
    },
    "macd": {
        "indicator_id": "macd",
        "name": "MACD (Moving Average Convergence Divergence)",
        "category": "Momentum",
        "version": "1.0.0",
        "description": "Trend-following momentum indicator displaying the relationship between two exponential moving averages.",
        "default_timeframe": "15m",
        "default_weight": 20.0,
        "default_parameters": {"fast": 12, "slow": 26, "signal": 9, "source": "close"},
        "default_display": {"color": "#29b6f6", "line_width": 2, "line_style": "solid", "panel": "separate", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "both", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "fast", "label": "Fast Period", "type": "integer", "default": 12, "minimum": 2, "maximum": 100, "step": 1, "tab": "inputs", "description": "Fast EMA period."},
            {"name": "slow", "label": "Slow Period", "type": "integer", "default": 26, "minimum": 3, "maximum": 200, "step": 1, "tab": "inputs", "description": "Slow EMA period."},
            {"name": "signal", "label": "Signal Smoothing", "type": "integer", "default": 9, "minimum": 2, "maximum": 50, "step": 1, "tab": "inputs", "description": "Signal line period."},
            {"name": "source", "label": "Price Source", "type": "select", "default": "close", "options": SUPPORTED_PRICE_SOURCES, "tab": "inputs", "description": "Price source."}
        ],
        "validation_rules": {"comparison": {"field1": "fast", "operator": "<", "field2": "slow", "message": "MACD Fast Period must be strictly less than Slow Period."}}
    },
    "stoch_rsi": {
        "indicator_id": "stoch_rsi",
        "name": "Stochastic RSI",
        "category": "Momentum",
        "version": "1.0.0",
        "description": "Applies the Stochastic formula to RSI values rather than price, giving ultra-sensitive momentum cycles.",
        "default_timeframe": "15m",
        "default_weight": 15.0,
        "default_parameters": {"period": 14, "rsi_period": 14, "k": 3, "d": 3, "oversold": 20.0, "overbought": 80.0},
        "default_display": {"color": "#00bcd4", "line_width": 2, "line_style": "solid", "panel": "separate", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "threshold", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "period", "label": "Stochastic Length", "type": "integer", "default": 14, "minimum": 2, "maximum": 100, "step": 1, "tab": "inputs", "description": "Lookback bars for Stochastic."},
            {"name": "rsi_period", "label": "RSI Length", "type": "integer", "default": 14, "minimum": 2, "maximum": 100, "step": 1, "tab": "inputs", "description": "RSI period."},
            {"name": "k", "label": "%K Smoothing", "type": "integer", "default": 3, "minimum": 1, "maximum": 20, "step": 1, "tab": "inputs", "description": "%K smoothing factor."},
            {"name": "d", "label": "%D Smoothing", "type": "integer", "default": 3, "minimum": 1, "maximum": 20, "step": 1, "tab": "inputs", "description": "%D smoothing factor."},
            {"name": "overbought", "label": "Overbought", "type": "decimal", "default": 80.0, "minimum": 60.0, "maximum": 95.0, "step": 1.0, "tab": "inputs", "description": "Overbought boundary."},
            {"name": "oversold", "label": "Oversold", "type": "decimal", "default": 20.0, "minimum": 5.0, "maximum": 40.0, "step": 1.0, "tab": "inputs", "description": "Oversold boundary."}
        ],
        "validation_rules": {"comparison": {"field1": "oversold", "operator": "<", "field2": "overbought", "message": "Stochastic RSI oversold must be less than overbought."}}
    },
    "stochastic": {
        "indicator_id": "stochastic",
        "name": "Stochastic Oscillator",
        "category": "Momentum",
        "version": "1.0.0",
        "description": "Compares closing price to price range over given time period.",
        "default_timeframe": "15m",
        "default_weight": 15.0,
        "default_parameters": {"k_period": 14, "d_period": 3, "smooth": 3, "oversold": 20.0, "overbought": 80.0},
        "default_display": {"color": "#ab47bc", "line_width": 2, "line_style": "solid", "panel": "separate", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "threshold", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "k_period", "label": "%K Period", "type": "integer", "default": 14, "minimum": 2, "maximum": 100, "step": 1, "tab": "inputs", "description": "%K lookback."},
            {"name": "d_period", "label": "%D Period", "type": "integer", "default": 3, "minimum": 1, "maximum": 50, "step": 1, "tab": "inputs", "description": "%D moving average period."},
            {"name": "overbought", "label": "Overbought", "type": "decimal", "default": 80.0, "minimum": 60.0, "maximum": 95.0, "step": 1.0, "tab": "inputs", "description": "Overbought level."},
            {"name": "oversold", "label": "Oversold", "type": "decimal", "default": 20.0, "minimum": 5.0, "maximum": 40.0, "step": 1.0, "tab": "inputs", "description": "Oversold level."}
        ],
        "validation_rules": {"comparison": {"field1": "oversold", "operator": "<", "field2": "overbought", "message": "Stochastic oversold must be less than overbought."}}
    },
    "cci": {
        "indicator_id": "cci",
        "name": "CCI (Commodity Channel Index)",
        "category": "Momentum",
        "version": "1.0.0",
        "description": "Measures variation from statistical mean to identify cyclical peaks and troughs.",
        "default_timeframe": "15m",
        "default_weight": 10.0,
        "default_parameters": {"period": 20, "overbought": 100.0, "oversold": -100.0},
        "default_display": {"color": "#ffa726", "line_width": 2, "line_style": "solid", "panel": "separate", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "threshold", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "period", "label": "CCI Period", "type": "integer", "default": 20, "minimum": 2, "maximum": 100, "step": 1, "tab": "inputs", "description": "Lookback bars."},
            {"name": "overbought", "label": "Overbought Level (+100)", "type": "decimal", "default": 100.0, "minimum": 50.0, "maximum": 300.0, "step": 10.0, "tab": "inputs", "description": "Overbought threshold."},
            {"name": "oversold", "label": "Oversold Level (-100)", "type": "decimal", "default": -100.0, "minimum": -300.0, "maximum": -50.0, "step": 10.0, "tab": "inputs", "description": "Oversold threshold."}
        ],
        "validation_rules": {"period": {"min": 2, "max": 100}}
    },
    "williams_r": {
        "indicator_id": "williams_r",
        "name": "Williams %R",
        "category": "Momentum",
        "version": "1.0.0",
        "description": "Momentum indicator measuring overbought and oversold levels from 0 to -100.",
        "default_timeframe": "15m",
        "default_weight": 10.0,
        "default_parameters": {"period": 14, "overbought": -20.0, "oversold": -80.0},
        "default_display": {"color": "#ec407a", "line_width": 2, "line_style": "solid", "panel": "separate", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "threshold", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "period", "label": "Period", "type": "integer", "default": 14, "minimum": 2, "maximum": 100, "step": 1, "tab": "inputs", "description": "Lookback period."}
        ],
        "validation_rules": {"period": {"min": 2, "max": 100}}
    },
    "roc": {
        "indicator_id": "roc",
        "name": "ROC (Rate of Change)",
        "category": "Momentum",
        "version": "1.0.0",
        "description": "Measures percentage change in price from one period to the next.",
        "default_timeframe": "15m",
        "default_weight": 10.0,
        "default_parameters": {"period": 12, "source": "close"},
        "default_display": {"color": "#26c6da", "line_width": 2, "line_style": "solid", "panel": "separate", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "threshold", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "period", "label": "Period (Bars)", "type": "integer", "default": 12, "minimum": 1, "maximum": 100, "step": 1, "tab": "inputs", "description": "Lookback period."}
        ],
        "validation_rules": {"period": {"min": 1, "max": 100}}
    },
    "momentum": {
        "indicator_id": "momentum",
        "name": "Momentum",
        "category": "Momentum",
        "version": "1.0.0",
        "description": "Measures difference between current close and close N bars ago.",
        "default_timeframe": "15m",
        "default_weight": 10.0,
        "default_parameters": {"period": 10, "source": "close"},
        "default_display": {"color": "#42a5f5", "line_width": 2, "line_style": "solid", "panel": "separate", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "threshold", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "period", "label": "Period (Bars)", "type": "integer", "default": 10, "minimum": 1, "maximum": 100, "step": 1, "tab": "inputs", "description": "Momentum period."}
        ],
        "validation_rules": {"period": {"min": 1, "max": 100}}
    },

    # =========================================================================
    # 3. VOLATILITY INDICATORS
    # =========================================================================
    "bollinger": {
        "indicator_id": "bollinger",
        "name": "Bollinger Bands",
        "category": "Volatility",
        "version": "1.0.0",
        "description": "Volatility bands placed above and below a moving average.",
        "default_timeframe": "15m",
        "default_weight": 20.0,
        "default_parameters": {"period": 20, "std_dev": 2.0, "source": "close", "bandwidth_threshold": 0.05},
        "default_display": {"color": "#80cbc4", "line_width": 2, "line_style": "solid", "panel": "overlay", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "both", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "period", "label": "Period Length", "type": "integer", "default": 20, "minimum": 2, "maximum": 200, "step": 1, "tab": "inputs", "description": "SMA period length."},
            {"name": "std_dev", "label": "StdDev Multiplier (σ)", "type": "decimal", "default": 2.0, "minimum": 0.5, "maximum": 5.0, "step": 0.1, "tab": "inputs", "description": "Standard deviation multiplier."},
            {"name": "source", "label": "Price Source", "type": "select", "default": "close", "options": SUPPORTED_PRICE_SOURCES, "tab": "inputs", "description": "Price source."}
        ],
        "validation_rules": {"period": {"min": 2, "max": 200}, "std_dev": {"min": 0.5, "max": 5.0}}
    },
    "atr": {
        "indicator_id": "atr",
        "name": "ATR (Average True Range)",
        "category": "Volatility",
        "version": "1.0.0",
        "description": "Measures market volatility by decomposing the entire range of an asset price.",
        "default_timeframe": "15m",
        "default_weight": 15.0,
        "default_parameters": {"period": 14, "multiplier": 1.5, "volatility_threshold": 1.0},
        "default_display": {"color": "#ffca28", "line_width": 2, "line_style": "solid", "panel": "separate", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "threshold", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "period", "label": "ATR Period", "type": "integer", "default": 14, "minimum": 1, "maximum": 100, "step": 1, "tab": "inputs", "description": "Period length of ATR."},
            {"name": "multiplier", "label": "Stop Distance Multiplier", "type": "decimal", "default": 1.5, "minimum": 0.5, "maximum": 5.0, "step": 0.1, "tab": "inputs", "description": "Multiplier for dynamic SL calculation."}
        ],
        "validation_rules": {"period": {"min": 1, "max": 100}}
    },
    "keltner": {
        "indicator_id": "keltner",
        "name": "Keltner Channels",
        "category": "Volatility",
        "version": "1.0.0",
        "description": "Volatility-based envelopes set above and below an exponential moving average.",
        "default_timeframe": "15m",
        "default_weight": 15.0,
        "default_parameters": {"period": 20, "atr_period": 10, "multiplier": 2.0},
        "default_display": {"color": "#64b5f6", "line_width": 2, "line_style": "solid", "panel": "overlay", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "both", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "period", "label": "EMA Period", "type": "integer", "default": 20, "minimum": 2, "maximum": 200, "step": 1, "tab": "inputs", "description": "Central EMA period."},
            {"name": "atr_period", "label": "ATR Period", "type": "integer", "default": 10, "minimum": 1, "maximum": 50, "step": 1, "tab": "inputs", "description": "ATR smoothing period."},
            {"name": "multiplier", "label": "Channel Multiplier", "type": "decimal", "default": 2.0, "minimum": 0.5, "maximum": 5.0, "step": 0.1, "tab": "inputs", "description": "ATR channel width multiplier."}
        ],
        "validation_rules": {"period": {"min": 2, "max": 200}}
    },
    "donchian": {
        "indicator_id": "donchian",
        "name": "Donchian Channels",
        "category": "Volatility",
        "version": "1.0.0",
        "description": "Formed by taking the highest high and lowest low of the last N periods.",
        "default_timeframe": "15m",
        "default_weight": 15.0,
        "default_parameters": {"period": 20},
        "default_display": {"color": "#ba68c8", "line_width": 2, "line_style": "solid", "panel": "overlay", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "both", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "period", "label": "Lookback Period", "type": "integer", "default": 20, "minimum": 2, "maximum": 200, "step": 1, "tab": "inputs", "description": "Donchian lookback bars."}
        ],
        "validation_rules": {"period": {"min": 2, "max": 200}}
    },

    # =========================================================================
    # 4. VOLUME INDICATORS
    # =========================================================================
    "volume": {
        "indicator_id": "volume",
        "name": "Volume & Volume SMA",
        "category": "Volume",
        "version": "1.0.0",
        "description": "Trading volume accompanied by a volume moving average baseline.",
        "default_timeframe": "15m",
        "default_weight": 15.0,
        "default_parameters": {"vol_sma_period": 20, "volume_multiplier": 1.2},
        "default_display": {"color": "#4db6ac", "line_width": 2, "line_style": "solid", "panel": "separate", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "threshold", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "vol_sma_period", "label": "Volume SMA Period", "type": "integer", "default": 20, "minimum": 1, "maximum": 100, "step": 1, "tab": "inputs", "description": "Volume moving average period."},
            {"name": "volume_multiplier", "label": "Volume Surge Multiplier", "type": "decimal", "default": 1.2, "minimum": 1.0, "maximum": 5.0, "step": 0.1, "tab": "inputs", "description": "Threshold for volume spike detection."}
        ],
        "validation_rules": {"vol_sma_period": {"min": 1, "max": 100}}
    },
    "obv": {
        "indicator_id": "obv",
        "name": "OBV (On-Balance Volume)",
        "category": "Volume",
        "version": "1.0.0",
        "description": "Cumulative total volume filtered by price direction to measure institutional flow.",
        "default_timeframe": "15m",
        "default_weight": 15.0,
        "default_parameters": {"sma_period": 20},
        "default_display": {"color": "#81c784", "line_width": 2, "line_style": "solid", "panel": "separate", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "both", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "sma_period", "label": "OBV Signal SMA Length", "type": "integer", "default": 20, "minimum": 1, "maximum": 100, "step": 1, "tab": "inputs", "description": "Moving average of OBV."}
        ],
        "validation_rules": {"sma_period": {"min": 1, "max": 100}}
    },
    "mfi": {
        "indicator_id": "mfi",
        "name": "MFI (Money Flow Index)",
        "category": "Volume",
        "version": "1.0.0",
        "description": "Volume-weighted RSI that measures the inflow and outflow of money.",
        "default_timeframe": "15m",
        "default_weight": 15.0,
        "default_parameters": {"period": 14, "overbought": 80.0, "oversold": 20.0},
        "default_display": {"color": "#4dd0e1", "line_width": 2, "line_style": "solid", "panel": "separate", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "threshold", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "period", "label": "MFI Period", "type": "integer", "default": 14, "minimum": 2, "maximum": 100, "step": 1, "tab": "inputs", "description": "Lookback bars for Money Flow Index."}
        ],
        "validation_rules": {"period": {"min": 2, "max": 100}}
    },
    "cmf": {
        "indicator_id": "cmf",
        "name": "CMF (Chaikin Money Flow)",
        "category": "Volume",
        "version": "1.0.0",
        "description": "Measures the amount of Money Flow Volume over a specific period.",
        "default_timeframe": "15m",
        "default_weight": 10.0,
        "default_parameters": {"period": 20, "threshold": 0.0},
        "default_display": {"color": "#aed581", "line_width": 2, "line_style": "solid", "panel": "separate", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "threshold", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "period", "label": "CMF Period", "type": "integer", "default": 20, "minimum": 2, "maximum": 100, "step": 1, "tab": "inputs", "description": "Chaikin Money Flow period."}
        ],
        "validation_rules": {"period": {"min": 2, "max": 100}}
    },

    # =========================================================================
    # 5. PRICE & MARKET STRUCTURE INDICATORS
    # =========================================================================
    "pivot": {
        "indicator_id": "pivot",
        "name": "Pivot Points (Standard / Fibonacci / Woodie)",
        "category": "Price/Structure",
        "version": "1.0.0",
        "description": "Predictive support and resistance levels derived from previous session extremes.",
        "default_timeframe": "1h",
        "default_weight": 15.0,
        "default_parameters": {"pivot_type": "standard"},
        "default_display": {"color": "#fff59d", "line_width": 2, "line_style": "dashed", "panel": "overlay", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "both", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "pivot_type", "label": "Calculation Type", "type": "select", "default": "standard", "options": [
                {"value": "standard", "label": "Standard (Traditional)"},
                {"value": "fibonacci", "label": "Fibonacci Pivots"},
                {"value": "woodie", "label": "Woodie Pivots"},
                {"value": "camarilla", "label": "Camarilla Pivots"}
            ], "tab": "inputs", "description": "Mathematical formula used for S/R pivot calculation."}
        ],
        "validation_rules": {}
    },
    "fibonacci": {
        "indicator_id": "fibonacci",
        "name": "Auto Fibonacci Retracement",
        "category": "Price/Structure",
        "version": "1.0.0",
        "description": "Automatically plots key golden ratio retracement levels (0.382, 0.5, 0.618, 0.786).",
        "default_timeframe": "15m",
        "default_weight": 15.0,
        "default_parameters": {"lookback": 50},
        "default_display": {"color": "#ffab91", "line_width": 2, "line_style": "dashed", "panel": "overlay", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "both", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "lookback", "label": "Swing Lookback (Bars)", "type": "integer", "default": 50, "minimum": 10, "maximum": 500, "step": 5, "tab": "inputs", "description": "Lookback bars to detect recent major Swing High/Low."}
        ],
        "validation_rules": {"lookback": {"min": 10, "max": 500}}
    },
    "support_resistance": {
        "indicator_id": "support_resistance",
        "name": "Support & Resistance Zones",
        "category": "Price/Structure",
        "version": "1.0.0",
        "description": "Multi-touch horizontal supply and demand clusters.",
        "default_timeframe": "15m",
        "default_weight": 15.0,
        "default_parameters": {"lookback": 50, "zone_width_pct": 0.5, "min_touches": 2},
        "default_display": {"color": "#b39ddb", "line_width": 2, "line_style": "solid", "panel": "overlay", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "both", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "lookback", "label": "Lookback (Bars)", "type": "integer", "default": 50, "minimum": 10, "maximum": 500, "step": 5, "tab": "inputs", "description": "Bar count for swing cluster identification."},
            {"name": "min_touches", "label": "Minimum Swing Touches", "type": "integer", "default": 2, "minimum": 1, "maximum": 10, "step": 1, "tab": "inputs", "description": "Number of touches required to validate key level."}
        ],
        "validation_rules": {"lookback": {"min": 10, "max": 500}}
    },
    "breakout_levels": {
        "indicator_id": "breakout_levels",
        "name": "High / Low Breakout Levels",
        "category": "Price/Structure",
        "version": "1.0.0",
        "description": "Tracks dynamic 20-bar Donchian breakout boundaries for momentum expansion.",
        "default_timeframe": "15m",
        "default_weight": 15.0,
        "default_parameters": {"lookback": 20},
        "default_display": {"color": "#ef5350", "line_width": 2, "line_style": "solid", "panel": "overlay", "show_on_chart": True},
        "default_signal": {"long_enabled": True, "short_enabled": True, "signal_mode": "both", "min_confirmations": 1},
        "parameter_schema": [
            {"name": "lookback", "label": "Breakout Lookback", "type": "integer", "default": 20, "minimum": 5, "maximum": 200, "step": 1, "tab": "inputs", "description": "Bars for highest high / lowest low breakout channel."}
        ],
        "validation_rules": {"lookback": {"min": 5, "max": 200}}
    }
}

# =============================================================================
# REUSABLE PRESETS
# =============================================================================
UNIVERSAL_INDICATOR_PRESETS: Dict[str, Dict[str, Any]] = {
    "Conservative": {
        "name": "Conservative",
        "category": "Trend Following",
        "description": "High-conviction macro trend following setup utilizing 50/200 EMAs, MACD, Volume Profile, and ADX strength.",
        "enabled_ids": ["ema_50", "ema_200", "macd", "adx", "volume_profile"],
        "weights": {"ema_50": 20.0, "ema_200": 25.0, "macd": 20.0, "adx": 15.0, "volume_profile": 20.0}
    },
    "Conservative Trend": {
        "name": "Conservative Trend",
        "category": "Trend Following",
        "description": "High-conviction macro trend following setup utilizing 50/200 EMAs, MACD, Volume Profile, and ADX strength.",
        "enabled_ids": ["ema_50", "ema_200", "macd", "adx", "volume_profile"],
        "weights": {"ema_50": 20.0, "ema_200": 25.0, "macd": 20.0, "adx": 15.0, "volume_profile": 20.0}
    },
    "Balanced": {
        "name": "Balanced",
        "category": "Standard Confluence",
        "description": "Balanced trend and momentum confluence using EMA, RSI, MACD, and Volume.",
        "enabled_ids": ["ema_20", "ema_50", "rsi", "macd", "volume"],
        "weights": {"ema_20": 20.0, "ema_50": 20.0, "rsi": 20.0, "macd": 20.0, "volume": 20.0}
    },
    "Aggressive Scalping": {
        "name": "Aggressive Scalping",
        "category": "Scalping",
        "description": "Fast momentum and intraday cycle setup with 9/20 EMAs, RSI, MACD, and Supertrend.",
        "enabled_ids": ["ema_9", "ema_20", "rsi", "macd", "supertrend"],
        "weights": {"ema_9": 20.0, "ema_20": 20.0, "rsi": 20.0, "macd": 20.0, "supertrend": 20.0}
    },
    "Volatility Breakout": {
        "name": "Volatility Breakout",
        "category": "Breakout",
        "description": "Detects explosive expansion cycles with Bollinger Bands, ATR, Donchian, and Volume surge.",
        "enabled_ids": ["bollinger", "atr", "volume", "breakout_levels"],
        "weights": {"bollinger": 30.0, "atr": 25.0, "volume": 25.0, "breakout_levels": 20.0}
    },
    "Mean Reversion": {
        "name": "Mean Reversion",
        "category": "Range / Swing",
        "description": "Capitalizes on overbought/oversold extremes in ranging markets with RSI, Stochastic, CCI, and Bollinger.",
        "enabled_ids": ["rsi", "stochastic", "cci", "bollinger"],
        "weights": {"rsi": 30.0, "stochastic": 25.0, "cci": 20.0, "bollinger": 25.0}
    },
    "Price Action & Volume": {
        "name": "Price Action & Volume",
        "category": "Structure",
        "description": "Pure structural setup using VWAP, Volume Profile, Support/Resistance, and Pivot Points.",
        "enabled_ids": ["vwap", "volume_profile", "support_resistance", "pivot"],
        "weights": {"vwap": 25.0, "volume_profile": 30.0, "support_resistance": 25.0, "pivot": 20.0}
    }
}


def get_all_indicator_schemas() -> List[Dict[str, Any]]:
    """Return all universal indicator schema definitions as a list."""
    return list(UNIVERSAL_INDICATOR_SCHEMAS.values())


def get_indicator_schema(indicator_id: str) -> Optional[Dict[str, Any]]:
    """Return a single universal indicator schema definition."""
    return UNIVERSAL_INDICATOR_SCHEMAS.get(indicator_id)


def validate_indicator_parameters(indicator_id: str, params: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Validate indicator parameters against its schema and validation rules.
    Returns (is_valid, error_message).
    """
    schema = UNIVERSAL_INDICATOR_SCHEMAS.get(indicator_id)
    if not schema:
        return True, "OK"  # Allow custom/extension indicators

    rules = schema.get("validation_rules", {})

    # Check numeric bounds
    for field_name, bounds in rules.items():
        if field_name == "comparison":
            continue
        if field_name in params:
            val = params[field_name]
            try:
                num_val = float(val)
                if "min" in bounds and num_val < bounds["min"]:
                    return False, f"Parameter '{field_name}' must be >= {bounds['min']}."
                if "max" in bounds and num_val > bounds["max"]:
                    return False, f"Parameter '{field_name}' must be <= {bounds['max']}."
            except (ValueError, TypeError):
                return False, f"Parameter '{field_name}' must be a valid number."

    # Check comparison rules (e.g. fast < slow, oversold < overbought)
    if "comparison" in rules:
        cmp_rule = rules["comparison"]
        f1 = cmp_rule.get("field1")
        f2 = cmp_rule.get("field2")
        op = cmp_rule.get("operator")
        msg = cmp_rule.get("message", f"{f1} must satisfy {op} {f2}")

        if f1 in params and f2 in params:
            try:
                v1 = float(params[f1])
                v2 = float(params[f2])
                if op == "<" and not (v1 < v2):
                    return False, msg
                elif op == "<=" and not (v1 <= v2):
                    return False, msg
                elif op == ">" and not (v1 > v2):
                    return False, msg
            except (ValueError, TypeError):
                pass

    return True, "OK"
