import sys
from pathlib import Path
from datetime import datetime
import sqlite3

# Add project source to sys.path dynamically
project_dir = Path(__file__).resolve().parent.parent
if str(project_dir) not in sys.path:
    sys.path.append(str(project_dir))

from src import config
from src import db

def main():
    print("=" * 60)
    print("              BTC TRADING BOT STATUS MONITOR")
    print("=" * 60)

    # 1. Query Heartbeat
    last_heartbeat_ts = None
    last_heartbeat_status = None
    minutes_ago = None
    alive_status = "UNKNOWN"

    try:
        conn = db.get_connection()
        cursor = conn.cursor()
        
        # Check if table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='heartbeat_log'")
        if cursor.fetchone():
            cursor.execute("SELECT timestamp, status FROM heartbeat_log ORDER BY id DESC LIMIT 1")
            row = cursor.fetchone()
            if row:
                last_heartbeat_ts = row['timestamp']
                last_heartbeat_status = row['status']
                
                # Parse timestamp and compute delta
                last_dt = datetime.fromisoformat(last_heartbeat_ts)
                now = datetime.utcnow()
                delta = now - last_dt
                minutes_ago = delta.total_seconds() / 60.0
                
                # Check expected window (plus 5 minute grace period)
                if minutes_ago <= (config.CHECK_INTERVAL_MINS + 5):
                    if last_heartbeat_status == "OK":
                        alive_status = "BOT APPEARS ALIVE"
                    else:
                        alive_status = "ALIVE BUT LAST CYCLE FAILED - check system_errors"
                else:
                    alive_status = "WARNING: NO RECENT HEARTBEAT (Possible Crash)"
            else:
                alive_status = "WARNING: NO HEARTBEATS RECORDED"
        else:
            alive_status = "WARNING: HEARTBEAT LOG TABLE NOT INITIALIZED YET"
            
    except Exception as e:
        alive_status = f"ERROR QUERYING DATABASE: {e}"

    print("[+] Heartbeat Check:")
    if last_heartbeat_ts:
        print(f"    Last check-in: {last_heartbeat_ts} UTC")
        print(f"    Status:        {last_heartbeat_status}")
        print(f"    Time Elapsed:  {minutes_ago:.1f} minutes ago")
    print(f"    Interval:      {config.CHECK_INTERVAL_MINS} minutes")
    print(f"    Result:        {alive_status}")
    print("-" * 60)

    # 2. Kill Switch Check
    kill_switch_active = config.KILL_SWITCH_FILE.exists()
    print("[+] Kill Switch Check:")
    if kill_switch_active:
        print(f"    Status:        ACTIVE (Halted: {config.KILL_SWITCH_FILE.name} exists)")
    else:
        print("    Status:        INACTIVE (Running normally)")
    print("-" * 60)

    # 3. Open Trades Check
    open_trade = None
    try:
        cursor.execute("SELECT * FROM trades_log WHERE status = 'OPEN' LIMIT 1")
        open_trade = cursor.fetchone()
    except Exception as e:
        print(f"[!] Error reading trades_log: {e}")

    print("[+] Open Trade Position:")
    if open_trade:
        print(f"    ID:            {open_trade['id']}")
        print(f"    Entry Time:    {open_trade['timestamp']} UTC")
        print(f"    Direction:     {open_trade['direction']}")
        print(f"    Size:          {open_trade['position_size']:.4f} BTC")
        print(f"    Entry Price:   ${open_trade['entry_price']:.2f}")
        print(f"    Stop Loss:     ${open_trade['stop_loss']:.2f}")
        print(f"    Take Profit:   ${open_trade['take_profit']:.2f}")
    else:
        print("    No active open trades found.")
    print("-" * 60)

    # 4. Last 5 Signals
    signals = []
    try:
        cursor.execute("SELECT timestamp, signal_type, price, is_blocked, reason FROM signals_log ORDER BY id DESC LIMIT 5")
        signals = cursor.fetchall()
    except Exception as e:
        print(f"[!] Error reading signals_log: {e}")

    print("[+] Last 5 Strategy Signals:")
    if signals:
        for sig in signals:
            if sig['signal_type'] in ["LONG", "SHORT"]:
                state_str = "Signal fired"
            elif sig['is_blocked']:
                state_str = f"Blocked: {sig['reason']}"
            else:
                state_str = "No trigger"
            print(f"    {sig['timestamp'][:16]} | {sig['signal_type']:5} | Price: ${sig['price']:.2f} | {state_str}")
    else:
        print("    No signals recorded.")
    print("-" * 60)

    # 5. Last 3 Errors
    errors = []
    try:
        cursor.execute("SELECT timestamp, error_message FROM system_errors ORDER BY id DESC LIMIT 3")
        errors = cursor.fetchall()
    except Exception as e:
        print(f"[!] Error reading system_errors: {e}")

    print("[+] System Error Logs (Last 3):")
    if errors:
        for err in errors:
            print(f"    {err['timestamp'][:16]} | {err['error_message']}")
    else:
        print("    No system errors recorded.")
    print("=" * 60)
    
    if conn:
        conn.close()

if __name__ == "__main__":
    main()
