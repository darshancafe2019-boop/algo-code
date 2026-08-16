import logging
import sqlite3
import uuid
import json
import time
from datetime import datetime, timezone
from typing import Dict, Any, Tuple, Optional

from src import config, db
from src.audit import log_bot_event
from src.monitoring import SystemWatchdog

logger = logging.getLogger("OrderExecutionService")


def _execute_query(sql: str, params: tuple = ()) -> list[dict]:
    try:
        conn = sqlite3.connect(str(config.DB_PATH), timeout=10.0)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(sql, params)
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return rows
    except Exception as e:
        logger.error("DB Query error: %s", e)
        return []


def _execute_statement(sql: str, params: tuple = ()) -> bool:
    try:
        conn = sqlite3.connect(str(config.DB_PATH), timeout=10.0)
        cursor = conn.cursor()
        cursor.execute(sql, params)
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error("DB Execute error: %s", e)
        return False


class PaperExecutionAdapter:
    """Simulated Paper Execution Adapter maintaining identical order contract as Live."""

    def submit_order(self, symbol: str, side: str, amount: float, price: float) -> Dict[str, Any]:
        sim_order_id = f"PAPER_ORD_{uuid.uuid4().hex[:10]}"
        return {
            "success": True,
            "order_id": sim_order_id,
            "broker_order_id": sim_order_id,
            "client_order_id": sim_order_id,
            "symbol": symbol,
            "side": side,
            "requested_quantity": amount,
            "filled_quantity": amount,
            "remaining_quantity": 0.0,
            "average_price": price,
            "fees": round(amount * price * 0.001, 2),
            "status": "FILLED",
            "execution_mode": "PAPER"
        }


class TestExecutionAdapter:
    """Mocked Execution Adapter for deterministic unit testing with zero network requests."""

    def submit_order(self, symbol: str, side: str, amount: float, price: float) -> Dict[str, Any]:
        test_order_id = f"TEST_MOCK_ORD_{uuid.uuid4().hex[:8]}"
        return {
            "success": True,
            "order_id": test_order_id,
            "broker_order_id": test_order_id,
            "client_order_id": test_order_id,
            "symbol": symbol,
            "side": side,
            "requested_quantity": amount,
            "filled_quantity": amount,
            "remaining_quantity": 0.0,
            "average_price": price,
            "fees": 0.0,
            "status": "FILLED",
            "execution_mode": "TEST"
        }


class LiveExecutionAdapter:
    """Live Execution Adapter requiring strict server-side arming and 14-point validation."""

    def submit_order(self, symbol: str, side: str, amount: float, price: float) -> Dict[str, Any]:
        from src.execution import ExecutionEngine
        from src.data_fetcher import get_testnet_fetcher

        fetcher = get_testnet_fetcher()
        engine = ExecutionEngine(fetcher.exchange)
        if side.upper() in ["BUY", "LONG"]:
            res = engine.market_buy(symbol, amount, price)
        else:
            res = engine.market_sell(symbol, amount, price)

        return {
            "success": True,
            "order_id": res.get("order_id"),
            "broker_order_id": res.get("order_id"),
            "client_order_id": res.get("order_id"),
            "symbol": symbol,
            "side": side,
            "requested_quantity": amount,
            "filled_quantity": res.get("filled_amount", amount),
            "remaining_quantity": 0.0,
            "average_price": res.get("average_price", price),
            "fees": 0.0,
            "status": "FILLED",
            "execution_mode": "LIVE"
        }


class OrderExecutionService:
    """
    Centralized Order Execution Gate.
    Enforces 14-Point Pre-Order Validation Check before any order can be created.
    """

    def __init__(self):
        self.paper_adapter = PaperExecutionAdapter()
        self.test_adapter = TestExecutionAdapter()
        self.live_adapter = LiveExecutionAdapter()

    def generate_idempotency_key(self, bot_id: str, strategy: str, symbol: str, signal_time: str) -> str:
        raw_key = f"{bot_id}:{strategy}:{symbol}:{signal_time}"
        return f"IDEM_{uuid.uuid5(uuid.NAMESPACE_DNS, raw_key).hex[:16]}"

    def validate_14_point_pre_order_check(
        self,
        bot_id: str,
        strategy: str,
        symbol: str,
        side: str,
        amount: float,
        price: float,
        stop_loss: float,
        take_profit: float,
        confidence_score: float,
        market_tick_iso: Optional[str] = None,
        account_balance: float = 10000.0,
        is_live: bool = False
    ) -> Tuple[bool, str]:
        """Strict 14-Point Pre-Order Validation Check."""

        # 1. MarketDataCheck
        watchdog = SystemWatchdog()
        is_stale, age_s = watchdog.is_market_data_stale(market_tick_iso, max_age_seconds=config.MAX_MARKET_DATA_AGE_SECONDS)
        if is_stale and market_tick_iso:
            return False, f"STALE_MARKET_DATA: Age {age_s:.1f}s exceeds max allowed {config.MAX_MARKET_DATA_AGE_SECONDS}s"
        if price <= 0:
            return False, "INVALID_PRICE: Price must be greater than zero"

        # 2. SymbolCheck
        inst = db.get_market_instrument(symbol)
        if inst and not inst.get("execution_available", True):
            return False, f"DATA_ONLY_SYMBOL: Instrument {symbol} does not support live execution"

        # 3. AccountCheck
        order_cost = amount * price
        if account_balance <= 0 or order_cost > account_balance:
            return False, f"INSUFFICIENT_BALANCE: Order cost ${order_cost:,.2f} exceeds balance ${account_balance:,.2f}"

        # 4. PositionCheck
        if getattr(config, "POSITION_MISMATCH_LOCKED", False):
            return False, "POSITION_MISMATCH_LOCKED: Live positions mismatched with broker state"

        # 5. DuplicateCheck / Idempotency
        signal_time_str = market_tick_iso or datetime.now(timezone.utc).isoformat()
        idem_key = self.generate_idempotency_key(bot_id, strategy, symbol, signal_time_str[:16])
        existing_orders = _execute_query("SELECT id FROM bot_event_audit WHERE correlation_id = ? AND status = 'SUCCESS'", (idem_key,))
        if existing_orders:
            return False, f"DUPLICATE_ORDER_ATTEMPT: Signal {idem_key} already processed"

        # 6. ExposureCheck
        if amount > config.MAX_POSITION_SIZE:
            return False, f"EXCEEDS_MAX_POSITION_SIZE: Requested {amount} > max {config.MAX_POSITION_SIZE}"
        if order_cost > config.MAX_ORDER_VALUE:
            return False, f"EXCEEDS_MAX_ORDER_VALUE: Requested ${order_cost:,.2f} > max ${config.MAX_ORDER_VALUE:,.2f}"

        # 7. DailyLossCheck
        todays_stats = _execute_query("SELECT daily_pnl FROM daily_statistics WHERE date_key = DATE('now')")
        daily_pnl = todays_stats[0].get("daily_pnl", 0.0) if todays_stats else 0.0
        if daily_pnl <= -abs(config.MAX_DAILY_LOSS):
            return False, f"DAILY_LOSS_LIMIT_REACHED: Daily PnL ${daily_pnl:,.2f} reached limit -${config.MAX_DAILY_LOSS:,.2f}"

        # 8. PositionSizeCheck
        if amount <= 0:
            return False, "INVALID_POSITION_SIZE: Position size must be positive"

        # 9. StopLossCheck
        if stop_loss <= 0 or (side.upper() in ["BUY", "LONG"] and stop_loss >= price) or (side.upper() in ["SELL", "SHORT"] and stop_loss <= price):
            return False, f"INVALID_STOP_LOSS: Invalid SL level {stop_loss} for {side} @ {price}"

        # 10. TakeProfitCheck
        if take_profit <= 0 or (side.upper() in ["BUY", "LONG"] and take_profit <= price) or (side.upper() in ["SELL", "SHORT"] and take_profit >= price):
            return False, f"INVALID_TAKE_PROFIT: Invalid TP level {take_profit} for {side} @ {price}"

        # 10b. RiskRewardCheck
        risk = abs(price - stop_loss)
        reward = abs(take_profit - price)
        if risk > 0 and (reward / risk) < 1.0:
            return False, f"POOR_RISK_REWARD_RATIO: Risk/Reward ratio {(reward/risk):.2f}:1 is less than min 1.0:1"

        # 11. StrategyPermissionCheck
        if confidence_score < config.CONFLUENCE_THRESHOLD:
            return False, f"CONFIDENCE_BELOW_THRESHOLD: Confidence {confidence_score*100:.1f}% < threshold {config.CONFLUENCE_THRESHOLD*100:.1f}%"

        # 12. ExecutionModeCheck
        mode = getattr(config, "TRADING_MODE", "PAPER").upper()
        if is_live and mode != "LIVE":
            return False, f"EXECUTION_MODE_MISMATCH: Live order requested but TRADING_MODE is '{mode}'"

        # 13. KillSwitchCheck
        if config.KILL_SWITCH_FILE.exists() or getattr(config, "GLOBAL_TRADING_KILL_SWITCH", False):
            return False, "KILL_SWITCH_ACTIVE: Global Trading Kill Switch is ACTIVATED"

        # 14. LiveTradingArmCheck
        if is_live:
            if not getattr(config, "LIVE_TRADING_ENABLED", False):
                return False, "LIVE_TRADING_DISABLED: LIVE_TRADING_ENABLED flag is False"
            if not getattr(config, "LIVE_TRADING_ARMED", False):
                return False, "LIVE_TRADING_DISARMED: Live trading has NOT been explicitly armed by user"
            if not getattr(config, "MASTER_LIVE_TRADING", False):
                return False, "MASTER_LIVE_TRADING_OFF: MASTER_LIVE_TRADING flag is False"

        return True, "ALL_14_SAFETY_CHECKS_PASSED"

    def execute_order(
        self,
        bot_id: str,
        strategy: str,
        symbol: str,
        side: str,
        amount: float,
        price: float,
        stop_loss: float,
        take_profit: float,
        confidence_score: float,
        market_tick_iso: Optional[str] = None,
        account_balance: float = 10000.0,
        is_live: bool = False
    ) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Single Authoritative Order Execution Entrypoint.
        Routes to Paper, Test, or Live execution after 14-Point Pre-Order Check.
        """
        passed, reason = self.validate_14_point_pre_order_check(
            bot_id=bot_id, strategy=strategy, symbol=symbol, side=side, amount=amount,
            price=price, stop_loss=stop_loss, take_profit=take_profit,
            confidence_score=confidence_score, market_tick_iso=market_tick_iso,
            account_balance=account_balance, is_live=is_live
        )

        signal_time_str = market_tick_iso or datetime.now(timezone.utc).isoformat()
        idem_key = self.generate_idempotency_key(bot_id, strategy, symbol, signal_time_str[:16])

        if not passed:
            log_bot_event(
                event_type="ORDER_BLOCKED",
                message=f"Order BLOCKED for {symbol} ({side}): {reason}",
                bot_instance_id=bot_id,
                severity="WARNING",
                status="BLOCKED",
                reason=reason,
                strategy_name=strategy,
                symbol=symbol,
                confidence_score=confidence_score,
                threshold=config.CONFLUENCE_THRESHOLD * 100.0,
                correlation_id=idem_key
            )
            return False, reason, {}

        mode = "LIVE" if is_live else ("TEST" if getattr(config, "TEST_MODE", False) else "PAPER")
        log_bot_event(
            event_type="ORDER_REQUESTED",
            message=f"Submitting {mode} order for {symbol} ({side}) amount={amount} @ ${price:,.2f}",
            bot_instance_id=bot_id,
            severity="INFO",
            status="PENDING",
            strategy_name=strategy,
            symbol=symbol,
            confidence_score=confidence_score,
            correlation_id=idem_key
        )

        try:
            from src.latency_profiler import TradeLatencyContext
            from src.trade_ledger import trade_ledger
            
            latency_ctx = TradeLatencyContext(trade_id=0, order_id=idem_key)
            latency_ctx.mark_stage("risk_check")
            latency_ctx.mark_stage("order_creation")
            latency_ctx.mark_stage("broker_submit")

            if mode == "TEST":
                result = self.test_adapter.submit_order(symbol, side, amount, price)
            elif mode == "LIVE":
                result = self.live_adapter.submit_order(symbol, side, amount, price)
            else:
                result = self.paper_adapter.submit_order(symbol, side, amount, price)

            latency_ctx.mark_stage("broker_ack")
            latency_ctx.mark_stage("fill")

            log_bot_event(
                event_type="ORDER_FILLED",
                message=f"Order FILLED: #{result['order_id']} {symbol} ({side}) avg_price=${result['average_price']:,.2f}",
                bot_instance_id=bot_id,
                severity="INFO",
                status="SUCCESS",
                order_id=str(result["order_id"]),
                strategy_name=strategy,
                symbol=symbol,
                confidence_score=confidence_score,
                correlation_id=idem_key,
                metadata=result
            )

            # Record through Authoritative Trade Ledger
            ok, trade_id, msg = trade_ledger.record_new_trade({
                "bot_id": bot_id,
                "strategy": strategy,
                "strategy_id": strategy,
                "symbol": symbol,
                "direction": side.upper(),
                "entry_price": float(result.get("average_price") or price),
                "position_size": float(result.get("filled_quantity") or amount),
                "stop_loss": stop_loss,
                "take_profit": take_profit,
                "signal_confidence": float(confidence_score * 100.0 if confidence_score <= 1.0 else confidence_score),
                "execution_mode": mode,
                "broker_order_id": str(result.get("broker_order_id") or result.get("order_id")),
                "order_id": str(result.get("order_id")),
                "idempotency_key": idem_key,
                "fees": float(result.get("fees") or 1.50),
                "remarks": f"Executed via {mode} OrderExecutionService"
            })

            latency_ctx.trade_id = trade_id
            latency_ctx.mark_stage("db_write")
            latency_ctx.finalize()

            result["trade_id"] = trade_id
            return True, f"Order executed successfully in {mode} mode (Trade #{trade_id})", result

        except Exception as e:
            logger.error("Order execution failed for %s: %s", symbol, e)
            log_bot_event(
                event_type="ORDER_REJECTED",
                message=f"Execution error for {symbol}: {str(e)}",
                bot_instance_id=bot_id,
                severity="ERROR",
                status="FAILED",
                reason=str(e),
                strategy_name=strategy,
                symbol=symbol,
                correlation_id=idem_key
            )
            return False, f"Execution engine error: {str(e)}", {}


order_execution_service = OrderExecutionService()
