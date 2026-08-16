import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Tuple

from src import config, db
from src.audit import log_bot_event, log_data_correction

logger = logging.getLogger("PositionReconciler")


class PositionReconciler:
    """
    Broker vs Local DB Position & Order Reconciler.
    Prevents trading on desynchronized position state.
    """

    def fetch_local_open_positions(self) -> List[Dict[str, Any]]:
        """Fetch open trades from persistent DB trades_log."""
        return db.safe_query("SELECT * FROM trades_log WHERE status = 'OPEN' OR status = 'RUNNING'")

    def fetch_broker_open_positions(self) -> List[Dict[str, Any]]:
        """Fetch open positions from broker/exchange API."""
        mode = getattr(config, "TRADING_MODE", "PAPER").upper()
        if mode == "PAPER" or mode == "TEST" or getattr(config, "TEST_MODE", False):
            # In Paper/Test mode, broker matches DB
            local_pos = self.fetch_local_open_positions()
            return [
                {
                    "symbol": p.get("symbol"),
                    "side": p.get("direction"),
                    "amount": p.get("position_size"),
                    "entry_price": p.get("entry_price")
                }
                for p in local_pos
            ]

        try:
            from src.data_fetcher import get_testnet_fetcher
            fetcher = get_testnet_fetcher()
            raw_positions = fetcher.exchange.fetch_positions()
            active_pos = []
            for pos in raw_positions:
                contracts = float(pos.get("contracts", 0.0) or pos.get("amount", 0.0))
                if contracts > 0:
                    active_pos.append({
                        "symbol": pos.get("symbol"),
                        "side": pos.get("side", "").upper(),
                        "amount": contracts,
                        "entry_price": float(pos.get("entryPrice", 0.0))
                    })
            return active_pos
        except Exception as e:
            logger.error("Failed to fetch broker positions: %s", e)
            return []

    def reconcile_on_startup(self) -> Tuple[bool, str, List[Dict[str, Any]]]:
        """
        Execute reconciliation loop on startup or audit interval.
        Locks live trading if mismatch is detected.
        """
        log_bot_event(
            event_type="RECONCILIATION_STARTED",
            message="Starting broker vs local database position reconciliation...",
            severity="INFO"
        )

        local_positions = self.fetch_local_open_positions()
        broker_positions = self.fetch_broker_open_positions()

        mismatches = []
        local_map = {p["symbol"]: p for p in local_positions if p.get("symbol")}
        broker_map = {p["symbol"]: p for p in broker_positions if p.get("symbol")}

        all_symbols = set(local_map.keys()).union(set(broker_map.keys()))

        for sym in all_symbols:
            loc = local_map.get(sym)
            brk = broker_map.get(sym)

            if loc and not brk:
                mismatches.append({
                    "symbol": sym,
                    "type": "LOCAL_ONLY",
                    "details": f"Local DB has open trade #{loc.get('id')} but broker has 0 position"
                })
            elif brk and not loc:
                mismatches.append({
                    "symbol": sym,
                    "type": "EXCHANGE_ONLY",
                    "details": f"Broker has open position {brk.get('amount')} {sym} but local DB has 0 open trade"
                })
            elif loc and brk:
                loc_amt = float(loc.get("position_size", 0.0))
                brk_amt = float(brk.get("amount", 0.0))
                if abs(loc_amt - brk_amt) > 0.0001:
                    mismatches.append({
                        "symbol": sym,
                        "type": "MISMATCH_QUANTITY",
                        "details": f"Quantity mismatch for {sym}: local DB={loc_amt} vs broker={brk_amt}"
                    })

        if mismatches:
            setattr(config, "POSITION_MISMATCH_LOCKED", True)
            setattr(config, "LIVE_TRADING_ARMED", False)

            log_bot_event(
                event_type="RECONCILIATION_MISMATCH",
                message=f"Position mismatch detected! Live trading LOCKED. Mismatches: {len(mismatches)}",
                severity="ERROR",
                status="FAILED",
                reason="POSITION_MISMATCH",
                metadata={"mismatches": mismatches}
            )
            return False, "POSITION MISMATCH — LIVE TRADING LOCKED", mismatches

        setattr(config, "POSITION_MISMATCH_LOCKED", False)
        log_bot_event(
            event_type="RECONCILIATION_COMPLETED",
            message=f"Reconciliation completed successfully. {len(local_positions)} open positions MATCHED.",
            severity="INFO",
            status="SUCCESS"
        )
        return True, "Position state MATCHED", []


position_reconciler = PositionReconciler()
