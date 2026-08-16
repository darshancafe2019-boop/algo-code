import sys
import json
from datetime import datetime, timezone

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from src import db, config
import dashboard

def test_global_health_summary_api():
    print("\n--- TEST 1: GLOBAL SYSTEM HEALTH SUMMARY API ---")
    app = dashboard.app
    client = app.test_client()
    
    # 1. Check healthy state
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("UPDATE bot_instances SET status = 'RUNNING' WHERE id = 'bot-1'")
    c.execute("UPDATE bot_instances SET status = 'STOPPED' WHERE id != 'bot-1'")
    conn.commit()
    conn.close()
    
    res = client.get("/api/status")
    assert res.status_code == 200, f"Expected 200 OK, got {res.status_code}"
    
    data = res.get_json()
    summary = data.get("system_summary", {})
    print("Healthy System Summary Payload:")
    print(json.dumps(summary, indent=2))
    
    assert summary["system_state"] == "HEALTHY", f"Expected HEALTHY, got {summary['system_state']}"
    assert "🟢 System Healthy" in summary["headline"], f"Expected '🟢 System Healthy' in headline, got '{summary['headline']}'"
    print("PASSED: Healthy state summary verified.")
    
    # 2. Check stalled warning state
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("UPDATE bot_instances SET status = 'STALLED' WHERE id = 'bot-1'")
    conn.commit()
    conn.close()
    
    res = client.get("/api/status")
    data = res.get_json()
    summary = data.get("system_summary", {})
    print("\nStalled Warning System Summary Payload:")
    print(json.dumps(summary, indent=2))
    
    assert summary["system_state"] == "WARNING", f"Expected WARNING, got {summary['system_state']}"
    assert "🟡 Warning" in summary["headline"], "Expected '🟡 Warning' in headline"
    print("PASSED: Stalled warning state summary verified.")
    
    # 3. Check critical error state
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("UPDATE bot_instances SET status = 'ERROR' WHERE id = 'bot-1'")
    conn.commit()
    conn.close()
    
    res = client.get("/api/status")
    data = res.get_json()
    summary = data.get("system_summary", {})
    print("\nCritical Error System Summary Payload:")
    print(json.dumps(summary, indent=2))
    
    assert summary["system_state"] == "CRITICAL", f"Expected CRITICAL, got {summary['system_state']}"
    assert "⚠️ Error Alert" in summary["headline"], "Expected '⚠️ Error Alert' in headline"
    print("PASSED: Critical error state summary verified.")
    
    # Restore running status
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("UPDATE bot_instances SET status = 'RUNNING' WHERE id = 'bot-1'")
    conn.commit()
    conn.close()

if __name__ == "__main__":
    test_global_health_summary_api()
    print("\nALL UX & GLOBAL HEALTH SUMMARY TESTS PASSED SUCCESSFULLY!")
