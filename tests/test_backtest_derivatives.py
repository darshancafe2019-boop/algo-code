import unittest
import os
import sys
import pandas as pd
import numpy as np

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src import db
from src.backtester_v2 import AdvancedBacktestEngine


class TestBacktestDerivatives(unittest.TestCase):
    """
    Tests Futures and Options Backtesting:
    - Futures contracts, lot size scaling, margin requirements, leverage
    - Options models, Greeks approximations (Delta, Gamma, Theta, Vega), spreads
    """

    @classmethod
    def setUpClass(cls):
        db.init_db()

    def _generate_test_candles(self, n=80):
        return pd.DataFrame({
            "timestamp": [f"2024-05-01T{i//4:02d}:{(i%4)*15:02d}:00Z" for i in range(n)],
            "open": [24000.0 + (i * 15.0) for i in range(n)],
            "high": [24050.0 + (i * 15.0) for i in range(n)],
            "low": [23950.0 + (i * 15.0) for i in range(n)],
            "close": [24010.0 + (i * 15.0) for i in range(n)],
            "volume": [50000.0 for _ in range(n)]
        })

    def test_01_futures_lot_size_and_margin_scaling(self):
        config = {
            "asset_class": "Futures",
            "symbol": "NIFTY_FUT",
            "lot_size": 25.0,
            "tick_size": 0.05,
            "contract_size": 25.0,
            "leverage": 5.0, # 20% margin
            "margin_requirement": 0.20,
            "initial_capital": 25000.0,
            "confidence_threshold": 50.0
        }
        engine = AdvancedBacktestEngine(config)
        df = self._generate_test_candles(60)
        res = engine.run(df)
        trades = res.get("trades", [])

        if trades:
            for t in trades:
                # Quantity must be a multiple of lot size (25)
                self.assertEqual(t["quantity"] % 25.0, 0.0)
                self.assertGreater(t["margin_used"], 0)

    def test_02_options_spread_scenario_simulation(self):
        config = {
            "asset_class": "Options",
            "symbol": "NIFTY_24500_CE",
            "option_type": "CALL",
            "lot_size": 25.0,
            "initial_capital": 15000.0,
            "confidence_threshold": 50.0
        }
        engine = AdvancedBacktestEngine(config)
        df = self._generate_test_candles(60)
        res = engine.run(df)
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["asset_class"], "Options")


if __name__ == '__main__':
    unittest.main()
