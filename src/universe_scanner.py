import logging
from typing import Dict, Any, List, Optional
from src import config, db
from src.indicators import evaluate_profile_confluence

logger = logging.getLogger("UniverseScanner")


class MultiAssetStagedScanner:
    """
    Executes the complete end-to-end staged scanning pipeline across multi-asset Market Universe:
    EXCHANGE / PROVIDER -> INSTRUMENT MASTER -> DISCOVERY SYNC -> MARKET UNIVERSE ->
    WATCHLIST / SCANNER -> CATEGORIES (HIGH VOLATILITY, MOMENTUM, DIRECTIONAL, SWING, SCALPING, HEDGING) ->
    CHART DATAFEED -> INDICATORS -> STRATEGY (75%+ CONFLUENCE) -> RISK GATE -> PAPER / PROTECTED LIVE
    """

    def __init__(self, confidence_threshold: float = 75.0):
        self.confidence_threshold = confidence_threshold

    def scan_active_universe(self, limit: int = 50, category_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        """Scans active/watched instruments through the strategy confluence and risk pipeline."""
        candidates = []
        try:
            # Step 1: Query active or strategy-enabled instruments
            res = db.get_market_universe(status_filter="STRATEGY", limit=limit)
            instruments = res.get("instruments", [])

            if not instruments:
                # Fallback to high volatility instruments if no specific strategy-enabled set
                res = db.get_market_universe(volatility="High", limit=limit)
                instruments = res.get("instruments", [])

            logger.info(f"Staged scanner evaluating {len(instruments)} candidate instruments across universe...")

            for inst in instruments:
                symbol = inst.get("symbol") or inst.get("canonical_symbol")
                if not symbol:
                    continue

                asset_class = inst.get("asset_class", "Stock")

                # Step 2: Liquidity & Volatility Filter
                vol = float(inst.get("volume_24h") or 0.0)
                liq_score = float(inst.get("liquidity_score") or (80.0 if vol > 100000 else 50.0))
                if liq_score < 30.0:
                    continue

                # Category Filtering (if requested)
                if category_filter == "SWING" and not inst.get("is_swing_candidate"):
                    continue
                if category_filter == "SCALPING" and not inst.get("is_scalping_candidate"):
                    continue
                if category_filter == "HEDGING" and not inst.get("is_hedge_candidate"):
                    continue
                if category_filter == "HIGH_VOLATILITY" and inst.get("volatility_category") not in ["High", "Extreme"]:
                    continue

                # Step 3: Evaluate indicators & strategy confluence
                confluence = evaluate_profile_confluence(symbol=symbol, df=None, profile="balanced")
                confidence_score = confluence.get("confluence_score", 0.0)
                signal_type = confluence.get("signal", "HOLD")

                # Step 4: 75% Confidence Score Threshold Validation
                meets_threshold = (confidence_score >= self.confidence_threshold) and (signal_type in ["BUY_LONG", "SELL_SHORT"])

                execution_available = (inst.get("tradability") != "DATA_ONLY") and (bool(inst.get("paper_enabled", 1)) or bool(inst.get("live_enabled", 0)))

                candidate_record = {
                    "symbol": symbol,
                    "canonical_symbol": inst.get("canonical_symbol", symbol),
                    "display_name": inst.get("display_name") or inst.get("display_symbol", symbol),
                    "asset_class": asset_class,
                    "market": inst.get("exchange", "Global"),
                    "signal_type": signal_type,
                    "confidence_score": confidence_score,
                    "threshold": self.confidence_threshold,
                    "meets_threshold": meets_threshold,
                    "volatility_score": inst.get("volatility_score", 45.0),
                    "volatility_category": inst.get("volatility_category", "Medium"),
                    "momentum_score": inst.get("momentum_score", 50.0),
                    "directional_bias": inst.get("directional_bias", "NEUTRAL"),
                    "is_swing_candidate": bool(inst.get("is_swing_candidate", 0)),
                    "is_scalping_candidate": bool(inst.get("is_scalping_candidate", 0)),
                    "is_hedge_candidate": bool(inst.get("is_hedge_candidate", 0)),
                    "execution_available": execution_available,
                    "details": confluence
                }

                if meets_threshold:
                    logger.info(f"🎯 75%+ Signal Candidates Found: {symbol} ({asset_class}) -> {signal_type} ({confidence_score}%)")
                    candidates.append(candidate_record)

        except Exception as exc:
            logger.error(f"Error during staged multi-asset scan: {exc}")

        return candidates
