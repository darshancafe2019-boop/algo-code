import pytest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import config, db
from src.trade_audit_engine import (
    generate_trade_ref_id,
    calculate_mae_mfe_r_multiple,
    check_trade_audit_integrity,
    build_trade_detail_payload
)

@pytest.fixture
def test_app_client():
    from dashboard import app
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

def test_01_trade_ref_id_formatting():
    """Verify trade_ref_id produces immutable human-readable reference IDs."""
    ref1 = generate_trade_ref_id(40, "2026-08-13T12:00:00Z")
    assert ref1 == "TRD-20260813-000040"

    ref2 = generate_trade_ref_id(123)
    assert "TRD-" in ref2
    assert "000123" in ref2

def test_02_mae_mfe_r_multiple_calculations():
    """Verify MAE, MFE, and R-multiple calculations."""
    # Long trade: Entry $65,000, SL $64,000 (Risk=$1,000), Exit $68,000 (Profit=$3,000)
    mae, mfe, r_mult = calculate_mae_mfe_r_multiple(
        entry_price=65000.0,
        stop_loss=64000.0,
        exit_price=68000.0,
        direction="LONG",
        price_highs=[65500.0, 67000.0, 68500.0],
        price_lows=[64800.0, 64600.0, 66000.0]
    )
    assert r_mult == 3.0
    assert mfe == 3500.0  # Max high (68500) - Entry (65000)
    assert mae == 400.0   # Entry (65000) - Min low (64600)

def test_03_audit_integrity_check():
    """Verify check_trade_audit_integrity returns structured status."""
    res = check_trade_audit_integrity(1)
    assert "status" in res
    assert "badge" in res
    assert "components" in res

def test_04_build_trade_detail_payload_11_categories():
    """Verify build_trade_detail_payload produces all 11 required category sections."""
    payload = build_trade_detail_payload(1)
    assert payload["success"] is True
    assert "overview" in payload
    assert "entry" in payload
    assert "signal" in payload
    assert "indicators" in payload
    assert "market" in payload
    assert "risk" in payload
    assert "order" in payload
    assert "position" in payload
    assert "exit" in payload
    assert "pnl" in payload
    assert "timeline" in payload
    assert "replay" in payload

def test_05_api_trades_v2_filtering_and_pagination(test_app_client):
    """Test /api/trades/v2 endpoint with server-side pagination and search."""
    res = test_app_client.get("/api/trades/v2?page=1&limit=10&status=ALL&sort_by=newest")
    assert res.status_code == 200
    json_data = res.get_json()
    assert json_data["status"] == "success"
    assert "page" in json_data
    assert "limit" in json_data
    assert "total_count" in json_data
    assert "trades" in json_data
    assert len(json_data["trades"]) <= 10

def test_06_api_trade_detail_and_replay_endpoints(test_app_client):
    """Test /api/trades/<trade_id>/detail and /api/trades/<trade_id>/replay REST routes."""
    res_detail = test_app_client.get("/api/trades/1/detail")
    assert res_detail.status_code == 200
    assert res_detail.get_json()["success"] is True

    res_replay = test_app_client.get("/api/trades/1/replay")
    assert res_replay.status_code == 200
    json_replay = res_replay.get_json()
    assert json_replay["success"] is True
    assert "replay_steps" in json_replay

def test_07_api_export_trade_audit_single(test_app_client):
    """Test downloadable JSON audit export endpoint."""
    res = test_app_client.get("/api/export/trade-audit/1")
    assert res.status_code == 200
    assert "application/json" in res.content_type
    assert b"overview" in res.data
