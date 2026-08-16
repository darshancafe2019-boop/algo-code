# BTC Algorithmic Trading Bot (Rule-Based, Single User)

This is a Python-based rule-based Bitcoin (BTC) trading bot designed for backtesting, walk-forward validation, and scheduled paper trading (alert-only mode) on the Binance Testnet.

## Strategy Rules

The bot checks for trade signals every cycle by combining four indicators:
1. **Trend Filter**: Close price must be above EMA 200 for LONG trades, or below EMA 200 for SHORT trades (if allowed).
2. **Timing Trigger**: EMA 9 crossing above EMA 20 (for LONG entries) or crossing below EMA 20 (for SHORT entries).
3. **Momentum Confirmation**: MACD line must be positive (> 0) for LONG entries, or negative (< 0) for SHORT entries.
4. **Location Filter**: Close price must reside within the Volume Profile Value Area Low (VAL) and Value Area High (VAH) range (with a configurable percentage buffer). The Volume Profile is calculated dynamically over a rolling lookback window using a High-Low range split volume assignment algorithm.

---

## Project Structure

```
/btc-bot
  /data/                   <- SQLite database and raw historical CSV logs
  /src/
    - config.py            <- Unified parameters for indicators, risk, and scheduling
    - data_fetcher.py      <- Handles historical (Mainnet) and live (Testnet/Mainnet) fetches via ccxt
    - indicators.py        <- Technical indicators calculations (EMA, MACD, Volume Profile)
    - strategy.py          <- Evaluates entry/exit signal rules
    - risk_manager.py      <- Sizing, SL/TP rules, daily drawdown checks, and kill switch checks
    - backtester.py        <- Backtrader historical simulator & walk-forward engine
    - db.py                <- SQLite setup and logging interface
    - telegram_alert.py    <- Synchrounous direct requests Telegram notification client
    - live_runner.py       <- APScheduler cycle check on Binance Testnet (Alert-Only)
    - backup.py            <- Copies database and raw data to /backup/ folder
  /tests/
    - test_indicators.py   <- Pytest verifying EMA, MACD, and custom Volume Profile
    - test_strategy.py     <- Pytest verifying filter combinations and blocked states
  .env.example             <- Template configurations file
  .gitignore               <- Excludes databases, credentials, data/, and run flags from Git
  requirements.txt         <- Project dependencies
  README.md                <- Detailed startup, running, and recovery documentation
```

---

## Setup Instructions

1. **Install Dependencies**:
   Initialize your environment (Python 3.11+) and run:
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Fill in your credentials:
   - `BINANCE_TESTNET_API_KEY`: Your Binance Testnet API key.
   - `BINANCE_TESTNET_SECRET_KEY`: Your Binance Testnet API secret.
   - `TELEGRAM_BOT_TOKEN`: Token obtained from Telegram's `@BotFather`.
   - `TELEGRAM_CHAT_ID`: Chat ID to receive alerts.

3. **Configure Strategy/Risk Parameters**:
   All trading settings (timeframe, EMA lengths, risk percentage, stop-loss method, etc.) can be customized directly in [src/config.py](file:///k:/fake/algo/btc-bot/src/config.py).

---

## Running the Bot

### 1. Run Unit Tests
To verify all calculations are working correctly on your machine, run:
   ```bash
   python -m pytest btc-bot/tests/
   ```

### 2. Fetch Market Data & Verify Indicators
To download historical market data (Binance Mainnet public endpoints) and print indicator samples, execute:
   ```bash
   # Generates btc_historical_1h.csv under btc-bot/data/
   python btc-bot/scripts/verify_indicators.py
   ```

### 3. Run Historical & Walk-Forward Backtests
To simulate performance metrics (trades count, win rate, Sharpe ratio, profit factor, max drawdown) and verify walk-forward in-sample vs out-of-sample data splits, execute:
   ```bash
   python btc-bot/scripts/run_backtests.py
   ```
   *Note: Results will automatically log into the `backtest_runs` table in SQLite and `data/backtest_runs.csv`.*

### 4. Run Scheduled Paper Trading (Alert-Only)
To run the automated scheduled trading cycle loop (default checks every 60 minutes) which pulls live market candles, executes risk sizing/rules, logs steps, and dispatches Telegram notifications, run:
   ```bash
   python -m btc-bot.src.live_runner
   ```

---

## Enforcing a Kill Switch

The bot implements a file-based kill switch checks before every schedule cycle.

- **To Halt the Bot**: Create an empty file named `kill_switch.flag` in the root folder of the project (`btc-bot/`).
- **To Resume Trading**: Delete the `kill_switch.flag` file.

*When the flag file is present, the live runner skips calculations, blocks signals, and sends a warning message to Telegram.*

---

## Backing Up & Restoring Local Data

### Backup
To back up your trade database (`trading_bot.db`) and historical raw CSV files on-demand, run:
```bash
python -m btc-bot.src.backup
```
This copies data to `backup/backup_YYYYMMDD_HHMMSS/` in the project root. You can schedule this script (e.g. using Windows Task Scheduler or cron) to automate backups.

### Recovery / Restore Instructions
In case of database corruption or data loss:
1. Locate your latest backup subfolder in `backup/` (e.g., `backup/backup_20260716_120000/`).
2. Copy `trading_bot.db` from the backup folder back into the `data/` folder.
3. Copy all files inside the backup `data/` subfolder back into the project `data/` folder.
4. Restart your bot runner.
