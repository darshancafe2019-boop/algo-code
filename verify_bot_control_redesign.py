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
from src.process_manager import multi_bot_manager
import dashboard

def audit_bot_control_system():
    results = {
        "tab_removal": {},
        "lifecycle_controls": {},
        "bot_creation_deletion": {},
        "confluence_scoring_per_bot": {},
        "leaderboard_accuracy": {},
        "cycle_simulation": {}
    }

    print("=" * 75)
    print("AUDIT 1: TRADING & CHARTING TAB REMOVAL VERIFICATION")
    print("=" * 75)
    index_path = BASE_DIR / "templates" / "index.html"
    index_content = index_path.read_text(encoding="utf-8")
    
    charting_nav_exists = 'data-tab="charting"' in index_content
    charting_section_exists = 'id="tab-charting"' in index_content
    default_active_control = 'data-tab="control"' in index_content and 'class="nav-item active"' in index_content

    results["tab_removal"] = {
        "charting_nav_removed": not charting_nav_exists,
        "charting_section_removed": not charting_section_exists,
        "default_active_tab_is_control": default_active_control
    }
    print(json.dumps(results["tab_removal"], indent=2))

    print("\n" + "=" * 75)
    print("AUDIT 2: BOT LIFECYCLE CONTROLS (START, PAUSE, RESUME, STOP)")
    print("=" * 75)
    test_bot_id = "bot-1"

    with dashboard.app.test_client() as client:
        # 1. START
        res_start = client.post(f"/api/bots/{test_bot_id}/control", json={"action": "START"})
        data_start = res_start.get_json()
        print(f"[START] Response: {data_start}")
        time.sleep(1)
        res_act_1 = client.get(f"/api/bots/{test_bot_id}/activity").get_json()
        print(f"Status after START: {res_act_1.get('bot_status')}")

        # 2. PAUSE
        res_pause = client.post(f"/api/bots/{test_bot_id}/control", json={"action": "PAUSE"})
        data_pause = res_pause.get_json()
        print(f"[PAUSE] Response: {data_pause}")
        time.sleep(1)
        res_act_2 = client.get(f"/api/bots/{test_bot_id}/activity").get_json()
        print(f"Status after PAUSE: {res_act_2.get('bot_status')}")

        # 3. RESUME
        res_resume = client.post(f"/api/bots/{test_bot_id}/control", json={"action": "RESUME"})
        data_resume = res_resume.get_json()
        print(f"[RESUME] Response: {data_resume}")
        time.sleep(1)
        res_act_3 = client.get(f"/api/bots/{test_bot_id}/activity").get_json()
        print(f"Status after RESUME: {res_act_3.get('bot_status')}")

        # 4. STOP
        res_stop = client.post(f"/api/bots/{test_bot_id}/control", json={"action": "STOP"})
        data_stop = res_stop.get_json()
        print(f"[STOP] Response: {data_stop}")
        time.sleep(1)
        res_act_4 = client.get(f"/api/bots/{test_bot_id}/activity").get_json()
        print(f"Status after STOP: {res_act_4.get('bot_status')}")

        results["lifecycle_controls"] = {
            "start_status": res_act_1.get("bot_status"),
            "pause_status": res_act_2.get("bot_status"),
            "resume_status": res_act_3.get("bot_status"),
            "stop_status": res_act_4.get("bot_status")
        }

    print("\n" + "=" * 75)
    print("AUDIT 3: CREATE NEW BOT INSTANCE & DELETE INSTANCE")
    print("=" * 75)
    with dashboard.app.test_client() as client:
        # Create
        new_bot_payload = {
            "name": "Audit Test Wizard Bot",
            "symbol": "ETH/USDT",
            "strategy": "EMA_MACD_VP",
            "timeframe": "15m",
            "allocated_capital": 5000.0,
            "risk_pct": 0.015,
            "indicators": ["ema", "rsi", "adx"]
        }
        res_create = client.post("/api/bots/create", json=new_bot_payload)
        create_data = res_create.get_json()
        print(f"[CREATE] Response: {create_data}")
        created_id = create_data.get("bot_id")

        # Verify creation in DB
        bots_in_db = dashboard.safe_query("SELECT id, name, symbol, timeframe, config_json FROM bot_instances WHERE id = ?", (created_id,))
        print(f"Created Bot in DB: {dict(bots_in_db[0]) if bots_in_db else None}")

        # Delete
        res_del = client.delete(f"/api/bots/{created_id}")
        del_data = res_del.get_json()
        print(f"[DELETE] Response: {del_data}")

        # Verify deletion in DB
        bots_after_del = dashboard.safe_query("SELECT id FROM bot_instances WHERE id = ?", (created_id,))
        print(f"Bot in DB after deletion: {len(bots_after_del)} rows found.")

        results["bot_creation_deletion"] = {
            "created_successfully": create_data.get("status") == "success",
            "db_verified": len(bots_in_db) > 0,
            "deleted_successfully": del_data.get("status") == "success",
            "db_deleted": len(bots_after_del) == 0
        }

    print("\n" + "=" * 75)
    print("AUDIT 4: PER-BOT INDICATOR CONFLUENCE SCORING ISOLATION")
    print("=" * 75)
    with dashboard.app.test_client() as client:
        for b_id in ["bot-1", "bot-2", "bot-3"]:
            res_conf = client.get(f"/api/bots/{b_id}/confluence").get_json()
            print(f"\n[Confluence for {b_id}] Status: {res_conf.get('status')}")
            if res_conf.get("status") == "success":
                conf = res_conf.get("confluence", {})
                print(f"  Bot Name: {res_conf.get('bot_name')}")
                print(f"  Indicators Evaluated: {list(conf.get('indicator_details', {}).keys())}")
                print(f"  Bull Score: {conf.get('bull_score_pct')}% (Threshold: {conf.get('threshold')*100:.0f}%)")
                results["confluence_scoring_per_bot"][b_id] = {
                    "indicators": list(conf.get("indicator_details", {}).keys()),
                    "score_pct": conf.get("bull_score_pct")
                }

    print("\n" + "=" * 75)
    print("AUDIT 5: LEADERBOARD ACCURACY VS DB TRADE HISTORY")
    print("=" * 75)
    with dashboard.app.test_client() as client:
        res_comp = client.get("/api/bots/comparison").get_json()
        print(json.dumps(res_comp.get("comparison", []), indent=2))
        results["leaderboard_accuracy"] = res_comp.get("comparison", [])

    print("\n" + "=" * 75)
    print("AUDIT 6: CYCLE SIMULATION RUN (30 CANDLES / DECISION LOGGING)")
    print("=" * 75)
    from src.live_runner import LiveRunner
    runner = LiveRunner(bot_id="bot-1")
    print("Executing cycle for bot-1...")
    runner.process_cycle()

    decisions = db.get_bot_decisions("bot-1", limit=1)
    if decisions:
        print("\nLogged Decision in DB:")
        print(json.dumps(decisions[0], indent=2, ensure_ascii=False))
        results["cycle_simulation"] = {
            "decision_logged": True,
            "decision": decisions[0].get("decision"),
            "confluence_pct": decisions[0].get("confluence_pct")
        }

    print("\n" + "=" * 75)
    print("FINAL SUMMARY OF AUDIT RESULTS:")
    print("=" * 75)
    print(json.dumps(results, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    audit_bot_control_system()
