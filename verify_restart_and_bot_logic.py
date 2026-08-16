import sys
import os
import time
import json
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.append(str(BASE_DIR))

from src import db
from src import config
from src.live_runner import LiveRunner
import dashboard

def run_comprehensive_verification():
    print("=" * 70)
    print("VERIFICATION REQUIREMENT 1: BOT INSTANCE CLEANUP REPORT")
    print("=" * 70)
    cleanup_res = db.cleanup_bot_instances()
    print(json.dumps(cleanup_res, indent=2, ensure_ascii=False))

    conn = db.get_connection()
    c = conn.cursor()
    c.execute("SELECT id, name, symbol, timeframe, status FROM bot_instances")
    active_bots = [dict(r) for r in c.fetchall()]
    conn.close()
    print("\nCURRENT ACTIVE BOT INSTANCES IN DATABASE:")
    print(json.dumps(active_bots, indent=2, ensure_ascii=False))

    print("\n" + "=" * 70)
    print("VERIFICATION REQUIREMENT 2: CONTRADICTORY BOT STATUS RESOLUTION")
    print("=" * 70)
    # Test client using Flask test client
    with dashboard.app.test_client() as client:
        # Test 1: Bot status when STOPPED with open trade
        res = client.get("/api/bots/bot-1/activity")
        act_data = res.get_json()
        print("\n[STOPPED Bot State Response]")
        print(f"Status Badge Text: {act_data.get('bot_status')}")
        print(f"Unified Headline Banner: {act_data.get('summary_headline')}")
        print(f"Active Position Label: {act_data.get('open_position_label')}")

        # Test 2: Decisions endpoint next check in
        res_dec = client.get("/api/bots/bot-1/decisions")
        dec_data = res_dec.get_json()
        print(f"Next Check In Value: {dec_data.get('next_cycle_seconds')}s (Status: {act_data.get('bot_status')})")

    print("\n" + "=" * 70)
    print("VERIFICATION REQUIREMENT 3: REAL-TIME P&L & UNREALIZED P&L CALCULATION")
    print("=" * 70)
    with dashboard.app.test_client() as client:
        res = client.get("/api/analytics?bot_id=ALL")
        analytics = res.get_json().get("trade_summary", {})
        print(json.dumps(analytics, indent=2, ensure_ascii=False))
        print(f"\nCalculated Closed P&L: ${analytics.get('closed_pnl')}")
        print(f"Calculated Unrealized P&L: ${analytics.get('unrealized_pnl')}")
        print(f"Total Combined P&L: ${analytics.get('total_pnl')}")
        print(f"Current Account Balance: ${analytics.get('current_balance')}")

    print("\n" + "=" * 70)
    print("VERIFICATION REQUIREMENT 4: REAL TRADE HISTORY TIMESTAMPS FROM DATABASE")
    print("=" * 70)
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("SELECT id, timestamp, exit_timestamp, symbol, direction, entry_price, exit_price, result_pnl, status, bot_id FROM trades_log ORDER BY id DESC LIMIT 15")
    trades = [dict(r) for r in c.fetchall()]
    conn.close()
    print(f"Total Trade Records in DB: {len(trades)}")
    print(json.dumps(trades, indent=2, ensure_ascii=False))

    print("\n" + "=" * 70)
    print("VERIFICATION REQUIREMENT 5: BOT EVALUATION CYCLE & DECISION PERSISTENCE")
    print("=" * 70)
    runner = LiveRunner()
    print("Executing bot signal cycle (LiveRunner)...")
    runner.process_cycle()

    decisions = db.get_bot_decisions("bot-1", limit=1)
    if decisions:
        print("\nLatest Bot Decision Logged in DB:")
        print(json.dumps(decisions[0], indent=2, ensure_ascii=False))

if __name__ == "__main__":
    run_comprehensive_verification()
