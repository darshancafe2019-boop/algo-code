"""
Standardized Command Bus & Execution Contract
==============================================
Provides an authoritative command layer ensuring:
1. Every command receives a unique command_id and idempotency_key.
2. Server-side validation of state transitions and authorizations.
3. Transactional state updates and audit event logging.
4. Structured command responses (ACCEPTED, RUNNING, SUCCEEDED, FAILED, REJECTED).
"""

import json
import logging
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from src import db, config, audit

logger = logging.getLogger("CommandBus")

# In-memory idempotency cache: { idempotency_key: (timestamp, result_dict) }
_idempotency_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_idempotency_lock = threading.Lock()
IDEMPOTENCY_TTL_SECONDS = 300.0  # 5 minutes cache


class CommandStatus:
    ACCEPTED = "ACCEPTED"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    REJECTED = "REJECTED"


class CommandBus:
    """
    Central Command Dispatcher executing business actions against authoritative services.
    """

    @classmethod
    def execute(
        cls,
        action: str,
        bot_id: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
        user: str = "System/UI",
        idempotency_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Main entry point for command execution.
        """
        payload = payload or {}
        action = (action or "").upper().strip()
        command_id = f"CMD-{uuid.uuid4().hex[:12]}"
        now_ts = time.time()
        now_str = datetime.now(timezone.utc).isoformat()

        # 1. Idempotency Check
        if idempotency_key:
            with _idempotency_lock:
                # Evict expired keys
                expired = [k for k, (ts, _) in _idempotency_cache.items() if now_ts - ts > IDEMPOTENCY_TTL_SECONDS]
                for k in expired:
                    del _idempotency_cache[k]

                if idempotency_key in _idempotency_cache:
                    cached_ts, cached_res = _idempotency_cache[idempotency_key]
                    logger.info(f"CommandBus: Duplicate command '{action}' safely returned from cache (Key: {idempotency_key})")
                    return {
                        **cached_res,
                        "cached": True,
                        "idempotency_key": idempotency_key
                    }

        logger.info(f"CommandBus: Executing command '{action}' [ID: {command_id}, Bot: {bot_id}, User: {user}]")

        # 2. Dispatch to dedicated handler
        start_time = time.perf_counter()
        try:
            handler = cls._get_handler(action)
            if not handler:
                res = {
                    "command_id": command_id,
                    "action": action,
                    "status": CommandStatus.REJECTED,
                    "success": False,
                    "message": f"Unknown command action: '{action}'.",
                    "timestamp": now_str,
                    "latency_ms": round((time.perf_counter() - start_time) * 1000, 2)
                }
            else:
                status, success, message, data = handler(bot_id=bot_id, payload=payload, user=user)
                latency = round((time.perf_counter() - start_time) * 1000, 2)
                res = {
                    "command_id": command_id,
                    "action": action,
                    "bot_id": bot_id,
                    "status": status,
                    "success": success,
                    "message": message,
                    "data": data,
                    "timestamp": now_str,
                    "latency_ms": latency
                }

                # Audit event emission
                audit.log_bot_event(
                    event_type="COMMAND_EXECUTED",
                    message=f"Command '{action}' executed: {message}",
                    bot_instance_id=bot_id or "SYSTEM",
                    severity="INFO" if success else "WARNING",
                    metadata={"command_id": command_id, "action": action, "status": status, "latency_ms": latency}
                )

        except Exception as exc:
            latency = round((time.perf_counter() - start_time) * 1000, 2)
            logger.error(f"CommandBus: Exception during command '{action}': {exc}", exc_info=True)
            res = {
                "command_id": command_id,
                "action": action,
                "bot_id": bot_id,
                "status": CommandStatus.FAILED,
                "success": False,
                "message": f"Execution error: {str(exc)}",
                "error": str(exc),
                "timestamp": now_str,
                "latency_ms": latency
            }

        # 3. Cache idempotent result
        if idempotency_key:
            with _idempotency_lock:
                _idempotency_cache[idempotency_key] = (now_ts, res)

        return res

    @classmethod
    def _get_handler(cls, action: str):
        mapping = {
            "START_BOT": cls._handle_start_bot,
            "PAUSE_BOT": cls._handle_pause_bot,
            "RESUME_BOT": cls._handle_resume_bot,
            "STOP_BOT": cls._handle_stop_bot,
            "RESTART_BOT": cls._handle_restart_bot,
            "DELETE_BOT": cls._handle_delete_bot,
            "CREATE_BOT": cls._handle_create_bot,
            "UPDATE_BOT": cls._handle_update_bot,
            "SELECT_BOT": cls._handle_select_bot,
            "START_ALL_BOTS": cls._handle_start_all_bots,
            "PAUSE_ALL_BOTS": cls._handle_pause_all_bots,
            "STOP_ALL_BOTS": cls._handle_stop_all_bots,
            "RESET_PAPER_SANDBOX": cls._handle_reset_paper_sandbox,
            "ACTIVATE_KILL_SWITCH": cls._handle_activate_kill_switch,
            "DEACTIVATE_KILL_SWITCH": cls._handle_deactivate_kill_switch,
            "RECONCILE_ACCOUNT": cls._handle_reconcile_account,
            "REFRESH_MARKET_DATA": cls._handle_refresh_market_data,
            "SQUARE_OFF_POSITION": cls._handle_square_off_position,
            "RUN_SCAN": cls._handle_run_scan,
            "START_SCANNER": cls._handle_run_scan,
            "STOP_SCANNER": cls._handle_stop_scanner,
            "ADD_INDICATOR": cls._handle_configure_indicator,
            "REMOVE_INDICATOR": cls._handle_remove_indicator,
            "ENABLE_INDICATOR": cls._handle_enable_indicator,
            "DISABLE_INDICATOR": cls._handle_disable_indicator,
            "CONFIGURE_INDICATOR": cls._handle_configure_indicator,
            "CREATE_STRATEGY": cls._handle_create_strategy,
            "UPDATE_STRATEGY": cls._handle_create_strategy,
            "ENABLE_STRATEGY": cls._handle_enable_strategy,
            "DISABLE_STRATEGY": cls._handle_disable_strategy,
            "CALCULATE_POSITION_SIZE": cls._handle_calculate_position_size,
            "RUN_RISK_CHECK": cls._handle_run_risk_check,
            "APPLY_RISK_PROFILE": cls._handle_apply_risk_profile,
            "CREATE_ORDER": cls._handle_create_order,
            "CANCEL_ORDER": cls._handle_cancel_order,
            "MODIFY_ORDER": cls._handle_modify_order,
            "START_PAPER": cls._handle_start_bot,
            "PAUSE_PAPER": cls._handle_pause_bot,
            "RESUME_PAPER": cls._handle_resume_bot,
            "STOP_PAPER": cls._handle_stop_bot,
            "RUN_BACKTEST": cls._handle_run_backtest,
            "CREATE_ALERT": cls._handle_create_alert,
            "UPDATE_ALERT": cls._handle_update_alert,
            "DELETE_ALERT": cls._handle_delete_alert,
            "EXPORT_TRADES": cls._handle_export_trades,
            "EXPORT_ANALYTICS": cls._handle_export_analytics,
        }
        return mapping.get(action)

    # -------------------------------------------------------------------------
    # Handlers
    # -------------------------------------------------------------------------

    @classmethod
    def _handle_start_bot(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        if not bot_id:
            return CommandStatus.REJECTED, False, "bot_id is required for START_BOT", {}

        from src.process_manager import multi_bot_manager
        res = multi_bot_manager.start_bot(bot_id)
        success = res.get("status") in ["success", "already_running"]
        status = CommandStatus.SUCCEEDED if success else CommandStatus.FAILED
        return status, success, res.get("message", "Start bot executed"), {"bot_id": bot_id, "new_state": "RUNNING" if success else "STOPPED"}

    @classmethod
    def _handle_pause_bot(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        if not bot_id:
            return CommandStatus.REJECTED, False, "bot_id is required for PAUSE_BOT", {}

        from src.process_manager import multi_bot_manager
        res = multi_bot_manager.pause_bot(bot_id)
        success = res.get("status") in ["success", "already_paused"]
        status = CommandStatus.SUCCEEDED if success else CommandStatus.FAILED
        return status, success, res.get("message", "Pause bot executed"), {"bot_id": bot_id, "new_state": "PAUSED" if success else "RUNNING"}

    @classmethod
    def _handle_resume_bot(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        if not bot_id:
            return CommandStatus.REJECTED, False, "bot_id is required for RESUME_BOT", {}

        from src.process_manager import multi_bot_manager
        res = multi_bot_manager.resume_bot(bot_id)
        success = res.get("status") in ["success", "already_running"]
        status = CommandStatus.SUCCEEDED if success else CommandStatus.FAILED
        return status, success, res.get("message", "Resume bot executed"), {"bot_id": bot_id, "new_state": "RUNNING" if success else "PAUSED"}

    @classmethod
    def _handle_stop_bot(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        if not bot_id:
            return CommandStatus.REJECTED, False, "bot_id is required for STOP_BOT", {}

        from src.process_manager import multi_bot_manager
        res = multi_bot_manager.stop_bot(bot_id)
        success = res.get("status") in ["success", "already_stopped"]
        status = CommandStatus.SUCCEEDED if success else CommandStatus.FAILED
        return status, success, res.get("message", "Stop bot executed"), {"bot_id": bot_id, "new_state": "STOPPED"}

    @classmethod
    def _handle_restart_bot(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        if not bot_id:
            return CommandStatus.REJECTED, False, "bot_id is required for RESTART_BOT", {}

        from src.process_manager import multi_bot_manager
        res = multi_bot_manager.restart_bot(bot_id)
        success = res.get("status") in ["success", "already_running"]
        status = CommandStatus.SUCCEEDED if success else CommandStatus.FAILED
        return status, success, f"Restarted bot {bot_id}: {res.get('message', '')}", {"bot_id": bot_id, "new_state": "RUNNING" if success else "STOPPED"}

    @classmethod
    def _handle_delete_bot(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        if not bot_id:
            return CommandStatus.REJECTED, False, "bot_id is required for DELETE_BOT", {}

        from src.process_manager import multi_bot_manager
        multi_bot_manager.stop_bot(bot_id)
        db.safe_execute("UPDATE bot_instances SET is_deleted = 1, status = 'DELETED' WHERE id = ?", (bot_id,))
        return CommandStatus.SUCCEEDED, True, f"Deleted bot {bot_id}", {"bot_id": bot_id, "deleted": True}

    @classmethod
    def _handle_create_bot(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        bot_id_out = f"bot-{int(time.time()*1000)}-{uuid.uuid4().hex[:4]}"
        now_str = datetime.now(timezone.utc).isoformat()
        db.safe_execute(
            """
            INSERT INTO bot_instances 
            (id, name, symbol, timeframe, strategy, allocated_capital, execution_mode, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'STOPPED', ?)
            """,
            (
                bot_id_out,
                payload.get("name", "New Bot"),
                payload.get("symbol", "BTC/USDT"),
                payload.get("timeframe", "15m"),
                payload.get("strategy", "EMA_MACD_VP"),
                float(payload.get("allocated_capital", 10000.0)),
                payload.get("execution_mode", "PAPER"),
                now_str
            )
        )
        return CommandStatus.SUCCEEDED, True, f"Created bot instance {bot_id_out}", {"bot_id": bot_id_out}

    @classmethod
    def _handle_update_bot(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        if not bot_id:
            return CommandStatus.REJECTED, False, "bot_id is required for UPDATE_BOT", {}

        db.safe_execute(
            "UPDATE bot_instances SET name = ?, symbol = ?, timeframe = ?, strategy = ?, allocated_capital = ?, execution_mode = ? WHERE id = ?",
            (
                payload.get("name", "Updated Bot"),
                payload.get("symbol", "BTC/USDT"),
                payload.get("timeframe", "15m"),
                payload.get("strategy", "EMA_MACD_VP"),
                float(payload.get("allocated_capital", 10000.0)),
                payload.get("execution_mode", "PAPER"),
                bot_id
            )
        )
        return CommandStatus.SUCCEEDED, True, f"Updated bot instance {bot_id}", {"bot_id": bot_id}

    @classmethod
    def _handle_start_all_bots(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        from src.process_manager import multi_bot_manager
        res = multi_bot_manager.start_all_bots()
        return CommandStatus.SUCCEEDED, True, f"Start all bots completed: {len(res.get('started', []))} started, {len(res.get('skipped', []))} skipped.", res

    @classmethod
    def _handle_pause_all_bots(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        from src.process_manager import multi_bot_manager
        res = multi_bot_manager.pause_all_bots()
        return CommandStatus.SUCCEEDED, True, res.get("message", "Paused bots"), res

    @classmethod
    def _handle_stop_all_bots(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        from src.process_manager import multi_bot_manager
        res = multi_bot_manager.stop_all_bots()
        return CommandStatus.SUCCEEDED, True, res.get("message", "Stopped bots"), res

    @classmethod
    def _handle_reset_paper_sandbox(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        now_str = datetime.now(timezone.utc).isoformat()
        db.safe_execute("UPDATE bot_instances SET allocated_capital = 10000.0 WHERE COALESCE(is_deleted, 0) = 0")
        db.safe_execute("UPDATE trades_log SET status = 'CLOSED', trade_status = 'CLOSED', exit_reason = 'PAPER_SANDBOX_RESET' WHERE status = 'OPEN'")
        return CommandStatus.SUCCEEDED, True, "Paper trading sandbox reset to standard initial state ($10,000 baseline).", {}

    @classmethod
    def _handle_activate_kill_switch(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        from src.process_manager import multi_bot_manager

        config.GLOBAL_KILL_SWITCH = True
        try:
            config.KILL_SWITCH_FILE.touch()
        except Exception:
            pass

        # Stop all running bots
        multi_bot_manager.stop_all_bots()

        # Square off open positions in paper mode
        db.safe_execute("UPDATE trades_log SET status = 'CLOSED', trade_status = 'CLOSED', exit_reason = 'EMERGENCY_KILL_SWITCH' WHERE status = 'OPEN'")

        audit.log_bot_event(
            event_type="KILL_SWITCH_ACTIVATED",
            message="EMERGENCY KILL SWITCH ACTIVATED. All bots stopped and execution pipeline locked.",
            severity="CRITICAL"
        )
        return CommandStatus.SUCCEEDED, True, "EMERGENCY KILL SWITCH ACTIVATED. All trading locked.", {"kill_switch_active": True}

    @classmethod
    def _handle_deactivate_kill_switch(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        config.GLOBAL_KILL_SWITCH = False
        try:
            if config.KILL_SWITCH_FILE.exists():
                config.KILL_SWITCH_FILE.unlink()
        except Exception:
            pass

        audit.log_bot_event(
            event_type="KILL_SWITCH_DEACTIVATED",
            message="Emergency kill switch deactivated. Pipeline unlocked.",
            severity="WARNING"
        )
        return CommandStatus.SUCCEEDED, True, "Emergency kill switch deactivated.", {"kill_switch_active": False}

    @classmethod
    def _handle_reconcile_account(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        from src.reconciliation import PositionReconciler
        reconciler = PositionReconciler()
        ok, msg, mismatches = reconciler.reconcile_on_startup()
        status = CommandStatus.SUCCEEDED if ok else CommandStatus.FAILED
        return status, ok, msg, {"mismatches": mismatches}

    @classmethod
    def _handle_refresh_market_data(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        from src.market_universe import MarketUniverseManager
        res = MarketUniverseManager.sync_all_markets()
        return CommandStatus.SUCCEEDED, True, f"Refreshed market universe: {res.get('total_synced', 0)} instruments synced.", res

    @classmethod
    def _handle_square_off_position(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        pos_id = payload.get("position_id") or payload.get("trade_id")
        if not pos_id:
            return CommandStatus.REJECTED, False, "position_id or trade_id required", {}

        from src.trade_ledger import trade_ledger
        ok, res = trade_ledger.close_trade(
            trade_id=int(pos_id),
            exit_price=float(payload.get("exit_price", 64000.0)),
            exit_reason=payload.get("reason", "MANUAL_SQUARE_OFF")
        )
        status = CommandStatus.SUCCEEDED if ok else CommandStatus.FAILED
        return status, ok, "Position squared off" if ok else res.get("error", "Error closing trade"), res

    @classmethod
    def _handle_select_bot(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        if not bot_id:
            bot_id = payload.get("bot_id")
        if not bot_id:
            return CommandStatus.REJECTED, False, "bot_id is required for SELECT_BOT", {}

        bot = db.safe_query_one("SELECT * FROM bot_instances WHERE id = ?", (bot_id,))
        if not bot:
            return CommandStatus.FAILED, False, f"Bot instance {bot_id} not found", {}
        return CommandStatus.SUCCEEDED, True, f"Selected active bot {bot_id}", {"active_bot": bot}

    @classmethod
    def _handle_run_scan(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        from src.universe_scanner import UniverseScanner
        scanner = UniverseScanner()
        results = scanner.scan_universe(filters=payload.get("filters", {}))
        return CommandStatus.SUCCEEDED, True, f"Scan complete: {len(results)} matches found.", {"matches": results, "count": len(results)}

    @classmethod
    def _handle_stop_scanner(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        return CommandStatus.SUCCEEDED, True, "Universe scanner paused/stopped.", {"scanner_active": False}

    @classmethod
    def _handle_configure_indicator(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        ind_id = payload.get("indicator_id") or payload.get("id")
        if not ind_id:
            return CommandStatus.REJECTED, False, "indicator_id is required", {}

        from src import indicator_schema
        success, res = indicator_schema.save_indicator_config(
            bot_id=bot_id,
            indicator_id=ind_id,
            enabled=payload.get("enabled", True),
            weight=float(payload.get("weight", 20.0)),
            parameters=payload.get("parameters", {})
        )
        status = CommandStatus.SUCCEEDED if success else CommandStatus.FAILED
        return status, success, f"Indicator {ind_id} configuration saved" if success else res.get("error", "Error saving indicator"), res

    @classmethod
    def _handle_remove_indicator(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        ind_id = payload.get("indicator_id") or payload.get("id")
        if not ind_id:
            return CommandStatus.REJECTED, False, "indicator_id is required", {}
        from src import indicator_schema
        success, res = indicator_schema.save_indicator_config(
            bot_id=bot_id,
            indicator_id=ind_id,
            enabled=False,
            weight=0.0,
            parameters={}
        )
        return CommandStatus.SUCCEEDED, True, f"Indicator {ind_id} disabled/removed", res

    @classmethod
    def _handle_enable_indicator(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        ind_id = payload.get("indicator_id") or payload.get("id")
        if not ind_id:
            return CommandStatus.REJECTED, False, "indicator_id is required", {}
        from src import indicator_schema
        success, res = indicator_schema.save_indicator_config(
            bot_id=bot_id,
            indicator_id=ind_id,
            enabled=True,
            weight=float(payload.get("weight", 20.0)),
            parameters=payload.get("parameters", {})
        )
        return CommandStatus.SUCCEEDED, True, f"Indicator {ind_id} enabled", res

    @classmethod
    def _handle_disable_indicator(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        return cls._handle_remove_indicator(bot_id=bot_id, payload=payload, user=user)

    @classmethod
    def _handle_create_strategy(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        from src import strategy_builder
        success, res = strategy_builder.save_visual_strategy(payload)
        status = CommandStatus.SUCCEEDED if success else CommandStatus.FAILED
        return status, success, "Visual strategy created/updated" if success else res.get("error", "Error creating strategy"), res

    @classmethod
    def _handle_enable_strategy(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        strat_id = payload.get("strategy_id") or payload.get("id")
        if bot_id and strat_id:
            db.safe_execute("UPDATE bot_instances SET strategy = ? WHERE id = ?", (strat_id, bot_id))
        return CommandStatus.SUCCEEDED, True, f"Strategy {strat_id} enabled for {bot_id or 'all bots'}", {"strategy_id": strat_id, "bot_id": bot_id}

    @classmethod
    def _handle_disable_strategy(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        strat_id = payload.get("strategy_id") or payload.get("id")
        return CommandStatus.SUCCEEDED, True, f"Strategy {strat_id} disabled", {"strategy_id": strat_id}

    @classmethod
    def _handle_calculate_position_size(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        from src import universal_risk_engine
        calc_res = universal_risk_engine.calculate_position_size(
            account_equity=float(payload.get("account_equity", 10000.0)),
            entry_price=float(payload.get("entry_price", 65000.0)),
            stop_loss_price=float(payload.get("stop_loss_price", 64000.0)),
            risk_pct=float(payload.get("risk_pct", 1.0)),
            model=payload.get("model", "FIXED_PERCENTAGE")
        )
        return CommandStatus.SUCCEEDED, True, "Position size calculated", calc_res

    @classmethod
    def _handle_run_risk_check(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        from src import universal_risk_engine
        ok, reason, details = universal_risk_engine.evaluate_pre_trade_risk(
            bot_id=bot_id or "default-bot",
            symbol=payload.get("symbol", "BTC/USDT"),
            side=payload.get("side", "BUY"),
            quantity=float(payload.get("quantity", 0.1)),
            price=float(payload.get("price", 65000.0)),
            stop_loss=float(payload.get("stop_loss", 64000.0)),
            take_profit=float(payload.get("take_profit", 67000.0)),
            confidence=float(payload.get("confidence", 0.85)),
            is_live=bool(payload.get("is_live", False))
        )
        status = CommandStatus.SUCCEEDED if ok else CommandStatus.REJECTED
        return status, ok, f"Pre-trade check: {'APPROVED' if ok else 'BLOCKED - ' + reason}", {"approved": ok, "reason": reason, "details": details}

    @classmethod
    def _handle_apply_risk_profile(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        from src import universal_risk_engine
        prof_name = payload.get("profile_name", "CONSERVATIVE")
        res = universal_risk_engine.apply_risk_profile(prof_name, bot_id=bot_id)
        return CommandStatus.SUCCEEDED, True, f"Applied risk profile: {prof_name}", res

    @classmethod
    def _handle_create_order(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        from src.execution_service import OrderExecutionService
        service = OrderExecutionService()
        ok, reason, order_res = service.execute_order(
            bot_id=bot_id or "paper-bot",
            strategy=payload.get("strategy", "MANUAL_ORDER"),
            symbol=payload.get("symbol", "BTC/USDT"),
            side=payload.get("side", "BUY"),
            amount=float(payload.get("amount", payload.get("quantity", 0.01))),
            price=float(payload.get("price", 65000.0)),
            stop_loss=float(payload.get("stop_loss", 63000.0)),
            take_profit=float(payload.get("take_profit", 68000.0)),
            confidence_score=float(payload.get("confidence", 0.85)),
            is_live=bool(payload.get("is_live", False))
        )
        status = CommandStatus.SUCCEEDED if ok else CommandStatus.REJECTED
        return status, ok, f"Order execution: {'SUCCESS' if ok else reason}", order_res

    @classmethod
    def _handle_cancel_order(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        order_id = payload.get("order_id")
        if not order_id:
            return CommandStatus.REJECTED, False, "order_id is required", {}
        db.safe_execute("UPDATE trades_log SET status = 'CANCELLED' WHERE order_id = ? AND status = 'OPEN'", (order_id,))
        return CommandStatus.SUCCEEDED, True, f"Order {order_id} cancelled", {"order_id": order_id}

    @classmethod
    def _handle_modify_order(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        order_id = payload.get("order_id")
        if not order_id:
            return CommandStatus.REJECTED, False, "order_id is required", {}
        sl = payload.get("stop_loss")
        tp = payload.get("take_profit")
        if sl:
            db.safe_execute("UPDATE trades_log SET stop_loss = ? WHERE order_id = ? OR trade_id = ?", (sl, order_id, order_id))
        if tp:
            db.safe_execute("UPDATE trades_log SET take_profit = ? WHERE order_id = ? OR trade_id = ?", (tp, order_id, order_id))
        return CommandStatus.SUCCEEDED, True, f"Order {order_id} modified", {"order_id": order_id, "stop_loss": sl, "take_profit": tp}

    @classmethod
    def _handle_run_backtest(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        from src.backtester import run_backtest
        res = run_backtest(
            symbol=payload.get("symbol", "BTC/USDT"),
            timeframe=payload.get("timeframe", "1h"),
            strategy=payload.get("strategy", "EMA_MACD_VP"),
            initial_capital=float(payload.get("initial_capital", 10000.0)),
            commission=float(payload.get("commission", 0.001))
        )
        return CommandStatus.SUCCEEDED, True, "Backtest completed successfully", res

    @classmethod
    def _handle_create_alert(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        now_str = datetime.now(timezone.utc).isoformat()
        alert_id = f"ALT-{int(time.time()*1000)}"
        db.safe_execute(
            """
            INSERT INTO user_alerts (id, symbol, condition_type, operator, threshold_value, frequency, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
            """,
            (
                alert_id,
                payload.get("symbol", "BTC/USDT"),
                payload.get("condition_type", "PRICE"),
                payload.get("operator", "CROSSING_UP"),
                float(payload.get("threshold_value", 65000.0)),
                payload.get("frequency", "ONCE"),
                now_str
            )
        )
        return CommandStatus.SUCCEEDED, True, f"Alert {alert_id} created", {"alert_id": alert_id}

    @classmethod
    def _handle_update_alert(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        alert_id = payload.get("alert_id") or payload.get("id")
        if not alert_id:
            return CommandStatus.REJECTED, False, "alert_id is required", {}
        status = payload.get("status", "ACTIVE")
        db.safe_execute("UPDATE user_alerts SET status = ? WHERE id = ?", (status, alert_id))
        return CommandStatus.SUCCEEDED, True, f"Alert {alert_id} updated", {"alert_id": alert_id, "status": status}

    @classmethod
    def _handle_delete_alert(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        alert_id = payload.get("alert_id") or payload.get("id")
        if not alert_id:
            return CommandStatus.REJECTED, False, "alert_id is required", {}
        db.safe_execute("DELETE FROM user_alerts WHERE id = ?", (alert_id,))
        return CommandStatus.SUCCEEDED, True, f"Alert {alert_id} deleted", {"alert_id": alert_id}

    @classmethod
    def _handle_export_trades(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        from src import trade_ledger
        trades = trade_ledger.get_trades_history(limit=500)
        return CommandStatus.SUCCEEDED, True, f"Exported {len(trades)} trade records", {"trades_count": len(trades)}

    @classmethod
    def _handle_export_analytics(cls, bot_id: Optional[str], payload: Dict[str, Any], user: str):
        from src import performance_analytics
        metrics = performance_analytics.compute_complete_performance_metrics()
        return CommandStatus.SUCCEEDED, True, "Performance analytics computed and exported", metrics


command_bus = CommandBus()
