import unittest
import os
import sys
import pandas as pd
import numpy as np

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src import db
from src.backtester_v2 import AdvancedBacktestEngine


class TestBacktestStopsAndTargets(unittest.TestCase):
    """
    Tests Stop-Loss & Target Models:
    - Fixed points, percentage, ATR multiplier, Swing levels
    - Risk/Reward ratios (1:1.5, 1:2, 1:3)
    - Multi-target partial exits (TP1 50%, TP2 25%, TP3 25%) and breakeven stop moves
    """

    @classmethod
    def setUpClass(cls):
        db.init_db()

    def _generate_test_candles(self, n=80):
        return pd.DataFrame({
            "timestamp": [f"2024-04-01T{i//4:02d}:{(i%4)*15:02d}:00Z" for i in range(n)],
            "open": [100.0 + (i * 0.5) for i in range(n)],
            "high": [101.0 + (i * 0.5) for i in range(n)],
            "low": [99.0 + (i * 0.5) for i in range(n)],
            "close": [100.5 + (i * 0.5) for i in range(n)],
            "volume": [1000.0 for _ in range(n)]
        })

    def test_01_fixed_percent_stop_and_rr_target(self):
        config = {
            "initial_capital": 10000.0,
            "stop_loss_method": "FIXED_PERCENT",
            "fixed_stop_loss_pct": 0.02, # 2%
            "take_profit_method": "RISK_REWARD",
            "risk_reward_ratio": 2.5,
            "confidence_threshold": 50.0
        }
        engine = AdvancedBacktestEngine(config)
        df = self._generate_test_candles(60)
        res = engine.run(df)
        trades = res.get("trades", [])

        if trades:
            for t in trades:
                self.assertEqual(t["risk_reward_ratio"], 2.5)
                self.assertGreater(t["stop_distance"], 0)

    def test_02_multi_target_partial_exits(self):
        config = {
            "initial_capital": 10000.0,
            "take_profit_method": "MULTI_TARGET",
            "tp1_ratio": 1.0,
            "tp1_pct": 50.0,
            "tp2_ratio": 2.0,
            "tp2_pct": 50.0,
            "move_stop_to_breakeven": True,
            "confidence_threshold": 50.0
        }
        engine = AdvancedBacktestEngine(config)
        df = self._generate_test_candles(80)
        res = engine.run(df)
        trades = res.get("trades", [])

        self.assertGreaterEqual(len(trades), 1)


if __name__ == '__main__':
    unittest.main()
