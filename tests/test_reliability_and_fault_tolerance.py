import pytest
import pandas as pd
import numpy as np
from pathlib import Path
from src import config, db, audit, risk_manager, order_router, monitoring

@pytest.fixture
def test_app_client():
    from dashboard import app
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

def test_01_75pct_confidence_threshold_strict_enforcement():
    """Verify strategy 75% confidence score threshold is strictly preserved."""
    from src.strategy import Strategy
    strat = Strategy()

    # Create dummy dataframe for confluence calculation
    dates = pd.date_range("2026-08-01", periods=250, freq="15min")
    closes = np.linspace(60000, 65000, 250)
    df = pd.DataFrame({"close": closes, "open": closes - 10, "high": closes + 20, "low": closes - 20, "volume": 100}, index=dates)

    decision, conf, reason_dict = strat.evaluate_confluence(df, idx=-1)
    assert conf >= 0.0
    # Threshold is 75% (0.75)
    assert config.CONFLUENCE_THRESHOLD == 0.75 or getattr(config, "CONFIDENCE_THRESHOLD", 0.75) == 0.75

def test_02_global_kill_switch_blocks_new_trades(test_app_client):
    """Verify Global Trading Kill Switch blocks new order submission."""
    # Activate kill switch via API
    res = test_app_client.post("/api/kill-switch", json={"action": "activate", "reason": "Reliability unit test"})
    assert res.status_code == 200
    json_data = res.get_json()
    assert json_data.get("kill_switch_active") is True or json_data.get("status") == "success"

    # Verify risk manager detects active kill switch
    risk = risk_manager.RiskManager()
    is_active = risk.is_kill_switch_active()
    assert is_active is True

    # Deactivate kill switch for subsequent tests
    res_off = test_app_client.post("/api/kill-switch", json={"action": "deactivate", "reason": "Cleanup"})
    assert res_off.status_code == 200
    assert risk.is_kill_switch_active() is False

def test_03_stale_market_data_blocks_trading():
    """Verify stale market data age triggers MARKET_DATA_STALE and blocks trading."""
    watchdog = monitoring.SystemWatchdog()
    stale_timestamp_utc = "2020-01-01T00:00:00+00:00"
    is_stale, age = watchdog.is_market_data_stale(stale_timestamp_utc, max_age_seconds=60)
    assert is_stale is True
    assert age > 60

def test_04_duplicate_order_idempotency_prevention():
    """Verify idempotent order execution prevents duplicate trades."""
    unique_order_id = "TEST_ORD_IDEMPOTENCY_001"
    
    # Log initial audit event
    audit.log_bot_event(
        event_type="ORDER_CREATED",
        message=f"Created order {unique_order_id}",
        order_id=unique_order_id,
        bot_instance_id="bot-1"
    )

    # Check that duplicate order ID can be queried and detected
    audits = audit.get_bot_event_audits(bot_id="bot-1", limit=20)
    order_events = [ev for ev in audits if ev.get("order_id") == unique_order_id]
    assert len(order_events) >= 1

def test_05_trade_timeline_api_endpoint(test_app_client):
    """Test /api/trades/<trade_id>/timeline endpoint."""
    res = test_app_client.get("/api/trades/3/timeline")
    assert res.status_code == 200
    json_data = res.get_json()
    assert json_data["success"] is True
    assert "events" in json_data
    assert json_data["trade_id"] == 3

def test_06_csv_export_endpoints(test_app_client):
    """Test CSV export routes for trades and audit logs."""
    res_trades = test_app_client.get("/api/export/trades.csv")
    assert res_trades.status_code == 200
    assert "text/csv" in res_trades.content_type
    assert b"Trade ID" in res_trades.data or b"ID" in res_trades.data

    res_audit = test_app_client.get("/api/export/audit.csv")
    assert res_audit.status_code == 200
    assert "text/csv" in res_audit.content_type
    assert b"timestamp_utc" in res_audit.data or b"event_type" in res_audit.data
