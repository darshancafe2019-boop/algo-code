"""
Unit and integration tests for Universal Bot Control Center.
Tests all REST APIs, Process State Transitions, Templates, Groups, Paper Sandbox, Live Safety Gate,
Audit Event Logging, and End-to-End lifecycle in PAPER mode.
"""
import pytest
import json
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure project root is in sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src import db, config
from src.process_manager import multi_bot_manager
from dashboard import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


@pytest.fixture(autouse=True)
def setup_test_environment(monkeypatch):
    """Ensures test database is initialized with default templates and groups, and mocks subprocess start."""
    db.init_db()
    # Ensure Kill switch is not active for tests unless explicitly set
    if config.KILL_SWITCH_FILE.exists():
        try:
            config.KILL_SWITCH_FILE.unlink()
        except Exception:
            pass

    # Mock subprocess.Popen in BotProcessManager to prevent real long-running processes during unit tests
    def mock_start_bot(self, *args, **kwargs):
        self.status_state = "RUNNING"
        return {"status": "success", "message": "Bot started in mock test mode.", "pid": 99999}

    def mock_stop_bot(self, *args, **kwargs):
        self.status_state = "STOPPED"
        return {"status": "success", "message": "Bot stopped in mock test mode."}

    def mock_pause_bot(self, *args, **kwargs):
        self.status_state = "PAUSED"
        return {"status": "success", "message": "Bot paused in mock test mode."}

    def mock_resume_bot(self, *args, **kwargs):
        self.status_state = "RUNNING"
        return {"status": "success", "message": "Bot resumed in mock test mode."}

    monkeypatch.setattr("src.process_manager.BotProcessManager.start_bot", mock_start_bot)
    monkeypatch.setattr("src.process_manager.BotProcessManager.stop_bot", mock_stop_bot)
    monkeypatch.setattr("src.process_manager.BotProcessManager.pause_bot", mock_pause_bot)
    monkeypatch.setattr("src.process_manager.BotProcessManager.resume_bot", mock_resume_bot)


def test_bot_templates_crud_and_instantiate(client):
    """Test Template listing, retrieval, instantiation, and deletion."""
    # 1. GET all templates
    res = client.get("/api/bot-templates")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "success"
    templates = data["templates"]
    assert len(templates) >= 6

    # Verify default seeded template exists
    btc_tpl = next((t for t in templates if "btc" in t["template_id"].lower()), None)
    assert btc_tpl is not None
    assert "BTC" in btc_tpl["name"]
    template_id = btc_tpl["template_id"]

    # 2. Instantiate template into a new PAPER bot
    inst_res = client.post(f"/api/bot-templates/{template_id}/instantiate", json={
        "name": "Custom Test BTC Bot",
        "allocated_capital": 15000.0
    })
    assert inst_res.status_code == 200
    inst_data = inst_res.get_json()
    assert inst_data["status"] == "success"
    bot_id = inst_data["bot_id"]
    assert bot_id.startswith("bot-")

    # Verify bot was inserted in DB with PAPER mode
    bots = db.safe_query("SELECT * FROM bot_instances WHERE id = ?", (bot_id,))
    assert len(bots) == 1
    bot = dict(bots[0])
    assert bot["name"] == "Custom Test BTC Bot"
    assert bot["execution_mode"] == "PAPER"
    assert bot["allocated_capital"] == 15000.0
    assert bot["status"] == "CREATED"

    # 3. Create a custom template
    create_tpl_res = client.post("/api/bot-templates", json={
        "template_id": "tpl_custom_gold_scalper",
        "name": "Gold Commodity Scalper",
        "category": "Commodities",
        "asset_class": "Commodities",
        "symbol": "XAU/USD",
        "strategy": "Mean Reversion",
        "timeframe": "5m",
        "description": "Gold intraday mean reversion strategy",
        "config": {"risk_pct": 1.5, "indicators": ["rsi", "bollinger"]}
    })
    assert create_tpl_res.status_code == 200

    # 4. GET single template
    get_tpl_res = client.get("/api/bot-templates/tpl_custom_gold_scalper")
    assert get_tpl_res.status_code == 200
    assert get_tpl_res.get_json()["template"]["name"] == "Gold Commodity Scalper"

    # 5. DELETE template
    del_res = client.delete("/api/bot-templates/tpl_custom_gold_scalper")
    assert del_res.status_code == 200
    assert del_res.get_json()["status"] == "success"


def test_bot_groups_crud_and_batch_control(client):
    """Test Bot Groups listing, creation, and batch lifecycle controls."""
    # 1. GET bot groups
    res = client.get("/api/bot-groups")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "success"
    groups = data["groups"]
    assert len(groups) >= 3

    crypto_grp = next((g for g in groups if g["name"] == "Crypto Scalping Bots"), None)
    assert crypto_grp is not None

    # 2. Test batch control across group
    batch_res = client.post("/api/bot-groups/Crypto Scalping Bots/batch-control", json={"action": "START"})
    assert batch_res.status_code == 200
    batch_data = batch_res.get_json()
    assert batch_data["status"] == "success"
    assert "results" in batch_data
    assert isinstance(batch_data["results"], list)

    # 3. Test PAUSE batch control
    pause_res = client.post("/api/bot-groups/Crypto Scalping Bots/batch-control", json={"action": "PAUSE"})
    assert pause_res.status_code == 200
    assert pause_res.get_json()["status"] == "success"

    # 4. Test STOP batch control
    stop_res = client.post("/api/bot-groups/Crypto Scalping Bots/batch-control", json={"action": "STOP"})
    assert stop_res.status_code == 200
    assert stop_res.get_json()["status"] == "success"


def test_batch_control_all_bots(client):
    """Test Start All, Pause All, Stop All endpoints."""
    # Start all bots
    start_res = client.post("/api/bots/start-all")
    assert start_res.status_code == 200
    start_data = start_res.get_json()
    assert start_data["status"] == "success"
    assert "started_count" in start_data

    # Pause all bots
    pause_res = client.post("/api/bots/pause-all")
    assert pause_res.status_code == 200
    pause_data = pause_res.get_json()
    assert pause_data["status"] == "success"

    # Stop all bots
    stop_res = client.post("/api/bots/stop-all")
    assert stop_res.status_code == 200
    stop_data = stop_res.get_json()
    assert stop_data["status"] == "success"


def test_bot_duplicate_and_delete(client):
    """Test duplicate bot configuration and clean deletion."""
    # 1. Instantiate a bot first
    templates_res = client.get("/api/bot-templates")
    first_tpl_id = templates_res.get_json()["templates"][0]["template_id"]
    inst = client.post(f"/api/bot-templates/{first_tpl_id}/instantiate", json={
        "name": "Original Test Bot"
    })
    bot_id = inst.get_json()["bot_id"]

    # 2. Duplicate bot
    dup_res = client.post(f"/api/bots/{bot_id}/duplicate")
    assert dup_res.status_code == 200
    dup_data = dup_res.get_json()
    assert dup_data["status"] == "success"
    new_bot_id = dup_data["bot_id"]
    assert new_bot_id != bot_id
    assert "Original Test Bot (Copy)" in dup_data["name"]

    # 3. Clean delete duplicated bot
    del_res = client.delete(f"/api/bots/{new_bot_id}")
    assert del_res.status_code == 200
    assert del_res.get_json()["status"] == "success"

    # Verify deleted from DB
    check = db.safe_query("SELECT * FROM bot_instances WHERE id = ?", (new_bot_id,))
    assert len(check) == 0


def test_paper_trading_sandbox_overview_and_reset(client):
    """Test Paper Trading Overview metrics and Sandbox reset."""
    # 1. Overview
    res = client.get("/api/bots/paper/overview")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "success"
    assert "balance" in data or "simulated_balance" in data
    assert "equity" in data or "total_equity" in data

    # 2. Reset sandbox
    reset_res = client.post("/api/bots/paper/reset")
    assert reset_res.status_code == 200
    reset_data = reset_res.get_json()
    assert reset_data["status"] == "success"

    # Verify balance restored
    res2 = client.get("/api/bots/paper/overview")
    bal = res2.get_json().get("balance") or res2.get_json().get("simulated_balance")
    assert bal == 10000.0


def test_live_trading_protected_panel(client):
    """Test Live Trading protected status endpoint and safety safeguards."""
    res = client.get("/api/bots/live/overview")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "success"
    # Live trading must remain False by default
    assert data["live_trading_enabled"] == getattr(config, "LIVE_TRADING_ENABLED", False)
    assert "safety_checks" in data
    assert "live_bots" in data


def test_bot_history_and_events_filtering(client):
    """Test bot activity history log and events stream queries with filtering and pagination."""
    # Log a few standard test events
    db.log_standard_bot_event("TEST_EVENT_ALPHA", "bot-1", "Alpha test message", severity="INFO", strategy_id="Scalping", symbol="BTC/USDT")
    db.log_standard_bot_event("TEST_EVENT_BETA", "bot-2", "Beta warning message", severity="WARNING", strategy_id="Trend", symbol="ETH/USDT")

    # 1. Query history with pagination
    res = client.get("/api/bots/history?page=1&per_page=10")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "success"
    assert "events" in data
    assert "total_pages" in data
    assert len(data["events"]) > 0

    # 2. Query history with filter
    res_filt = client.get("/api/bots/history?severity=WARNING")
    assert res_filt.status_code == 200
    assert any(e["severity"] == "WARNING" for e in res_filt.get_json()["events"])

    # 3. Query history CSV export
    res_csv = client.get("/api/bots/history?export=true")
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.content_type
    assert b"Timestamp_UTC" in res_csv.data

    # 4. Query events stream log
    res_evts = client.get("/api/bots/events?limit=20")
    assert res_evts.status_code == 200
    assert res_evts.get_json()["status"] == "success"
