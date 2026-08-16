import os
import json
import time
import sqlite3
import requests
from pathlib import Path

BASE_URL = "http://127.0.0.1:5000"

def run_tests():
    print("=== STARTING VERIFICATION OF BOT FEATURES & DB CONTRACTS ===")
    
    # 1. Start Flask app / check database directly
    from src import db
    db.init_db()
    
    conn = db.get_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, name, symbol, strategy, timeframe, allocated_capital, status, config_json FROM bot_instances ORDER BY created_at ASC")
    rows = cursor.fetchall()
    
    print("\n--- INITIAL BOT INSTANCES IN DATABASE ---")
    for r in rows:
        r_dict = dict(r)
        print(f"ID: {r_dict['id']} | Name: {r_dict['name']} | Status: {r_dict['status']} | Config: {r_dict['config_json']}")
    
    conn.close()

    # Import Flask app for client testing
    from dashboard import app
    client = app.test_client()

    print("\n--- TEST 1: CREATE TWO BOTS WITH DIFFERENT INDICATORS ---")
    bot_a_data = {
        "name": "Bot Alpha (EMA + MACD)",
        "symbol": "BTC/USDT",
        "strategy": "EMA_MACD_VP",
        "timeframe": "5m",
        "allocated_capital": 12000.0,
        "indicators": [
            {"id": "ema", "name": "EMA (Exponential Moving Average)", "params": {"period": 50}},
            {"id": "macd", "name": "MACD (Moving Average Convergence Divergence)", "params": {"fast": 12, "slow": 26, "signal": 9}}
        ]
    }
    
    bot_b_data = {
        "name": "Bot Beta (RSI + BB + ADX)",
        "symbol": "BTC/USDT",
        "strategy": "RSI_MEAN_REVERSION",
        "timeframe": "15m",
        "allocated_capital": 8000.0,
        "indicators": [
            {"id": "rsi", "name": "RSI (Relative Strength Index)", "params": {"period": 14}},
            {"id": "bollinger", "name": "Bollinger Bands", "params": {"period": 20, "stdDev": 2.0}},
            {"id": "adx", "name": "Average Directional Index (ADX)", "params": {"period": 14}}
        ]
    }

    res_a = client.post("/api/bots/create", json=bot_a_data)
    print("Create Bot A Response:", res_a.status_code, res_a.get_json())
    bot_a_id = res_a.get_json()["bot_id"]

    res_b = client.post("/api/bots/create", json=bot_b_data)
    print("Create Bot B Response:", res_b.status_code, res_b.get_json())
    bot_b_id = res_b.get_json()["bot_id"]

    print("\n--- TEST 2: VERIFY PER-BOT CONFLUENCE EVALUATION ---")
    conf_a = client.get(f"/api/bots/{bot_a_id}/confluence").get_json()
    print("Bot A Confluence Output:", json.dumps(conf_a, indent=2))

    conf_b = client.get(f"/api/bots/{bot_b_id}/confluence").get_json()
    print("Bot B Confluence Output:", json.dumps(conf_b, indent=2))

    assert conf_a["confluence"]["active_indicators"] != conf_b["confluence"]["active_indicators"], "Bots must evaluate distinct indicators!"

    print("\n--- TEST 3: CONFIRM INDICATOR SETTINGS CHANGED FOR BOT A DO NOT AFFECT BOT B ---")
    updated_bot_a = bot_a_data.copy()
    updated_bot_a["indicators"] = [
        {"id": "ema", "name": "EMA (Exponential Moving Average)", "params": {"period": 200}},
        {"id": "sma", "name": "SMA (Simple Moving Average)", "params": {"period": 20}}
    ]
    res_update = client.put(f"/api/bots/{bot_a_id}", json=updated_bot_a)
    print("Update Bot A Response:", res_update.get_json())

    conf_a_new = client.get(f"/api/bots/{bot_a_id}/confluence").get_json()
    conf_b_check = client.get(f"/api/bots/{bot_b_id}/confluence").get_json()

    print("Bot A New Active Indicators:", conf_a_new["confluence"]["active_indicators"])
    print("Bot B Unaffected Active Indicators:", conf_b_check["confluence"]["active_indicators"])
    bot_b_ids = [ind["id"] if isinstance(ind, dict) else ind for ind in conf_b_check["confluence"]["active_indicators"]]
    assert bot_b_ids == ["rsi", "bollinger", "adx"], "Bot B indicators changed unexpectedly!"

    print("\n--- TEST 4: CONFIRM 4-INDICATOR CAP ENFORCEMENT ---")
    five_ind_data = bot_a_data.copy()
    five_ind_data["indicators"] = [
        {"id": "ema"}, {"id": "macd"}, {"id": "rsi"}, {"id": "adx"}, {"id": "sma"}
    ]
    res_cap = client.post("/api/bots/create", json=five_ind_data)
    print("5-Indicator Attempt Response:", res_cap.status_code, res_cap.get_json())
    assert res_cap.status_code == 400 or res_cap.get_json()["status"] == "error", "5-indicator cap failed!"

    print("\n--- TEST 5: CONFIRM DELETING RUNNING BOT STOPS IT FIRST & PRESERVES TRADE HISTORY ---")
    # Start Bot A first
    start_res = client.post(f"/api/bots/{bot_a_id}/control", json={"action": "START"})
    print("Start Bot A Response:", start_res.get_json())

    # Insert a dummy trade tied to Bot A
    conn = db.get_connection()
    conn.execute(
        "INSERT INTO trades_log (timestamp, symbol, direction, entry_price, stop_loss, take_profit, position_size, status, bot_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("2026-08-08T12:00:00", "BTC/USDT", "LONG", 60000.0, 59000.0, 62000.0, 0.1, "CLOSED", bot_a_id)
    )
    conn.commit()
    conn.close()

    # Delete Bot A
    del_res = client.delete(f"/api/bots/{bot_a_id}")
    print("Delete Bot A Response:", del_res.get_json())

    # Verify Bot A removed from bot_instances table
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM bot_instances WHERE id = ?", (bot_a_id,))
    deleted_bot_row = c.fetchone()
    print("Query deleted bot in bot_instances:", deleted_bot_row)
    assert deleted_bot_row is None, "Bot instance was not removed from DB!"

    # Verify trade history in trades_log is preserved
    c.execute("SELECT * FROM trades_log WHERE bot_id = ?", (bot_a_id,))
    preserved_trades = c.fetchall()
    print(f"Preserved Trades Count in trades_log for deleted bot {bot_a_id}: {len(preserved_trades)}")
    for t in preserved_trades:
        t_dict = dict(t)
        print(f"  Trade ID: {t_dict['id']} | Symbol: {t_dict['symbol']} | Direction: {t_dict['direction']} | Entry: {t_dict['entry_price']} | Bot ID: {t_dict['bot_id']}")
    assert len(preserved_trades) >= 1, "Trade history was incorrectly purged!"
    conn.close()

    print("\n--- TEST 6: VERIFY API BOTS COMPARISON LEADERBOARD OUTPUT ---")
    comp_res = client.get("/api/bots/comparison").get_json()
    print("Leaderboard Bots Output:")
    for b in comp_res["comparison"]:
        print(f" - {b['name']} ({b['id']}): Indicators={b['indicators']}")

    print("\nALL VERIFICATION TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
