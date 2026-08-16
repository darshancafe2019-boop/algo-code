import pytest
import json
from dashboard import app, compute_analytics_payload

@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

def test_analytics_main_api(client):
    """Test main /api/analytics endpoint contract and data structures."""
    response = client.get("/api/analytics")
    assert response.status_code == 200
    data = response.get_json()
    assert data["success"] is True
    assert data["status"] == "success"
    assert "trade_summary" in data
    assert "charts" in data
    assert "equity_curve" in data
    assert "generated_at" in data
    assert "trade_count" in data

    summary = data["trade_summary"]
    assert "winning_count" in summary
    assert "losing_count" in summary
    assert "breakeven_count" in summary
    assert "win_rate_pct" in summary
    assert "total_pnl" in summary

    charts = data["charts"]
    assert "realized_pnl_by_symbol" in charts
    assert "win_loss_donut" in charts
    assert "open_closed_donut" in charts
    assert "strategy_winrate_donut" in charts
    assert "direction_donut" in charts
    assert "asset_class_donut" in charts
    assert "execution_mode_donut" in charts
    assert "strategy_combo" in charts
    assert "equity_curve" in charts

def test_analytics_win_loss_ratio(client):
    """Test win/loss ratio calculations from persistent closed trades."""
    res = client.get("/api/analytics/win-loss")
    assert res.status_code == 200
    json_data = res.get_json()
    assert json_data["success"] is True
    data = json_data["data"]
    assert "winning" in data
    assert "losing" in data
    assert "breakeven" in data
    assert "ratio_str" in data
    assert f"{data['winning']}:{data['losing']}" == data["ratio_str"]

def test_analytics_filters_endpoint(client):
    """Test dynamic filters choices returned from database."""
    res = client.get("/api/analytics/filters")
    assert res.status_code == 200
    json_data = res.get_json()
    assert json_data["success"] is True
    assert "bots" in json_data
    assert "strategies" in json_data
    assert "symbols" in json_data
    assert len(json_data["bots"]) > 0
    assert len(json_data["strategies"]) > 0
    assert len(json_data["symbols"]) > 0

def test_analytics_sub_endpoints(client):
    """Test all modular sub-endpoints."""
    endpoints = [
        "/api/analytics/summary",
        "/api/analytics/pnl-by-symbol",
        "/api/analytics/open-closed",
        "/api/analytics/strategy-performance",
        "/api/analytics/direction-bias",
        "/api/analytics/asset-class-distribution",
        "/api/analytics/execution-mode",
        "/api/analytics/equity-curve",
        "/api/analytics/drawdown",
        "/api/analytics/trade-history"
    ]
    for ep in endpoints:
        res = client.get(ep)
        assert res.status_code == 200, f"Endpoint {ep} failed with status {res.status_code}"
        json_data = res.get_json()
        assert json_data["success"] is True, f"Endpoint {ep} success key is not True"
        assert "data" in json_data

def test_analytics_filtering_queries(client):
    """Test filtering by bot_id, strategy, and symbol."""
    res_all = client.get("/api/analytics?bot_id=ALL&strategy=ALL&symbol=ALL")
    assert res_all.status_code == 200
    all_count = res_all.get_json()["trade_count"]

    res_btc = client.get("/api/analytics?symbol=BTC/USDT")
    assert res_btc.status_code == 200
    btc_data = res_btc.get_json()
    assert btc_data["success"] is True
    assert btc_data["trade_count"] <= all_count

def test_analytics_compute_payload_helper():
    """Direct test of backend compute_analytics_payload function."""
    payload = compute_analytics_payload()
    assert payload["success"] is True
    assert payload["trade_count"] >= 0
    assert "trade_summary" in payload
    assert "charts" in payload
