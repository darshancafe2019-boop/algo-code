import json
import pytest
import sqlite3
from datetime import datetime, timezone

from dashboard import app
from src import db, config
from src.trade_ledger import trade_ledger, init_trade_ledger_schema, compute_trade_quality_score
from src.pnl_engine import compute_authoritative_pnl, compute_unrealized_pnl, normalize_currency_amount
from src.indicator_cache import indicator_cache
from src.latency_profiler import TradeLatencyContext, compute_latency_summary, diagnose_slow_trade
from src.performance_analytics import analytics_engine


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


class TestAuthoritativeTradeLedger:
    """Test Authoritative Trade Ledger multi-field schema, partial fills, and position lifecycle."""

    def test_01_complete_trade_schema_recording(self):
        """Verify recording a complete trade with all 40+ fields."""
        init_trade_ledger_schema()
        
        test_data = {
            "bot_id": "bot-test-ledger",
            "bot_name": "Alpha BTC Scalper Pro",
            "strategy_id": "EMA_MACD_VP",
            "strategy_version": "v1.4.2",
            "symbol": "BTC/USDT",
            "asset_class": "Crypto",
            "exchange": "Binance",
            "market": "Spot",
            "timeframe": "15m",
            "direction": "LONG",
            "entry_price": 65000.0,
            "position_size": 0.5,
            "stop_loss": 63700.0,
            "take_profit": 68250.0,
            "signal_confidence": 85.0,
            "market_regime": "TRENDING",
            "execution_mode": "PAPER",
            "broker_order_id": "TEST_BRK_001",
            "execution_id": "EXEC_001",
            "order_id": "ORD_001",
            "fees": 2.50,
            "slippage": 1.20,
            "indicator_snapshot": {"rsi": 62.5, "ema_20": 64800.0, "macd_hist": 120.0},
            "signal_snapshot": {"direction": "LONG", "confidence": 85.0, "reason": "Confluence 85% meets 75% threshold"},
            "entry_reason": "EMA_CROSS",
            "idempotency_key": f"IDEM_SCHEMA_REC_{datetime.now(timezone.utc).timestamp()}"
        }

        ok, trade_id, msg = trade_ledger.record_new_trade(test_data)
        assert ok is True, f"Failed to record trade: {msg}"
        assert trade_id > 0

        # Retrieve and verify all fields
        rows = db.safe_query("SELECT * FROM trades_log WHERE id = ?", (trade_id,))
        assert len(rows) == 1
        t = rows[0]
        assert t["symbol"] == "BTC/USDT"
        assert t["direction"] == "LONG"
        assert float(t["entry_price"]) == 65000.0
        assert float(t["position_size"]) == 0.5
        assert float(t["planned_risk"]) == 650.0  # (65000 - 63700) * 0.5
        assert float(t["risk_reward"]) == 2.5     # (68250 - 65000) / (65000 - 63700)
        assert t["status"] == "OPEN"
        assert t["strategy_version"] == "v1.4.2"
        assert t["entry_reason"] == "EMA_CROSS"
        assert float(t["trade_quality_score"]) > 0

        # Verify initial fill in trade_fills
        fills = db.safe_query("SELECT * FROM trade_fills WHERE trade_id = ?", (trade_id,))
        assert len(fills) >= 1
        assert float(fills[0]["fill_quantity"]) == 0.5

        # Verify position transition in position_transitions
        trans = db.safe_query("SELECT * FROM position_transitions WHERE trade_id = ?", (trade_id,))
        assert len(trans) >= 1
        assert trans[0]["from_state"] == "NO_POSITION"
        assert trans[0]["to_state"] == "OPEN"

    def test_02_partial_fills_vwap_reconstruction(self):
        """Verify recording multiple partial fills and volume-weighted average price."""
        # Create new trade for partial fills
        ok, trade_id, msg = trade_ledger.record_new_trade({
            "bot_id": "bot-test-partial",
            "strategy": "SCALPER",
            "symbol": "ETH/USDT",
            "direction": "LONG",
            "entry_price": 3000.0,
            "position_size": 1.0,
            "execution_mode": "PAPER",
            "idempotency_key": f"IDEM_PARTIAL_{datetime.now(timezone.utc).timestamp()}"
        })
        assert ok is True

        # Fill 1: 1.0 @ 3000 (initial)
        # Fill 2: 2.0 @ 3030
        ok2, res2 = trade_ledger.record_partial_fill(
            trade_id=trade_id,
            order_id="ORD_ETH_002",
            fill_price=3030.0,
            fill_qty=2.0,
            fee=3.0,
            fill_side="BUY"
        )
        assert ok2 is True
        assert res2["total_quantity"] == 3.0
        # VWAP = (1.0*3000 + 2.0*3030) / 3.0 = 9060 / 3 = 3020.0
        assert abs(res2["weighted_average_price"] - 3020.0) < 0.01

        # Check DB reflects updated VWAP and size
        updated = db.safe_query("SELECT entry_price, position_size FROM trades_log WHERE id = ?", (trade_id,))[0]
        assert abs(float(updated["entry_price"]) - 3020.0) < 0.01
        assert float(updated["position_size"]) == 3.0

    def test_03_idempotency_key_duplicate_prevention(self):
        """Verify that duplicate submissions with identical idempotency key are safely rejected."""
        test_key = f"IDEM_DUPL_TEST_{datetime.now(timezone.utc).timestamp()}"
        trade_payload = {
            "bot_id": "bot-test-idem",
            "strategy": "EMA_MACD_VP",
            "symbol": "SOL/USDT",
            "direction": "LONG",
            "entry_price": 145.0,
            "position_size": 10.0,
            "idempotency_key": test_key,
            "execution_mode": "PAPER"
        }

        # First Submission
        ok1, id1, msg1 = trade_ledger.record_new_trade(trade_payload)
        assert ok1 is True
        assert id1 > 0

        # Duplicate Submission
        ok2, id2, msg2 = trade_ledger.record_new_trade(trade_payload)
        assert ok2 is False
        assert id2 == id1
        assert "DUPLICATE_TRADE_IGNORED" in msg2

    def test_04_trade_closure_and_position_lifecycle(self):
        """Verify closing a trade calculates authoritative P&L and transitions position to CLOSED."""
        ok, trade_id, msg = trade_ledger.record_new_trade({
            "bot_id": "bot-test-close",
            "strategy": "EMA_MACD_VP",
            "symbol": "BTC/USDT",
            "direction": "LONG",
            "entry_price": 64000.0,
            "position_size": 0.5,
            "stop_loss": 62000.0,
            "fees": 2.0,
            "idempotency_key": f"IDEM_CLOSE_TEST_{datetime.now(timezone.utc).timestamp()}"
        })
        assert ok is True

        # Close trade at 66000 (Gross = (66000-64000)*0.5 = 1000.0, Total fees = 2.0+1.5=3.5, Net = 996.5)
        ok_c, res_c = trade_ledger.close_trade(
            trade_id=trade_id,
            exit_price=66000.0,
            exit_reason="TAKE_PROFIT",
            fees_exit=1.50,
            slippage=0.50
        )
        assert ok_c is True
        assert res_c["status"] == "CLOSED"
        assert res_c["trade_result"] == "WIN"
        assert res_c["gross_pnl"] == 1000.0
        assert res_c["net_pnl"] == 996.0  # 1000.0 - 3.50 fees - 0.50 slippage
        assert res_c["r_multiple"] == 1.0 # (2000 / 2000)

        # Verify DB position transition
        trans = db.safe_query("SELECT * FROM position_transitions WHERE trade_id = ? AND to_state = 'CLOSED'", (trade_id,))
        assert len(trans) == 1
        assert trans[0]["reason"] == "TAKE_PROFIT"


class TestUniversalPnLEngine:
    """Test authoritative P&L calculations and multi-currency normalization."""

    def test_01_long_trade_pnl_calculation(self):
        """Verify Long trade gross and net PnL."""
        res = compute_authoritative_pnl(
            direction="LONG",
            entry_price=60000.0,
            exit_price=63000.0,
            quantity=0.1,
            fees=1.50,
            slippage=0.50,
            funding=0.0,
            taxes=0.0,
            stop_loss=58500.0
        )
        assert res["gross_pnl"] == 300.0  # (63000 - 60000) * 0.1
        assert res["net_pnl"] == 298.0    # 300.0 - 2.00
        assert res["pnl_percentage"] == 4.97 # 298 / 6000 * 100
        assert res["r_multiple"] == 2.0   # 3000 profit / 1500 risk
        assert res["is_win"] is True

    def test_02_short_trade_pnl_calculation(self):
        """Verify Short trade gross and net PnL."""
        res = compute_authoritative_pnl(
            direction="SHORT",
            entry_price=60000.0,
            exit_price=57000.0,
            quantity=0.1,
            fees=2.00,
            slippage=1.00,
            stop_loss=61500.0
        )
        assert res["gross_pnl"] == 300.0  # (60000 - 57000) * 0.1
        assert res["net_pnl"] == 297.0    # 300.0 - 3.00
        assert res["r_multiple"] == 2.0
        assert res["is_win"] is True

    def test_03_currency_normalization(self):
        """Verify multi-currency normalization without direct cross-currency summation."""
        inr_conv = normalize_currency_amount(10000.0, from_currency="INR", to_currency="USD")
        assert inr_conv["is_converted"] is True
        assert inr_conv["normalized_currency"] == "USD"
        assert inr_conv["normalized_amount"] == 115.0  # 10,000 * 0.0115

        usdt_conv = normalize_currency_amount(500.0, from_currency="USDT", to_currency="USD")
        assert usdt_conv["is_converted"] is False
        assert usdt_conv["normalized_amount"] == 500.0


class TestIndicatorCacheAndLatencies:
    """Test Indicator LRU/TTL caching and execution latency profiling."""

    def test_01_indicator_cache_hit_and_miss(self):
        """Verify indicator cache stores and retrieves values without recalculation."""
        indicator_cache.clear()
        
        # Miss
        val = indicator_cache.get("BTC/USDT", "15m", "2026-08-15T10:00:00Z", "RSI", {"length": 14})
        assert val is None

        # Set
        indicator_cache.set("BTC/USDT", "15m", "2026-08-15T10:00:00Z", "RSI", 64.8, {"length": 14})

        # Hit
        val_hit = indicator_cache.get("BTC/USDT", "15m", "2026-08-15T10:00:00Z", "RSI", {"length": 14})
        assert val_hit == 64.8

        stats = indicator_cache.get_stats()
        assert stats["cache_hits"] >= 1
        assert stats["cache_misses"] >= 1
        assert stats["hit_rate_pct"] > 0.0

    def test_02_latency_context_and_summary(self):
        """Verify latency profiling measures stages and calculates system summaries."""
        ctx = TradeLatencyContext(trade_id=999, order_id="ORD-LAT-TEST")
        ctx.mark_stage("risk_check")
        ctx.mark_stage("order_creation")
        ctx.mark_stage("broker_submit")
        ctx.mark_stage("broker_ack")
        ctx.mark_stage("fill")
        ctx.mark_stage("db_write")
        latencies = ctx.finalize()

        assert "total_execution_ms" in latencies
        assert latencies["total_execution_ms"] >= 0.0

        summary = compute_latency_summary()
        assert "total_execution_latency" in summary
        assert "p95_ms" in summary["total_execution_latency"]
        assert summary["status"] in ["HEALTHY", "WARNING"]


class TestAnalyticsIntegrityAndRestApiSuite:
    """Test authoritative performance analytics, mathematical integrity checks, and REST API endpoints."""

    def test_01_analytics_integrity_audit(self):
        """Verify automated mathematical consistency checker."""
        trades = analytics_engine.get_raw_trades()
        report = analytics_engine.verify_analytics_integrity(trades)

        assert report["status"] in ["HEALTHY", "WARNING"]
        assert len(report["checks"]) == 4
        # All checks must pass
        for chk in report["checks"]:
            assert chk["passed"] is True

    def test_02_api_analytics_v2_endpoint(self, client):
        """Verify /api/analytics/v2 returns comprehensive analytics."""
        res = client.get("/api/analytics/v2?bot_id=ALL&strategy=ALL&symbol=ALL&date_range=ALL")
        assert res.status_code == 200
        data = res.get_json()
        assert data["success"] is True
        assert "trade_summary" in data
        assert "charts" in data
        assert "breakdowns" in data
        assert "equity_curve" in data

    def test_03_api_analytics_kpis_endpoint(self, client):
        """Verify /api/analytics/kpis returns top 10 KPI cards with drill-down IDs."""
        res = client.get("/api/analytics/kpis")
        assert res.status_code == 200
        data = res.get_json()
        assert data["success"] is True
        assert "cards" in data
        assert len(data["cards"]) == 10
        card_ids = [c["id"] for c in data["cards"]]
        assert "TOTAL_TRADES" in card_ids
        assert "WIN_RATE" in card_ids
        assert "NET_PNL" in card_ids
        assert "PROFIT_FACTOR" in card_ids
        assert "MAX_DRAWDOWN" in card_ids

    def test_04_api_analytics_drilldown_endpoint(self, client):
        """Verify /api/analytics/drilldown returns underlying trade list."""
        res = client.get("/api/analytics/drilldown?filter_type=ALL_COMPLETED&limit=50")
        assert res.status_code == 200
        data = res.get_json()
        assert data["success"] is True
        assert "trades" in data
        assert isinstance(data["trades"], list)

    def test_05_api_trades_reconcile_endpoint(self, client):
        """Verify /api/trades/reconcile runs position reconciliation."""
        res = client.post("/api/trades/reconcile")
        assert res.status_code == 200
        data = res.get_json()
        assert data["success"] is True
        assert "reconciled" in data
        assert "open_positions_count" in data

    def test_06_api_export_complete_records(self, client):
        """Verify CSV and JSON exports contain full 40+ field records."""
        res_csv = client.get("/api/export/trades/complete.csv")
        assert res_csv.status_code == 200
        assert res_csv.mimetype == "text/csv"
        csv_text = res_csv.get_data(as_text=True)
        assert "trade_id" in csv_text
        assert "strategy_version" in csv_text
        assert "trade_quality_score" in csv_text

        res_json = client.get("/api/export/trades/complete.json")
        assert res_json.status_code == 200
        json_data = res_json.get_json()
        assert "trades" in json_data
        assert "total_records" in json_data
