import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

# Add project source to sys.path
project_dir = Path(__file__).resolve().parent.parent
if str(project_dir) not in sys.path:
    sys.path.append(str(project_dir))

from src.indicators import calculate_emas, calculate_macd, calculate_volume_profile
from src import config

def test_calculate_emas():
    # Save original config values to restore later
    orig_fast = config.EMA_FAST_CROSS
    orig_slow = config.EMA_SLOW_CROSS
    orig_support = config.EMA_SUPPORT
    orig_trend = config.EMA_TREND_FILTER
    
    try:
        # Override configuration for a known small dataset
        config.EMA_FAST_CROSS = 3
        config.EMA_SLOW_CROSS = 3
        config.EMA_SUPPORT = 3
        config.EMA_TREND_FILTER = 3
        
        # 5 prices: EMA of span 3 starts at index 2 (1-based: 3rd element)
        df = pd.DataFrame({
            'close': [10.0, 11.0, 12.0, 13.0, 14.0],
            'high': [10.0, 11.0, 12.0, 13.0, 14.0],
            'low': [10.0, 11.0, 12.0, 13.0, 14.0],
            'volume': [1.0] * 5
        })
        
        df = calculate_emas(df)
        
        # Expected outputs:
        # Index 0, 1: NaN
        # Index 2: 11.0 (SMA of [10.0, 11.0, 12.0])
        # Index 3: 13.0 * 0.5 + 11.0 * 0.5 = 12.0 (using alpha = 2 / (3 + 1) = 0.5)
        # Index 4: 14.0 * 0.5 + 12.0 * 0.5 = 13.0
        
        assert pd.isna(df['ema_9'].iloc[0])
        assert pd.isna(df['ema_9'].iloc[1])
        assert pytest.approx(df['ema_9'].iloc[2], 1e-4) == 11.0
        assert pytest.approx(df['ema_9'].iloc[3], 1e-4) == 12.0
        assert pytest.approx(df['ema_9'].iloc[4], 1e-4) == 13.0
        
    finally:
        # Restore configuration
        config.EMA_FAST_CROSS = orig_fast
        config.EMA_SLOW_CROSS = orig_slow
        config.EMA_SUPPORT = orig_support
        config.EMA_TREND_FILTER = orig_trend

def test_calculate_macd():
    # Save original config
    orig_fast = config.MACD_FAST
    orig_slow = config.MACD_SLOW
    orig_signal = config.MACD_SIGNAL
    
    try:
        # Override config
        config.MACD_FAST = 2
        config.MACD_SLOW = 4
        config.MACD_SIGNAL = 2
        
        df = pd.DataFrame({
            'close': [10.0, 20.0, 30.0, 40.0, 50.0]
        })
        
        df = calculate_macd(df)
        
        # Hand-verified outputs:
        # Index 0, 1, 2: NaN (due to slow=4 window and signal=2)
        # Index 3: MACD line = 10.0, Signal = NaN, Hist = NaN
        # Index 4: MACD line = 10.0, Signal = 10.0, Hist = 0.0
        
        assert pd.isna(df['macd_line'].iloc[0])
        assert pd.isna(df['macd_line'].iloc[2])
        assert pytest.approx(df['macd_line'].iloc[3], 1e-4) == 10.0
        assert pytest.approx(df['macd_line'].iloc[4], 1e-4) == 10.0
        
        assert pd.isna(df['macd_signal'].iloc[3])
        assert pytest.approx(df['macd_signal'].iloc[4], 1e-4) == 10.0
        assert pytest.approx(df['macd_hist'].iloc[4], 1e-4) == 0.0
        
    finally:
        config.MACD_FAST = orig_fast
        config.MACD_SLOW = orig_slow
        config.MACD_SIGNAL = orig_signal

def test_calculate_volume_profile():
    # Save original config
    orig_tf = config.TIMEFRAME
    orig_lookback = config.VP_LOOKBACK_DAYS
    orig_bin = config.VP_BIN_SIZE_USDT
    orig_area = config.VP_VALUE_AREA_PCT
    
    try:
        # Setup config overrides for testing
        config.TIMEFRAME = '1h'
        config.VP_LOOKBACK_DAYS = 1  # 24 candles
        config.VP_BIN_SIZE_USDT = 10.0
        config.VP_VALUE_AREA_PCT = 0.70
        
        # We construct 30 candles
        # High-Low Range is 0 to isolate POC bin and test rounding
        # All candles have close=104, high=104, low=104, so they round to bin 100
        # One high volume candle at index 15 has close=156 (rounds to bin 150)
        
        highs = [104.0] * 30
        lows = [104.0] * 30
        closes = [104.0] * 30
        volumes = [1.0] * 30
        
        highs[15] = 156.0
        lows[15] = 156.0
        closes[15] = 156.0
        volumes[15] = 100.0  # Dominant volume
        
        df = pd.DataFrame({
            'timestamp': [i * 3600 * 1000 for i in range(30)],
            'open': closes,
            'high': highs,
            'low': lows,
            'close': closes,
            'volume': volumes
        })
        
        df = calculate_volume_profile(df)
        
        assert 'poc' in df.columns
        assert 'val' in df.columns
        assert 'vah' in df.columns
        
        # For index 25 (which looks back 24 candles, including index 15):
        # Dominant volume is at index 15 (price 156.0).
        # This price 156.0 should fall in the 150 bin.
        # Check that the POC, VAL, VAH are correctly identified as 150.
        assert df['poc'].iloc[25] == 150
        assert df['val'].iloc[25] == 150
        assert df['vah'].iloc[25] == 150
        
    finally:
        config.TIMEFRAME = orig_tf
        config.VP_LOOKBACK_DAYS = orig_lookback
        config.VP_BIN_SIZE_USDT = orig_bin
        config.VP_VALUE_AREA_PCT = orig_area


def test_timeframe_to_lookback_mapping_supports_multiple_intervals():
    from src.indicators import get_lookback_candles

    assert get_lookback_candles('1m', 1) == 1440
    assert get_lookback_candles('5m', 1) == 288
    assert get_lookback_candles('1h', 1) == 24
    assert get_lookback_candles('4h', 1) == 6
    assert get_lookback_candles('1d', 1) == 1
    assert get_lookback_candles('unknown', 1) == 720
