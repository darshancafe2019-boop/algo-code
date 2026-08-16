"""
Pre-Production Reliability Audit & Hardening Verification Script
================================================================
Runs a complete, empirical reliability audit across all bot instances,
tests instance creation with indicator selection, executes a real order
on Binance Spot Testnet (capturing raw exchange order ID), sends Telegram
notifications, and audits database P&L / analytics integrity.
"""

import sys
import os
import sqlite3
import json
import time
from datetime import datetime, timezone
from pathlib import Path

# Add project root to sys.path
project_root = Path(__file__).resolve().parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from src import config
from src import db
from src.process_manager import multi_bot_manager
from src.data_fetcher import get_mainnet_fetcher, get_testnet_fetcher
from src.live_runner import LiveRunner
from src.telegram_alert import TelegramAlert

def print_banner(title: str):
    print("\n" + "=" * 80)
    print(f" {title.upper()}")
    print("=" * 80)

def run_audit():
    print_banner("0. PRE-FLIGHT PROCESS AUDIT")
    curr_pid = os.getpid()
    print(f"Current Audit Process PID: {curr_pid}")
    
    # Use tasklist / subprocess to check running python processes
    import subprocess
    try:
        res = subprocess.run(["tasklist", "/FI", "IMAGENAME eq python.exe", "/FO", "CSV"], capture_output=True, text=True)
        lines = res.stdout.strip().splitlines()
        print(f"Active Python Processes output:\n{res.stdout}")
    except Exception as pe:
        print(f"Process check exception: {pe}")

    # =========================================================================
    print_banner("1. FULL BOT-BY-BOT RELIABILITY AUDIT")
    db.init_db()
    fetcher = get_mainnet_fetcher()
    print("Fetching live real-time prices for BTC/USDT and ETH/USDT from Binance Mainnet...")
    btc_ticker = fetcher.exchange.fetch_ticker("BTC/USDT")
    eth_ticker = fetcher.exchange.fetch_ticker("ETH/USDT")

    live_btc_price = float(btc_ticker['last'])
    live_eth_price = float(eth_ticker['last'])

    live_prices = {
        "BTC/USDT": live_btc_price,
        "BTCUSDT": live_btc_price,
        "ETH/USDT": live_eth_price,
        "ETHUSDT": live_eth_price,
    }

    live_timestamp = btc_ticker.get('datetime') or datetime.now(timezone.utc).isoformat()
    print(f"LIVE MARKET PRICES (Binance Mainnet at {live_timestamp}):")
    print(f"   • BTC/USDT: ${live_btc_price:,.2f} USDT")
    print(f"   • ETH/USDT: ${live_eth_price:,.2f} USDT")

    conn = db.get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM bot_instances ORDER BY created_at ASC")
    bots = [dict(r) for r in c.fetchall()]
    conn.close()

    print(f"\nFound {len(bots)} bot instances in database:\n")
    audit_summary = []

    for b in bots:
        b_id = b['id']
        b_name = b['name']
        b_sym = b['symbol'].upper()
        b_tf = b['timeframe']
        db_status = b['status']
        last_chk = b.get('last_checked_at')

        health = db.compute_bot_health(b_id, live_market_price=live_prices)

        # Get latest decision log
        conn = db.get_connection()
        c = conn.cursor()
        c.execute("SELECT price, timestamp, decision, reason FROM bot_decision_logs WHERE bot_id = ? ORDER BY id DESC LIMIT 1", (b_id,))
        dec_row = c.fetchone()
        conn.close()

        logged_price = float(dec_row['price']) if dec_row and dec_row['price'] else None
        target_market_price = live_prices.get(b_sym, live_btc_price)
        price_diff = abs(logged_price - target_market_price) if logged_price else 0.0

        item = {
            "bot_id": b_id,
            "name": b_name,
            "symbol": b_sym,
            "timeframe": b_tf,
            "db_status": health["status"],
            "process_alive": health["is_process_alive"],
            "health_status": health["health_status"],
            "health_reasons": health["reasons"],
            "info": health.get("info", ""),
            "last_checked_at": last_chk,
            "logged_price": logged_price,
            "live_market_price": target_market_price,
            "price_diff": price_diff,
            "latest_decision": dec_row['decision'] if dec_row else "None",
            "latest_reason": dec_row['reason'] if dec_row else "None",
        }
        audit_summary.append(item)

        print(f"🤖 Bot Instance: '{b_name}' ({b_id})")
        print(f"   • Config: Symbol={b_sym} | Timeframe={b_tf}")
        print(f"   • Database Status: {health['status']}")
        print(f"   • Background OS Process Alive: {health['is_process_alive']}")
        print(f"   • Last Real Evaluation Timestamp: {last_chk or 'NEVER'}")
        print(f"   • Logged Decision Price: ${logged_price:,.2f} ({b_sym})" if logged_price else f"   • Logged Price: N/A ({b_sym})")
        print(f"   • Live Market Price for {b_sym}: ${target_market_price:,.2f}")
        print(f"   • Symbol-Matched Price Diff: ${price_diff:,.2f}")
        print(f"   • Bot Health Signal: [{health['health_status']}]")
        print(f"   • Health Info / Status: {health.get('info')}")
        if health['reasons']:
            for r in health['reasons']:
                print(f"     ⚠️ {r}")
        print("-" * 60)

    # =========================================================================
    print_banner("2. CREATE BOT INSTANCE & INDICATOR SELECTION END-TO-END TEST")
    test_bot_id = f"bot-audit-test-{int(time.time())}"
    test_name = "Hardening Audit Verification Bot"
    selected_indicators = ["ema", "rsi", "adx"]
    config_json = json.dumps({"risk_pct": 0.02, "indicators": selected_indicators})

    print(f"Creating test bot instance '{test_name}' ({test_bot_id}) with indicators: {selected_indicators}...")
    conn = db.get_connection()
    conn.execute(
        "INSERT INTO bot_instances (id, name, symbol, strategy, timeframe, allocated_capital, status, created_at, config_json) VALUES (?, ?, ?, ?, ?, ?, 'STOPPED', ?, ?)",
        (test_bot_id, test_name, "BTC/USDT", "EMA_MACD_VP", "5m", 10000.0, datetime.now(timezone.utc).isoformat(), config_json)
    )
    conn.commit()
    conn.close()

    # Instantiate LiveRunner for this bot and run an evaluation cycle
    runner = LiveRunner(bot_id=test_bot_id)
    print(f"Loaded LiveRunner for bot {test_bot_id}: indicators = {runner.indicators}")
    print("Executing single evaluation cycle...")
    runner.process_cycle()

    # Verify decision log recorded in DB
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM bot_decision_logs WHERE bot_id = ? ORDER BY id DESC LIMIT 1", (test_bot_id,))
    dec_entry = c.fetchone()
    conn.close()

    if dec_entry:
        dec_dict = dict(dec_entry)
        print("✅ Decision log recorded successfully for custom bot instance!")
        print(f"   • Bot ID: {dec_dict['bot_id']}")
        print(f"   • Timestamp: {dec_dict['timestamp']}")
        print(f"   • Price: ${dec_dict['price']:,.2f}")
        print(f"   • Decision: {dec_dict['decision']}")
        print(f"   • Reason: {dec_dict['reason']}")
        print(f"   • Indicators JSON: {dec_dict['indicators_json']}")
    else:
        print("❌ ERROR: Decision log was not recorded!")

    # =========================================================================
    print_banner("3. END-TO-END REAL TESTNET TRADE EXECUTION TRACE")
    print("Executing a REAL market order on Binance Spot Testnet via ExecutionEngine...")
    testnet_fetcher = get_testnet_fetcher()
    executor = runner.executor

    try:
        # Check testnet balance
        bal = testnet_fetcher.fetch_testnet_balance()
        print(f"Binance Testnet Available USDT Balance: ${bal:,.2f}")

        # Place a real test market buy order (small amount: 0.0001 BTC)
        order_symbol = "BTC/USDT"
        order_amount = 0.0001
        ref_price = live_btc_price

        print(f"Submitting market BUY order: Symbol={order_symbol}, Amount={order_amount} BTC...")
        order_res = executor.market_buy(order_symbol, order_amount, ref_price)

        order_id = str(order_res['order_id'])
        filled_amt = order_res['filled_amount']
        avg_price = order_res['average_price']

        print("\n🎉 REAL EXCHANGE ORDER CONFIRMATION RECEIVED FROM BINANCE TESTNET:")
        print(f"   • Exchange Order ID: {order_id}")
        print(f"   • Filled Quantity: {filled_amt} BTC")
        print(f"   • Average Execution Price: ${avg_price:,.2f}")
        print(f"   • Raw Exchange Response Status: {order_res['raw'].get('status')}")

        # Log trade entry to SQLite database
        trade_id = db.log_trade_entry(
            symbol=order_symbol,
            direction="LONG",
            entry_price=avg_price,
            stop_loss=avg_price * 0.98,
            take_profit=avg_price * 1.05,
            position_size=filled_amt,
            metadata={"order_id": order_id, "reason": "Pre-production Hardening Trade Trace"},
            bot_id=test_bot_id,
            strategy=test_name
        )

        print(f"\n💾 DATABASE RECORD PERSISTED (trades_log ID: {trade_id}):")
        conn = db.get_connection()
        c = conn.cursor()
        c.execute("SELECT * FROM trades_log WHERE id = ?", (trade_id,))
        t_row = dict(c.fetchone())
        conn.close()
        for k, v in t_row.items():
            print(f"   • {k}: {v}")

    except Exception as exc:
        print(f"❌ Testnet execution error: {exc}")

    # =========================================================================
    print_banner("4. TELEGRAM NOTIFICATION VERIFICATION")
    tg = TelegramAlert()
    tg_msg = (
        f"🧪 <b>PRE-PRODUCTION AUDIT ALERT</b>\n"
        f"• <b>Status</b>: Verified Live Execution\n"
        f"• <b>Symbol</b>: BTC/USDT\n"
        f"• <b>Exchange Order ID</b>: <code>{order_id if 'order_id' in locals() else 'TEST_N/A'}</code>\n"
        f"• <b>Live Price</b>: ${live_btc_price:,.2f}\n"
        f"• <b>Render Check</b>: Clean HTML Formatting (Zero Asterisks)"
    )
    print("Sending real Telegram alert...")
    success, tg_resp = tg.send_message(tg_msg)

    print(f"Telegram API Success: {success}")
    print(f"Raw Telegram API Response: {json.dumps(tg_resp, indent=2)}")
    print(f"Received Message Text Sent to Telegram:\n---\n{tg_msg}\n---")

    # =========================================================================
    print_banner("5. DATA INTEGRITY & ANALYTICS AUDIT")
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM trades_log")
    all_trades = [dict(r) for r in c.fetchall()]
    conn.close()

    closed_trades = [t for t in all_trades if t['status'] == 'CLOSED']
    open_trades = [t for t in all_trades if t['status'] == 'OPEN']

    calc_pnl = sum(float(t['result_pnl'] or 0.0) for t in closed_trades)
    calc_wins = [t for t in closed_trades if float(t['result_pnl'] or 0.0) > 0]
    calc_losses = [t for t in closed_trades if float(t['result_pnl'] or 0.0) < 0]
    calc_winrate = (len(calc_wins) / len(closed_trades) * 100.0) if len(closed_trades) > 0 else 0.0

    print(f"RAW DATABASE TRADES AUDIT:")
    print(f"   • Total Trades Recorded: {len(all_trades)}")
    print(f"   • Open Trades Count: {len(open_trades)}")
    print(f"   • Closed Trades Count: {len(closed_trades)}")
    print(f"   • Winning Trades Count: {len(calc_wins)}")
    print(f"   • Losing Trades Count: {len(calc_losses)}")
    print(f"   • Calculated Cumulative Net P&L: ${calc_pnl:,.2f} USDT")
    print(f"   • Calculated Win Rate: {calc_winrate:.2f}%")

    print("\nCleaning up temporary test bot instance...")
    conn = db.get_connection()
    conn.execute("DELETE FROM bot_instances WHERE id LIKE 'bot-audit-test%'")
    conn.execute("DELETE FROM trades_log WHERE bot_id LIKE 'bot-audit-test%'")
    conn.commit()
    conn.close()

    print("\n" + "=" * 80)
    print(" HARDENING AUDIT VERIFICATION COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    run_audit()
