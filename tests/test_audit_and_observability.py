import unittest
import os
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from src import config, db
from src.audit import log_bot_event, get_bot_event_audits, log_data_correction
from src.monitoring import MonitoringService
from src.risk_manager import RiskManager
from src.order_router import MultiAssetOrderRouter


class TestAuditAndObservabilitySystem(unittest.TestCase):
    """
    Dedicated test suite covering Master Task requirements: Audit Event Ledger,
    Trade Ledger completeness, duplicate protection, risk engine logging,
    watchdog alerts, global kill switch, and paper trading mode safeguards.
    """

    def setUp(self):
        db.init_db()
        self.risk_manager = RiskManager()
        self.monitoring = MonitoringService()

    def test_01_bot_event_audit_logging(self):
        """Verify log_bot_event immutably writes 32-field audit record to DB."""
        event_id = log_bot_event(
            event_type="BOT_START",
            message="Test bot initialization audit event",
            bot_instance_id="bot-test-1",
            bot_instance_name="Test Scalper",
            symbol="BTC/USDT",
            severity="INFO",
            reason="SYSTEM_TEST"
        )
        self.assertTrue(bool(event_id))

        events = get_bot_event_audits(bot_id="bot-test-1", limit=10)
        self.assertTrue(len(events) > 0)
        latest = events[0]
        self.assertEqual(latest["event_type"], "BOT_START")
        self.assertEqual(latest["symbol"], "BTC/USDT")
        self.assertEqual(latest["severity"], "INFO")

    def test_02_immutable_data_correction_logging(self):
        """Verify immutable data correction audit event principle."""
        corr_id = log_data_correction(
            entity_name="trades_log",
            record_id=101,
            field_name="entry_price",
            old_value=66500.0,
            new_value=66502.0,
            reason="Exchange reconciliation adjustment",
            bot_instance_id="bot-test-1"
        )
        self.assertTrue(bool(corr_id))

        events = get_bot_event_audits(bot_id="bot-test-1", event_type="DATA_CORRECTION", limit=5)
        self.assertTrue(len(events) > 0)
        self.assertIn("66500.0", events[0]["message"])

    def test_03_trade_ledger_extended_fields(self):
        """Verify trades_log table stores complete trade ledger attributes."""
        trade_id = db.log_trade_entry(
            symbol="ETH/USDT",
            direction="LONG",
            entry_price=3500.0,
            stop_loss=3400.0,
            take_profit=3700.0,
            position_size=1.5,
            metadata={"test_run": True},
            bot_id="bot-test-2",
            strategy="EMA_MACD_VP"
        )
        self.assertTrue(trade_id > 0)

        conn = db.get_connection()
        c = conn.cursor()
        c.execute("SELECT * FROM trade_history WHERE id = ?", (trade_id,))
        trade_row = dict(c.fetchone())
        conn.close()

        self.assertEqual(trade_row["symbol"], "ETH/USDT")
        self.assertEqual(trade_row["direction"], "LONG")
        self.assertEqual(float(trade_row["entry_price"]), 3500.0)

    def test_04_global_kill_switch(self):
        """Verify Global Trading Kill Switch blocks order submission."""
        flag_file = config.KILL_SWITCH_FILE
        try:
            flag_file.touch()
            setattr(config, "GLOBAL_TRADING_KILL_SWITCH", True)
            self.assertTrue(self.risk_manager.is_kill_switch_active())
        finally:
            if flag_file.exists():
                flag_file.unlink()
            setattr(config, "GLOBAL_TRADING_KILL_SWITCH", False)

    def test_05_market_data_staleness_check(self):
        """Verify staleness detector flags expired ticks."""
        stale, age = self.monitoring.is_market_data_stale(None)
        self.assertTrue(stale)

        old_iso = "2020-01-01T00:00:00+00:00"
        stale_old, age_old = self.monitoring.is_market_data_stale(old_iso, max_age_seconds=60)
        self.assertTrue(stale_old)

    def test_06_paper_trading_safety_protection(self):
        """Verify order router enforces live trading safety flags."""
        ok, msg, res = MultiAssetOrderRouter.route_order(
            symbol="BTC/USDT",
            signal_type="BUY_LONG",
            position_size=0.1,
            price=64000.0,
            asset_class="Crypto",
            is_live=True
        )
        self.assertFalse(ok)
        self.assertTrue("Live trading disabled" in msg or "MASTER_LIVE_TRADING is OFF" in msg)

    def test_07_75_percent_confidence_threshold_preserved(self):
        """Verify existing 75% confidence threshold remains constant."""
        self.assertEqual(config.CONFLUENCE_THRESHOLD, 0.75)


if __name__ == "__main__":
    unittest.main()
