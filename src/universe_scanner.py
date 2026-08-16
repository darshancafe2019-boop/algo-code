import logging
from typing import Dict, Any, List
from src import config, db
from src.indicators import evaluate_profile_confluence

logger = logging.getLogger("UniverseScanner")


class MultiAssetStagedScanner:
    """
    Executes staged scanning pipeline across multi-asset Market Universe:
    ALL DISCOVERED -> ACTIVE/WATCH -> LIQUIDITY & VOLATILITY FILTER -> INDICATORS ->
    EXISTING STRATEGY -> 75% CONFIDENCE SCORE THRESHOLD -> RISK CHECK -> ORDER ROUTER
    """

    def __init__(self, confidence_threshold: float = 75.0):
        self.confidence_threshold = confidence_threshold

    def scan_active_universe(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Scans active/watched instruments through the strategy confluence pipeline."""
        candidates = []
        try:
            # Step 1 & 2: Query active or strategy-enabled instruments
            res = db.get_market_universe(status_filter="STRATEGY", limit=limit)
            instruments = res.get("instruments", [])

            if not instruments:
                # Fallback to high volatility instruments if no specific strategy-enabled set
                res = db.get_market_universe(volatility="High", limit=limit)
                instruments = res.get("instruments", [])

            logger.info(f"Staged scanner evaluating {len(instruments)} candidate instruments...")

            for inst in instruments:
                symbol = inst["symbol"]
                asset_class = inst["asset_class"]

                # Step 3: Liquidity & Volatility Filter
                if inst.get("liquidity_score", 0) < 30.0:
                    continue

                # Step 4 & 5: Evaluate indicators & strategy confluence
                # Strategy evaluation feeds into evaluate_profile_confluence (preserving 75% threshold)
                confluence = evaluate_profile_confluence(symbol=symbol, df=None, profile="balanced")
                confidence_score = confluence.get("confluence_score", 0.0)
                signal_type = confluence.get("signal", "HOLD")

                # Step 6: 75% Confidence Score Threshold Validation
                meets_threshold = (confidence_score >= self.confidence_threshold) and (signal_type in ["BUY_LONG", "SELL_SHORT"])

                candidate_record = {
                    "symbol": symbol,
                    "display_name": inst.get("display_name", symbol),
                    "asset_class": asset_class,
                    "market": inst.get("exchange", "Global"),
                    "signal_type": signal_type,
                    "confidence_score": confidence_score,
                    "threshold": self.confidence_threshold,
                    "meets_threshold": meets_threshold,
                    "volatility_score": inst.get("volatility_score", 0.0),
                    "execution_available": inst.get("execution_available", False),
                    "details": confluence
                }

                if meets_threshold:
                    logger.info(f"🎯 75%+ Signal Candidates Found: {symbol} ({asset_class}) -> {signal_type} ({confidence_score}%)")
                    candidates.append(candidate_record)

        except Exception as exc:
            logger.error(f"Error during staged multi-asset scan: {exc}")

        return candidates
