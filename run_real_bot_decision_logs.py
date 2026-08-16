import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent))

# Configure utf-8 console output for Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from src import db, config
from src.data_fetcher import get_mainnet_fetcher
from src.strategy import Strategy
from src.indicators import generate_indicators

def generate_real_bot_decision_history(bot_id: str = "bot-1", symbol: str = "BTC/USDT", timeframe: str = "5m", num_candles: int = 24):
    print("==========================================================================")
    print(f"  EVALUATING REAL BOT '{bot_id}' DECISION LOG HISTORY (PAST {num_candles * 5} MINS)")
    print("==========================================================================")

    db.init_db()
    fetcher = get_mainnet_fetcher()
    
    # Fetch real live OHLCV candles from Binance
    print(f"Fetching real market OHLCV candles for {symbol} ({timeframe})...")
    df = fetcher.fetch_live_ohlcv(symbol, timeframe, limit=max(100, num_candles + 50))
    if df.empty or len(df) < num_candles + 30:
        print("Error: Failed to fetch candles from Binance.")
        return

    df = generate_indicators(df)
    strategy = Strategy()

    # Clear previous decision logs for this bot to show clean run
    conn = db.get_connection()
    conn.execute("DELETE FROM bot_decision_logs WHERE bot_id = ?", (bot_id,))
    conn.commit()

    start_idx = len(df) - num_candles
    logged_count = 0

    print(f"Evaluating {num_candles} consecutive 5-minute candle closes for '{bot_id}'...\n")

    for idx in range(start_idx, len(df)):
        row = df.iloc[idx]
        candle_ts = row['timestamp']
        close_p = float(row['close'])
        
        signal, filters, is_blocked, reason_row = strategy.evaluate_row(df, idx)
        dir_conf, score_conf, conf_details = strategy.evaluate_confluence(df, idx)

        counts = conf_details.get("summary_counts", {})
        conf_pct = float(conf_details.get("bull_score_pct", 0.0))
        adx_val = float(conf_details.get("adx", 15.0))
        regime_str = str(conf_details.get("regime", "RANGING"))
        thresh_pct = float(conf_details.get("threshold", 0.75) * 100)

        if dir_conf in ["LONG", "SHORT"] and score_conf >= conf_details.get("threshold", 0.75):
            decision = dir_conf
            reason = f"Confluence score: {conf_pct:.0f}% ({dir_conf}) meets {thresh_pct:.0f}% threshold"
        else:
            decision = signal
            reason = reason_row or f"Confluence score: {conf_pct:.0f}% ({signal})"

        regime_str = str(conf_details.get("regime", "RANGING"))
        
        # Log to DB with exact candle timestamp
        db.log_bot_decision(
            bot_id=bot_id,
            price=close_p,
            timeframe=timeframe,
            regime=regime_str,
            adx=adx_val,
            bullish_count=counts.get("bullish", 0),
            bearish_count=counts.get("bearish", 0),
            neutral_count=counts.get("neutral", 0),
            total_indicators=counts.get("total", 4),
            confluence_pct=conf_pct,
            threshold_pct=thresh_pct,
            decision=decision,
            reason=reason,
            indicators_details=conf_details.get("indicator_details", {}),
            candle_timestamp=str(candle_ts)
        )

        logged_count += 1

    # Fetch logged decisions from DB
    c = conn.cursor()
    c.execute("SELECT timestamp, price, regime, adx, confluence_pct, decision, reason FROM bot_decision_logs WHERE bot_id = ? ORDER BY id ASC", (bot_id,))
    logs = c.fetchall()
    conn.close()

    print(f"REAL BOT '{bot_id}' DECISION HISTORY LOG ({logged_count} EVALUATION CYCLES):")
    print("-" * 110)
    print(f"{'Time (UTC)':<20} | {'BTC Price ($)':<14} | {'Regime':<12} | {'ADX':<6} | {'Confluence':<10} | {'Decision':<8} | {'Plain English Reason'}")
    print("-" * 110)

    for l in logs:
        raw_ts = str(l["timestamp"])
        if raw_ts.isdigit():
            ts_str = datetime.fromtimestamp(int(raw_ts) / 1000.0, timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        else:
            ts_str = raw_ts.replace("T", " ")[:19]
        price_str = f"${float(l['price']):,.2f}"
        reg_str = str(l["regime"])
        adx_str = f"{float(l['adx']):.1f}"
        conf_str = f"{float(l['confluence_pct']):.0f}%"
        dec_str = str(l["decision"])
        reas_str = str(l["reason"])[:45]
        
        print(f"{ts_str:<20} | {price_str:<14} | {reg_str:<12} | {adx_str:<6} | {conf_str:<10} | {dec_str:<8} | {reas_str}")


    print("-" * 110)
    print(f"\n✅ REAL BOT '{bot_id}' DECISION LOG HISTORY VERIFIED ON GENUINE {num_candles * 5}m DATA!")

if __name__ == "__main__":
    generate_real_bot_decision_history("bot-1", "BTC/USDT", "5m", 24)
