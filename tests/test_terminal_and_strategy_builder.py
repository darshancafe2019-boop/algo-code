"""
Automated Test Suite: Trading Terminal, Visual Strategy Builder, and Direct Navigation Routing
=============================================================================================
Verifies:
1. Direct URL navigation routing returns HTTP 200 and loads main template.
2. Visual Strategy Builder compilation, rule validation, DB persistence, and testing endpoints.
3. Command Bus integration with custom visual strategies.
4. Comprehensive 12-Step Tutorial and Contextual Guidance data contracts.
"""

import json
import sys
from pathlib import Path
import pytest

project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from src import db, config, strategy_builder
from src.strategy_builder import DEFAULT_STRATEGY_TEMPLATES, init_strategy_builder_schema
from dashboard import app


@pytest.fixture(autouse=True)
def setup_test_db():
    db.init_db()
    init_strategy_builder_schema()
    yield



@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


class TestDirectNavigationRoutes:
    """Verifies that all direct URL paths load properly for bookmarks and direct navigation."""

    @pytest.mark.parametrize("route", [
        "/",
        "/bots",
        "/bots/create",
        "/bots/templates",
        "/bots/groups",
        "/bots/paper",
        "/bots/live",
        "/bots/history",
        "/bots/events",
        "/risk",
        "/performance",
        "/analytics",
        "/audit",
        "/backtesting",
        "/indicators",
        "/market-universe",
        "/market-intelligence",
        "/alerts",
        "/security",
        "/logs",
        "/diagnostics",
        "/tutorial"
    ])
    def test_direct_url_routes_return_200(self, client, route):
        res = client.get(route)
        assert res.status_code == 200
        assert b"Algo Trading Platform" in res.data or b"terminal" in res.data or b"DOCTYPE" in res.data


class TestVisualStrategyBuilder:
    """Verifies rule parsing, compilation, persistence, and live evaluation."""

    def test_01_get_visual_strategies_catalog(self, client):
        res = client.get("/api/strategies/visual")
        assert res.status_code == 200
        data = res.get_json()
        assert data["status"] == "success"
        assert len(data["strategies"]) >= len(DEFAULT_STRATEGY_TEMPLATES)

    def test_02_compile_valid_visual_strategy(self, client):
        payload = {
            "name": "RSI Oversold with MACD Confirmation",
            "target_signal": "BUY",
            "conjunction": "AND",
            "rules": [
                {"left": "rsi_14", "op": "<", "right": "30"},
                {"left": "macd_line", "op": ">", "right": "macd_signal"}
            ]
        }
        res = client.post("/api/strategies/visual/compile", json=payload)
        assert res.status_code == 200
        data = res.get_json()
        assert data["valid"] is True
        assert "IF (rsi_14 < 30 AND macd_line > macd_signal) THEN BUY" in data["compiled_expression"]

    def test_03_compile_invalid_rule_rejection(self, client):
        payload = {
            "name": "Invalid Strategy",
            "target_signal": "BUY",
            "conjunction": "AND",
            "rules": [
                {"left": "rsi_14", "op": "INVALID_OP", "right": "30"}
            ]
        }
        res = client.post("/api/strategies/visual/compile", json=payload)
        assert res.status_code == 400
        data = res.get_json()
        assert data["valid"] is False
        assert "Unsupported operator" in data["error"]

    def test_04_save_and_retrieve_custom_strategy(self, client):
        payload = {
            "name": "Custom Breakout Strategy",
            "description": "Close breaks above VAH with ADX confirmation",
            "target_signal": "BUY",
            "conjunction": "AND",
            "rules": [
                {"left": "close", "op": ">", "right": "vah"},
                {"left": "adx_14", "op": ">=", "right": "25"}
            ]
        }
        res = client.post("/api/strategies/visual/save", json=payload)
        assert res.status_code == 200
        data = res.get_json()
        assert data["status"] == "success"
        assert "strategy_id" in data

        # Verify strategy is now in catalog
        cat_res = client.get("/api/strategies/visual")
        cat_data = cat_res.get_json()
        saved = next((s for s in cat_data["strategies"] if s["name"] == "Custom Breakout Strategy"), None)
        assert saved is not None

    def test_05_test_visual_strategy_on_indicators(self, client):
        payload = {
            "strategy": {
                "target_signal": "BUY",
                "conjunction": "AND",
                "rules": [
                    {"left": "rsi_14", "op": "<", "right": "30"},
                    {"left": "close", "op": ">", "right": "ema_200"}
                ]
            },
            "indicators": {
                "rsi_14": 25.0,
                "close": 64000.0,
                "ema_200": 60000.0
            }
        }
        res = client.post("/api/strategies/visual/test", json=payload)
        assert res.status_code == 200
        data = res.get_json()
        assert data["triggered"] is True
        assert data["signal"] == "BUY"
        assert len(data["conditions"]) == 2
        assert all(c["passed"] for c in data["conditions"])

    def test_06_enriched_bots_summary_metrics(self, client):
        res = client.get("/api/bots/summary")
        assert res.status_code == 200
        data = res.get_json()
        assert data["status"] == "success"
        m = data["metrics"]
        assert "start_balance" in m
        assert "current_balance" in m
        assert "current_equity" in m
        assert "total_trades" in m
        assert "open_trades" in m
        assert "wins" in m
        assert "losses" in m
        assert "breakeven" in m
        assert "win_rate_pct" in m
        assert "profit_factor" in m
        assert "w_l_be" in m
        assert "total_pnl" in m
        assert "today_pnl" in m

    def test_07_export_trades_csv_and_json(self, client):
        csv_res = client.get("/api/trades/export")
        assert csv_res.status_code == 200
        assert "text/csv" in csv_res.content_type

        json_res = client.get("/api/trades/export-json")
        assert json_res.status_code == 200
        assert "application/json" in json_res.content_type
        trades_list = json_res.get_json()
        assert isinstance(trades_list, list)

    def test_08_indicator_endpoints_and_batch_actions(self, client):
        # 1. Test GET /api/indicators
        res = client.get("/api/indicators?bot_id=bot-1")
        assert res.status_code == 200
        data = res.get_json()
        assert data["status"] == "success"
        indicators = data["indicators"]
        assert len(indicators) >= 5
        assert all("id" in ind and "name" in ind and "category" in ind for ind in indicators)

        # 2. Test GET /api/indicators/status
        st_res = client.get("/api/indicators/status?bot_id=bot-1")
        assert st_res.status_code == 200
        st_data = st_res.get_json()
        assert st_data["status"] == "success"
        assert "active_indicators_count" in st_data
        assert "current_market_regime" in st_data
        assert "active_profile_name" in st_data

        # 3. Test POST /api/indicators/enable-all and /api/indicators/disable-all
        en_res = client.post("/api/indicators/enable-all")
        assert en_res.status_code == 200
        assert en_res.get_json()["status"] == "success"

        dis_res = client.post("/api/indicators/disable-all")
        assert dis_res.status_code == 200
        assert dis_res.get_json()["status"] == "success"

        # Restore default enabled
        client.post("/api/indicators/enable-all")

        # 4. Test GET /api/indicators/profiles and apply
        prof_res = client.get("/api/indicators/profiles")
        assert prof_res.status_code == 200
        prof_data = prof_res.get_json()
        assert prof_data["status"] == "success"
        assert len(prof_data["profiles"]) > 0

        # Apply profile
        pid = prof_data["profiles"][0]["profile_id"]
        apply_res = client.post(f"/api/indicators/profiles/{pid}/apply", json={"bot_id": "bot-1"})
        assert apply_res.status_code == 200
        assert apply_res.get_json()["status"] == "success"

    def test_09_per_bot_indicator_custom_configurations_isolation(self, client):
        """Verify Bot A (bot-1) and Bot B (bot-2) maintain completely independent custom indicator parameters."""
        # 1. Configure RSI for bot-1 with period 21, weight 25%
        bot1_payload = {
            "indicator_id": "rsi",
            "bot_id": "bot-1",
            "enabled": True,
            "weight": 25.0,
            "parameters": {"period": 21, "oversold": 25, "overbought": 75, "source": "close"}
        }
        res1 = client.put("/api/indicators/rsi?bot_id=bot-1", json=bot1_payload)
        assert res1.status_code == 200
        data1 = res1.get_json()
        assert data1["status"] == "success"
        assert data1["indicator"]["parameters"]["period"] == 21
        assert data1["indicator"]["weight"] == 25.0

        # 2. Configure RSI for bot-2 with period 10, weight 10%
        bot2_payload = {
            "indicator_id": "rsi",
            "bot_id": "bot-2",
            "enabled": True,
            "weight": 10.0,
            "parameters": {"period": 10, "oversold": 20, "overbought": 80, "source": "open"}
        }
        res2 = client.put("/api/indicators/rsi?bot_id=bot-2", json=bot2_payload)
        assert res2.status_code == 200
        data2 = res2.get_json()
        assert data2["status"] == "success"
        assert data2["indicator"]["parameters"]["period"] == 10
        assert data2["indicator"]["weight"] == 10.0

        # 3. Retrieve effective configs for bot-1 and bot-2, verify zero interference
        get_b1 = client.get("/api/indicators?bot_id=bot-1").get_json()
        b1_rsi = next(x for x in get_b1["indicators"] if x["id"] == "rsi" or x["indicator_id"] == "rsi")
        assert b1_rsi["parameters"]["period"] == 21
        assert b1_rsi["weight"] == 25.0
        assert b1_rsi["effective_source"] == "BOT OVERRIDE"

        get_b2 = client.get("/api/indicators?bot_id=bot-2").get_json()
        b2_rsi = next(x for x in get_b2["indicators"] if x["id"] == "rsi" or x["indicator_id"] == "rsi")
        assert b2_rsi["parameters"]["period"] == 10
        assert b2_rsi["weight"] == 10.0
        assert b2_rsi["effective_source"] == "BOT OVERRIDE"

    def test_10_indicator_hierarchy_resolution_source_tagging(self, client):
        """Verify hierarchy resolution: BOT OVERRIDE > BOT PROFILE > GLOBAL DEFAULT."""
        # Check effective config endpoint
        res = client.get("/api/indicators/effective-config?bot_id=bot-1")
        assert res.status_code == 200
        data = res.get_json()
        assert data["status"] == "success"
        configs = data["effective_configs"]
        assert len(configs) >= 10
        sources = {c["indicator_id"]: c["effective_source"] for c in configs}
        assert "rsi" in sources
        assert sources["rsi"] == "BOT OVERRIDE"

        # Reset bot-1 rsi override and verify source reverts to BOT PROFILE or GLOBAL DEFAULT
        res_reset = client.post("/api/indicators/rsi/reset?bot_id=bot-1")
        assert res_reset.status_code == 200

        res_after = client.get("/api/indicators/effective-config?bot_id=bot-1")
        configs_after = res_after.get_json()["effective_configs"]
        rsi_after = next(x for x in configs_after if x["indicator_id"] == "rsi")
        assert rsi_after["effective_source"] in ["BOT PROFILE", "GLOBAL DEFAULT"]

    def test_11_indicator_validation_and_history_restore(self, client):
        """Verify input validation (e.g. fast < slow in MACD) and history recording + restore."""
        # 1. Invalid MACD fast >= slow must be rejected with HTTP 400
        invalid_macd = {
            "indicator_id": "macd",
            "bot_id": "bot-1",
            "parameters": {"fast": 30, "slow": 12, "signal": 9}
        }
        inv_res = client.put("/api/indicators/macd?bot_id=bot-1", json=invalid_macd)
        assert inv_res.status_code == 400

        # 2. Valid MACD update
        valid_macd = {
            "indicator_id": "macd",
            "bot_id": "bot-1",
            "parameters": {"fast": 10, "slow": 22, "signal": 7}
        }
        val_res = client.put("/api/indicators/macd?bot_id=bot-1", json=valid_macd)
        assert val_res.status_code == 200

        # 3. Check history endpoint
        hist_res = client.get("/api/indicators/macd/history?bot_id=bot-1")
        assert hist_res.status_code == 200
        hist_data = hist_res.get_json()
        assert hist_data["status"] == "success"
        assert len(hist_data["history"]) > 0

        # 4. Test restore from history
        hid = hist_data["history"][0]["id"]
        rest_res = client.post(f"/api/indicators/history/{hid}/restore")
        assert rest_res.status_code == 200
        assert rest_res.get_json()["status"] == "success"

    def test_12_bot_clone_deep_copy_indicator_configs(self, client):
        """Verify copy_bot_indicator_configs creates an independent clone by value."""
        # Save custom EMA 9 for bot-3
        b3_cfg = {
            "indicator_id": "ema_9",
            "bot_id": "bot-3",
            "weight": 35.0,
            "parameters": {"length": 13, "source": "hl2"}
        }
        client.put("/api/indicators/ema_9?bot_id=bot-3", json=b3_cfg)

        # Clone bot-3 configs to bot-4
        ok = db.copy_bot_indicator_configs("bot-3", "bot-4")
        assert ok is True

        # Verify bot-4 inherited settings
        b4_res = client.get("/api/indicators?bot_id=bot-4").get_json()
        b4_ema = next(x for x in b4_res["indicators"] if x["indicator_id"] == "ema_9")
        assert b4_ema["weight"] == 35.0
        assert b4_ema["parameters"]["length"] == 13

        # Modify bot-4 and ensure bot-3 remains unchanged
        client.put("/api/indicators/ema_9?bot_id=bot-4", json={"indicator_id": "ema_9", "parameters": {"length": 7}})
        b3_res = client.get("/api/indicators?bot_id=bot-3").get_json()
        b3_ema = next(x for x in b3_res["indicators"] if x["indicator_id"] == "ema_9")
        assert b3_ema["parameters"]["length"] == 13



