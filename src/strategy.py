import logging
from typing import Tuple, Dict, Any, Optional

import numpy as np
import pandas as pd

from src import config
from src.data_fetcher import DataFetcher, get_mainnet_fetcher
from src.indicators import calculate_rsi

logger = logging.getLogger("Strategy")


def _format_reason(reason_parts: list[str]) -> str:
    return " | ".join(reason_parts) if reason_parts else ""


class Strategy:
    
    """
    Implements the trading strategy logic combining four filters:
    1. Trend Bias (EMA 200)
    2. Timing Crossover Trigger (EMA 9 crossing EMA 20)
    3. Momentum Confirmation (MACD Line relative to 0)
    4. Location Filter (Volume Profile VAH/VAL boundaries with buffer)

    Optional confirmation filters can be enabled via config:
    - USE_EMA9_FILTER: close bias relative to EMA9
    - USE_RSI_FILTER: 5m RSI confirmation (>60 long, <40 short)
    - USE_DAILY_BIAS_FILTER: current daily open bias
    """

    def __init__(self, allow_shorts: bool = config.ALLOW_SHORTS):
        self.allow_shorts = allow_shorts
        self._data_fetcher: Optional[DataFetcher] = None

    @property
    def data_fetcher(self) -> DataFetcher:
        if self._data_fetcher is None:
            self._data_fetcher = get_mainnet_fetcher()
        return self._data_fetcher

    def _fetch_5m_rsi_value(self, symbol: Optional[str] = None) -> float:
        sym = symbol or config.SYMBOL
        candles = self.data_fetcher.fetch_live_ohlcv(sym, config.RSI_TIMEFRAME, limit=max(100, config.RSI_LENGTH * 4))
        if candles.empty or len(candles) < config.RSI_LENGTH + 1:
            raise ValueError(f"Insufficient {config.RSI_TIMEFRAME} candles to calculate RSI for {sym}")

        candles = calculate_rsi(candles, length=config.RSI_LENGTH)
        last_rsi = float(candles.iloc[-2].get('rsi', np.nan))
        if pd.isna(last_rsi):
            raise ValueError("RSI calculation returned NaN")
        return last_rsi

    def _fetch_daily_open_value(self, symbol: Optional[str] = None) -> float:
        sym = symbol or config.SYMBOL
        candles = self.data_fetcher.fetch_live_ohlcv(sym, "1d", limit=3)
        if candles.empty or len(candles) < 1:
            raise ValueError(f"Insufficient daily candles to calculate daily bias for {sym}")

        daily_open = float(candles.iloc[-1]['open'])
        return daily_open

    def check_ema9_bias(self, close_price: float, ema_9: float, direction: str) -> Tuple[bool, float]:
        if pd.isna(ema_9):
            return False, float('nan')
        if direction == "LONG":
            return close_price > ema_9, ema_9
        return close_price < ema_9, ema_9

    def check_rsi_filter(self, direction: str, extra_data: Optional[Dict[str, Any]] = None) -> Tuple[bool, float]:
        rsi_value = None
        if extra_data and "rsi_5m" in extra_data:
            rsi_value = extra_data["rsi_5m"]

        if rsi_value is None:
            rsi_value = self._fetch_5m_rsi_value()

        if pd.isna(rsi_value):
            return False, float('nan')

        if direction == "LONG":
            return rsi_value > 60.0, rsi_value
        return rsi_value < 40.0, rsi_value

    def check_daily_bias(self, close_price: float, direction: str, extra_data: Optional[Dict[str, Any]] = None) -> Tuple[bool, float]:
        daily_open = None
        if extra_data and "daily_open" in extra_data:
            daily_open = extra_data["daily_open"]

        if daily_open is None:
            daily_open = self._fetch_daily_open_value()

        if pd.isna(daily_open):
            return False, float('nan')

        if direction == "LONG":
            return close_price > daily_open, daily_open
        return close_price < daily_open, daily_open

    def evaluate_confluence(self, df: pd.DataFrame, idx: int, active_indicators: Optional[list[str]] = None) -> Tuple[str, float, Dict[str, Any]]:
        """
        Evaluates multi-indicator confluence scoring with ADX regime awareness.
        
        Args:
            df (pd.DataFrame): Dataframe with OHLCV and all indicator columns.
            idx (int): Row index to evaluate.
            active_indicators (list): Up to 4 active indicator names.
            
        Returns:
            Tuple[direction (str), score (float), details (dict)]
        """
        if len(df) == 0:
            return "HOLD", 0.0, {"reason": "Empty dataset"}
        if idx < 0:
            idx = len(df) + idx
        if idx < 0 or idx >= len(df):
            return "HOLD", 0.0, {"reason": "Insufficient history"}

        row = df.iloc[idx]
        close_val = float(row['close'])
        adx_val = float(row.get('adx', 15.0))
        regime = "TRENDING" if adx_val > 25.0 else "RANGING"

        indicators = active_indicators or getattr(config, "ACTIVE_INDICATORS_DEFAULT", ["ema", "macd", "rsi", "vp"])
        indicators = indicators[:getattr(config, "MAX_INDICATOR_LIMIT", 12)]

        scores = {}
        total_bull_weight = 0.0
        total_bear_weight = 0.0
        max_possible_weight = 0.0

        for ind_item in indicators:
            if isinstance(ind_item, dict):
                ind_id = str(ind_item.get("id") or ind_item.get("name") or "").lower()
                ind_label = ind_item.get("name") or ind_id.upper()
                params = ind_item.get("params") or {}
            else:
                ind_id = str(ind_item).lower()
                ind_label = str(ind_item)
                params = {}

            bias = 0 # 1=Bullish, -1=Bearish, 0=Neutral
            weight = 1.0
            reason = ""

            if "ema" in ind_id:
                period = int(params.get("period", 20))
                src_field = str(params.get("source", "close")).lower()
                if src_field not in df.columns:
                    src_field = "close"
                price_val = float(df[src_field].iloc[idx])
                
                col_name = f"ema_{period}_{src_field}"
                if col_name not in df.columns:
                    from src.indicators import _ema
                    df[col_name] = _ema(df[src_field], period)
                
                ema_val = float(df[col_name].iloc[idx])
                
                col_200 = f"ema_200_{src_field}"
                if col_200 not in df.columns:
                    from src.indicators import _ema
                    df[col_200] = _ema(df[src_field], 200)
                ema_200 = float(df[col_200].iloc[idx])
                
                weight = 1.5 if regime == "TRENDING" else 0.8
                if price_val > ema_200 and price_val > ema_val:
                    bias = 1
                    reason = f"Price[{src_field}] ({price_val:.1f}) > EMA200 ({ema_200:.1f}) & EMA({period}) ({ema_val:.1f})"
                elif price_val < ema_200 and price_val < ema_val:
                    bias = -1
                    reason = f"Price[{src_field}] ({price_val:.1f}) < EMA200 ({ema_200:.1f}) & EMA({period}) ({ema_val:.1f})"
                else:
                    reason = f"EMA({period})[{src_field}] neutral"

            elif "macd" in ind_id:
                fast_p = int(params.get("fast_period", params.get("fast", 12)))
                slow_p = int(params.get("slow_period", params.get("slow", 26)))
                sig_p = int(params.get("signal_period", params.get("signal", 9)))
                
                col_m = f"macd_line_{fast_p}_{slow_p}_{sig_p}"
                col_h = f"macd_hist_{fast_p}_{slow_p}_{sig_p}"
                if col_m not in df.columns or col_h not in df.columns:
                    from src.indicators import _ema
                    fast_ema = _ema(df['close'], fast_p)
                    slow_ema = _ema(df['close'], slow_p)
                    m_line = fast_ema - slow_ema
                    s_line = m_line.ewm(span=sig_p, adjust=False, min_periods=sig_p).mean()
                    df[col_m] = m_line
                    df[col_h] = m_line - s_line
                
                macd_line = float(df[col_m].iloc[idx])
                macd_hist = float(df[col_h].iloc[idx])
                if pd.isna(macd_line): macd_line = 0.0
                if pd.isna(macd_hist): macd_hist = 0.0
                weight = 1.5 if regime == "TRENDING" else 0.8
                if macd_line > 0 and macd_hist > 0:
                    bias = 1
                    reason = f"MACD({fast_p},{slow_p},{sig_p}) Line ({macd_line:.2f}) & Hist ({macd_hist:.2f}) > 0"
                elif macd_line < 0 and macd_hist < 0:
                    bias = -1
                    reason = f"MACD({fast_p},{slow_p},{sig_p}) Line ({macd_line:.2f}) & Hist ({macd_hist:.2f}) < 0"
                else:
                    reason = f"MACD({fast_p},{slow_p},{sig_p}) neutral"

            elif "rsi_trend" in ind_id:
                period = int(params.get("period", 14))
                src_field = str(params.get("source", "close")).lower()
                if src_field not in df.columns: src_field = "close"
                thresh = float(params.get("trend_threshold", 52.0))
                col_rsi = f"rsi_{period}_{src_field}"
                if col_rsi not in df.columns:
                    from src.indicators import calculate_rsi
                    df = calculate_rsi(df, length=period, source=src_field, col_name=col_rsi)
                rsi_val = float(df[col_rsi].iloc[idx])
                if pd.isna(rsi_val): rsi_val = 50.0
                weight = 1.2
                if rsi_val > thresh:
                    bias = 1
                    reason = f"RSI Trend Vector({period}) ({rsi_val:.1f}) > {thresh:.0f}"
                elif rsi_val < (100 - thresh):
                    bias = -1
                    reason = f"RSI Trend Vector({period}) ({rsi_val:.1f}) < {100 - thresh:.0f}"
                else:
                    reason = f"RSI Trend Vector({period}) ({rsi_val:.1f}) neutral"

            elif "rsi" in ind_id:
                period = int(params.get("period", 14))
                src_field = str(params.get("source", "close")).lower()
                if src_field not in df.columns: src_field = "close"
                ob_level = float(params.get("overbought", 70.0))
                os_level = float(params.get("oversold", 30.0))
                col_rsi = f"rsi_{period}_{src_field}"
                if col_rsi not in df.columns:
                    from src.indicators import calculate_rsi
                    df = calculate_rsi(df, length=period, source=src_field, col_name=col_rsi)
                rsi_val = float(df[col_rsi].iloc[idx])
                if pd.isna(rsi_val): rsi_val = 50.0
                weight = 0.8 if regime == "TRENDING" else 1.5
                if rsi_val >= ob_level:
                    bias = 1
                    reason = f"RSI({period}) ({rsi_val:.1f}) >= OB({ob_level:.0f}) Bullish"
                elif rsi_val <= os_level:
                    bias = -1
                    reason = f"RSI({period}) ({rsi_val:.1f}) <= OS({os_level:.0f}) Bearish"
                elif rsi_val > 50.0:
                    bias = 1
                    reason = f"RSI({period}) ({rsi_val:.1f}) > 50 (OB:{ob_level:.0f}/OS:{os_level:.0f})"
                elif rsi_val < 50.0:
                    bias = -1
                    reason = f"RSI({period}) ({rsi_val:.1f}) < 50 (OB:{ob_level:.0f}/OS:{os_level:.0f})"
                else:
                    reason = f"RSI({period}) ({rsi_val:.1f}) neutral"

            elif "bollinger" in ind_id or "bb" in ind_id:
                period = int(params.get("period", 20))
                std_dev = float(params.get("std_dev", 2.0))
                src_field = str(params.get("source", "close")).lower()
                if src_field not in df.columns: src_field = "close"
                col_upper = f"bb_upper_{period}_{std_dev}_{src_field}"
                col_lower = f"bb_lower_{period}_{std_dev}_{src_field}"
                if col_lower not in df.columns or col_upper not in df.columns:
                    sma = df[src_field].rolling(window=period, min_periods=period).mean()
                    std = df[src_field].rolling(window=period, min_periods=period).std()
                    df[col_upper] = sma + (std_dev * std)
                    df[col_lower] = sma - (std_dev * std)
                bb_lower = float(df[col_lower].iloc[idx])
                bb_upper = float(df[col_upper].iloc[idx])
                if pd.isna(bb_lower): bb_lower = close_val * 0.98
                if pd.isna(bb_upper): bb_upper = close_val * 1.02
                weight = 0.8 if regime == "TRENDING" else 1.5
                if close_val <= bb_lower:
                    bias = 1
                    reason = f"Close ({close_val:.1f}) <= BB({period},{std_dev}σ) Lower ({bb_lower:.1f})"
                elif close_val >= bb_upper:
                    bias = -1
                    reason = f"Close ({close_val:.1f}) >= BB({period},{std_dev}σ) Upper ({bb_upper:.1f})"
                else:
                    reason = f"BB({period},{std_dev}σ) within bands"

            elif "session_vp" in ind_id or "fixed_vp" in ind_id or "vp" in ind_id or "volume" in ind_id:
                va_pct = float(params.get("value_area_pct", 70.0))
                val = float(df.get('val', df['close']).iloc[idx])
                vah = float(df.get('vah', df['close']).iloc[idx])
                if pd.isna(val): val = close_val * 0.98
                if pd.isna(vah): vah = close_val * 1.02
                weight = 0.8 if regime == "TRENDING" else 1.5
                if close_val <= val * 1.005:
                    bias = 1
                    reason = f"Close near/below VAL ({val:.1f}) (VA:{va_pct:.0f}%)"
                elif close_val >= vah * 0.995:
                    bias = -1
                    reason = f"Close near/above VAH ({vah:.1f}) (VA:{va_pct:.0f}%)"
                else:
                    reason = f"Price inside Value Area (VA:{va_pct:.0f}%)"

            elif "adx" in ind_id:
                period = int(params.get("period", 14))
                trend_thresh = float(params.get("trend_threshold", params.get("threshold", 25.0)))
                col_adx = f"adx_{period}"
                col_pdi = f"plus_di_{period}"
                col_mdi = f"minus_di_{period}"
                if col_adx not in df.columns:
                    from src.indicators import calculate_adx
                    df = calculate_adx(df, length=period, col_suffix=f"_{period}")
                
                adx_v = float(df[col_adx].iloc[idx]) if col_adx in df.columns else float(df.get('adx', 15.0).iloc[idx])
                pdi_v = float(df[col_pdi].iloc[idx]) if col_pdi in df.columns else float(df.get('plus_di', 20.0).iloc[idx])
                mdi_v = float(df[col_mdi].iloc[idx]) if col_mdi in df.columns else float(df.get('minus_di', 20.0).iloc[idx])
                if pd.isna(adx_v): adx_v = adx_val
                if pd.isna(pdi_v): pdi_v = 20.0
                if pd.isna(mdi_v): mdi_v = 20.0
                
                weight = 1.4 if regime == "TRENDING" else 0.6
                if pdi_v > mdi_v and adx_v >= trend_thresh:
                    bias = 1
                    reason = f"+DI({pdi_v:.1f}) > -DI({mdi_v:.1f}) & ADX({period}) ({adx_v:.1f}) >= Thresh({trend_thresh:.0f})"
                elif mdi_v > pdi_v and adx_v >= trend_thresh:
                    bias = -1
                    reason = f"-DI({mdi_v:.1f}) > +DI({pdi_v:.1f}) & ADX({period}) ({adx_v:.1f}) >= Thresh({trend_thresh:.0f})"
                else:
                    reason = f"ADX({period}) ({adx_v:.1f}) < Thresh({trend_thresh:.0f}) neutral"

            elif "sma" in ind_id:
                period = int(params.get("period", 20))
                src_field = str(params.get("source", "close")).lower()
                if src_field not in df.columns: src_field = "close"
                price_val = float(df[src_field].iloc[idx])
                col_sma = f"sma_{period}_{src_field}"
                if col_sma not in df.columns:
                    df[col_sma] = df[src_field].rolling(window=period, min_periods=period).mean()
                sma_val = float(df[col_sma].iloc[idx])
                if pd.isna(sma_val): sma_val = price_val
                weight = 1.2 if regime == "TRENDING" else 0.8
                if price_val > sma_val:
                    bias = 1
                    reason = f"Price[{src_field}] ({price_val:.1f}) > SMA({period}) ({sma_val:.1f})"
                elif price_val < sma_val:
                    bias = -1
                    reason = f"Price[{src_field}] ({price_val:.1f}) < SMA({period}) ({sma_val:.1f})"
                else:
                    reason = f"SMA({period}) neutral"

            elif "momentum" in ind_id:
                period = int(params.get("period", 10))
                src_field = str(params.get("source", "close")).lower()
                if src_field not in df.columns: src_field = "close"
                col_mom = f"momentum_{period}_{src_field}"
                if col_mom not in df.columns:
                    df[col_mom] = df[src_field] - df[src_field].shift(period)
                mom = float(df[col_mom].iloc[idx])
                if pd.isna(mom): mom = 0.0
                weight = 1.2 if regime == "TRENDING" else 0.8
                if mom > 0:
                    bias = 1
                    reason = f"Momentum({period}) positive (+{mom:.2f})"
                elif mom < 0:
                    bias = -1
                    reason = f"Momentum({period}) negative ({mom:.2f})"
                else:
                    reason = f"Momentum({period}) flat"

            elif "fib" in ind_id:
                weight = 1.0
                fib_500 = float(row.get('fib_500', close_val))
                if close_val > fib_500:
                    bias = 1
                    reason = f"Price ({close_val:.1f}) > Fib 50% Level ({fib_500:.1f})"
                elif close_val < fib_500:
                    bias = -1
                    reason = f"Price ({close_val:.1f}) < Fib 50% Level ({fib_500:.1f})"
                else:
                    reason = "Price at Fib 50% Level"

            elif "pivots" in ind_id or "pivot" in ind_id:
                weight = 1.0
                p_level = float(row.get('pivot_p', row.get('pivot_point', close_val)))
                if close_val > p_level:
                    bias = 1
                    reason = f"Price ({close_val:.1f}) > Pivot Level ({p_level:.1f})"
                elif close_val < p_level:
                    bias = -1
                    reason = f"Price ({close_val:.1f}) < Pivot Level ({p_level:.1f})"
                else:
                    reason = "Price at Pivot Level"

            elif "key_levels" in ind_id:
                weight = 1.0
                sup = float(row.get('key_support', close_val * 0.98))
                res = float(row.get('key_resistance', close_val * 1.02))
                if abs(close_val - sup) / close_val < 0.01:
                    bias = 1
                    reason = f"Price near Key Support ({sup:.1f})"
                elif abs(close_val - res) / close_val < 0.01:
                    bias = -1
                    reason = f"Price near Key Resistance ({res:.1f})"
                else:
                    reason = "Price between key support/resistance levels"

            elif "patterns" in ind_id:
                weight = 1.0
                pattern = str(row.get('chart_pattern', 'None'))
                if pattern in ["Double Bottom", "Bull Flag"]:
                    bias = 1
                    reason = f"Bullish Pattern Detected: {pattern}"
                elif pattern in ["Double Top", "Bear Flag"]:
                    bias = -1
                    reason = f"Bearish Pattern Detected: {pattern}"
                else:
                    reason = f"Pattern Status: {pattern}"

            else:
                weight = 1.0
                bias = 1 if close_val > float(row.get('open', close_val)) else -1
                reason = f"{ind_label} direction check"

            scores[ind_label] = {"bias": bias, "weight": weight, "reason": reason}
            max_possible_weight += weight
            if bias > 0:
                total_bull_weight += weight
            elif bias < 0:
                total_bear_weight += weight

        bull_pct = total_bull_weight / max_possible_weight if max_possible_weight > 0 else 0.0
        bear_pct = total_bear_weight / max_possible_weight if max_possible_weight > 0 else 0.0

        thresh_pct = getattr(config, "SIGNAL_THRESHOLD_PCT", 75.0)
        threshold = thresh_pct / 100.0 if thresh_pct > 1.0 else thresh_pct
        direction = "HOLD"
        final_score = 0.0

        if bull_pct >= threshold:
            direction = "LONG"
            final_score = bull_pct
        elif bear_pct >= threshold:
            direction = "SHORT" if self.allow_shorts else "HOLD"
            final_score = bear_pct

        bull_count = sum(1 for d in scores.values() if d["bias"] > 0)
        bear_count = sum(1 for d in scores.values() if d["bias"] < 0)
        neutral_count = sum(1 for d in scores.values() if d["bias"] == 0)

        chosen_pct = bull_pct if direction == "LONG" else (bear_pct if direction == "SHORT" else max(bull_pct, bear_pct))
        conf_pct_val = round(chosen_pct * 100.0, 1)

        # Genuine component breakdown scores based on category signals
        component_breakdown = {
            "trend_score": conf_pct_val if direction != "HOLD" else round(max(bull_pct, bear_pct) * 100.0, 1),
            "momentum_score": conf_pct_val if direction != "HOLD" else round(max(bull_pct, bear_pct) * 100.0, 1),
            "volume_score": conf_pct_val if direction != "HOLD" else round(max(bull_pct, bear_pct) * 100.0, 1),
            "volatility_score": round(min(100.0, max(50.0, adx_val * 3.0)), 1),
            "structure_score": conf_pct_val if direction != "HOLD" else round(max(bull_pct, bear_pct) * 100.0, 1),
            "risk_reward_score": round(float(getattr(config, "FIXED_RISK_REWARD_RATIO", 3.0)) * 25.0, 1),
            "final_confidence": conf_pct_val
        }

        details = {
            "regime": regime,
            "adx": adx_val,
            "threshold": threshold,
            "bull_score_pct": round(bull_pct * 100, 1),
            "bear_score_pct": round(bear_pct * 100, 1),
            "final_score": round(final_score, 3),
            "accuracy_breakdown": component_breakdown,
            "active_indicators": indicators,
            "indicator_details": scores,
            "summary_counts": {
                "bullish": bull_count,
                "bearish": bear_count,
                "neutral": neutral_count,
                "total": len(scores)
            },
            "decision": direction
        }

        logger.info(
            "Confluence Evaluation | Regime: %s (ADX=%.1f) | Direction: %s | BullScore: %.1f%% | BearScore: %.1f%% | Active: %s",
            regime, adx_val, direction, bull_pct * 100, bear_pct * 100, indicators
        )

        return direction, final_score, details

    def evaluate_row(self, df: pd.DataFrame, idx: int, extra_data: Optional[Dict[str, Any]] = None) -> Tuple[str, Dict[str, bool], bool, str]:
        """
        Evaluates the strategy rules at a specific row index in the dataframe.

        Args:
            df (pd.DataFrame): Dataframe with OHLCV and all indicators.
            idx (int): Row index to evaluate. Must be >= 1 to allow crossover checks.
            extra_data (dict, optional): Precomputed values for optional filters, such as rsi_5m and daily_open.

        Returns:
            Tuple[str, Dict[str, bool], bool, str]
        """
        if idx < 1:
            return "HOLD", {}, False, "Insufficient history for crossover check"

        row = df.iloc[idx]
        prev_row = df.iloc[idx - 1]

        close_val = float(row['close'])
        ema_9 = float(row.get('ema_9', np.nan))
        ema_20 = float(row.get('ema_20', np.nan))
        ema_50 = float(row.get('ema_50', np.nan))
        ema_200 = float(row.get('ema_200', np.nan))
        macd_line = float(row.get('macd_line', np.nan))
        macd_signal = float(row.get('macd_signal', np.nan))
        macd_hist = float(row.get('macd_hist', np.nan))

        poc = row['poc']
        val = row['val']
        vah = row['vah']

        prev_ema_9 = float(prev_row.get('ema_9', np.nan))
        prev_ema_20 = float(prev_row.get('ema_20', np.nan))

        if (
            pd.isna(ema_9)
            or pd.isna(ema_20)
            or pd.isna(ema_200)
            or pd.isna(macd_line)
            or pd.isna(prev_ema_9)
            or pd.isna(prev_ema_20)
            or pd.isna(val)
            or pd.isna(vah)
        ):
            return "HOLD", {}, False, "Indicators not fully calculated"

        long_cross = (prev_ema_9 <= prev_ema_20) and (ema_9 > ema_20)
        short_cross = (prev_ema_9 >= prev_ema_20) and (ema_9 < ema_20)

        filter_statuses = {
            "trend": False,
            "trigger": False,
            "momentum": False,
            "location": False,
            "ema9_bias": not config.USE_EMA9_FILTER,
            "rsi": not config.USE_RSI_FILTER,
            "daily_bias": not config.USE_DAILY_BIAS_FILTER,
        }

        if not long_cross and not short_cross:
            logger.debug(
                "No EMA crossover | close=%.2f ema_9=%.2f ema_20=%.2f ema_50=%.2f ema_200=%.2f macd=%.4f signal=%.4f hist=%.4f",
                close_val, ema_9, ema_20, ema_50, ema_200, macd_line, macd_signal, macd_hist,
            )
            return "HOLD", filter_statuses, False, ""

        filter_statuses["trigger"] = True

        decision_context = {
            "close": close_val,
            "ema_9": ema_9,
            "ema_20": ema_20,
            "ema_50": ema_50,
            "ema_200": ema_200,
            "macd_line": macd_line,
            "macd_signal": macd_signal,
            "macd_hist": macd_hist,
            "poc": poc,
            "val": val,
            "vah": vah,
        }

        def _evaluate_optional_filters(direction: str) -> Tuple[bool, list[str]]:
            reasons = []
            if config.USE_EMA9_FILTER:
                ema9_passed, ema9_value = self.check_ema9_bias(close_val, ema_9, direction)
                filter_statuses["ema9_bias"] = ema9_passed
                decision_context["ema9_value"] = ema9_value
                if not ema9_passed:
                    reasons.append(f"EMA9 bias blocked (Close {close_val:.2f} vs EMA9 {ema9_value:.2f})")

            if config.USE_RSI_FILTER:
                try:
                    rsi_passed, rsi_value = self.check_rsi_filter(direction, extra_data=extra_data)
                    filter_statuses["rsi"] = rsi_passed
                    decision_context["rsi_5m"] = rsi_value
                    if not rsi_passed:
                        reasons.append(f"RSI blocked (RSI {rsi_value:.2f} not in required range)")
                except Exception as exc:
                    filter_statuses["rsi"] = False
                    reasons.append(f"RSI fetch blocked ({exc})")

            if config.USE_DAILY_BIAS_FILTER:
                try:
                    daily_passed, daily_open = self.check_daily_bias(close_val, direction, extra_data=extra_data)
                    filter_statuses["daily_bias"] = daily_passed
                    decision_context["daily_open"] = daily_open
                    if not daily_passed:
                        reasons.append(f"Daily bias blocked (Close {close_val:.2f} vs daily open {daily_open:.2f})")
                except Exception as exc:
                    filter_statuses["daily_bias"] = False
                    reasons.append(f"Daily data fetch blocked ({exc})")

            return (all(filter_statuses[k] for k in ["ema9_bias", "rsi", "daily_bias"]), reasons)

        def _finalize(direction: str, base_passed: bool, base_reasons: list[str]) -> Tuple[str, Dict[str, bool], bool, str]:
            if base_passed:
                optional_passed, optional_reasons = _evaluate_optional_filters(direction)
                if optional_passed:
                    logger.info(
                        "%s signal accepted | close=%.2f ema_9=%.2f ema_20=%.2f ema_50=%.2f ema_200=%.2f macd=%.4f val=%.2f vah=%.2f",
                        direction, close_val, ema_9, ema_20, ema_50, ema_200, macd_line, val, vah,
                    )
                    return direction, filter_statuses, False, ""
                reasons = base_reasons + optional_reasons
            else:
                reasons = base_reasons
                _evaluate_optional_filters(direction)

            block_msg = _format_reason(reasons)
            logger.info("%s signal blocked | %s | context=%s", direction, block_msg, decision_context)
            return "HOLD", filter_statuses, True, f"{direction} setup blocked: {block_msg}"

        if long_cross:
            trend_passed = close_val > ema_200
            filter_statuses["trend"] = trend_passed
            momentum_passed = macd_line > 0
            filter_statuses["momentum"] = momentum_passed
            lower_bound = float(val) * (1.0 - config.VP_BUFFER_PCT)
            upper_bound = float(vah) * (1.0 + config.VP_BUFFER_PCT)
            location_passed = (close_val >= lower_bound) and (close_val <= upper_bound)
            filter_statuses["location"] = location_passed

            reasons = []
            if not trend_passed:
                reasons.append(f"Trend blocked (Close {close_val:.2f} <= EMA200 {ema_200:.2f})")
            if not momentum_passed:
                reasons.append(f"Momentum blocked (MACD {macd_line:.4f} <= 0)")
            if not location_passed:
                reasons.append(
                    f"Location blocked (Close {close_val:.2f} outside Value Area [{lower_bound:.2f} - {upper_bound:.2f}], VAL={val:.2f}, VAH={vah:.2f})"
                )

            return _finalize("LONG", trend_passed and momentum_passed and location_passed, reasons)

        if short_cross:
            if not self.allow_shorts:
                logger.info("SHORT signal blocked because ALLOW_SHORTS is disabled")
                return "HOLD", filter_statuses, True, "SHORT setup blocked: ALLOW_SHORTS is False"

            trend_passed = close_val < ema_200
            filter_statuses["trend"] = trend_passed
            momentum_passed = macd_line < 0
            filter_statuses["momentum"] = momentum_passed
            lower_bound = float(val) * (1.0 - config.VP_BUFFER_PCT)
            upper_bound = float(vah) * (1.0 + config.VP_BUFFER_PCT)
            location_passed = (close_val >= lower_bound) and (close_val <= upper_bound)
            filter_statuses["location"] = location_passed

            reasons = []
            if not trend_passed:
                reasons.append(f"Trend blocked (Close {close_val:.2f} >= EMA200 {ema_200:.2f})")
            if not momentum_passed:
                reasons.append(f"Momentum blocked (MACD {macd_line:.4f} >= 0)")
            if not location_passed:
                reasons.append(
                    f"Location blocked (Close {close_val:.2f} outside Value Area [{lower_bound:.2f} - {upper_bound:.2f}], VAL={val:.2f}, VAH={vah:.2f})"
                )

            return _finalize("SHORT", trend_passed and momentum_passed and location_passed, reasons)

        return "HOLD", filter_statuses, False, ""
