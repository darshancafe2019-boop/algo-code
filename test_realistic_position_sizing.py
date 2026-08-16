import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent))

# Configure utf-8 console output for Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from src import config, db
from src.risk_manager import RiskManager
from src.live_runner import LiveRunner

def test_realistic_position_sizing_and_pnl():
    print("==========================================================================")
    print("  VERIFYING REALISTIC POSITION SIZING & P&L ($10,000 PAPER CAPITAL)")
    print("==========================================================================")

    db.init_db()
    rm = RiskManager()
    
    paper_capital = 10000.0
    entry_price = 64250.0
    sl_price = 62965.0 # 2% SL distance ($1,285 per BTC)
    tp_price = 67462.50 # 5% TP distance (+$3,212.50 per BTC)

    # 1. Calculate position size using $10,000 paper capital
    pos_size = rm.calculate_position_size(paper_capital, entry_price, sl_price)
    trade_value = pos_size * entry_price

    print(f"[POSITION SIZING CALCULATION]")
    print(f"• Paper Trading Capital: ${paper_capital:,.2f}")
    print(f"• Entry Price: ${entry_price:,.2f}")
    print(f"• Stop Loss: ${sl_price:,.2f} (-2.0%)")
    print(f"• Take Profit: ${tp_price:,.2f} (+5.0%)")
    print(f"• Risk Per Trade (2%): ${paper_capital * 0.02:,.2f}")
    print(f"• Calculated Position Size: {pos_size:.4f} BTC")
    print(f"• Total Trade Position Value: ${trade_value:,.2f}")

    # 2. Simulate WIN trade P&L (TP hit)
    win_pnl = round((tp_price - entry_price) * pos_size, 2)
    # Simulate LOSS trade P&L (SL hit)
    loss_pnl = round((sl_price - entry_price) * pos_size, 2)

    print(f"\n[SIMULATED TRADE RESULTS]")
    print(f"• Win Trade (+5% move): +${win_pnl:,.2f} USDT")
    print(f"• Loss Trade (-2% move): -${abs(loss_pnl):,.2f} USDT")

    # Log clean strategy trade entry in DB for bot-1
    trade_id = db.log_trade_entry(
        symbol="BTC/USDT",
        direction="LONG",
        entry_price=entry_price,
        stop_loss=sl_price,
        take_profit=tp_price,
        position_size=pos_size,
        metadata={"paper_capital": paper_capital, "risk_pct": 0.02},
        bot_id="bot-1",
        strategy="EMA_MACD_VP"
    )

    # Log exit with realistic +$500 PnL
    db.log_trade_exit(trade_id, tp_price, win_pnl, reason="Take Profit Hit (+5%)")

    # Query DB trade journal to confirm clean strategy name and realistic P&L
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("SELECT id, symbol, direction, strategy, position_size, result_pnl, remarks, emotion_tag FROM trades_log WHERE id = ?", (trade_id,))
    t = dict(c.fetchone())
    conn.close()

    print(f"\n[VERIFIED TRADE JOURNAL ENTRY]")
    print(f"• Trade ID: #{t['id']}")
    print(f"• Symbol: {t['symbol']}")
    print(f"• Strategy: '{t['strategy']}' (Clean strategy name, no annotations)")
    print(f"• Position Size: {t['position_size']} BTC")
    print(f"• Realized P&L: +${t['result_pnl']:,.2f} USDT")

    assert pos_size >= 0.10, f"Position size {pos_size} is too small!"
    assert win_pnl >= 100.0, f"P&L {win_pnl} is too small!"
    assert t['strategy'] == "EMA_MACD_VP", f"Strategy name '{t['strategy']}' is polluted!"

    print("\n✅ REALISTIC POSITION SIZING & CLEAN TRADE JOURNAL VERIFIED SUCCESSFULLY!")

if __name__ == "__main__":
    test_realistic_position_sizing_and_pnl()
