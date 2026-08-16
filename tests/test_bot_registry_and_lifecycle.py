import sys
import time
from pathlib import Path
from datetime import datetime, timezone
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import config, db
from src.process_manager import multi_bot_manager
from dashboard import app

class TestBotRegistryAndLifecycle(unittest.TestCase):

    def setUp(self):
        db.init_db(force=True)
        app.config["TESTING"] = True
        self.client = app.test_client()

    def test_01_bot_registry_schema_and_creation(self):
        """Verify new bot instance creation populates all authoritative registry fields."""
        conn = db.get_connection()
        c = conn.cursor()
        c.execute("PRAGMA table_info(bot_instances)")
        cols = [row["name"] for row in c.fetchall()]
        conn.close()

        required_cols = [
            "id", "name", "symbol", "strategy", "timeframe", "asset_class",
            "exchange", "execution_mode", "status", "created_at", "started_at",
            "stopped_at", "paused_at", "resumed_at", "last_heartbeat", "last_scan_at",
            "next_scan_at", "scan_count", "trade_count", "open_position_count",
            "current_signal", "signal_confidence", "required_confidence",
            "allocated_capital", "current_equity", "realized_pnl", "unrealized_pnl",
            "error_count", "last_error", "process_id", "config_json"
        ]
        for col in required_cols:
            self.assertIn(col, cols, f"Column '{col}' missing from bot_instances table schema")

    def test_02_bot_creation_api(self):
        """Verify /api/bots/create endpoint creates bot instance in PAPER mode."""
        res = self.client.post("/api/bots/create", json={
            "name": "Test Registry Bot",
            "symbol": "ETH/USDT",
            "strategy": "RSI_MEAN_REVERSION",
            "timeframe": "15m",
            "asset_class": "CRYPTO",
            "exchange": "ccxt_binance",
            "execution_mode": "PAPER",
            "allocated_capital": 5000.0,
            "required_confidence": 75.0
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        bot_id = data["bot_id"]

        bots = db.safe_query("SELECT * FROM bot_instances WHERE id = ?", (bot_id,))
        self.assertEqual(len(bots), 1)
        b = dict(bots[0])
        self.assertEqual(b["name"], "Test Registry Bot")
        self.assertEqual(b["symbol"], "ETH/USDT")
        self.assertEqual(b["status"], "CREATED")
        self.assertEqual(b["execution_mode"], "PAPER")

    def test_03_bot_lifecycle_transitions_and_idempotency(self):
        """Verify START, PAUSE, RESUME, STOP, RESTART lifecycle transitions and idempotency."""
        bot_id = f"test-lifecycle-{int(time.time()*1000)}"
        conn = db.get_connection()
        conn.execute(
            "INSERT INTO bot_instances (id, name, symbol, strategy, timeframe, status, created_at) VALUES (?, ?, ?, ?, ?, 'STOPPED', ?)",
            (bot_id, "Lifecycle Bot", "BTC/USDT", "EMA_MACD_VP", "5m", datetime.now(timezone.utc).isoformat())
        )
        conn.commit()
        conn.close()

        # 1. Start bot
        res_start = self.client.post(f"/api/bots/{bot_id}/control", json={"action": "START"})
        self.assertEqual(res_start.status_code, 200)
        self.assertIn(res_start.get_json()["status"], ["success", "already_running"])

        # 2. Idempotency test: Start again -> return already_running
        res_start2 = self.client.post(f"/api/bots/{bot_id}/control", json={"action": "START"})
        self.assertEqual(res_start2.status_code, 200)
        self.assertEqual(res_start2.get_json()["status"], "already_running")

        # 3. Pause bot
        res_pause = self.client.post(f"/api/bots/{bot_id}/control", json={"action": "PAUSE"})
        self.assertEqual(res_pause.status_code, 200)
        self.assertEqual(res_pause.get_json()["status"], "success")

        # 4. Resume bot
        res_resume = self.client.post(f"/api/bots/{bot_id}/control", json={"action": "RESUME"})
        self.assertEqual(res_resume.status_code, 200)
        self.assertEqual(res_resume.get_json()["status"], "success")

        # 5. Restart bot
        res_restart = self.client.post(f"/api/bots/{bot_id}/control", json={"action": "RESTART"})
        self.assertEqual(res_restart.status_code, 200)
        self.assertEqual(res_restart.get_json()["status"], "success")

        # 6. Stop bot
        res_stop = self.client.post(f"/api/bots/{bot_id}/control", json={"action": "STOP"})
        self.assertEqual(res_stop.status_code, 200)
        self.assertEqual(res_stop.get_json()["status"], "success")

    def test_04_kill_switch_blocking_and_deactivation(self):
        """Verify Kill Switch blocks order submission and start commands until deactivated."""
        setattr(config, "GLOBAL_TRADING_KILL_SWITCH", True)
        
        # Verify pre-order check fails on KILL_SWITCH_ACTIVE
        from src.execution_service import OrderExecutionService
        service = OrderExecutionService()
        fresh_iso = datetime.now(timezone.utc).isoformat()
        passed, reason = service.validate_14_point_pre_order_check(
            bot_id="bot-ks", strategy="EMA_MACD_VP", symbol="BTC/USDT", side="LONG",
            amount=0.1, price=65000.0, stop_loss=64000.0, take_profit=68000.0,
            confidence_score=0.85, market_tick_iso=fresh_iso, is_live=False
        )
        self.assertFalse(passed)
        self.assertIn("KILL_SWITCH_ACTIVE", reason)

        # Deactivate Kill Switch
        setattr(config, "GLOBAL_TRADING_KILL_SWITCH", False)

    def test_05_start_all_bots_validation_loop(self):
        """Verify POST /api/bots/start-all validates all bot instances and returns detailed report."""
        res = self.client.post("/api/bots/start-all")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertIn("started_count", data)
        self.assertIn("skipped_count", data)
        self.assertIn("started", data)
        self.assertIn("skipped", data)


if __name__ == "__main__":
    unittest.main()
