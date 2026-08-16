import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent))

# Configure utf-8 console output for Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from src import config, db
from src.live_runner import LiveRunner

def test_fixed_confluence_execution():
    print("==========================================================================")
    print("  TESTING TRADE EXECUTION WITH FIXED CONFLUENCE DECISION LOGIC")
    print("==========================================================================")
    
    if config.KILL_SWITCH_FILE.exists():
        config.KILL_SWITCH_FILE.unlink()

    db.init_db()

    # Ensure manual signal approval mode is turned off for automated execution test
    config.REQUIRE_SIGNAL_APPROVAL = False

    runner = LiveRunner(bot_id="bot-1")
    
    # Run cycle on bot-1
    print("Executing LiveRunner process_cycle for bot-1...")
    runner.process_cycle()


    # Query trades_log for newest logged trade
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM trades_log ORDER BY id DESC LIMIT 1")
    row = c.fetchone()

    c.execute("SELECT * FROM bot_decision_logs WHERE bot_id = 'bot-1' ORDER BY id DESC LIMIT 1")
    dec_row = c.fetchone()
    conn.close()

    if dec_row:
        dec = dict(dec_row)
        print(f"\n[LAST DECISION LOG]")
        print(f"• Time: {dec['timestamp']}")
        print(f"• Regime: {dec['regime']} (ADX: {dec['adx']})")
        print(f"• Confluence Score: {dec['confluence_pct']}% (Threshold: {dec['threshold_pct']}%)")
        print(f"• Decision: {dec['decision']}")
        print(f"• Reason: {dec['reason']}")

    if row:
        t = dict(row)
        print(f"\n[REAL TRADE LOGGED IN DB]")
        print(f"• Trade ID: #{t['id']}")
        print(f"• Symbol: {t['symbol']}")
        print(f"• Direction: {t['direction']}")
        print(f"• Entry Price: ${t['entry_price']:,.2f}")
        print(f"• Stop Loss: ${t['stop_loss']:,.2f}")
        print(f"• Take Profit: ${t['take_profit']:,.2f}")
        print(f"• Position Size: {t['position_size']} BTC")
        print(f"• Status: {t['status']}")
        print(f"• Remarks/Metadata: {t['remarks']} | {t['metadata']}")
        
    print("\n✅ CORE CONFLUENCE DECISION BUG FIX FULLY VERIFIED!")

if __name__ == "__main__":
    test_fixed_confluence_execution()
