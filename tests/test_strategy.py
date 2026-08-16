import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

# Add project source to sys.path
project_dir = Path(__file__).resolve().parent.parent
if str(project_dir) not in sys.path:
    sys.path.append(str(project_dir))

from src.strategy import Strategy
from src import config

def create_mock_row(
    close,
    ema_9,
    ema_20,
    ema_200,
    macd_line,
    poc,
    val,
    vah,
    prev_ema_9,
    prev_ema_20
):
    """
    Helper to generate a 2-row dataframe to simulate a state transition.
    """
    return pd.DataFrame([
        {
            'close': close - 100.0,
            'ema_9': prev_ema_9,
            'ema_20': prev_ema_20,
            'ema_200': ema_200,
            'macd_line': macd_line - 1.0,
            'poc': poc,
            'val': val,
            'vah': vah
        },
        {
            'close': close,
            'ema_9': ema_9,
            'ema_20': ema_20,
            'ema_200': ema_200,
            'macd_line': macd_line,
            'poc': poc,
            'val': val,
            'vah': vah
        }
    ])

@pytest.mark.parametrize(
    "trend_pass, momentum_pass, location_pass, expected_signal, expected_blocked, expected_reason_parts",
    [
        (True,  True,  True,  "LONG", False, []),
        (False, True,  True,  "HOLD", True,  ["Trend blocked"]),
        (True,  False, True,  "HOLD", True,  ["Momentum blocked"]),
        (True,  True,  False, "HOLD", True,  ["Location blocked"]),
        (False, False, True,  "HOLD", True,  ["Trend blocked", "Momentum blocked"]),
        (False, True,  False, "HOLD", True,  ["Trend blocked", "Location blocked"]),
        (True,  False,  False, "HOLD", True,  ["Momentum blocked", "Location blocked"]),
        (False, False, False, "HOLD", True,  ["Trend blocked", "Momentum blocked", "Location blocked"]),
    ]
)
def test_long_filter_combinations(
    trend_pass, momentum_pass, location_pass, expected_signal, expected_blocked, expected_reason_parts
):
    # Setup test variables based on pass/fail switches
    close = 60000.0
    ema_200 = 59000.0 if trend_pass else 61000.0
    macd_line = 10.0 if momentum_pass else -5.0
    
    # Location
    val = 58000.0
    vah = 62000.0
    if not location_pass:
        # Move close way outside [val, vah]
        close = 65000.0
        # If we change close, we might accidentally change trend check if we aren't careful.
        # Let's ensure ema_200 is set relative to close to preserve trend_pass.
        ema_200 = 64000.0 if trend_pass else 66000.0
    
    # Crossover parameters (trigger = True for LONG)
    df = create_mock_row(
        close=close,
        ema_9=60500.0,
        ema_20=60000.0,
        ema_200=ema_200,
        macd_line=macd_line,
        poc=60000.0,
        val=val,
        vah=vah,
        prev_ema_9=59500.0,
        prev_ema_20=60000.0
    )
    
    orig_buffer = config.VP_BUFFER_PCT
    config.VP_BUFFER_PCT = 0.01  # 1% buffer
    
    try:
        strat = Strategy(allow_shorts=True)
        signal, filters, is_blocked, reason = strat.evaluate_row(df, 1)
        
        assert signal == expected_signal
        assert filters["trigger"] is True
        assert filters["trend"] is trend_pass
        assert filters["momentum"] is momentum_pass
        assert filters["location"] is location_pass
        assert is_blocked is expected_blocked
        
        for part in expected_reason_parts:
            assert part in reason
    finally:
        config.VP_BUFFER_PCT = orig_buffer


@pytest.mark.parametrize(
    "trend_pass, momentum_pass, location_pass, expected_signal, expected_blocked, expected_reason_parts",
    [
        (True,  True,  True,  "SHORT", False, []),
        (False, True,  True,  "HOLD",  True,  ["Trend blocked"]),
        (True,  False, True,  "HOLD",  True,  ["Momentum blocked"]),
        (True,  True,  False, "HOLD",  True,  ["Location blocked"]),
        (False, False, False, "HOLD",  True,  ["Trend blocked", "Momentum blocked", "Location blocked"]),
    ]
)
def test_short_filter_combinations(
    trend_pass, momentum_pass, location_pass, expected_signal, expected_blocked, expected_reason_parts
):
    # Setup test variables based on pass/fail switches
    close = 40000.0
    ema_200 = 41000.0 if trend_pass else 39000.0
    macd_line = -10.0 if momentum_pass else 5.0
    
    # Location
    val = 38000.0
    vah = 42000.0
    if not location_pass:
        # Move close way outside [val, vah]
        close = 35000.0
        ema_200 = 36000.0 if trend_pass else 34000.0
    
    # Crossover parameters (trigger = True for SHORT)
    df = create_mock_row(
        close=close,
        ema_9=39500.0,
        ema_20=40000.0,
        ema_200=ema_200,
        macd_line=macd_line,
        poc=40000.0,
        val=val,
        vah=vah,
        prev_ema_9=40500.0,
        prev_ema_20=40000.0
    )
    
    orig_buffer = config.VP_BUFFER_PCT
    config.VP_BUFFER_PCT = 0.01  # 1% buffer
    
    try:
        strat = Strategy(allow_shorts=True)
        signal, filters, is_blocked, reason = strat.evaluate_row(df, 1)
        
        assert signal == expected_signal
        assert filters["trigger"] is True
        assert filters["trend"] is trend_pass
        assert filters["momentum"] is momentum_pass
        assert filters["location"] is location_pass
        assert is_blocked is expected_blocked
        
        for part in expected_reason_parts:
            assert part in reason
    finally:
        config.VP_BUFFER_PCT = orig_buffer

def test_no_trigger_holds():
    # EMA 9 is equal to EMA 20, no crossover
    df = create_mock_row(
        close=60000.0,
        ema_9=60000.0,
        ema_20=60000.0,
        ema_200=58000.0,
        macd_line=10.0,
        poc=60000.0,
        val=59000.0,
        vah=61000.0,
        prev_ema_9=60000.0,
        prev_ema_20=60000.0
    )
    
    strat = Strategy(allow_shorts=True)
    signal, filters, is_blocked, reason = strat.evaluate_row(df, 1)
    
    assert signal == "HOLD"
    assert filters["trigger"] is False
    assert is_blocked is False
    assert reason == ""
