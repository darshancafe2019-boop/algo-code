import pytest
import json
import dashboard

@pytest.fixture
def client():
    dashboard.app.config["TESTING"] = True
    with dashboard.app.test_client() as client:
        yield client

def test_api_logs_standard(client):
    """Test GET /api/logs default endpoint."""
    resp = client.get("/api/logs")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data.get("status") == "success"
    assert "log_count" in data
    assert "logs" in data
    assert "system_errors" in data

def test_api_logs_filtering(client):
    """Test GET /api/logs with level filter and limit."""
    resp = client.get("/api/logs?level=INFO&limit=25")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data.get("status") == "success"

def test_api_logs_diagnostic_report(client):
    """Test GET /api/logs/diagnostic_report."""
    resp = client.get("/api/logs/diagnostic_report")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data.get("status") == "success"
    assert "report" in data
    assert "BTC ALGO TRADING BOT DIAGNOSTIC REPORT" in data["report"]

def test_api_audit_events_and_filtering(client):
    """Test GET /api/audit/events and severity filter."""
    resp = client.get("/api/audit/events?limit=50")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data.get("status") == "success"
    assert "events" in data
    assert "count" in data

    resp_info = client.get("/api/audit/events?severity=INFO&limit=20")
    assert resp_info.status_code == 200
    data_info = resp_info.get_json()
    assert data_info.get("status") == "success"

def test_api_audit_export_csv(client):
    """Test GET /api/audit/export-csv."""
    resp = client.get("/api/audit/export-csv")
    assert resp.status_code == 200
    assert resp.content_type.startswith("text/csv") or "csv" in resp.headers.get("Content-Disposition", "")

def test_api_diagnostics_state(client):
    """Test GET /api/diagnostics/state snapshot."""
    resp = client.get("/api/diagnostics/state")
    assert resp.status_code == 200
    data = resp.get_json()
    assert "timestamp" in data
    assert "total_bots" in data
    assert "open_positions" in data
    assert "latencies" in data
    lat = data["latencies"]
    assert "status" in lat
    assert "total_execution_latency" in lat
