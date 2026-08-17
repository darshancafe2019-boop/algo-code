import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Tuple, Optional
from src import db
from src.market_providers import get_provider_registry, BaseMarketProvider

logger = logging.getLogger("MarketUniverse")


def calculate_volatility_score(change_pct: float, high_price: float, low_price: float, close_price: float) -> Tuple[float, str]:
    """Calculates an explainable volatility score (0 - 100) and category."""
    abs_change = abs(change_pct)
    range_pct = ((high_price - low_price) / close_price * 100.0) if close_price > 0 else abs_change

    score = min(100.0, (abs_change * 4.0) + (range_pct * 3.0) + 20.0)

    if score >= 75.0:
        cat = "Extreme"
    elif score >= 55.0:
        cat = "High"
    elif score >= 35.0:
        cat = "Medium"
    else:
        cat = "Low"

    return round(score, 1), cat


class MarketUniverseManager:
    """Central Engine for Market Universe discovery, multi-provider synchronization, derivatives lifecycle, and intelligence."""

    @staticmethod
    def sync_all_markets() -> Dict[str, Any]:
        """Runs full multi-market synchronization across NSE, BSE, Global Equities, Crypto, Forex, and Commodities."""
        start_t = time.time()
        now_utc = datetime.now(timezone.utc).isoformat()
        logger.info("Starting Market Universe 2.0 full multi-provider synchronization...")

        registry = get_provider_registry()
        providers = registry.get_all_providers()
        all_instruments: List[Dict[str, Any]] = []
        errors: List[str] = []

        per_provider_report: Dict[str, Dict[str, Any]] = {}

        for p in providers:
            p_id = p.get_provider_id()
            p_name = p.get_provider_name()
            try:
                logger.info(f"Syncing market data from provider: {p_name} ({p_id})...")
                p_insts = p.get_instruments()
                all_instruments.extend(p_insts)
                per_provider_report[p_id] = {
                    "provider_name": p_name,
                    "count": len(p_insts),
                    "status": "SUCCESS"
                }
            except Exception as e:
                err_msg = f"Error syncing provider {p_name}: {e}"
                logger.error(err_msg)
                errors.append(err_msg)
                per_provider_report[p_id] = {
                    "provider_name": p_name,
                    "count": 0,
                    "status": "ERROR",
                    "error": str(e)
                }

        # Deduplicate instruments by instrument_id
        deduped = {}
        for inst in all_instruments:
            iid = inst.get("instrument_id")
            if iid and iid not in deduped:
                deduped[iid] = inst

        unique_instruments = list(deduped.values())

        # Step 2: Handle Expired Derivative Contracts
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        expired_count = 0
        for inst in unique_instruments:
            exp = inst.get("expiry")
            if exp and exp != "PERPETUAL" and exp < today_str:
                inst["contract_status"] = "EXPIRED"
                inst["tradability"] = "DATA_ONLY"
                expired_count += 1

        # Step 3: Bulk Upsert into SQLite
        inserted, updated = db.bulk_upsert_instruments(unique_instruments)
        duration_s = round(time.time() - start_t, 2)
        summary = db.get_universe_summary_stats()

        # Step 4: Log Sync Run History
        sync_id = db.log_sync_run(
            job_name="SYNC_ALL_MARKETS",
            provider_id="MULTI_PROVIDER",
            started_at=now_utc,
            finished_at=datetime.now(timezone.utc).isoformat(),
            status="SUCCESS" if not errors else "PARTIAL_SUCCESS",
            records_seen=len(unique_instruments),
            records_added=inserted,
            records_updated=updated,
            records_expired=expired_count,
            errors=errors
        )

        logger.info(
            f"Market Universe 2.0 Sync Completed in {duration_s}s: "
            f"Seen={len(unique_instruments)}, Added={inserted}, Updated={updated}, Expired={expired_count}. "
            f"Total Universe={summary.get('total_instruments', 0)}"
        )

        return {
            "status": "SUCCESS" if not errors else "PARTIAL_SUCCESS",
            "sync_id": sync_id,
            "duration_seconds": duration_s,
            "discovered": len(unique_instruments),
            "inserted": inserted,
            "updated": updated,
            "expired": expired_count,
            "total_instruments": summary.get("total_instruments", 0),
            "stats": summary,
            "per_provider": per_provider_report,
            "providers": registry.get_provider_statuses(),
            "provider_health": registry.get_provider_statuses(),
            "errors": errors
        }

    @staticmethod
    def sync_provider(provider_id: str) -> Dict[str, Any]:
        """Runs on-demand sync for a specific target provider."""
        start_t = time.time()
        now_utc = datetime.now(timezone.utc).isoformat()
        registry = get_provider_registry()
        provider = registry.get_provider(provider_id)

        if not provider:
            return {"status": "ERROR", "error": f"Provider '{provider_id}' not found in registry."}

        try:
            insts = provider.get_instruments()
            inserted, updated = db.bulk_upsert_instruments(insts)
            duration_s = round(time.time() - start_t, 2)

            db.log_sync_run(
                job_name=f"SYNC_{provider_id.upper()}",
                provider_id=provider_id,
                started_at=now_utc,
                finished_at=datetime.now(timezone.utc).isoformat(),
                status="SUCCESS",
                records_seen=len(insts),
                records_added=inserted,
                records_updated=updated,
                records_expired=0
            )

            return {
                "status": "SUCCESS",
                "provider_id": provider_id,
                "provider_name": provider.get_provider_name(),
                "duration_seconds": duration_s,
                "discovered": len(insts),
                "inserted": inserted,
                "updated": updated
            }
        except Exception as exc:
            logger.error(f"Error syncing single provider {provider_id}: {exc}")
            return {"status": "ERROR", "error": str(exc)}

    @staticmethod
    def get_option_chain(underlying: str, expiry: Optional[str] = None) -> Dict[str, Any]:
        """Fetches authoritative option chain for an underlying."""
        chain_data = db.get_option_chain_from_db(underlying, expiry)
        if not chain_data.get("strikes"):
            # Fallback: Trigger sync and query again
            MarketUniverseManager.sync_all_markets()
            chain_data = db.get_option_chain_from_db(underlying, expiry)
        return chain_data

    @staticmethod
    def get_futures_chain(underlying: str) -> List[Dict[str, Any]]:
        """Fetches Near, Next, Far futures contracts for an underlying."""
        fut_chain = db.get_futures_chain_from_db(underlying)
        if not fut_chain:
            MarketUniverseManager.sync_all_markets()
            fut_chain = db.get_futures_chain_from_db(underlying)
        return fut_chain

    @staticmethod
    def calculate_market_intelligence() -> Dict[str, Any]:
        """Computes and returns explainable real-time market intelligence candidate rankings."""
        all_insts = db.get_instruments_master(limit=1000).get("instruments", [])

        # 1. Top High Volatility
        vol_ranked = sorted(
            [i for i in all_insts if i.get("volatility_category") in ["High", "Extreme"]],
            key=lambda x: x.get("volatility_score", 0.0),
            reverse=True
        )[:20]

        # 2. Top Momentum
        momentum_ranked = sorted(
            all_insts,
            key=lambda x: x.get("momentum_score", 0.0),
            reverse=True
        )[:20]

        # 3. Top Bullish & Bearish
        bullish = sorted(
            [i for i in all_insts if i.get("directional_bias") == "BULLISH"],
            key=lambda x: x.get("change_24h", 0.0),
            reverse=True
        )[:20]

        bearish = sorted(
            [i for i in all_insts if i.get("directional_bias") == "BEARISH"],
            key=lambda x: x.get("change_24h", 0.0)
        )[:20]

        # 4. Swing Candidates (High Range + Medium-to-High Volatility)
        swing_candidates = [i for i in all_insts if i.get("is_swing_candidate") == 1][:20]

        # 5. Scalping Candidates (High volume + Tight spread + High Liquidity)
        scalping_candidates = [i for i in all_insts if i.get("is_scalping_candidate") == 1][:20]

        # 6. Hedging Candidates (Indices, Futures & Put Options)
        hedging_candidates = [i for i in all_insts if i.get("is_hedge_candidate") == 1][:20]

        return {
            "top_volatility": vol_ranked,
            "top_momentum": momentum_ranked,
            "top_bullish": bullish,
            "top_bearish": bearish,
            "top_swing": swing_candidates,
            "top_scalping": scalping_candidates,
            "top_hedging": hedging_candidates,
            "generated_at": datetime.now(timezone.utc).isoformat()
        }

    @staticmethod
    def get_provider_health_dashboard() -> List[Dict[str, Any]]:
        """Returns live provider health status with latencies and error logs."""
        registry = get_provider_registry()
        return registry.get_provider_statuses()
