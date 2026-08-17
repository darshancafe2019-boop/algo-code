import unittest
import os
import sys
import pandas as pd
import numpy as np

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src import db
from src.backtester_v2 import AdvancedBacktestEngine


class TestBacktestCapitalAndSizing(unittest.TestCase):
    """
    Tests Capital Model & Position Sizing:
    - Initial Capital ($10,000) vs Reserve ($2,000) vs Available Trading Capital ($8,000)
    - Fixed Risk ($100), Percent Equity (1%), Percent Available
    - Max notional & leverage scaling
    """

    @classmethod
    def setUpClass(cls):
        db.init_db()

    def _generate_test_candles(self, n=80):
        return pd.DataFrame({
            "timestamp": [f"2024-03-01T{i//4:02d}:{(i%4)*15:02d}:00Z" for i in range(n)],
            "open": [100.0 + (i * 0.4) for i in range(n)],
            "high": [101.0 + (i * 0.4) for i in range(n)],
            "low": [99.0 + (i * 0.4) for i in range(n)],
            "close": [100.5 + (i * 0.4) for i in range(n)],
            "volume": [1000.0 for _ in range(n)]
        })

    def test_01_reserve_cash_reduces_available_trading_capital(self):
        config = {
            "initial_capital": 10000.0,
            "reserve_cash": 2000.0,
            "confidence_threshold": 50.0
        }
        engine = AdvancedBacktestEngine(config)
        self.assertEqual(engine.initial_capital, 10000.0)
        self.assertEqual(engine.reserve_cash, 2000.0)
        self.assertEqual(engine.available_capital, 8000.0)

        df = self._generate_test_candles(60)
        res = engine.run(df)
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["reserve_cash"], 2000.0)
        self.assertEqual(res["available_capital"], 8000.0)

    def test_02_fixed_risk_amount_sizing(self):
        config = {
            "initial_capital": 10000.0,
            "reserve_cash": 1000.0,
            "risk_model": "FIXED_AMOUNT",
            "fixed_risk_amount": 150.0,
            "stop_loss_method": "FIXED_PERCENT",
            "fixed_stop_loss_pct": 0.02, # 2% SL
            "confidence_threshold": 50.0
        }
        engine = AdvancedBacktestEngine(config)
        df = self._generate_test_candles(60)
        res = engine.run(df)
        trades = res.get("trades", [])

        if trades:
            for t in trades:
                self.assertLessEqual(t["planned_risk"], 150.01)

    def test_03_percent_equity_sizing(self):
        config = {
            "initial_capital": 20000.0,
            "reserve_cash": 4000.0,
            "risk_model": "PERCENT_EQUITY",
            "risk_per_trade_pct": 1.0, # 1% of 20000 = $200
            "confidence_threshold": 50.0
        }
        engine = AdvancedBacktestEngine(config)
        df = self._generate_test_candles(60)
        res = engine.run(df)
        trades = res.get("trades", [])

        if trades:
            for t in trades:
                self.assertLessEqual(t["planned_risk"], 200.01)


if __name__ == '__main__':
    unittest.main()
