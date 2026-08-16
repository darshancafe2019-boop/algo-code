import sys
import time
from pathlib import Path
from datetime import datetime, timezone
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import config, db
from src.strategy import Strategy
from dashboard import app

class TestCommandCenterAndTrace(unittest.TestCase):

    def setUp(self):
        db.init_db(force=True)
        app.config["TESTING"] = True
        self.client = app.test_client()

    def test_01_accuracy_breakdown_in_strategy(self):
        """Verify Strategy.evaluate_confluence returns complete component accuracy breakdown."""
        import pandas as pd
        df = pd.DataFrame({
            "open": [64000.0] * 250,
            "high": [65500.0] * 250,
            "low": [63800.0] * 250,
            "close": [65000.0] * 250,
            "volume": [100.0] * 250,
            "ema_200": [63000.0] * 250,
            "adx": [30.0] * 250
        })
        strat = Strategy()
        direction, score, details = strat.evaluate_confluence(df, idx=249, active_indicators=["ema", "adx"])
        self.assertIn("accuracy_breakdown", details)
        breakdown = details["accuracy_breakdown"]
        self.assertIn("trend_score", breakdown)
        self.assertIn("momentum_score", breakdown)
        self.assertIn("volume_score", breakdown)
        self.assertIn("volatility_score", breakdown)
        self.assertIn("structure_score", breakdown)
        self.assertIn("final_confidence", breakdown)

    def test_02_trade_trace_api(self):
        """Verify /api/trades/<trade_id>/trace returns complete 10-step trace timeline."""
        # Insert a sample trade into trades_log
        now_str = datetime.now(timezone.utc).isoformat()
        conn = db.get_connection()
        c = conn.cursor()
        c.execute("""
            INSERT INTO trades_log (
                timestamp, bot_id, symbol, direction, strategy, entry_price, stop_loss,
                take_profit, position_size, status, broker_order_id, execution_mode, correlation_id
            ) VALUES (?, 'bot-trace-1', 'BTC/USDT', 'LONG', 'EMA_MACD_VP', 65000.0, 64000.0, 68000.0, 0.1, 'OPEN', 'BROKER-ORD-101', 'PAPER', 'IDEM-TEST-101')
        """, (now_str,))
        trade_id = c.lastrowid
        conn.commit()
        conn.close()

        res = self.client.get(f"/api/trades/{trade_id}/trace")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["trade"]["id"], trade_id)
        self.assertEqual(len(data["trace"]), 10)
        self.assertEqual(data["trace"][0]["step"], 1)
        self.assertEqual(data["trace"][9]["step"], 10)

if __name__ == "__main__":
    unittest.main()
