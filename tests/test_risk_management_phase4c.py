import pytest
from dashboard import app
import src.db as db

@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

def test_risk_overview_endpoint(client):
    res = client.get("/api/risk/overview")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "success"
    ov = data["overview"]
    assert "account_balance" in ov
    assert "available_capital" in ov
    assert "margin_used" in ov
    assert "risk_score" in ov
    assert "risk_status" in ov
    assert "score_factors" in ov
    assert isinstance(data["positions"], list)
    assert isinstance(data["heatmap"], list)

def test_risk_limits_endpoint(client):
    res = client.get("/api/risk-limits")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "success"
    assert data["max_daily_loss"] > 0
    assert data["max_position_size"] > 0
    assert data["max_open_positions"] >= 1

def test_risk_profiles_and_default_switch(client):
    res = client.get("/api/risk/profiles")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "success"
    profiles = data["profiles"]
    assert len(profiles) >= 3

    # Switch default profile
    p_id = profiles[0]["profile_id"]
    switch_res = client.post("/api/risk/profiles/default", json={"profile_id": p_id})
    assert switch_res.status_code == 200
    assert switch_res.get_json()["status"] == "success"

def test_risk_rules_and_toggle(client):
    res = client.get("/api/risk/rules")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "success"
    rules = data["rules"]
    assert len(rules) >= 1

    r_id = rules[0]["rule_id"]
    curr_state = rules[0]["is_enabled"]
    # Toggle state
    tog_res = client.post(f"/api/risk/rules/{r_id}/toggle", json={"enabled": not curr_state})
    assert tog_res.status_code == 200
    assert tog_res.get_json()["status"] == "success"

    # Restore state
    client.post(f"/api/risk/rules/{r_id}/toggle", json={"enabled": curr_state})

def test_position_sizing_and_what_if(client):
    sizing_payload = {
        "account_balance": 10000.0,
        "entry_price": 65000.0,
        "stop_loss_price": 63700.0,
        "method": "percent_equity",
        "risk_pct": 2.0,
        "leverage": 1.0,
    }
    s_res = client.post("/api/risk/position-size", json=sizing_payload)
    assert s_res.status_code == 200
    s_data = s_res.get_json()
    assert s_data["status"].upper() == "SUCCESS"
    assert s_data["position_quantity"] > 0
    assert s_data["risk_amount"] > 0

    what_if_payload = {
        "balance": 10000.0,
        "trade": {
            "entry_price": 65000.0,
            "stop_loss": 63700.0,
            "quantity": s_data["position_quantity"],
            "leverage": 1.0,
        },
        "positions": [],
    }
    wi_res = client.post("/api/risk/what-if", json=what_if_payload)

    assert wi_res.status_code == 200
    wi_data = wi_res.get_json()
    assert wi_data["status"] == "success"
    assert "current" in wi_data
    assert "after_trade" in wi_data
    assert "change" in wi_data
