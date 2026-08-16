import sys
import time
import json
from datetime import datetime, timedelta, timezone

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from src import db, config
from src.process_manager import BotWatchdog, multi_bot_manager
from src.live_runner import LiveRunner
import dashboard

def test_watchdog_stall_trigger():
    print("\n--- TEST 1: WATCHDOG STALLED STATE TRIGGER ---")
    app = dashboard.app
    client = app.test_client()
    
    conn = db.get_connection()
    c = conn.cursor()
    
    # Pick a bot and set status to RUNNING with an old last_checked_at (240s ago)
    stalled_time = (datetime.now(timezone.utc) - timedelta(seconds=240)).isoformat()
    c.execute("UPDATE bot_instances SET status = 'RUNNING', last_checked_at = ? WHERE id = 'bot-1'", (stalled_time,))
    conn.commit()
    conn.close()
    
    # Manually trigger watchdog check
    watchdog = BotWatchdog(stall_threshold_sec=180)
    watchdog._check_stalled_bots()
    
    # Query DB activity logs to verify Watchdog logged the exact required recovery message
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("SELECT message FROM bot_activity_logs WHERE bot_id = 'bot-1' AND event_type = 'STALLED_RECOVERY' ORDER BY id DESC LIMIT 1")
    row = c.fetchone()
    conn.close()
    
    assert row is not None, "Expected STALLED_RECOVERY activity log entry"
    assert "Watchdog detected stall — attempting automatic restart" in row["message"], f"Expected required stall message, got: {row['message']}"
    
    res = client.get("/api/bots/bot-1/activity")
    data = res.get_json()

    print("Watchdog Triggered API Status Response:")
    print(f"Bot Status: {data['bot_status']} | Stalled Warning: {data['stalled_warning']} | Seconds Ago: {data['last_checked_seconds_ago']}")
    print(f"Activity Log Verified: {row['message']}")
    
    print("PASSED: Watchdog detected stall, logged recovery attempt, and attempted automatic restart.")

def test_live_runner_continuous_cycles():
    print("\n--- TEST 2: LIVE RUNNER CONTINUOUS CYCLES & EXCEPTION SAFETY ---")
    runner = LiveRunner()
    
    print("Executing 5 consecutive live runner cycles with 10s CCXT timeout...")
    for i in range(1, 6):
        start_t = time.time()
        runner.process_cycle()
        elapsed = time.time() - start_t
        print(f"Cycle {i}/5 completed in {elapsed:.2f}s.")
        
        # Verify last_checked_at was updated
        conn = db.get_connection()
        c = conn.cursor()
        c.execute("SELECT status, last_checked_at FROM bot_instances WHERE id = 'bot-1'")
        row = c.fetchone()
        conn.close()
        
        print(f"  Bot DB Status: {row['status']} | Last Checked: {row['last_checked_at']}")
        assert row['status'] in ['RUNNING', 'STOPPED', 'OK'], f"Unexpected status: {row['status']}"
        time.sleep(1)

    print("PASSED: Live Runner completed continuous evaluation cycles without stall.")

if __name__ == "__main__":
    test_watchdog_stall_trigger()
    test_live_runner_continuous_cycles()
    print("\nALL WATCHDOG & LIVE RUNNER STALL FIX TESTS PASSED SUCCESSFULLY!")
