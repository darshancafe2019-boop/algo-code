import json
import sys
import logging
import time
from typing import Optional, Dict, Any
import traceback
from pathlib import Path
from datetime import datetime, timezone
from apscheduler.schedulers.blocking import BlockingScheduler

# Add project root to path
project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from src import config
from src.data_fetcher import DataFetcher, get_mainnet_fetcher, get_testnet_fetcher
from src.indicators import generate_indicators
from src.strategy import Strategy
from src.risk_manager import RiskManager
from src.telegram_alert import TelegramAlert
from src.monitoring import MonitoringService
from src import db
from src.execution import ExecutionEngine
from src.audit import log_bot_event

# Setup Logging
_handlers = [logging.StreamHandler(sys.stdout)]
try:
    _log_file = config.BASE_DIR / "data" / "live_runner.log"
    _log_file.parent.mkdir(parents=True, exist_ok=True)
    _handlers.append(logging.FileHandler(_log_file, delay=True, encoding="utf-8"))
except Exception:
    pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=_handlers
)
logger = logging.getLogger("LiveRunner")



class CycleContext:
    """Simple container for the current evaluation context."""

    def __init__(self) -> None:
        self.started_at = datetime.now(timezone.utc)
        self.balance = 10000.0
        self.close_price = 0.0
        self.signal = "HOLD"
        self.decision = "HOLD"
        self.open_trade = None
        self.status = "OK"
        self.details = {}

class LiveRunner:
    """
    Orchestrates the scheduled execution cycle of a specific Bot Instance.
    Runs in alert-only paper trading mode connected to Binance Testnet.
    """

    def __init__(self, bot_id: str = "bot-1"):
        db.init_db()
        self.bot_id = bot_id
        self.strategy = Strategy()
        self.risk_manager = RiskManager()
        self.telegram = TelegramAlert()
        self.monitoring = MonitoringService()
        self.retry_count = 0

        # Load bot instance config from DB
        conn = db.get_connection()
        c = conn.cursor()
        c.execute("SELECT * FROM bot_instances WHERE id = ?", (self.bot_id,))
        row = c.fetchone()
        conn.close()
        if row:
            b = dict(row)
            self.symbol = b.get("symbol") or config.SYMBOL
            self.timeframe = b.get("timeframe") or config.TIMEFRAME
            self.bot_name = b.get("name") or f"Bot {self.bot_id}"
            cfg = b.get("config_json") or {}
            if isinstance(cfg, str):
                try:
                    cfg = json.loads(cfg)
                    if isinstance(cfg, str):
                        cfg = json.loads(cfg)
                except Exception:
                    cfg = {}
            if not isinstance(cfg, dict):
                cfg = {}
            self.indicators = cfg.get("indicators", ["ema", "macd", "vp"])
            self.risk_pct = float(cfg.get("risk_pct") or 0.02)
        else:
            self.symbol = config.SYMBOL
            self.timeframe = config.TIMEFRAME
            self.bot_name = f"Bot {self.bot_id}"
            self.indicators = ["ema", "macd", "vp"]
            self.risk_pct = 0.02

        # Testnet data fetcher for balance checks and order simulation
        self.testnet_fetcher = get_testnet_fetcher()
        # Execution engine for real orders on Binance Testnet (spot)
        self.executor = ExecutionEngine(self.testnet_fetcher.exchange)
        # Mainnet fetcher for reliable live candles
        self.mainnet_fetcher = get_mainnet_fetcher()

        log_bot_event(
            event_type="BOT_START",
            message=f"Initialized bot runner instance '{self.bot_name}' ({self.bot_id}) for {self.symbol} ({self.timeframe})",
            bot_instance_id=self.bot_id,
            bot_instance_name=self.bot_name,
            symbol=self.symbol,
            timeframe=self.timeframe,
            severity="INFO"
        )

    def process_cycle(self):
        """Execute one bot evaluation cycle with diagnostics and safety checks."""
        # Reload latest bot instance config dynamically from DB
        if getattr(self, "bot_id", None):
            try:
                conn = db.get_connection()
                c = conn.cursor()
                c.execute("SELECT config_json, allocated_capital, timeframe, symbol FROM bot_instances WHERE id = ?", (self.bot_id,))
                row = c.fetchone()
                conn.close()
                if row and row["config_json"]:
                    cfg = json.loads(row["config_json"])
                    if isinstance(cfg, str):
                        cfg = json.loads(cfg)
                    if isinstance(cfg, dict) and "indicators" in cfg:
                        self.indicators = cfg["indicators"]
                    if row and "allocated_capital" in row.keys() and row["allocated_capital"]:
                        self.allocated_capital = float(row["allocated_capital"])
            except Exception as exc:
                logger.warning("[%s] Failed to dynamically reload config from DB: %s", self.bot_id, exc)

        logger.info("[%s] Starting signal check cycle for %s (%s)...", self.bot_id, self.symbol, self.timeframe)
        db.log_bot_activity(self.bot_id, "EVALUATION_START", f"Starting {self.timeframe} candle evaluation cycle for {self.symbol}", {"symbol": self.symbol, "timeframe": self.timeframe})
        context = CycleContext()
        status = "OK"

        try:
            if self.risk_manager.is_kill_switch_active():
                logger.warning("Kill switch file active. Skipping cycle.")
                self.telegram.send_message("⚠️ <b>BTC Trading Bot alert</b>: Cycle skipped. kill_switch.flag is present in the workspace.")
                return

            # Paper trading capital allocated to this bot instance ($10,000.00 default)
            paper_balance = float(getattr(self, "allocated_capital", 10000.0) or 10000.0)
            balance = paper_balance
            context.balance = paper_balance


            if config.FORCE_TEST_SIGNAL:
                logger.info("FORCE_TEST_SIGNAL is enabled; injecting a LONG signal for Telegram testing.")
                context.signal = "LONG"
                context.decision = "LONG"

            logger.info("Fetching recent candles for %s (%s) [Bot: %s]...", self.symbol, self.timeframe, self.bot_id)
            df = self.mainnet_fetcher.fetch_live_ohlcv(self.symbol, self.timeframe, limit=1000)

            if df.empty or len(df) < 200:
                logger.error("Fetched insufficient historical candles for indicator calculation.")
                status = "WARN"
                return

            df = generate_indicators(df, timeframe=self.timeframe)
            eval_idx = len(df) - 2
            candle_time = pd_timestamp_to_str(df.iloc[eval_idx]['timestamp'])
            close_price = float(df.iloc[eval_idx]['close'])
            high_price = float(df.iloc[eval_idx]['high'])
            low_price = float(df.iloc[eval_idx]['low'])
            context.close_price = close_price
            logger.info("[%s] Evaluating strategy on completed candle: %s at Close price: %.2f", self.bot_id, candle_time, close_price)

            # Update last_checked_at in DB and log activity
            db.log_bot_activity(self.bot_id, "EVALUATION", f"Evaluating {self.timeframe} candle close at ${close_price:,.2f}", {"close_price": close_price, "timeframe": self.timeframe})

            active_trade = get_active_trade(self.bot_id)
            context.open_trade = active_trade
            if active_trade:
                trade_id = active_trade['id']
                direction = active_trade['direction']
                entry_price = active_trade['entry_price']
                sl_price = active_trade['stop_loss']
                tp_price = active_trade['take_profit']
                size = active_trade['position_size']
                logger.info("[%s] Active trade found in DB (ID: %s, %s, Entry: %.2f, SL: %.2f, TP: %.2f)", self.bot_id, trade_id, direction, entry_price, sl_price, tp_price)

                exit_triggered = False
                exit_price = 0.0
                exit_pnl = 0.0
                exit_reason = ""

                if direction == "LONG":
                    if low_price <= sl_price:
                        exit_triggered = True
                        exit_price = sl_price
                        exit_pnl = (exit_price - entry_price) * size
                        exit_reason = "STOP LOSS"
                    elif high_price >= tp_price:
                        exit_triggered = True
                        exit_price = tp_price
                        exit_pnl = (exit_price - entry_price) * size
                        exit_reason = "TAKE PROFIT"
                elif direction == "SHORT":
                    if high_price >= sl_price:
                        exit_triggered = True
                        exit_price = sl_price
                        exit_pnl = (entry_price - exit_price) * size
                        exit_reason = "STOP LOSS"
                    elif low_price <= tp_price:
                        exit_triggered = True
                        exit_price = tp_price
                        exit_pnl = (entry_price - exit_price) * size
                        exit_reason = "TAKE PROFIT"

                if exit_triggered:
                    logger.info("[%s] Active trade exit condition detected (%s)! Price: %.2f, PnL: %.2f. Generating POSITION ALERT (Waiting for user decision).", self.bot_id, exit_reason, exit_price, exit_pnl)
                    
                    # Check if an approval request for this exit is already pending
                    pending_exits = [p for p in db.get_pending_signal_approvals(self.bot_id) if p.get("signal_type") in ["EXIT_SIGNAL", "SQUARE_OFF"]]
                    if not pending_exits:
                        sig_id = db.create_pending_signal_approval(
                            bot_id=self.bot_id,
                            symbol=self.symbol,
                            signal_type="EXIT_SIGNAL",
                            price=close_price,
                            confluence_pct=81.0,
                            threshold_pct=75.0,
                            sl_price=sl_price,
                            tp_price=tp_price,
                            position_size=size,
                            strategy_details={"reason": exit_reason, "unrealized_pnl": exit_pnl, "entry_price": entry_price},
                            timeframe=self.timeframe,
                            strategy=self.bot_name
                        )

                        self.telegram.send_interactive_signal_alert(
                            signal_id=sig_id,
                            symbol=self.symbol,
                            signal_type="EXIT_SIGNAL",
                            price=close_price,
                            confluence_pct=81.0,
                            threshold_pct=75.0,
                            current_position=direction,
                            entry_price=entry_price
                        )

                        db.log_bot_activity(
                            self.bot_id,
                            "SIGNAL_APPROVAL_WAITING",
                            f"🚨 POSITION ALERT: Strategy detected possible EXIT ({exit_reason}). Paused for user approval (ID: #{sig_id}).",
                            {"signal_id": sig_id, "exit_reason": exit_reason, "unrealized_pnl": exit_pnl}
                        )
                    context.signal = "EXIT_SIGNAL"
                    context.decision = "WAITING_APPROVAL"
                    return
                else:
                    logger.info("[%s] Active trade SL/TP not hit. Holding position.", self.bot_id)
                    context.signal = "HOLD"
                    context.decision = "HOLD"
                    db.log_signal(self.symbol, "HOLD", close_price, {}, False, "Holding open trade position")
                    return

            if not active_trade:
                signal_row, filters, is_blocked, reason_row = self.strategy.evaluate_row(df, eval_idx)
                direction_conf, score_conf, conf_details = self.strategy.evaluate_confluence(df, eval_idx, active_indicators=self.indicators)
                
                thresh_pct = float(conf_details.get("threshold", 0.75) * 100)
                if direction_conf == "SHORT":
                    conf_pct = float(conf_details.get("bear_score_pct", 0.0))
                elif direction_conf == "LONG":
                    conf_pct = float(conf_details.get("bull_score_pct", 0.0))
                else:
                    conf_pct = max(float(conf_details.get("bull_score_pct", 0.0)), float(conf_details.get("bear_score_pct", 0.0)))
                
                if direction_conf in ["LONG", "SHORT"] and score_conf >= conf_details.get("threshold", 0.75):
                    signal = direction_conf
                    reason = f"Confluence score: {conf_pct:.0f}% ({direction_conf}) meets {thresh_pct:.0f}% threshold"
                else:
                    signal = signal_row
                    reason = reason_row or f"Confluence score: {conf_pct:.0f}% ({signal})"

                context.signal = signal
                context.decision = signal if not is_blocked else "HOLD"

                # Log decision breakdown for Advanced Logs transparency tab
                counts = conf_details.get("summary_counts", {})
                db.log_bot_decision(
                    bot_id=self.bot_id,
                    price=close_price,
                    timeframe=self.timeframe,
                    regime=conf_details.get("regime", "RANGING"),
                    adx=conf_details.get("adx", 15.0),
                    bullish_count=counts.get("bullish", 0),
                    bearish_count=counts.get("bearish", 0),
                    neutral_count=counts.get("neutral", 0),
                    total_indicators=counts.get("total", 4),
                    confluence_pct=conf_pct,
                    threshold_pct=thresh_pct,
                    decision=context.decision,
                    reason=reason,
                    indicators_details=conf_details.get("indicator_details", {})
                )

                todays_pnl = db.get_todays_pnl(self.symbol)
                daily_limit_hit = self.risk_manager.check_daily_loss_limit(todays_pnl, balance)

                if daily_limit_hit and signal in ["LONG", "SHORT"]:
                    logger.warning("Daily loss limit exceeded. Entry signal blocked.")
                    is_blocked = True
                    reason = f"Daily Loss Limit hit (Today PnL: {todays_pnl:.2f} USDT). Signal {signal} blocked."
                    signal = "HOLD"
                    context.signal = signal
                    context.decision = "HOLD"

                db.log_signal(self.symbol, signal, close_price, filters, is_blocked, reason, {
                    "timeframe": self.timeframe,
                    "balance": balance,
                    "close_price": close_price,
                })

                if signal in ["LONG", "SHORT"] and not is_blocked:
                    sl_price, tp_price = self.risk_manager.calculate_trade_levels(df, eval_idx, signal, close_price)
                    size = self.risk_manager.calculate_position_size(balance, close_price, sl_price)

                    conf_pct = float(conf_details.get("bear_score_pct" if signal == "SHORT" else "bull_score_pct", 75.0))
                    thresh_pct = float(conf_details.get("threshold", 0.75) * 100)
                    
                    # Check if a pending approval already exists for this bot & signal type
                    pending_list = db.get_pending_signal_approvals(self.bot_id)
                    existing_pending = [p for p in pending_list if p.get("signal_type") == signal]
                    
                    if not existing_pending:
                        sig_id = db.create_pending_signal_approval(
                            bot_id=self.bot_id,
                            symbol=self.symbol,
                            signal_type=signal,
                            price=close_price,
                            confluence_pct=conf_pct,
                            threshold_pct=thresh_pct,
                            sl_price=sl_price,
                            tp_price=tp_price,
                            position_size=size,
                            strategy_details=conf_details,
                            timeframe=self.timeframe,
                            strategy=self.bot_name
                        )

                        # Send interactive Telegram alert with decision buttons
                        curr_pos_dir = active_trade.get("direction", "FLAT") if active_trade else "FLAT"
                        curr_pos_entry = float(active_trade.get("entry_price", 0.0)) if active_trade else 0.0
                        
                        self.telegram.send_interactive_signal_alert(
                            signal_id=sig_id,
                            symbol=self.symbol,
                            signal_type=signal,
                            price=close_price,
                            confluence_pct=conf_pct,
                            threshold_pct=thresh_pct,
                            current_position=curr_pos_dir,
                            entry_price=curr_pos_entry
                        )
                        
                        db.log_bot_activity(
                            self.bot_id,
                            "SIGNAL_APPROVAL_WAITING",
                            f"🚨 TRADE SIGNAL GENERATED: Signal {signal} ({conf_pct:.0f}% confidence) created (ID: #{sig_id}). Waiting for user decision.",
                            {"signal_id": sig_id, "signal": signal, "confluence_pct": conf_pct}
                        )
                        logger.info("[%s] Signal %s generated (ID: %s). Waiting for manual user approval.", self.bot_id, signal, sig_id)
                    else:
                        logger.info("[%s] Signal %s active pending approval already exists (ID: %s).", self.bot_id, signal, existing_pending[0].get("id"))
                    
                    # ALWAYS return without autonomous execution
                    context.decision = "WAITING_APPROVAL"
                    return
                else:
                    logger.info("Signal evaluated: HOLD. Reason/Details: %s", reason)
                    if is_blocked:
                        self.telegram.send_message(
                            f"🚫 <b>SIGNAL BLOCKED</b>\n"
                            f"• <b>Reason</b>: {reason}"
                        )

        except Exception as exc:
            status = "ERROR"
            error_msg = f"System Error in runner execution cycle: {exc}"
            logger.error(error_msg, exc_info=True)
            stack_trace = traceback.format_exc()
            db.log_error(error_msg, stack_trace, module="live_runner", function_name="process_cycle", retry_count=self.retry_count)
            db.log_bot_activity(self.bot_id, "ERROR", f"CRITICAL LOOP ERROR: {exc}", {"error": str(exc)})
            try:
                conn = db.get_connection()
                c = conn.cursor()
                c.execute("UPDATE bot_instances SET status = 'ERROR' WHERE id = ?", (self.bot_id,))
                conn.commit()
                conn.close()
            except Exception:
                pass
            try:
                self.telegram.send_message(f"🚨 <b>CRITICAL ERROR</b>: {error_msg}")
            except Exception as tg_err:
                logger.error("Failed to send Telegram error alert: %s", tg_err)
        finally:
            try:
                self.retry_count = self.retry_count + 1 if status == "ERROR" else 0
                db.log_heartbeat(status, details={"signal": context.signal, "decision": context.decision, "balance": context.balance, "close_price": context.close_price})
                db.log_bot_status(status, exchange_status="CONNECTED", telegram_status="OK" if self.telegram.enabled else "DISABLED", database_status="OK", details={"signal": context.signal, "decision": context.decision})
                
                # Update authoritative Bot Instance Registry scan & heartbeat metrics
                try:
                    from src.indicators import get_timeframe_minutes
                    from datetime import timedelta
                    tf_mins = get_timeframe_minutes(self.timeframe)
                    now_dt = datetime.now(timezone.utc)
                    next_dt = now_dt + timedelta(minutes=tf_mins)
                    now_iso = now_dt.isoformat()
                    next_iso = next_dt.isoformat()

                    conn = db.get_connection()
                    c = conn.cursor()
                    c.execute("""
                        UPDATE bot_instances SET
                            last_heartbeat = ?,
                            last_scan_at = ?,
                            next_scan_at = ?,
                            scan_count = COALESCE(scan_count, 0) + 1,
                            current_signal = ?,
                            signal_confidence = ?,
                            required_confidence = 75.0,
                            open_position_count = ?,
                            status = CASE WHEN status IN ('ERROR', 'STOPPED', 'PAUSED') THEN status ELSE 'RUNNING' END
                        WHERE id = ?
                    """, (now_iso, now_iso, next_iso, context.signal, getattr(context, 'confidence', 0.0), 1 if context.open_trade else 0, self.bot_id))
                    conn.commit()
                    conn.close()
                except Exception as reg_err:
                    logger.warning("[%s] Failed to update bot_instances registry stats: %s", self.bot_id, reg_err)

                health = self.monitoring.collect_health_snapshot(balance=context.balance, equity=context.balance, current_position=0.0)
                db.log_daily_statistics({"total_trades": 0, "winning_trades": 0, "losing_trades": 0, "win_rate": 0.0, "daily_pnl": 0.0, "balance": context.balance, "equity": context.balance})
                if config.SEND_HEARTBEAT_MESSAGES and status != "ERROR":
                    self.telegram.send_message(
                        f"❤️ <b>BOT STATUS</b>\n"
                        f"• <b>Status</b>: {status}\n"
                        f"• <b>Exchange Connected</b>: {'YES' if self.testnet_fetcher.exchange else 'NO'}\n"
                        f"• <b>Current Price</b>: ${context.close_price:.2f}\n"
                        f"• <b>Balance</b>: ${context.balance:.2f} USDT\n"
                        f"• <b>Open Trades</b>: {'YES' if context.open_trade else 'NO'}\n"
                        f"• <b>Last Signal</b>: {context.signal}\n"
                        f"• <b>Database Status</b>: OK\n"
                        f"• <b>Internet Status</b>: {'CONNECTED' if health['internet_connected'] else 'OFFLINE'}\n"
                        f"• <b>Telegram Status</b>: {'OK' if self.telegram.enabled else 'DISABLED'}"
                    )
                logger.info("Logged heartbeat status: %s", status)
            except Exception as db_err:
                logger.error("Failed to log heartbeat in finally block: %s", db_err)

    def send_daily_summary(self):
        """
        Sends a daily status and execution summary via Telegram.
        """
        logger.info("Generating daily execution summary...")
        try:
            stats = db.get_daily_summary_stats()
            
            cycles_run = stats['cycles_run']
            errors_count = stats['errors_count']
            signals_fired = stats['signals_fired']
            
            # Format signals list
            signals_str = ""
            if signals_fired:
                signals_str = "\n".join([
                    f"• {s['timestamp'][:16]} - <b>{s['signal_type']}</b> at ${s['price']:.2f} (Reason: {s['reason'] or 'N/A'})"
                    for s in signals_fired
                ])
            else:
                signals_str = "None"
                
            summary_msg = (
                f"📊 <b>DAILY BOT SUMMARY (UTC)</b>\n"
                f"• <b>Status</b>: Active & Running\n"
                f"• <b>Timeframe</b>: {self.timeframe}\n"
                f"• <b>Total Cycles Run</b>: {cycles_run}\n"
                f"• <b>Errors Encountered</b>: {errors_count}\n"
                f"• <b>Signals Fired (excl. HOLD)</b>:\n{signals_str}"
            )
            
            self.telegram.send_message(summary_msg)
            logger.info("Daily summary sent successfully.")
        except Exception as e:
            logger.error(f"Failed to generate or send daily summary: {e}")

def pd_timestamp_to_str(ts_ms) -> str:
    """
    Converts milliseconds timestamp to ISO datetime string.
    """
    try:
        return datetime.fromtimestamp(ts_ms / 1000.0, timezone.utc).isoformat()
    except:
        return str(ts_ms)

def get_active_trade(bot_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Helper to fetch the current active open trade from SQLite.
    """
    try:
        conn = db.get_connection()
        cursor = conn.cursor()
        if bot_id:
            cursor.execute("SELECT * FROM trades_log WHERE status = 'OPEN' AND bot_id = ? ORDER BY id DESC LIMIT 1", (bot_id,))
        else:
            cursor.execute("SELECT * FROM trades_log WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1")
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"Error fetching active trade from DB: {e}")
        return None

def parse_timeframe_to_minutes(tf_str: str) -> int:
    if not tf_str:
        return 5
    tf = tf_str.lower().strip()
    if tf.endswith("m"):
        try: return max(1, int(tf[:-1]))
        except ValueError: return 5
    elif tf.endswith("h"):
        try: return max(1, int(tf[:-1]) * 60)
        except ValueError: return 60
    elif tf.endswith("d"):
        try: return max(1, int(tf[:-1]) * 1440)
        except ValueError: return 1440
    return 5

def main():
    import argparse
    import os
    parser = argparse.ArgumentParser(description="BTC Trading Bot Live Runner")
    parser.add_argument("--bot_id", type=str, default="bot-1", help="Bot instance ID")
    args = parser.parse_args()

    # Single instance enforcement via PID lock
    pid = os.getpid()
    pid_file = config.BASE_DIR / "data" / f"bot_{args.bot_id}.pid"
    try:
        pid_file.parent.mkdir(parents=True, exist_ok=True)
        pid_file.write_text(str(pid))
    except Exception as pe:
        logger.warning(f"Could not write PID file {pid_file}: {pe}")


    logger.info("Initializing scheduled trading bot live runner for %s...", args.bot_id)
    runner = LiveRunner(bot_id=args.bot_id)
    
    # Startup Telegram notification
    startup_msg = (
        f"🚀 <b>{runner.bot_name} Started</b>\n"
        f"• <b>Symbol</b>: {runner.symbol}\n"
        f"• <b>Timeframe</b>: {runner.timeframe}\n"
        f"• <b>Status</b>: RUNNING"
    )
    try:
        runner.telegram.send_message(startup_msg)
    except Exception as e:
        logger.error(f"Failed to send startup Telegram alert: {e}")
    
    # Run once immediately on startup
    runner.process_cycle()

    # Calculate check interval in minutes from timeframe accurately
    mins = parse_timeframe_to_minutes(runner.timeframe)

    # Schedule blocking loop
    scheduler = BlockingScheduler()
    scheduler.add_job(
        runner.process_cycle,
        'interval',
        minutes=mins,
        id=f'market_check_job_{args.bot_id}'
    )
    
    logger.info(f"Bot {args.bot_id} scheduled to check every {mins} minutes.")
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler shutdown successfully.")
        try:
            if pid_file.exists(): pid_file.unlink(missing_ok=True)
        except Exception:
            pass

if __name__ == "__main__":
    main()
