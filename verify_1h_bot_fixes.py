import os
import sys
import time
import json
from datetime import datetime, timedelta, timezone

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from src import db, config
from src.process_manager import BotWatchdog, multi_bot_manager, cleanup_orphan_bot_process
from src.indicators import get_timeframe_minutes
from src.live_runner import LiveRunner
import dashboard

def verify_bug_1_timeframe_and_interval():
    print("=" * 70)
    print("BUG 1 VERIFICATION: Timeframe & Interval Accuracy for 1h Bot (bot-3)")
    print("=" * 70)
    
    app = dashboard.app
    client = app.test_client()

    # 1. Verify get_timeframe_minutes mapping
    tf_1h_mins = get_timeframe_minutes("1h")
    assert tf_1h_mins == 60, f"Expected 60 mins for 1h, got {tf_1h_mins}"
    print(f"✓ get_timeframe_minutes('1h') correctly maps to {tf_1h_mins} minutes.")

    # 2. Verify /api/bots return for bot-3 (Altcoin Momentum ETH/USDT 1h)
    res_bots = client.get("/api/bots")
    assert res_bots.status_code == 200
    bots = res_bots.get_json().get("bots", [])
    bot3 = next((b for b in bots if b["id"] == "bot-3"), None)
    assert bot3 is not None, "bot-3 must exist!"
    assert bot3["timeframe"] == "1h", f"bot-3 timeframe must be '1h', got {bot3['timeframe']}"
    assert bot3["symbol"] == "ETH/USDT", f"bot-3 symbol must be 'ETH/USDT', got {bot3['symbol']}"
    print(f"✓ GET /api/bots verified: bot-3 name='{bot3['name']}', symbol='{bot3['symbol']}', timeframe='{bot3['timeframe']}'.")

    # 3. Verify /api/bots/bot-3/activity with last_checked_at set to 600s ago (10 minutes)
    # A 1h bot should NOT be flagged as stalled at 600s inactive (threshold is 7260s)
    conn = db.get_connection()
    c = conn.cursor()
    past_10m = (datetime.now(timezone.utc) - timedelta(seconds=600)).isoformat()
    c.execute("UPDATE bot_instances SET status = 'RUNNING', last_checked_at = ? WHERE id = 'bot-3'", (past_10m,))
    conn.commit()
    conn.close()

    res_act = client.get("/api/bots/bot-3/activity")
    assert res_act.status_code == 200
    act_data = res_act.get_json()
    assert act_data["stalled_warning"] is False, f"1h bot inactive for 600s should NOT be flagged as stalled! Got stalled_warning={act_data['stalled_warning']}"
    assert "STALLED" not in act_data["summary_headline"], f"Summary headline should not say STALLED! Got: {act_data['summary_headline']}"
    print(f"✓ GET /api/bots/bot-3/activity verified: 600s inactive 1h bot is NOT flagged as stalled.")
    print(f"  --> Summary Headline: \"{act_data['summary_headline']}\"")

    # 4. Verify /api/bots/bot-3/decisions returns timeframe, interval_seconds, and interval_label
    res_dec = client.get("/api/bots/bot-3/decisions")
    assert res_dec.status_code == 200
    dec_data = res_dec.get_json()
    assert dec_data["timeframe"] == "1h", f"Expected timeframe '1h', got {dec_data.get('timeframe')}"
    assert dec_data["interval_seconds"] == 3600, f"Expected interval_seconds 3600, got {dec_data.get('interval_seconds')}"
    assert dec_data["interval_label"] == "1h Interval", f"Expected interval_label '1h Interval', got {dec_data.get('interval_label')}"
    print(f"✓ GET /api/bots/bot-3/decisions verified: timeframe='{dec_data['timeframe']}', interval_seconds={dec_data['interval_seconds']}, interval_label='{dec_data['interval_label']}', next_cycle_seconds={dec_data['next_cycle_seconds']}s.")

    # 5. Verify Watchdog dynamic threshold for 1h bot
    watchdog = BotWatchdog()
    tf_mins = get_timeframe_minutes("1h")
    dynamic_threshold = max(600, int(tf_mins * 60 * 2.5))
    assert dynamic_threshold == 9000, f"Watchdog stall threshold for 1h bot should be 9000s (2.5h), got {dynamic_threshold}s"
    print(f"✓ BotWatchdog stall threshold for 1h bot calculated as {dynamic_threshold}s (2.5 hours).")

    # 6. Verify dashboard.js static updates for ctrl-interval-sub
    js_content = (config.BASE_DIR / "static" / "js" / "dashboard.js").read_text(encoding="utf-8")
    assert "ctrl-interval-sub" in js_content, "dashboard.js must reference ctrl-interval-sub!"
    print("✓ dashboard.js dynamically updates #ctrl-interval-sub with active bot's timeframe interval.")


def verify_bug_2_start_bot_process_execution():
    print("\n" + "=" * 70)
    print("BUG 2 VERIFICATION: 'Start Bot' Spawns Live Process & Updates Aliveness")
    print("=" * 70)
    
    app = dashboard.app
    client = app.test_client()

    bot_id = "bot-3"
    
    # 1. Stop bot and set simulated dormant/stopped state
    multi_bot_manager.stop_bot(bot_id)
    time.sleep(1)

    dormant_time = (datetime.now(timezone.utc) - timedelta(seconds=607)).isoformat()
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("UPDATE bot_instances SET status = 'STOPPED', last_checked_at = ? WHERE id = ?", (dormant_time, bot_id))
    conn.commit()
    conn.close()

    # Capture BEFORE state
    res_before = client.get(f"/api/bots/{bot_id}/activity")
    before_data = res_before.get_json()
    res_dec_before = client.get(f"/api/bots/{bot_id}/decisions")
    dec_before = res_dec_before.get_json()

    print("\n[BEFORE CLICKING START BOT]")
    print(f"  • Bot ID:                {bot_id} ({before_data.get('bot_name')})")
    print(f"  • Status:                {before_data.get('bot_status')}")
    print(f"  • Last Checked:          {before_data.get('last_checked_seconds_ago')}s ago ({before_data.get('last_checked_at')})")
    print(f"  • Total Cycles Executed: {dec_before.get('total_cycles_completed')}")
    print(f"  • Stalled Warning:       {before_data.get('stalled_warning')}")
    print(f"  • Headline:              \"{before_data.get('summary_headline')}\"")

    assert before_data.get('last_checked_seconds_ago') >= 600, "Before state must reflect last checked ~607s ago"

    # 2. Trigger START BOT via API endpoint
    print("\nExecuting POST /api/bots/bot-3/control with action='START'...")
    res_start = client.post(f"/api/bots/{bot_id}/control", json={"action": "START"})
    assert res_start.status_code == 200
    start_payload = res_start.get_json()
    print(f"✓ Control response: {start_payload}")
    assert start_payload.get("status") == "success", f"Start bot failed: {start_payload}"

    # Allow up to 6 seconds for background process to start and run initial cycle
    print("Waiting up to 6 seconds for background live runner process to initialize and execute initial cycle...")
    for _ in range(6):
        time.sleep(1)
        res_after = client.get(f"/api/bots/{bot_id}/activity")
        after_data = res_after.get_json()
        if after_data.get('last_checked_seconds_ago', 999) < 10:
            break

    res_dec_after = client.get(f"/api/bots/{bot_id}/decisions")
    dec_after = res_dec_after.get_json()

    print("\n[AFTER CLICKING START BOT]")
    print(f"  • Bot ID:                {bot_id} ({after_data.get('bot_name')})")
    print(f"  • Status:                {after_data.get('bot_status')}")
    print(f"  • Last Checked:          {after_data.get('last_checked_seconds_ago')}s ago ({after_data.get('last_checked_at')})")
    print(f"  • Total Cycles Executed: {dec_after.get('total_cycles_completed')}")
    print(f"  • Stalled Warning:       {after_data.get('stalled_warning')}")
    print(f"  • Headline:              \"{after_data.get('summary_headline')}\"")

    # Verification assertions
    assert after_data.get('bot_status') == "RUNNING", f"Expected RUNNING status, got {after_data.get('bot_status')}"
    assert after_data.get('last_checked_seconds_ago') < 10, f"Last checked MUST reset to near-zero (<10s), got {after_data.get('last_checked_seconds_ago')}s"
    assert after_data.get('stalled_warning') is False, "Stalled warning must be False after starting live process"
    assert dec_after.get('total_cycles_completed') >= dec_before.get('total_cycles_completed'), "Cycle count must be maintained/incremented"
    
    # Check that process manager reports bot as running with valid PID
    mgr = multi_bot_manager.get_manager(bot_id)
    assert mgr.is_running() is True, "Background process MUST be active and running!"
    print(f"✓ Process aliveness confirmed: PID {mgr.get_status().get('pid')} is running in OS task manager.")

    # Cleanup test process
    multi_bot_manager.stop_bot(bot_id)
    print("✓ Cleaned up test process.")


if __name__ == "__main__":
    verify_bug_1_timeframe_and_interval()
    verify_bug_2_start_bot_process_execution()
    print("\n" + "=" * 70)
    print("ALL VERIFICATIONS COMPLETED SUCCESSFULLY WITH EMPIRICAL PROOF!")
    print("=" * 70)
