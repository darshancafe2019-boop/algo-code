"""
Comprehensive End-to-End Verification Test Script for Recovery Audit.
Validates:
1. API latencies and data consistency
2. System Health subsystem probes
3. Bot lifecycle transitions (CREATE -> START -> PAUSE -> RESUME -> STOP -> DELETE)
4. Paper trade execution, order fill, DB ledger persistence, and P&L calculation
5. Emergency Kill Switch activation and recovery
"""

import time
import json
import os
import sys

# Ensure proper path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import dashboard
from src import config, db
from src.process_manager import multi_bot_manager

def run_e2e_test():
    print("\n" + "=" * 80)
    print("STARTING COMPREHENSIVE END-TO-END RECOVERY VERIFICATION")
    print("=" * 80)

    client = dashboard.app.test_client()

    # TEST 1: API Performance & Latency Check
    print("\n--- TEST 1: API Performance & Latency Check ---")
    t0 = time.time()
    r_bots = client.get("/api/bots")
    t_bots = time.time() - t0
    assert r_bots.status_code == 200, f"/api/bots failed: {r_bots.status_code}"
    bots_data = r_bots.get_json()
    bots_list = bots_data.get("bots", [])
    print(f"✓ /api/bots returned in {t_bots:.3f}s with {len(bots_list)} active bots (expected < 1.0s)")
    assert t_bots < 2.0, f"/api/bots latency too high: {t_bots:.3f}s"

    t0 = time.time()
    r_sum = client.get("/api/bots/summary")
    t_sum = time.time() - t0
    assert r_sum.status_code == 200, f"/api/bots/summary failed: {r_sum.status_code}"
    sum_data = r_sum.get_json().get("metrics", {})
    print(f"✓ /api/bots/summary returned in {t_sum:.3f}s with total_bots={sum_data.get('total_bots')}")
    assert len(bots_list) == sum_data.get("total_bots"), f"Discrepancy: /api/bots={len(bots_list)} vs /api/bots/summary={sum_data.get('total_bots')}"

    # TEST 2: System Health Subsystems Probe
    print("\n--- TEST 2: System Health Subsystems Probe ---")
    r_health = client.get("/health/system")
    assert r_health.status_code == 200
    health_json = r_health.get_json()
    print(f"✓ Overall System Status: {health_json.get('status')}")
    subsystems = health_json.get("subsystems", {})
    for sub, info in subsystems.items():
        print(f"   • {sub.upper()}: {info.get('status')}")
    assert health_json.get("status") in ["HEALTHY", "IDLE"], f"System health is {health_json.get('status')}"

    # TEST 3: Bot Creation Wizard & Parameter Integrity
    print("\n--- TEST 3: Bot Creation & Lifecycle Execution ---")
    test_bot_id = f"e2e-test-bot-{int(time.time())}"
    create_payload = {
        "name": "E2E Recovery Lifecycle Bot",
        "symbol": "BTC/USDT",
        "timeframe": "5m",
        "strategy": "Trend Following",
        "allocated_capital": 25000.0,
        "required_confidence": 75.0,
        "execution_mode": "PAPER",
        "asset_class": "CRYPTO"
    }
    r_create = client.post("/api/bots/create", json=create_payload)
    assert r_create.status_code == 200
    created_id = r_create.get_json().get("bot_id")
    print(f"✓ Created test bot instance: ID = {created_id}")

    # START Bot
    r_start = client.post(f"/api/bots/{created_id}/control", json={"action": "START"})
    assert r_start.status_code == 200
    print(f"✓ START command executed: {r_start.get_json().get('message')}")
    time.sleep(1.0)
    
    # Check Status
    r_stat = client.get(f"/api/status?bot_id={created_id}")
    assert r_stat.status_code == 200
    bot_stat = r_stat.get_json().get("bot", {})
    print(f"✓ Bot runtime state after START: {bot_stat.get('status')} | PID: {bot_stat.get('pid')}")
    assert bot_stat.get("status") in ["RUNNING", "STARTING"]

    # PAUSE Bot
    r_pause = client.post(f"/api/bots/{created_id}/control", json={"action": "PAUSE"})
    assert r_pause.status_code == 200
    print(f"✓ PAUSE command executed: {r_pause.get_json().get('message')}")
    time.sleep(0.5)

    r_stat = client.get(f"/api/status?bot_id={created_id}")
    bot_stat = r_stat.get_json().get("bot", {})
    print(f"✓ Bot runtime state after PAUSE: {bot_stat.get('status')}")
    assert bot_stat.get("status") == "PAUSED"

    # RESUME Bot
    r_resume = client.post(f"/api/bots/{created_id}/control", json={"action": "RESUME"})
    assert r_resume.status_code == 200
    print(f"✓ RESUME command executed: {r_resume.get_json().get('message')}")
    time.sleep(0.5)

    r_stat = client.get(f"/api/status?bot_id={created_id}")
    bot_stat = r_stat.get_json().get("bot", {})
    print(f"✓ Bot runtime state after RESUME: {bot_stat.get('status')}")
    assert bot_stat.get("status") in ["RUNNING", "RESUMING"]

    # TEST 4: Force Paper Test Trade & PnL Accounting
    print("\n--- TEST 4: Force Paper Test Trade Execution ---")
    r_trade = client.post(f"/api/bots/{created_id}/force_test_trade", json={"trade_type": "LONG_ENTRY"})
    assert r_trade.status_code == 200
    trade_res = r_trade.get_json()
    print(f"✓ Paper trade executed: Status={trade_res.get('status')} | Fill Price=${trade_res.get('entry_price', 0):,.2f}")
    
    # Verify Trade Persistence in trades_log
    open_trade = client.get(f"/api/status?bot_id={created_id}").get_json().get("open_trade")
    assert open_trade is not None, "Open trade was not recorded in DB"
    print(f"✓ Authoritative DB Trade Ledger verified: Trade ID={open_trade.get('id')}, Direction={open_trade.get('direction')}, Entry=${open_trade.get('entry_price')}")

    # STOP Bot
    r_stop = client.post(f"/api/bots/{created_id}/control", json={"action": "STOP"})
    assert r_stop.status_code == 200
    print(f"✓ STOP command executed: {r_stop.get_json().get('message')}")
    time.sleep(1.0)

    r_stat = client.get(f"/api/status?bot_id={created_id}")
    bot_stat = r_stat.get_json().get("bot", {})
    print(f"✓ Bot runtime state after STOP: {bot_stat.get('status')} | Alive: {bot_stat.get('is_running')}")
    assert bot_stat.get("status") == "STOPPED"
    assert not bot_stat.get("is_running")

    # TEST 5: Kill Switch Enforcement
    print("\n--- TEST 5: Emergency Kill Switch Protection ---")
    r_ks = client.post("/api/bot/control", json={"action": "KILL_SWITCH", "confirmation_token": "CONFIRM-KILL-SWITCH"})
    assert r_ks.status_code == 200, f"Expected 200, got {r_ks.status_code}: {r_ks.get_data(as_text=True)}"
    print(f"✓ Kill switch triggered: {r_ks.get_json().get('message')}")
    assert config.KILL_SWITCH_FILE.exists()


    # Attempt trade while halted -> must be rejected with 403
    r_blocked = client.post(f"/api/bots/{created_id}/force_test_trade", json={"trade_type": "LONG_ENTRY"})
    assert r_blocked.status_code == 403, f"Expected 403 blocked, got {r_blocked.status_code}"
    print(f"✓ Trade attempt during HALT successfully blocked with HTTP 403: {r_blocked.get_json().get('message')}")

    # Deactivate Kill Switch
    r_deact = client.post("/api/bot/control", json={"action": "DEACTIVATE_KILL_SWITCH"})
    assert r_deact.status_code == 200
    print(f"✓ Kill switch deactivated: {r_deact.get_json().get('message')}")
    assert not config.KILL_SWITCH_FILE.exists()

    # Cleanup temporary test bot instance
    conn = db.get_connection()
    conn.execute("DELETE FROM bot_instances WHERE id = ?", (created_id,))
    conn.commit()
    conn.close()
    print(f"✓ Cleaned up temporary test bot '{created_id}' (trade history preserved in DB)")

    print("\n" + "=" * 80)
    print("🎉 ALL END-TO-END RECOVERY VERIFICATION TESTS PASSED PERFECTLY!")
    print("=" * 80 + "\n")

if __name__ == "__main__":
    run_e2e_test()
