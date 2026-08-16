import unittest
import sqlite3
import json
from datetime import datetime, timezone
from pathlib import Path

from src import db, audit
from clean_leftover_test_bots import clean_test_bot_instances, PRESERVED_CORE_BOT_IDS


class TestCleanupBotInstances(unittest.TestCase):
    def setUp(self):
        db.init_db()
        now_str = datetime.now(timezone.utc).isoformat()

        conn = db.get_connection()
        c = conn.cursor()

        # 1. Valid production core bot (bot-1)
        c.execute(
            "INSERT OR REPLACE INTO bot_instances (id, name, symbol, strategy, timeframe, execution_mode, status, is_deleted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
            ("bot-1", "Alpha BTC Scalper", "BTC/USDT", "EMA_MACD_VP", "5m", "PAPER", "RUNNING", now_str)
        )

        # 2. Live trading bot (bot-live-protected)
        c.execute(
            "INSERT OR REPLACE INTO bot_instances (id, name, symbol, strategy, timeframe, execution_mode, status, is_deleted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
            ("bot-live-protected", "Live Production Bot", "BTC/USDT", "EMA_MACD_VP", "15m", "LIVE", "STOPPED", now_str)
        )

        # 3. Running bot (bot-running-protected)
        c.execute(
            "INSERT OR REPLACE INTO bot_instances (id, name, symbol, strategy, timeframe, execution_mode, status, is_deleted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
            ("bot-running-protected", "Running Paper Bot", "ETH/USDT", "EMA_MACD_VP", "15m", "PAPER", "RUNNING", now_str)
        )

        # 4. Bot with open position (bot-open-position)
        c.execute(
            "INSERT OR REPLACE INTO bot_instances (id, name, symbol, strategy, timeframe, execution_mode, status, open_position_count, is_deleted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?)",
            ("bot-open-position", "Position Active Bot", "SOL/USDT", "EMA_MACD_VP", "15m", "PAPER", "STOPPED", now_str)
        )
        c.execute(
            "INSERT OR REPLACE INTO trades_log (id, bot_id, symbol, direction, entry_price, stop_loss, take_profit, position_size, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (99991, "bot-open-position", "SOL/USDT", "LONG", 150.0, 145.0, 160.0, 1.0, "OPEN", now_str)
        )

        # 5. Disposable test bot (bot-test-disposable-1)
        c.execute(
            "INSERT OR REPLACE INTO bot_instances (id, name, symbol, strategy, timeframe, execution_mode, status, is_deleted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
            ("bot-test-disposable-1", "Test Bot Sandbox", "BTC/USDT", "EMA_MACD_VP", "5m", "PAPER", "STOPPED", now_str)
        )
        # Attach historical trade and audit event
        c.execute(
            "INSERT OR REPLACE INTO trades_log (id, bot_id, symbol, direction, entry_price, stop_loss, take_profit, position_size, result_pnl, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (99992, "bot-test-disposable-1", "BTC/USDT", "LONG", 64000.0, 63000.0, 66000.0, 0.1, 150.0, "CLOSED", now_str)
        )
        c.execute(
            "INSERT OR REPLACE INTO bot_event_audit (id, event_id, bot_instance_id, event_type, severity, message, local_timestamp, timestamp_utc, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (99992, "evt-99992", "bot-test-disposable-1", "BOT_STARTED", "INFO", "Started test bot", now_str, now_str, now_str)
        )

        conn.commit()
        conn.close()

    def tearDown(self):
        conn = db.get_connection()
        c = conn.cursor()
        c.execute("DELETE FROM bot_instances WHERE id IN ('bot-live-protected', 'bot-running-protected', 'bot-open-position', 'bot-test-disposable-1')")
        c.execute("DELETE FROM trades_log WHERE id IN (99991, 99992)")
        c.execute("DELETE FROM bot_event_audit WHERE id = 99992")
        conn.commit()
        conn.close()

    def test_dry_run_mode_does_not_modify_database(self):
        """Test dry-run mode leaves all bot instances untouched."""
        clean_test_bot_instances(False)

        conn = db.get_connection()
        res = conn.execute("SELECT COALESCE(is_deleted, 0) FROM bot_instances WHERE id = 'bot-test-disposable-1'").fetchone()
        conn.close()

        self.assertEqual(res[0], 0, "Dry-run mode modified database!")

    def test_protected_bots_are_not_deleted(self):
        """Test core whitelist, live, running, and open position bots are protected from soft-deletion."""
        clean_test_bot_instances(True)

        conn = db.get_connection()
        for protected_id in ["bot-1", "bot-live-protected", "bot-running-protected", "bot-open-position"]:
            res = conn.execute("SELECT COALESCE(is_deleted, 0) FROM bot_instances WHERE id = ?", (protected_id,)).fetchone()
            self.assertEqual(res[0], 0, f"Protected bot '{protected_id}' was illegally soft-deleted!")
        conn.close()

    def test_test_bot_soft_deletion_and_historical_preservation(self):
        """Test disposable test bot is soft-deleted while historical trade and audit records remain intact."""
        clean_test_bot_instances(True)

        conn = db.get_connection()
        # Verify bot soft-deleted
        bot_res = conn.execute("SELECT is_deleted, deleted_by, deletion_reason FROM bot_instances WHERE id = 'bot-test-disposable-1'").fetchone()
        self.assertEqual(bot_res[0], 1, "Test bot was not soft-deleted!")
        self.assertEqual(bot_res[1], "cleanup_script")

        # Verify historical trade record preserved
        trade_res = conn.execute("SELECT status, result_pnl FROM trades_log WHERE id = 99992").fetchone()
        self.assertIsNotNone(trade_res, "Historical trade record was illegally deleted!")
        self.assertEqual(trade_res[0], "CLOSED")
        self.assertEqual(trade_res[1], 150.0)

        # Verify historical audit event preserved
        audit_res = conn.execute("SELECT event_type FROM bot_event_audit WHERE id = 99992").fetchone()
        self.assertIsNotNone(audit_res, "Historical audit record was illegally deleted!")

        # Verify cleanup audit event inserted
        cleanup_audit = conn.execute("SELECT event_type, bot_instance_id FROM bot_event_audit WHERE event_type = 'BOT_INSTANCE_CLEANUP' AND bot_instance_id = 'bot-test-disposable-1'").fetchone()
        self.assertIsNotNone(cleanup_audit, "Cleanup audit event was not recorded!")
        conn.close()

    def test_idempotency_of_cleanup(self):
        """Test running cleanup twice is completely idempotent."""
        clean_test_bot_instances(True)
        clean_test_bot_instances(True)

        conn = db.get_connection()
        bot_res = conn.execute("SELECT is_deleted FROM bot_instances WHERE id = 'bot-test-disposable-1'").fetchone()
        self.assertEqual(bot_res[0], 1)
        conn.close()


if __name__ == "__main__":
    unittest.main()

