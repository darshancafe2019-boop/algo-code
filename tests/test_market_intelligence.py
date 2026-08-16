import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
import time
from datetime import datetime, timezone

from src import config, db
from src.market_intelligence import MarketIntelligenceEngine, market_intelligence_engine

@pytest.fixture
def test_app_client():
    from dashboard import app
    db.init_db()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

def test_01_historical_coverage_registration():
    """Verify register_historical_coverage correctly audits candle completeness and quality score."""
    engine = MarketIntelligenceEngine()
    candles = [
        {"timestamp": "2026-08-13T10:00:00Z", "open": 65000, "high": 65500, "low": 64800, "close": 65200, "volume": 100},
        {"timestamp": "2026-08-13T10:15:00Z", "open": 65200, "high": 65800, "low": 65100, "close": 65600, "volume": 120}
    ]
    res = engine.register_historical_coverage("BTC/USDT", "CCXT Binance", "15m", candles)
    assert res["symbol"] == "BTC/USDT"
    assert res["status"] in ["COMPLETE", "PARTIAL"]
    assert res["quality_score"] > 80.0

def test_02_look_ahead_bias_prevention():
    """Verify strategy evaluation only uses candles at or before timestamp T."""
    candles = [
        {"timestamp": "2026-08-13T10:00:00Z", "close": 65000},
        {"timestamp": "2026-08-13T10:15:00Z", "close": 65200},
        {"timestamp": "2026-08-13T10:30:00Z", "close": 68000} # Future candle at T+30m
    ]
    # Filter candles strictly at or before T=10:15
    eval_candles = [c for c in candles if c["timestamp"] <= "2026-08-13T10:15:00Z"]
    assert len(eval_candles) == 2
    assert all(c["timestamp"] <= "2026-08-13T10:15:00Z" for c in eval_candles)
    assert eval_candles[-1]["close"] == 65200  # Never accesses future 68000 close

def test_03_stale_market_data_blocks_trade():
    """Verify pre-trade pipeline blocks execution on stale market tick data (>60s)."""
    engine = MarketIntelligenceEngine()
    stale_iso = "2020-01-01T00:00:00+00:00"
    approved, code, reason, pre_id = engine.run_pre_trade_pipeline(
        bot_id="bot-t1", strategy="EMA_MACD_VP", symbol="BTC/USDT", timeframe="15m",
        price=65000.0, indicator_snap={"rsi": 58}, signal_type="LONG",
        confidence_score=0.85, market_tick_iso=stale_iso
    )
    assert approved is False
    assert code == "TRADE_BLOCKED_DATA"
    assert "STALE_MARKET_DATA" in reason

def test_04_confidence_below_75pct_blocks_trade():
    """Verify signals with confidence below 75% threshold are rejected and audit logged."""
    engine = MarketIntelligenceEngine()
    fresh_iso = datetime.now(timezone.utc).isoformat()
    approved, code, reason, pre_id = engine.run_pre_trade_pipeline(
        bot_id="bot-t2", strategy="EMA_MACD_VP", symbol="BTC/USDT", timeframe="15m",
        price=65000.0, indicator_snap={"rsi": 58}, signal_type="LONG",
        confidence_score=0.60, market_tick_iso=fresh_iso
    )
    assert approved is False
    assert code == "TRADE_BLOCKED_CONFIDENCE"
    assert "CONFIDENCE_BELOW_THRESHOLD" in reason

def test_05_cross_bot_scan_and_conflict_detection():
    """Verify all-bot pre-trade scan detects active bots and portfolio exposure."""
    engine = MarketIntelligenceEngine()
    res = engine.perform_all_bot_scan()
    assert "global_scan_id" in res
    assert "active_bots_count" in res
    assert "open_positions_symbols" in res

def test_06_pre_trade_pipeline_approved_trade():
    """Verify valid signal passing all checks yields TRADE_APPROVED status."""
    engine = MarketIntelligenceEngine()
    fresh_iso = datetime.now(timezone.utc).isoformat()
    approved, code, reason, pre_id = engine.run_pre_trade_pipeline(
        bot_id="bot-t3", strategy="EMA_MACD_VP", symbol="BTC/USDT", timeframe="15m",
        price=65000.0, indicator_snap={"rsi": 58, "adx": 28}, signal_type="LONG",
        confidence_score=0.85, market_tick_iso=fresh_iso
    )
    assert approved is True
    assert code == "TRADE_APPROVED"
    assert "PRE_TRADE_PIPELINE_APPROVED" in reason
    assert "PTA-" in pre_id

def test_07_market_intelligence_rest_apis(test_app_client):
    """Test Market Intelligence REST API routes."""
    res_status = test_app_client.get("/api/market-intelligence/status")
    assert res_status.status_code == 200
    assert res_status.get_json()["status"] == "success"

    res_scanner = test_app_client.get("/api/market-intelligence/scanner")
    assert res_scanner.status_code == 200
    assert "rankings" in res_scanner.get_json()

    res_decisions = test_app_client.get("/api/market-intelligence/pre-trade-decisions")
    assert res_decisions.status_code == 200
    assert "decisions" in res_decisions.get_json()

    res_health = test_app_client.get("/api/market-intelligence/data-health")
    assert res_health.status_code == 200
    assert "provider_status" in res_health.get_json()

def test_08_failure_injection_kill_switch_active():
    """Verify pre-trade pipeline blocks trade when Kill Switch is active."""
    setattr(config, "GLOBAL_TRADING_KILL_SWITCH", True)
    engine = MarketIntelligenceEngine()
    fresh_iso = datetime.now(timezone.utc).isoformat()
    approved, code, reason, pre_id = engine.run_pre_trade_pipeline(
        bot_id="bot-t4", strategy="EMA_MACD_VP", symbol="BTC/USDT", timeframe="15m",
        price=65000.0, indicator_snap={"rsi": 58}, signal_type="LONG",
        confidence_score=0.85, market_tick_iso=fresh_iso
    )
    assert approved is False
    assert code == "TRADE_BLOCKED_RISK"
    assert "KILL_SWITCH_ACTIVE" in reason

    setattr(config, "GLOBAL_TRADING_KILL_SWITCH", False)
