import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent))

# Configure utf-8 console output for Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from src import db

def check_latest():
    db.init_db()
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM trades_log ORDER BY id DESC LIMIT 1")
    r = c.fetchone()
    conn.close()

    if r:
        t = dict(r)
        print("==========================================================================")
        print("  NEWEST NATURAL STRATEGY TRADE EXECUTED ON LIVE MARKET CANDLE")
        print("==========================================================================")
        print(f"• Trade ID in DB: #{t['id']}")
        print(f"• Timestamp: {t['timestamp']}")
        print(f"• Symbol: {t['symbol']}")
        print(f"• Direction: {t['direction']}")
        print(f"• Entry Price: ${t['entry_price']:,.2f}")
        print(f"• Stop Loss: ${t['stop_loss']:,.2f}")
        print(f"• Take Profit: ${t['take_profit']:,.2f}")
        print(f"• Position Size: {t['position_size']} BTC (Full $10,000 Paper Capital Basis)")
        print(f"• Status: {t['status']}")
        print(f"• Strategy: '{t['strategy']}'")
        print(f"• Metadata: {t['metadata']}")

if __name__ == "__main__":
    check_latest()
