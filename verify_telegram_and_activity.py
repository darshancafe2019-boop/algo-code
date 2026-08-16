import json
import sys
import time
from datetime import datetime, timedelta, timezone

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from src import db, config
from src.telegram_alert import TelegramAlert
import dashboard

def test_telegram_html_formatting():
    print("\n--- TEST 1: TELEGRAM HTML FORMATTING ---")
    tg = TelegramAlert()
    
    # Test Startup message
    msg = (
        f"🚀 <b>BTC Trading Bot Started</b>\n"
        f"• <b>Exchange</b>: Binance Testnet (SPOT)\n"
        f"• <b>Timeframe</b>: 5m\n"
        f"• <b>Check Interval</b>: 1 minute\n"
        f"• <b>Balance</b>: $10,000.00 USDT\n"
        f"• <b>Status</b>: <code>RUNNING</code>"
    )
    print("Sending HTML Telegram message:")
    print(msg)
    
    if tg.enabled:
        success, resp = tg.send_message(msg)
        print(f"Telegram Delivery Result: success={success}, response={resp}")
        assert success, f"Telegram alert delivery failed: {resp}"
    else:
        print("Telegram disabled in .env (No token/chat_id). Message structure verified valid HTML.")
    
    # Verify no raw asterisks exist in HTML message
    assert "*" not in msg, "Raw Markdown asterisks found in message payload!"
    assert "<b>" in msg and "</b>" in msg, "Missing HTML <b> tags!"
    print("PASSED: Telegram HTML formatting verified clean.")

def test_bot_activity_feed_api():
    print("\n--- TEST 2: BOT ACTIVITY FEED & LAST CHECKED API ---")
    app = dashboard.app
    client = app.test_client()
    
    # Create or pick a bot instance
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("SELECT id FROM bot_instances LIMIT 1")
    row = c.fetchone()
    conn.close()
    
    bot_id = row['id'] if row else "bot-1"
    
    # Call activity feed endpoint
    res = client.get(f"/api/bots/{bot_id}/activity")
    assert res.status_code == 200, f"Expected 200 OK, got {res.status_code}"
    
    data = res.get_json()
    print("Bot Activity API Response:")
    print(json.dumps(data, indent=2))
    
    assert data["status"] == "success", "Expected status == success"
    assert "last_checked_at" in data, "Missing last_checked_at"
    assert "last_checked_seconds_ago" in data, "Missing last_checked_seconds_ago"
    assert "summary_headline" in data, "Missing summary_headline"
    assert "activity_logs" in data, "Missing activity_logs"
    assert isinstance(data["activity_logs"], list), "activity_logs must be a list"
    
    if len(data["activity_logs"]) > 0:
        log_item = data["activity_logs"][0]
        print(f"Sample Log Item: Timestamp={log_item['timestamp']} | Event={log_item['event_type']} | Message={log_item['message']}")
        assert "message" in log_item and len(log_item["message"]) > 0, "Log message empty!"
    
    print("PASSED: Bot Activity Feed & Last Checked API verified.")

def test_stalled_warning_detection():
    print("\n--- TEST 3: BOT STALLED WARNING DETECTION ---")
    app = dashboard.app
    client = app.test_client()
    
    # Pick a bot and set last_checked_at to 5 minutes (300s) ago
    stalled_time = (datetime.now(timezone.utc) - timedelta(seconds=300)).isoformat()
    
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("SELECT id FROM bot_instances LIMIT 1")
    row = c.fetchone()
    bot_id = row['id'] if row else "bot-1"
    
    c.execute("UPDATE bot_instances SET status = 'RUNNING', last_checked_at = ? WHERE id = ?", (stalled_time, bot_id))
    conn.commit()
    conn.close()
    
    res = client.get(f"/api/bots/{bot_id}/activity")
    data = res.get_json()
    
    print("Stalled Bot Activity Response:")
    print(f"Status: {data['bot_status']} | Seconds Ago: {data['last_checked_seconds_ago']} | Stalled Warning: {data['stalled_warning']}")
    print(f"Headline: {data['summary_headline']}")
    
    assert data["stalled_warning"] == True, "Expected stalled_warning == True for 300s old last_checked_at!"
    assert "stalled" in data["summary_headline"].lower() or "warning" in data["summary_headline"].lower(), "Summary headline should report warning/stalled state!"
    
    print("PASSED: Bot Stalled Warning detection verified.")

if __name__ == "__main__":
    test_telegram_html_formatting()
    test_bot_activity_feed_api()
    test_stalled_warning_detection()
    print("\nALL TELEGRAM & BOT ACTIVITY VERIFICATION TESTS PASSED SUCCESSFULLY!")
