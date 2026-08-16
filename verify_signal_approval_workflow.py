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
from dashboard import app

def test_signal_approval_workflow():
    print("==================================================")
    print("  VERIFYING SIGNAL APPROVAL WORKFLOW (SEMI-AUTO)")
    print("==================================================")

    if config.KILL_SWITCH_FILE.exists():
        config.KILL_SWITCH_FILE.unlink()

    db.init_db()

    client = app.test_client()

    # Step 1: Create a pending signal approval record
    sig_id = db.create_pending_signal_approval(
        bot_id="bot-1",
        symbol="BTC/USDT",
        signal_type="LONG",
        price=63912.78,
        confluence_pct=82.0,
        threshold_pct=75.0,
        sl_price=62600.0,
        tp_price=67000.0,
        position_size=0.01,
        strategy_details={"ema_trend": "BULLISH", "macd": "POSITIVE", "vp": "ABOVE_POC"}
    )
    print(f"[STEP 1] Created pending signal approval ID: {sig_id}")
    assert sig_id > 0, "Pending signal ID should be valid > 0"

    # Step 2: Query pending signals API endpoint
    res_pending = client.get("/api/signals/pending?bot_id=bot-1").get_json()
    print(f"[STEP 2] GET /api/signals/pending response: {res_pending}")
    assert res_pending["status"] == "success", "Pending signals API should succeed"
    pending_list = res_pending["pending_signals"]
    assert any(s["id"] == sig_id for s in pending_list), f"Signal #{sig_id} must be in pending signals list"

    # Step 3: Test BUY_LONG approval decision
    res_approve = client.post("/api/signals/approve", json={
        "signal_id": sig_id,
        "action": "BUY_LONG",
        "source": "Verification Test Script"
    }).get_json()
    print(f"[STEP 3] Approve BUY_LONG response: {res_approve}")
    assert res_approve["status"] == "success", "Approving BUY_LONG should succeed"
    assert "BUY / ENTER LONG" in res_approve["message"], "Message should confirm BUY_LONG execution"

    # Verify signal status is no longer PENDING
    res_pending_after = client.get("/api/signals/pending?bot_id=bot-1").get_json()
    assert not any(s["id"] == sig_id for s in res_pending_after["pending_signals"]), "Resolved signal should no longer appear in pending list"

    # Step 4: Test SQUARE_OFF decision on active position
    # Seed another signal & open trade
    sig_id_2 = db.create_pending_signal_approval(
        bot_id="bot-1",
        symbol="BTC/USDT",
        signal_type="LONG",
        price=64000.0,
        confluence_pct=78.0,
        threshold_pct=75.0
    )
    trade_id_2 = db.log_trade_entry("BTC/USDT", "LONG", 64000.0, 63000.0, 67000.0, 0.01, bot_id="bot-1")

    res_sqoff = client.post("/api/signals/approve", json={
        "signal_id": sig_id_2,
        "action": "SQUARE_OFF",
        "source": "Verification Test Script"
    }).get_json()
    print(f"[STEP 4] Approve SQUARE_OFF response: {res_sqoff}")
    assert res_sqoff["status"] == "success", "SQUARE_OFF decision should succeed"
    assert "SQUARE OFF" in res_sqoff["message"], "Message should confirm SQUARE OFF execution"

    # Step 5: Test IGNORE decision
    sig_id_3 = db.create_pending_signal_approval(
        bot_id="bot-1",
        symbol="BTC/USDT",
        signal_type="SHORT",
        price=65000.0,
        confluence_pct=80.0,
        threshold_pct=75.0
    )
    res_ignore = client.post("/api/signals/approve", json={
        "signal_id": sig_id_3,
        "action": "IGNORE",
        "source": "Verification Test Script"
    }).get_json()
    print(f"[STEP 5] Approve IGNORE response: {res_ignore}")
    assert res_ignore["status"] == "success", "IGNORE decision should succeed"
    assert "IGNORED" in res_ignore["message"], "Message should confirm signal ignored"

    print("\n✅ ALL SIGNAL APPROVAL WORKFLOW TESTS PASSED CLEANLY!")

if __name__ == "__main__":
    test_signal_approval_workflow()
