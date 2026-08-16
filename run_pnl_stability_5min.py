import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent))

# Configure utf-8 console output for Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from src import db, config

def run_pnl_stability_check_5min():
    print("==========================================================================")
    print("  RUNNING 5+ MINUTE P&L STABILITY & DRIFT VERIFICATION (300 SECONDS)")
    print("==========================================================================")
    
    db.init_db()

    # Log initial snapshot
    snapshots = []
    duration_seconds = 300
    check_interval = 30
    total_checks = (duration_seconds // check_interval) + 1

    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] Starting 5-minute stability check ({total_checks} intervals @ 30s)...")
    print(f"{'Time':<12} | {'Balance ($)':<12} | {'Equity ($)':<12} | {'Open PnL ($)':<12} | {'Today PnL ($)':<12} | {'Status'}")
    print("-" * 80)

    for i in range(total_checks):
        conn = db.get_connection()
        c = conn.cursor()
        
        # Read system health
        c.execute("SELECT balance, equity FROM system_health ORDER BY id DESC LIMIT 1")
        hr = c.fetchone()
        bal = float(hr["balance"]) if hr else 10000.0
        eq = float(hr["equity"]) if hr else bal
        
        # Read today's realized PnL
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        c.execute("SELECT SUM(result_pnl) FROM trades_log WHERE status='CLOSED' AND exit_timestamp LIKE ?", (f"{today_str}%",))
        row_pnl = c.fetchone()[0]
        today_pnl = float(row_pnl) if row_pnl is not None else 0.0
        
        # Read open trades count
        c.execute("SELECT COUNT(*) FROM trades_log WHERE status='OPEN'")
        open_cnt = c.fetchone()[0]
        conn.close()

        open_pnl = round(eq - bal, 2)
        now_ts = datetime.now(timezone.utc).strftime("%H:%M:%S")

        snap = {
            "time": now_ts,
            "balance": bal,
            "equity": eq,
            "open_pnl": open_pnl,
            "today_pnl": today_pnl,
            "open_cnt": open_cnt
        }
        snapshots.append(snap)

        print(f"{now_ts:<12} | ${bal:<11.2f} | ${eq:<11.2f} | ${open_pnl:<11.2f} | ${today_pnl:<11.2f} | Open: {open_cnt}")

        if i < total_checks - 1:
            time.sleep(check_interval)

    print("=" * 80)
    print("ANALYSIS OF 5-MINUTE P&L STABILITY:")

    initial_bal = snapshots[0]["balance"]
    initial_eq = snapshots[0]["equity"]
    initial_pnl = snapshots[0]["today_pnl"]

    bal_drift = max(abs(s["balance"] - initial_bal) for s in snapshots)
    eq_drift = max(abs(s["equity"] - initial_eq) for s in snapshots)
    pnl_drift = max(abs(s["today_pnl"] - initial_pnl) for s in snapshots)

    print(f"• Duration Monitored: {duration_seconds} seconds (5.0 minutes)")
    print(f"• Balance Drift: ${bal_drift:.4f}")
    print(f"• Equity Drift:  ${eq_drift:.4f}")
    print(f"• P&L Drift:     ${pnl_drift:.4f}")

    assert bal_drift == 0.0, f"Balance drift detected: ${bal_drift}"
    assert eq_drift == 0.0, f"Equity drift detected: ${eq_drift}"
    assert pnl_drift == 0.0, f"P&L drift detected: ${pnl_drift}"

    print("\n✅ P&L STABILITY VERIFIED: Zero unwanted calculation drift across 5 full minutes!")

if __name__ == "__main__":
    run_pnl_stability_check_5min()
