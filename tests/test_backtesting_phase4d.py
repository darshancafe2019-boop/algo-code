import pytest
import json
import dashboard

@pytest.fixture
def client():
    dashboard.app.config["TESTING"] = True
    with dashboard.app.test_client() as client:
        yield client

def test_backtest_run_endpoint(client):
    """Test POST /api/backtest/run with standard parameters."""
    payload = {
        "symbol": "BTC/USDT",
        "timeframe": "5m",
        "start_date": "2024-01-01",
        "end_date": "2024-06-01",
        "strategy_name": "EMA_MACD_VP",
        "initial_cash": 10000.0,
        "allow_shorts": True
    }
    resp = client.post("/api/backtest/run", json=payload)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data.get("status") == "success"
    bt = data.get("backtest", {})
    assert "total_net_profit" in bt
    assert "return_pct" in bt
    assert "total_trades" in bt
    assert "win_rate_pct" in bt
    assert "max_drawdown_pct" in bt
    assert "sharpe_ratio" in bt

def test_backtest_deterministic_repeatability(client):
    """Test that running the backtest twice with identical inputs yields consistent results."""
    payload = {
        "symbol": "BTC/USDT",
        "timeframe": "5m",
        "start_date": "2024-01-01",
        "end_date": "2024-06-01",
        "strategy_name": "EMA_MACD_VP",
        "initial_cash": 10000.0
    }
    resp1 = client.post("/api/backtest/run", json=payload)
    resp2 = client.post("/api/backtest/run", json=payload)
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    bt1 = resp1.get_json().get("backtest", {})
    bt2 = resp2.get_json().get("backtest", {})
    assert bt1["total_net_profit"] == bt2["total_net_profit"]
    assert bt1["return_pct"] == bt2["return_pct"]
    assert bt1["total_trades"] == bt2["total_trades"]
    assert bt1["win_rate_pct"] == bt2["win_rate_pct"]
    assert bt1["max_drawdown_pct"] == bt2["max_drawdown_pct"]
    assert bt1["sharpe_ratio"] == bt2["sharpe_ratio"]

def test_backtest_strategy_config_and_profiles(client):
    """Test reading strategy configurations and indicator profiles for backtest setups."""
    strat_resp = client.get("/api/strategy/config")
    assert strat_resp.status_code == 200
    strat_data = strat_resp.get_json()
    assert strat_data.get("status") == "success"
    assert "config" in strat_data

    prof_resp = client.get("/api/indicators/profiles")
    assert prof_resp.status_code == 200
    prof_data = prof_resp.get_json()
    assert prof_data.get("status") == "success"
    assert len(prof_data.get("profiles", [])) > 0
