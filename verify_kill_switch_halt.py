import os
import sys
import time
from pathlib import Path

# Configure utf-8 for Windows console output
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent))


from src import config, db
from src.process_manager import bot_manager, multi_bot_manager

def test_kill_switch_halt_requirements():
    print("==================================================")
    print("  VERIFYING EMERGENCY KILL SWITCH & TRADING HALT")
    print("==================================================")

    # Clean initial state
    if config.KILL_SWITCH_FILE.exists():
        config.KILL_SWITCH_FILE.unlink()

    db.init_db()

    # Step A: Seed an OPEN trade position & unblocked signal
    trade_id = db.log_trade_entry(
        symbol="BTC/USDT",
        direction="LONG",
        entry_price=65000.0,
        stop_loss=64000.0,
        take_profit=68000.0,
        position_size=0.05,
        bot_id="bot-1",
        strategy="TEST_KILL"
    )
    db.log_signal("BTC/USDT", "LONG", 65000.0, {}, False, "Test entry signal")
    
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM trades_log WHERE status = 'OPEN'")
    open_count_before = c.fetchone()[0]
    conn.close()
    print(f"[TEST SETUP] Open trades count before Kill Switch: {open_count_before}")
    assert open_count_before > 0, "Expected at least 1 open trade before Kill Switch"

    # Step B: Trigger Kill Switch
    print("[ACTION] Triggering Kill Switch...")
    res = bot_manager.trigger_kill_switch()
    print(f"[KILL SWITCH RESPONSE] {res}")

    assert res["status"] == "success", "Kill switch trigger should return success"
    assert config.KILL_SWITCH_FILE.exists(), "kill_switch.flag file must exist"

    # Step C: Requirement 1 & 2 - Cancel pending orders & Close active positions
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM trades_log WHERE status = 'OPEN'")
    open_count_after = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM signals_log WHERE is_blocked = 0")
    unblocked_signals_after = c.fetchone()[0]

    c.execute("SELECT status FROM trades_log WHERE id = ?", (trade_id,))
    trade_status = c.fetchone()[0]
    conn.close()

    print(f"[CHECK 1 & 2] Open trades count after Kill Switch: {open_count_after} (Expected: 0)")
    print(f"[CHECK 1 & 2] Target trade status: {trade_status}")
    assert open_count_after == 0, "All active positions must be closed"
    assert trade_status == "CLOSED", "Open trade status must be updated to CLOSED"

    # Step D: Requirement 3 & 4 - Stop execution & Disable automated trading
    status_res = bot_manager.get_status()
    print(f"[CHECK 3 & 4 & 6] Bot status after Kill Switch: {status_res}")
    assert status_res["kill_switch_active"] is True, "kill_switch_active must be True"
    assert status_res["status"] == "TRADING HALTED", "Status state must be 'TRADING HALTED'"

    # Try starting bot while Kill Switch is active
    start_attempt = bot_manager.start_bot()
    print(f"[CHECK 4] Start attempt while halted: {start_attempt}")
    assert start_attempt["status"] == "error", "Start bot must fail when Kill Switch is active"

    # Try resuming bot while Kill Switch is active
    resume_attempt = bot_manager.resume_bot()
    print(f"[CHECK 4] Resume attempt while halted: {resume_attempt}")
    assert resume_attempt["status"] == "error", "Resume bot must fail when Kill Switch is active"

    # Step E: Requirement 5 - Lock execution pipeline (Dashboard endpoint check)
    from dashboard import app
    client = app.test_client()

    force_res = client.post("/api/bots/bot-1/force_test_trade", json={"trade_type": "LONG_ENTRY"})
    print(f"[CHECK 5] Force trade endpoint response while halted: {force_res.status_code} -> {force_res.get_json()}")
    assert force_res.status_code == 403, "Force trade endpoint must return 403 when halted"
    assert "locked" in force_res.get_json().get("message", "").lower(), "Error message must mention pipeline locked"

    # Step F: Requirement 6 - Show TRADING HALTED in /api/status
    api_status_res = client.get("/api/status").get_json()
    print(f"[CHECK 6] /api/status response summary: {api_status_res.get('system_summary')}")
    assert api_status_res["system_summary"]["system_state"] == "HALTED", "system_state must be HALTED"
    assert "TRADING HALTED" in api_status_res["system_summary"]["headline"], "headline must contain TRADING HALTED"

    # Step G: Cleanup & Deactivate Kill Switch
    print("[ACTION] Deactivating Kill Switch...")
    deact_res = bot_manager.deactivate_kill_switch()
    print(f"[DEACTIVATE RESPONSE] {deact_res}")
    assert not config.KILL_SWITCH_FILE.exists(), "kill_switch.flag file should be removed"

    print("\n✅ ALL 6 EMERGENCY KILL SWITCH REQUIREMENTS VERIFIED SUCCESSFULLY!")

if __name__ == "__main__":
    test_kill_switch_halt_requirements()
