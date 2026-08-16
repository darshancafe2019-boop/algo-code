import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
import time
from datetime import datetime, timezone
from src import config, db
from src.execution_service import OrderExecutionService, order_execution_service

@pytest.fixture
def test_app_client():
    from dashboard import app
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

def test_01_live_order_blocked_when_live_trading_disabled():
    """Verify live order is blocked when LIVE_TRADING_ENABLED is False."""
    setattr(config, "TRADING_MODE", "LIVE")
    setattr(config, "LIVE_TRADING_ENABLED", False)
    setattr(config, "LIVE_TRADING_ARMED", True)
    setattr(config, "MASTER_LIVE_TRADING", True)

    service = OrderExecutionService()
    fresh_iso = datetime.now(timezone.utc).isoformat()
    passed, reason = service.validate_14_point_pre_order_check(
        bot_id="bot-t1", strategy="EMA_MACD_VP", symbol="BTC/USDT", side="LONG",
        amount=0.1, price=65000.0, stop_loss=64000.0, take_profit=68000.0,
        confidence_score=0.85, market_tick_iso=fresh_iso, is_live=True
    )
    assert passed is False
    assert "LIVE_TRADING_DISABLED" in reason

    setattr(config, "TRADING_MODE", "PAPER")

def test_02_live_order_blocked_when_disarmed():
    """Verify live order is blocked when LIVE_TRADING_ARMED is False even if ENABLED is True."""
    setattr(config, "TRADING_MODE", "LIVE")
    setattr(config, "LIVE_TRADING_ENABLED", True)
    setattr(config, "LIVE_TRADING_ARMED", False)
    setattr(config, "MASTER_LIVE_TRADING", True)

    service = OrderExecutionService()
    fresh_iso = datetime.now(timezone.utc).isoformat()
    passed, reason = service.validate_14_point_pre_order_check(
        bot_id="bot-t2", strategy="EMA_MACD_VP", symbol="BTC/USDT", side="LONG",
        amount=0.1, price=65000.0, stop_loss=64000.0, take_profit=68000.0,
        confidence_score=0.85, market_tick_iso=fresh_iso, is_live=True
    )
    assert passed is False
    assert "LIVE_TRADING_DISARMED" in reason

    setattr(config, "TRADING_MODE", "PAPER")
    setattr(config, "LIVE_TRADING_ENABLED", False)

def test_03_live_order_blocked_when_confidence_below_75pct():
    """Verify order is blocked when confidence score is below 75% threshold."""
    setattr(config, "LIVE_TRADING_ENABLED", False)
    setattr(config, "LIVE_TRADING_ARMED", False)

    service = OrderExecutionService()
    fresh_iso = datetime.now(timezone.utc).isoformat()
    passed, reason = service.validate_14_point_pre_order_check(
        bot_id="bot-t3", strategy="EMA_MACD_VP", symbol="BTC/USDT", side="LONG",
        amount=0.1, price=65000.0, stop_loss=64000.0, take_profit=68000.0,
        confidence_score=0.60, market_tick_iso=fresh_iso, is_live=False
    )
    assert passed is False
    assert "CONFIDENCE_BELOW_THRESHOLD" in reason

def test_04_live_order_blocked_when_market_data_stale():
    """Verify order is blocked when market data timestamp is stale."""
    service = OrderExecutionService()
    stale_iso = "2020-01-01T00:00:00+00:00"
    passed, reason = service.validate_14_point_pre_order_check(
        bot_id="bot-t4", strategy="EMA_MACD_VP", symbol="BTC/USDT", side="LONG",
        amount=0.1, price=65000.0, stop_loss=64000.0, take_profit=68000.0,
        confidence_score=0.85, market_tick_iso=stale_iso, is_live=False
    )
    assert passed is False
    assert "STALE_MARKET_DATA" in reason

def test_05_live_order_blocked_when_position_mismatch_locked():
    """Verify order is blocked when POSITION_MISMATCH_LOCKED is True."""
    setattr(config, "POSITION_MISMATCH_LOCKED", True)

    service = OrderExecutionService()
    fresh_iso = datetime.now(timezone.utc).isoformat()
    passed, reason = service.validate_14_point_pre_order_check(
        bot_id="bot-t5", strategy="EMA_MACD_VP", symbol="BTC/USDT", side="LONG",
        amount=0.1, price=65000.0, stop_loss=64000.0, take_profit=68000.0,
        confidence_score=0.85, market_tick_iso=fresh_iso, is_live=False
    )
    assert passed is False
    assert "POSITION_MISMATCH_LOCKED" in reason

    setattr(config, "POSITION_MISMATCH_LOCKED", False)

def test_06_live_order_blocked_when_kill_switch_active():
    """Verify order is blocked when Global Trading Kill Switch is active."""
    setattr(config, "GLOBAL_TRADING_KILL_SWITCH", True)

    service = OrderExecutionService()
    fresh_iso = datetime.now(timezone.utc).isoformat()
    passed, reason = service.validate_14_point_pre_order_check(
        bot_id="bot-t6", strategy="EMA_MACD_VP", symbol="BTC/USDT", side="LONG",
        amount=0.1, price=65000.0, stop_loss=64000.0, take_profit=68000.0,
        confidence_score=0.85, market_tick_iso=fresh_iso, is_live=False
    )
    assert passed is False
    assert "KILL_SWITCH_ACTIVE" in reason

    setattr(config, "GLOBAL_TRADING_KILL_SWITCH", False)

def test_07_paper_trading_order_execution_success():
    """Verify paper trading order executes safely when all 14 checks pass."""
    setattr(config, "GLOBAL_TRADING_KILL_SWITCH", False)
    setattr(config, "POSITION_MISMATCH_LOCKED", False)
    setattr(config, "TRADING_MODE", "PAPER")

    fresh_iso = datetime.now(timezone.utc).isoformat()
    service = OrderExecutionService()

    success, msg, result = service.execute_order(
        bot_id=f"bot-t7-{int(time.time()*1000)}", strategy="EMA_MACD_VP", symbol="BTC/USDT", side="LONG",
        amount=0.01, price=65000.0, stop_loss=64000.0, take_profit=68000.0,
        confidence_score=0.85, market_tick_iso=fresh_iso, is_live=False
    )
    assert success is True
    assert "Order executed successfully" in msg
    assert result["execution_mode"] == "PAPER"
    assert result["status"] == "FILLED"

def test_08_live_trading_arming_disarming_api(test_app_client):
    """Test server-side live trading arming and disarming endpoints."""
    res_disarm = test_app_client.post("/api/live-trading/disarm")
    assert res_disarm.status_code == 200
    assert res_disarm.get_json()["live_trading_armed"] is False
    assert getattr(config, "LIVE_TRADING_ARMED") is False

    res_gate = test_app_client.get("/api/execution-gate/status")
    assert res_gate.status_code == 200
    json_gate = res_gate.get_json()
    assert json_gate["live_trading_armed"] is False
    assert json_gate["trading_mode"] == "PAPER"
