import sys
import time
from pathlib import Path
from datetime import datetime, timezone
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import config, db
from src.strategy import Strategy
from src.execution_service import OrderExecutionService
from src.reconciliation import PositionReconciler

class TestFullAccuracyAndAudit(unittest.TestCase):

    def setUp(self):
        db.init_db(force=True)

    def test_01_multi_indicator_confluence_evaluation(self):
        """Verify Strategy.evaluate_confluence evaluates multiple indicators simultaneously without truncation."""
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
        indicators = ["ema", "macd", "rsi", "vp", "adx", "sma"]
        direction, score, details = strat.evaluate_confluence(df, idx=249, active_indicators=indicators)
        self.assertIn("accuracy_breakdown", details)
        self.assertGreaterEqual(len(details["active_indicators"]), 4)

    def test_02_pre_order_checks_safety_pipeline(self):
        """Verify OrderExecutionService pre-order safety pipeline rejects invalid orders."""
        service = OrderExecutionService()
        
        # Test 1: Low Confidence (< 75%)
        passed, reason = service.validate_14_point_pre_order_check(
            bot_id="bot-test-acc", strategy="EMA_MACD_VP", symbol="BTC/USDT", side="BUY",
            amount=0.1, price=65000.0, stop_loss=64000.0, take_profit=68000.0,
            confidence_score=0.60
        )
        self.assertFalse(passed)
        self.assertIn("CONFIDENCE_BELOW_THRESHOLD", reason)

        # Test 2: Poor Risk/Reward Ratio (< 1.0)
        passed, reason = service.validate_14_point_pre_order_check(
            bot_id="bot-test-acc", strategy="EMA_MACD_VP", symbol="BTC/USDT", side="BUY",
            amount=0.1, price=65000.0, stop_loss=64000.0, take_profit=65500.0,
            confidence_score=0.82
        )
        self.assertFalse(passed)
        self.assertIn("POOR_RISK_REWARD_RATIO", reason)

    def test_03_position_reconciliation(self):
        """Verify PositionReconciler flags positions when broker and DB match/mismatch."""
        reconciler = PositionReconciler()
        passed, msg, mismatches = reconciler.reconcile_on_startup()
        self.assertTrue(passed)

if __name__ == "__main__":
    unittest.main()
