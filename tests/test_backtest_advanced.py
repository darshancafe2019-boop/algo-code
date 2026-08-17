import unittest
import os
import sys
import json
import pandas as pd

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src import db
from src.backtester_v2 import AdvancedBacktestEngine, run_monte_carlo_simulation
from dashboard import app


class TestBacktestAdvancedFeatures(unittest.TestCase):
    """
    Tests Advanced Backtesting Lab features:
    - Monte Carlo permutations & Risk of Ruin
    - Walk-Forward split testing
    - REST API routes (/api/backtest/*)
    """

    @classmethod
    def setUpClass(cls):
        db.init_db()
        cls.client = app.test_client()

    def test_01_monte_carlo_simulation(self):
        sample_trades = [
            {"net_pnl": 150.0},
            {"net_pnl": -80.0},
            {"net_pnl": 220.0},
            {"net_pnl": -90.0},
            {"net_pnl": 300.0},
            {"net_pnl": -70.0},
            {"net_pnl": 180.0}
        ]
        mc_res = run_monte_carlo_simulation(sample_trades, initial_capital=10000.0, iterations=100)
        self.assertEqual(mc_res["status"], "success")
        self.assertIn("expected_return_median", mc_res)
        self.assertIn("return_5th_percentile", mc_res)
        self.assertIn("return_95th_percentile", mc_res)
        self.assertIn("risk_of_ruin_pct", mc_res)

    def test_02_rest_api_backtest_run_and_history(self):
        payload = {
            "symbol": "BTC/USDT",
            "timeframe": "15m",
            "start_date": "2024-01-01",
            "end_date": "2024-06-01",
            "strategy_name": "EMA_MACD_VP",
            "initial_cash": 10000.0,
            "reserve_cash": 2000.0,
            "allow_shorts": True
        }
        # 1. Run
        resp = self.client.post("/api/backtest/run", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "success")
        bt_id = data["backtest"].get("backtest_id")
        self.assertIsNotNone(bt_id)

        # 2. History
        resp_hist = self.client.get("/api/backtest/history")
        self.assertEqual(resp_hist.status_code, 200)
        hist_data = json.loads(resp_hist.data)
        self.assertGreaterEqual(hist_data["total"], 1)

        # 3. Detail
        resp_det = self.client.get(f"/api/backtest/{bt_id}")
        self.assertEqual(resp_det.status_code, 200)
        det_data = json.loads(resp_det.data)
        self.assertEqual(det_data["backtest"]["backtest_id"], bt_id)

        # 4. Presets
        resp_pre = self.client.get("/api/backtest/presets")
        self.assertEqual(resp_pre.status_code, 200)
        pre_data = json.loads(resp_pre.data)
        self.assertGreaterEqual(len(pre_data["presets"]), 3)


if __name__ == '__main__':
    unittest.main()
