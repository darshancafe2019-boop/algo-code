import os
import logging
from pathlib import Path
from typing import Tuple, Dict, Any
import pandas as pd
import numpy as np

from src import config
from src.audit import log_bot_event

logger = logging.getLogger("RiskManager")


class RiskManager:
    """
    Manages risk parameters, calculates position sizing, sets stop-loss and take-profit levels,
    and enforces trading limits (max concurrent positions, daily loss limit, and global kill switch).
    """

    def __init__(self, kill_switch_file: Path = config.KILL_SWITCH_FILE):
        self.kill_switch_file = kill_switch_file

    def is_kill_switch_active(self) -> bool:
        """Checks if global kill switch is active via flag file or config master switch."""
        master_switch = getattr(config, "GLOBAL_TRADING_KILL_SWITCH", False)
        if master_switch or self.kill_switch_file.exists():
            logger.warning("Global Kill switch active! Found flag file or config switch.")
            log_bot_event(
                event_type="KILL_SWITCH_ACTIVATED",
                message="Global trading kill switch is currently ACTIVE. New order submission is blocked.",
                severity="WARNING",
                reason="KILL_SWITCH_ACTIVE"
            )
            return True
        return False

    def calculate_swing_levels(self, df: pd.DataFrame, idx: int, lookback: int) -> Tuple[float, float]:
        start_idx = max(0, idx - lookback + 1)
        window = df.iloc[start_idx:idx + 1]
        swing_low = float(window['low'].min())
        swing_high = float(window['high'].max())
        return swing_low, swing_high

    def calculate_trade_levels(
        self,
        df: pd.DataFrame,
        idx: int,
        direction: str,
        entry_price: float
    ) -> Tuple[float, float]:
        row = df.iloc[idx]
        val = float(row.get('val', entry_price * 0.98) if not pd.isna(row.get('val', np.nan)) else entry_price * 0.98)
        vah = float(row.get('vah', entry_price * 1.02) if not pd.isna(row.get('vah', np.nan)) else entry_price * 1.02)
        atr = float(row.get('atr', entry_price * 0.015) if not pd.isna(row.get('atr', np.nan)) else entry_price * 0.015)
        swing_low, swing_high = self.calculate_swing_levels(df, idx, config.SWING_LOOKBACK_CANDLES)

        if direction == "LONG":
            val_sl = val * 0.999
            swing_sl = swing_low * 0.999
            atr_sl = entry_price - (1.5 * atr)
            
            if config.STOP_LOSS_METHOD == "fixed_pct":
                stop_loss = entry_price * (1.0 - config.FIXED_STOP_LOSS_PCT)
            elif config.STOP_LOSS_METHOD == "atr":
                stop_loss = atr_sl if atr_sl < entry_price else entry_price * 0.98
            elif config.STOP_LOSS_METHOD == "tighter":
                valid_sls = [sl for sl in [val_sl, swing_sl, atr_sl] if sl < entry_price]
                stop_loss = max(valid_sls) if valid_sls else entry_price * 0.98
            elif config.STOP_LOSS_METHOD == "val_vah":
                stop_loss = val_sl if val_sl < entry_price else entry_price * 0.98
            else:
                stop_loss = swing_sl if swing_sl < entry_price else entry_price * 0.98

            sl_distance = entry_price - stop_loss
            tp_rr = entry_price + (config.FIXED_RISK_REWARD_RATIO * sl_distance) if config.TAKE_PROFIT_METHOD == "fixed_rr" else entry_price + (2.0 * sl_distance)
            
            vah_tp = vah
            if config.TAKE_PROFIT_METHOD == "conservative":
                take_profit = min(tp_rr, vah_tp) if vah_tp > entry_price else tp_rr
            else:
                take_profit = tp_rr

        elif direction == "SHORT":
            vah_sl = vah * 1.001
            swing_sl = swing_high * 1.001
            atr_sl = entry_price + (1.5 * atr)
            
            if config.STOP_LOSS_METHOD == "fixed_pct":
                stop_loss = entry_price * (1.0 + config.FIXED_STOP_LOSS_PCT)
            elif config.STOP_LOSS_METHOD == "atr":
                stop_loss = atr_sl if atr_sl > entry_price else entry_price * 1.02
            elif config.STOP_LOSS_METHOD == "tighter":
                valid_sls = [sl for sl in [vah_sl, swing_sl, atr_sl] if sl > entry_price]
                stop_loss = min(valid_sls) if valid_sls else entry_price * 1.02
            elif config.STOP_LOSS_METHOD == "val_vah":
                stop_loss = vah_sl if vah_sl > entry_price else entry_price * 1.02
            else:
                stop_loss = swing_sl if swing_sl > entry_price else entry_price * 1.02

            sl_distance = stop_loss - entry_price
            tp_rr = entry_price - (config.FIXED_RISK_REWARD_RATIO * sl_distance) if config.TAKE_PROFIT_METHOD == "fixed_rr" else entry_price - (2.0 * sl_distance)
            
            val_tp = val
            if config.TAKE_PROFIT_METHOD == "conservative":
                take_profit = max(tp_rr, val_tp) if val_tp < entry_price else tp_rr
            else:
                take_profit = tp_rr
        else:
            raise ValueError(f"Invalid direction: {direction}")

        if stop_loss == entry_price:
            stop_loss = entry_price * 0.98 if direction == "LONG" else entry_price * 1.02
            
        return round(stop_loss, 2), round(take_profit, 2)

    def calculate_position_size(
        self,
        account_balance: float,
        entry_price: float,
        stop_loss_price: float
    ) -> float:
        sl_distance = abs(entry_price - stop_loss_price)
        if sl_distance <= 1e-4:
            logger.warning("Stop loss distance is zero or near-zero. Position size calculation aborted.")
            log_bot_event(
                event_type="RISK_CHECK_FAILED",
                message="Position sizing aborted due to zero or near-zero Stop Loss distance",
                severity="WARNING",
                reason="INVALID_STOP_LOSS_DISTANCE"
            )
            return 0.0

        risk_amount_usdt = account_balance * config.RISK_PCT_PER_TRADE
        position_size_btc = risk_amount_usdt / sl_distance
        max_possible_btc = account_balance / entry_price
        
        if position_size_btc > max_possible_btc:
            logger.info(f"Capping position size {position_size_btc:.6f} BTC to available cash equivalent {max_possible_btc:.6f} BTC.")
            position_size_btc = max_possible_btc

        btc_size = round(position_size_btc, 6)
        log_bot_event(
            event_type="RISK_CHECK_PASSED",
            message=f"Risk check approved for ${account_balance:,.2f} balance: Size = {btc_size} BTC (Risk: ${risk_amount_usdt:.2f})",
            severity="INFO",
            reason="RISK_APPROVED",
            metadata={
                "account_balance": account_balance,
                "risk_amount_usdt": risk_amount_usdt,
                "position_size": btc_size,
                "entry_price": entry_price,
                "stop_loss_price": stop_loss_price
            }
        )
        return btc_size

    def check_daily_loss_limit(self, todays_pnl_usdt: float, account_balance: float) -> bool:
        if account_balance <= 0:
            return True
            
        drawdown_pct = todays_pnl_usdt / account_balance
        if drawdown_pct <= config.DAILY_LOSS_LIMIT_PCT:
            logger.warning(f"Daily loss limit hit! Current daily drawdown: {drawdown_pct*100:.2f}% (Limit: {config.DAILY_LOSS_LIMIT_PCT*100:.2f}%)")
            log_bot_event(
                event_type="DAILY_LOSS_LIMIT_EXCEEDED",
                message=f"Daily loss limit hit! Current daily drawdown: {drawdown_pct*100:.2f}%",
                severity="WARNING",
                reason="DAILY_LOSS_LIMIT"
            )
            return True
        return False
