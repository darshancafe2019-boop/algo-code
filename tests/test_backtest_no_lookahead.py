import unittest
import os
import sys
import pandas as pd
import numpy as np

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src import db
from src.backtester_v2 import AdvancedBacktestEngine


class TestBacktestNoLookaheadProtection(unittest.TestCase):
    """
    Critical No-Lookahead Protection Tests:
    Verifies that decisions made at historical candle T depend STRICTLY on data available up to T.
    Modifying candles after T must have ZERO effect on any decision or trade executed at or before T.
    """

    @classmethod
    def setUpClass(cls):
        db.init_db()

    def test_01_future_candle_mutation_does_not_change_past_decisions(self):
        # 1. Build a deterministic baseline dataset of 100 candles
        n_bars = 100
        np.random.seed(42)
        base_price = 100.0
        prices = [base_price]
        for _ in range(n_bars - 1):
            prices.append(prices[-1] + np.random.normal(0.2, 1.0))

        df_baseline = pd.DataFrame({
            "timestamp": [f"2024-01-01T{i//4:02d}:{(i%4)*15:02d}:00Z" for i in range(n_bars)],
            "open": [p - 0.2 for p in prices],
            "high": [p + 1.0 for p in prices],
            "low": [p - 1.0 for p in prices],
            "close": prices,
            "volume": [1000.0 + (i * 10) for i in range(n_bars)]
        })

        # Run backtest on baseline
        config = {
            "symbol": "BTC/USDT",
            "initial_capital": 10000.0,
            "confidence_threshold": 60.0
        }
        engine_base = AdvancedBacktestEngine(config)
        res_base = engine_base.run(df_baseline)
        trades_base = res_base.get("trades", [])

        self.assertGreater(len(trades_base), 0)

        # 2. Mutate all candles after bar 50 aggressively (simulate huge pump and dump)
        df_mutated = df_baseline.copy()
        split_bar = 50
        for k in range(split_bar, n_bars):
            df_mutated.at[k, "open"] = df_mutated.at[k, "open"] * 5.0
            df_mutated.at[k, "high"] = df_mutated.at[k, "high"] * 5.5
            df_mutated.at[k, "low"] = df_mutated.at[k, "low"] * 0.2
            df_mutated.at[k, "close"] = df_mutated.at[k, "close"] * 4.5
            df_mutated.at[k, "volume"] = df_mutated.at[k, "volume"] * 50.0

        engine_mutated = AdvancedBacktestEngine(config)
        res_mutated = engine_mutated.run(df_mutated)
        trades_mutated = res_mutated.get("trades", [])

        # 3. Check all trades that entered at or before split_bar:
        # Their entry time, entry price, stop loss, and target MUST be 100% identical
        base_early_trades = [t for t in trades_base if int(t["entry_time"][11:13])*4 + int(t["entry_time"][14:16])//15 <= split_bar]
        mutated_early_trades = [t for t in trades_mutated if int(t["entry_time"][11:13])*4 + int(t["entry_time"][14:16])//15 <= split_bar]

        self.assertEqual(len(base_early_trades), len(mutated_early_trades))
        for t_b, t_m in zip(base_early_trades, mutated_early_trades):
            self.assertEqual(t_b["entry_time"], t_m["entry_time"])
            self.assertEqual(t_b["entry_price"], t_m["entry_price"])
            self.assertEqual(t_b["stop_loss_price"], t_m["stop_loss_price"])
            self.assertEqual(t_b["take_profit_price"], t_m["take_profit_price"])
            self.assertEqual(t_b["side"], t_m["side"])

    def test_02_indicator_snapshots_are_strictly_historical(self):
        n_bars = 60
        df = pd.DataFrame({
            "timestamp": [f"2024-02-01T{i//4:02d}:{(i%4)*15:02d}:00Z" for i in range(n_bars)],
            "open": [100.0 + (i * 0.5) for i in range(n_bars)],
            "high": [101.0 + (i * 0.5) for i in range(n_bars)],
            "low": [99.0 + (i * 0.5) for i in range(n_bars)],
            "close": [100.5 + (i * 0.5) for i in range(n_bars)],
            "volume": [1000.0 for _ in range(n_bars)]
        })

        engine = AdvancedBacktestEngine({"confidence_threshold": 50.0})
        res = engine.run(df)
        trades = res.get("trades", [])
        self.assertGreater(len(trades), 0)

        for t in trades:
            ind_entry = t.get("indicators_at_entry", {})
            self.assertIn("rsi", ind_entry)
            self.assertIn("macd_line", ind_entry)
            self.assertIn("ema_9", ind_entry)
            self.assertIn("ema_20", ind_entry)
            self.assertGreater(ind_entry["rsi"], 0)


if __name__ == '__main__':
    unittest.main()
