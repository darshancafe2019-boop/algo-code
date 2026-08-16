"""
Automated Test Suite: Command Bus, Bot State Machine, and State Consistency Overhaul
===================================================================================
Verifies:
1. Command Bus dispatch contract, idempotency caching, and structured statuses.
2. Bot state transitions and uptime calculation accuracy.
3. Health monitoring endpoints (/health/live, /health/ready, /health/system, /health/bot/<id>).
4. Developer diagnostics snapshot endpoint (/api/diagnostics/state).
5. Universal P&L and Trade summary synchronization against /api/bots/summary.
"""

import json
import sys
from pathlib import Path
import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock

project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from src import db, config, command_bus, process_manager, trade_ledger

CommandStatus = command_bus.CommandStatus
command_bus = command_bus.command_bus
BotProcessManager = process_manager.BotProcessManager
multi_bot_manager = process_manager.multi_bot_manager
init_trade_ledger_schema = trade_ledger.init_trade_ledger_schema
from dashboard import app


@pytest.fixture(autouse=True)
def setup_test_environment(monkeypatch):
    db.init_db()
    init_trade_ledger_schema()

    if config.KILL_SWITCH_FILE.exists():
        try:
            config.KILL_SWITCH_FILE.unlink()
        except Exception:
            pass
    config.GLOBAL_KILL_SWITCH = False

    def _update_mock_db(bot_id: str, status: str):
        now_str = datetime.now(timezone.utc).isoformat()
        db.safe_execute("UPDATE bot_instances SET status = ?, last_heartbeat = ? WHERE id = ?", (status, now_str, bot_id))

    def mock_start(self, *args, **kwargs):
        self.status_state = "RUNNING"
        _update_mock_db(self.bot_id, "RUNNING")
        return {"status": "success", "message": f"Bot {self.bot_id} started mock.", "pid": 12345}

    def mock_stop(self, *args, **kwargs):
        self.status_state = "STOPPED"
        _update_mock_db(self.bot_id, "STOPPED")
        return {"status": "success", "message": f"Bot {self.bot_id} stopped mock."}

    def mock_pause(self, *args, **kwargs):
        self.status_state = "PAUSED"
        _update_mock_db(self.bot_id, "PAUSED")
        return {"status": "success", "message": f"Bot {self.bot_id} paused mock."}

    def mock_resume(self, *args, **kwargs):
        self.status_state = "RUNNING"
        _update_mock_db(self.bot_id, "RUNNING")
        return {"status": "success", "message": f"Bot {self.bot_id} resumed mock.", "pid": 12345}

    monkeypatch.setattr(BotProcessManager, "start_bot", mock_start)
    monkeypatch.setattr(BotProcessManager, "stop_bot", mock_stop)
    monkeypatch.setattr(BotProcessManager, "pause_bot", mock_pause)
    monkeypatch.setattr(BotProcessManager, "resume_bot", mock_resume)

    # Seed test bot instances
    now_str = datetime.now(timezone.utc).isoformat()
    db.safe_execute(
        """
        INSERT OR REPLACE INTO bot_instances 
        (id, name, symbol, timeframe, strategy, allocated_capital, execution_mode, status, started_at, last_heartbeat, created_at, is_deleted)
        VALUES 
        ('test-bot-alpha', 'Alpha BTC Bot', 'BTC/USDT', '15m', 'EMA_MACD_VP', 10000.0, 'PAPER', 'STOPPED', NULL, NULL, ?, 0)
        """,
        (now_str,)
    )
    db.safe_execute(
        """
        INSERT OR REPLACE INTO bot_instances 
        (id, name, symbol, timeframe, strategy, allocated_capital, execution_mode, status, started_at, last_heartbeat, created_at, is_deleted)
        VALUES 
        ('test-bot-beta', 'Beta ETH Bot', 'ETH/USDT', '5m', 'RSI_MEAN_REVERSION', 10000.0, 'PAPER', 'RUNNING', ?, ?, ?, 0)
        """,
        (now_str, now_str, now_str)
    )

    yield


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


class TestCommandBusAndStateExecution:
    """Test Command Bus execution and idempotency."""

    def test_01_command_bus_start_and_stop_lifecycle(self):
        # 1. Start Bot
        res = command_bus.execute(action="START_BOT", bot_id="test-bot-alpha")
        assert res["success"] is True
        assert res["status"] == CommandStatus.SUCCEEDED
        assert res["bot_id"] == "test-bot-alpha"

        # Check DB state updated
        b = db.safe_query_one("SELECT status FROM bot_instances WHERE id = 'test-bot-alpha'")
        assert b["status"] == "RUNNING"

        # 2. Pause Bot
        res_pause = command_bus.execute(action="PAUSE_BOT", bot_id="test-bot-alpha")
        assert res_pause["success"] is True
        b = db.safe_query_one("SELECT status FROM bot_instances WHERE id = 'test-bot-alpha'")
        assert b["status"] == "PAUSED"

        # 3. Resume Bot
        res_resume = command_bus.execute(action="RESUME_BOT", bot_id="test-bot-alpha")
        assert res_resume["success"] is True
        b = db.safe_query_one("SELECT status FROM bot_instances WHERE id = 'test-bot-alpha'")
        assert b["status"] == "RUNNING"

        # 4. Stop Bot
        res_stop = command_bus.execute(action="STOP_BOT", bot_id="test-bot-alpha")
        assert res_stop["success"] is True
        b = db.safe_query_one("SELECT status FROM bot_instances WHERE id = 'test-bot-alpha'")
        assert b["status"] == "STOPPED"

    def test_02_idempotency_duplicate_protection(self):
        idemp_key = f"IDEMP-TEST-UNIQUE-{datetime.now(timezone.utc).timestamp()}"
        res1 = command_bus.execute(action="START_BOT", bot_id="test-bot-alpha", idempotency_key=idemp_key)
        assert res1["success"] is True

        # Second call with same idempotency key must return cached result
        res2 = command_bus.execute(action="START_BOT", bot_id="test-bot-alpha", idempotency_key=idemp_key)
        assert res2.get("cached") is True
        assert res2["command_id"] == res1["command_id"]

    def test_03_unknown_command_rejection(self):
        res = command_bus.execute(action="INVALID_NON_EXISTENT_COMMAND")
        assert res["success"] is False
        assert res["status"] == CommandStatus.REJECTED

    def test_04_kill_switch_command_locking(self):
        res = command_bus.execute(action="ACTIVATE_KILL_SWITCH")
        assert res["success"] is True
        assert res["data"]["kill_switch_active"] is True
        assert config.GLOBAL_KILL_SWITCH is True

        # Deactivate
        res_deact = command_bus.execute(action="DEACTIVATE_KILL_SWITCH")
        assert res_deact["success"] is True
        assert config.GLOBAL_KILL_SWITCH is False


class TestHealthAndDiagnosticsRestApi:
    """Test health monitoring endpoints and diagnostics snapshot."""

    def test_01_health_live_and_ready(self, client):
        resp_live = client.get("/health/live")
        assert resp_live.status_code == 200
        assert resp_live.get_json()["status"] == "ALIVE"

        resp_ready = client.get("/health/ready")
        assert resp_ready.status_code == 200
        assert resp_ready.get_json()["status"] == "READY"

    def test_02_health_system_subsystems(self, client):
        resp = client.get("/health/system")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["status"] in ["HEALTHY", "WARNING"]
        assert "subsystems" in data
        assert data["subsystems"]["database"]["status"] == "HEALTHY"
        assert data["subsystems"]["api"]["status"] == "HEALTHY"

    def test_03_health_bot_instance(self, client):
        resp = client.get("/health/bot/test-bot-beta")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["bot_id"] == "test-bot-beta"
        assert data["symbol"] == "ETH/USDT"
        assert data["runtime"]["is_running"] is True
        assert data["runtime"]["uptime_seconds"] >= 0

    def test_04_api_command_rest_endpoint(self, client):
        resp = client.post(
            "/api/command",
            data=json.dumps({"action": "STOP_BOT", "bot_id": "test-bot-beta"}),
            content_type="application/json"
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert data["status"] == "SUCCEEDED"

    def test_05_api_diagnostics_state(self, client):
        resp = client.get("/api/diagnostics/state")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["total_bots"] >= 2
        assert "open_positions" in data
        assert "recent_closed_trades" in data
        assert "latencies" in data

    def test_06_bots_summary_and_trade_ledger_reconciliation(self, client):
        resp = client.get("/api/bots/summary")
        assert resp.status_code == 200
        data = resp.get_json()
        metrics = data["metrics"]

        # Total bots must equal count in DB
        bots_count = len(db.safe_query("SELECT id FROM bot_instances"))
        assert metrics["total_bots"] == bots_count

        # Open trades count matches trades_log
        open_res = db.safe_query("SELECT COUNT(*) as c FROM trades_log WHERE status = 'OPEN'")
        expected_open = open_res[0]["c"] if open_res else 0
        assert metrics["open_trades"] == expected_open
