import sys
import json
from datetime import datetime, timezone

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from src import db, config
import dashboard

def test_decision_logs_api():
    print("\n--- TEST: DECISION LOGS & STRATEGY DIAGNOSIS API ---")
    app = dashboard.app
    client = app.test_client()
    
    bot_id = "test-bot-xyz"
    
    # Create test bot instance
    conn = db.get_connection()
    c = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()
    c.execute("INSERT OR REPLACE INTO bot_instances (id, name, symbol, strategy, timeframe, allocated_capital, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              (bot_id, "Test Diagnosis Bot", "BTC/USDT", "EMA_MACD_VP", "5m", 10000.0, "RUNNING", now_iso))
    conn.commit()
    conn.close()

    db.log_bot_decision(
        bot_id=bot_id,
        price=64320.0,
        timeframe="5m",
        regime="RANGING",
        adx=18.5,
        bullish_count=1,
        bearish_count=1,
        neutral_count=2,
        total_indicators=4,
        confluence_pct=25.0,
        threshold_pct=75.0,
        decision="HOLD",
        reason="Confluence score: 25% (HOLD) — indicators do not agree",
        indicators_details={
            "RSI": {"bias": 0, "reason": "RSI (14): 52 → Neutral"},
            "EMA 9": {"bias": 1, "reason": "EMA 9: above EMA 20 → Bullish"},
            "MACD": {"bias": -1, "reason": "MACD: below signal line → Bearish"},
            "ADX": {"bias": 0, "reason": "ADX: 18 → Market is RANGING"}
        }
    )
    
    db.log_bot_decision(
        bot_id=bot_id,
        price=64350.0,
        timeframe="5m",
        regime="RANGING",
        adx=19.2,
        bullish_count=2,
        bearish_count=1,
        neutral_count=1,
        total_indicators=4,
        confluence_pct=50.0,
        threshold_pct=75.0,
        decision="HOLD",
        reason="Confluence score: 50% (HOLD) — needs 75% to trade",
        indicators_details={
            "RSI": {"bias": 1, "reason": "RSI (14): 58 → Bullish"},
            "EMA 9": {"bias": 1, "reason": "EMA 9: above EMA 20 → Bullish"},
            "MACD": {"bias": -1, "reason": "MACD: below signal line → Bearish"},
            "ADX": {"bias": 0, "reason": "ADX: 19 → Market is RANGING"}
        }
    )
    
    res = client.get(f"/api/bots/{bot_id}/decisions")
    assert res.status_code == 200, f"Expected 200 OK, got {res.status_code}"
    
    data = res.get_json()
    print("\nDecisions API Response Payload:")
    print(f"Bot Name: {data.get('bot_name')}")
    print(f"Total Cycles Completed: {data.get('total_cycles_completed')}")
    print(f"Next Cycle In: ~{data.get('next_cycle_seconds')}s")
    print(f"Strategy Diagnosis: {data.get('diagnosis_summary')}")
    
    decisions = data.get("decisions", [])
    assert len(decisions) >= 2, f"Expected >= 2 decision entries, got {len(decisions)}"
    
    latest = decisions[0]
    print("\nLatest Decision Entry Sample:")
    print(f"Price: ${latest['price']} | Timeframe: {latest['timeframe']}")
    print(f"Result Summary: {latest['bullish_count']} Bullish, {latest['bearish_count']} Bearish, {latest['neutral_count']} Neutral")
    print(f"Confluence Score: {latest['confluence_pct']}% (Threshold: {latest['threshold_pct']}%)")
    print(f"Decision Title: {latest['decision_title']}")
    print("Indicator Bullets:")
    for b in latest['indicator_bullets']:
        print(f"  • [{b['bias_label']}] {b['name']}: {b['reason']}")
        
    assert latest['decision'] == "HOLD", "Expected decision HOLD"
    assert "No trades yet" in data.get('diagnosis_summary'), "Expected plain-language diagnosis explanation"
    print("\nPASSED: Decision Log API & Strategy Diagnosis verified successfully!")

if __name__ == "__main__":
    test_decision_logs_api()
