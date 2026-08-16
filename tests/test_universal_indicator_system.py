"""
Unit and Integration Tests for Universal Indicator Configuration System
========================================================================
Validates parameter schemas, database persistence, preset management, history audit,
calculation variation, signal recalculation, and REST API suite.
"""

import sys
from pathlib import Path
import pytest
import json
import numpy as np
import pandas as pd

project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from src import indicator_schema, db, indicators, strategy
import dashboard


@pytest.fixture
def sample_ohlcv_df():
    """Generates synthetic 200-bar OHLCV DataFrame for testing."""
    np.random.seed(42)
    n = 200
    base_price = 60000.0
    changes = np.random.randn(n) * 150
    closes = base_price + np.cumsum(changes)
    highs = closes + np.random.rand(n) * 100
    lows = closes - np.random.rand(n) * 100
    opens = closes + np.random.randn(n) * 20
    volumes = np.random.rand(n) * 50 + 10

    df = pd.DataFrame({
        'timestamp': pd.date_range("2026-01-01", periods=n, freq="15min"),
        'open': opens,
        'high': highs,
        'low': lows,
        'close': closes,
        'volume': volumes
    })
    return df


@pytest.fixture
def client():
    dashboard.app.config['TESTING'] = True
    with dashboard.app.test_client() as client:
        yield client


class TestUniversalIndicatorSchema:
    """Test schema definitions, validation rules, and catalog completeness."""

    def test_master_schema_catalog_completeness(self):
        schemas = indicator_schema.get_all_indicator_schemas()
        assert len(schemas) >= 20, "Should have at least 20 universal indicator schemas"
        for s in schemas:
            assert "indicator_id" in s
            assert "name" in s
            assert "category" in s
            assert "default_parameters" in s
            assert "parameter_schema" in s
            assert "default_display" in s
            assert "default_signal" in s

    def test_rsi_parameter_validation(self):
        # Valid RSI
        ok, msg = indicator_schema.validate_indicator_parameters("rsi", {"period": 14, "oversold": 30.0, "overbought": 70.0})
        assert ok is True
        assert msg == "OK"

        # Invalid RSI (oversold >= overbought)
        ok, msg = indicator_schema.validate_indicator_parameters("rsi", {"period": 14, "oversold": 75.0, "overbought": 70.0})
        assert ok is False
        assert "oversold must be strictly less than overbought" in msg

    def test_macd_parameter_validation(self):
        # Valid MACD
        ok, msg = indicator_schema.validate_indicator_parameters("macd", {"fast": 12, "slow": 26, "signal": 9})
        assert ok is True

        # Invalid MACD (fast >= slow)
        ok, msg = indicator_schema.validate_indicator_parameters("macd", {"fast": 30, "slow": 20, "signal": 9})
        assert ok is False
        assert "Fast Period must be strictly less than Slow Period" in msg


class TestIndicatorDatabasePersistence:
    """Test SQLite persistence, presets, and history tracking."""

    def test_seed_and_get_all_configs(self):
        db.seed_indicator_configs_if_needed()
        cfgs = db.get_all_indicator_configs()
        assert len(cfgs) >= 20
        rsi_cfg = next((c for c in cfgs if c["indicator_id"] == "rsi"), None)
        assert rsi_cfg is not None
        assert "parameter_schema" in rsi_cfg
        assert "parameters" in rsi_cfg

    def test_save_and_update_indicator_config(self):
        test_payload = {
            "id": "rsi",
            "indicator_id": "rsi",
            "name": "Relative Strength Index (RSI)",
            "category": "Momentum",
            "enabled": True,
            "favorite": True,
            "timeframe": "30m",
            "weight": 25.0,
            "parameters": {"period": 21, "source": "close", "oversold": 25.0, "overbought": 75.0, "midline": 50.0}
        }
        ok, res_id = db.save_indicator_config(test_payload)
        assert ok is True
        assert res_id == "rsi"

        fetched = db.get_indicator_config("rsi")
        assert fetched is not None
        assert fetched["timeframe"] == "30m"
        assert fetched["weight"] == 25.0
        assert fetched["parameters"]["period"] == 21
        assert fetched["parameters"]["oversold"] == 25.0

    def test_preset_crud_and_apply(self):
        preset_name = "Test Scalper Custom Preset"
        preset_config = {
            "enabled_ids": ["ema_9", "rsi", "supertrend"],
            "weights": {"ema_9": 35.0, "rsi": 35.0, "supertrend": 30.0},
            "parameters": {"rsi": {"period": 7, "oversold": 20.0, "overbought": 80.0}}
        }
        ok, preset_id = db.save_indicator_preset(preset_name, preset_config, category="Scalping", description="Test Scalp Setup")
        assert ok is True

        presets = db.get_indicator_presets()
        target = next((p for p in presets if p["preset_id"] == preset_id), None)
        assert target is not None
        assert target["name"] == preset_name

        # Apply preset
        apply_ok, applied_name = db.apply_indicator_preset(preset_id)
        assert apply_ok is True

        rsi_cfg = db.get_indicator_config("rsi")
        assert rsi_cfg["enabled"] is True
        assert rsi_cfg["weight"] == 35.0
        assert rsi_cfg["parameters"]["period"] == 7

        # Delete preset
        del_ok, _ = db.delete_indicator_preset(preset_id)
        assert del_ok is True

    def test_config_history_logging(self):
        history = db.get_indicator_config_history(indicator_id="rsi", limit=10)
        assert isinstance(history, list)
        if len(history) > 0:
            assert "indicator_id" in history[0]
            assert "old_config" in history[0]
            assert "new_config" in history[0]


class TestRealCalculationEffects:
    """Verify that changing indicator parameters alters the numeric output series."""

    def test_rsi_period_change_alters_series(self, sample_ohlcv_df):
        df1 = sample_ohlcv_df.copy()
        df2 = sample_ohlcv_df.copy()

        res1 = indicators.calculate_rsi(df1, length=14, col_name="rsi_14")
        res2 = indicators.calculate_rsi(df2, length=21, col_name="rsi_21")

        # Compare valid slices
        s1 = res1["rsi_14"].dropna().iloc[-50:].to_numpy()
        s2 = res2["rsi_21"].dropna().iloc[-50:].to_numpy()
        assert not np.allclose(s1, s2), "RSI 14 and RSI 21 must produce different numeric curves"

    def test_macd_parameters_alter_series(self, sample_ohlcv_df):
        df1 = sample_ohlcv_df.copy()
        df2 = sample_ohlcv_df.copy()

        res1 = indicators.calculate_macd(df1, 12, 26, 9)
        macd1 = res1["macd_line"].dropna().to_numpy()

        res2 = indicators.calculate_macd(df2, 20, 35, 7)
        macd2 = res2["macd_line"].dropna().to_numpy()

        assert not np.allclose(macd1[-50:], macd2[-50:]), "MACD with different fast/slow parameters must produce different curves"

    def test_supertrend_multiplier_alters_bands(self, sample_ohlcv_df):
        df1 = sample_ohlcv_df.copy()
        df2 = sample_ohlcv_df.copy()

        res1 = indicators.calculate_supertrend(df1, period=10, multiplier=3.0)
        res2 = indicators.calculate_supertrend(df2, period=10, multiplier=1.5)

        st1 = res1["supertrend"].iloc[-50:].to_numpy()
        st2 = res2["supertrend"].iloc[-50:].to_numpy()

        assert not np.allclose(st1, st2), "Supertrend 3.0 vs 1.5 multiplier must produce different band values"


class TestIndicatorRestApiSuite:
    """Test all REST API endpoints for schema, catalog, apply, presets, history, export, and import."""

    def test_api_indicators_schema(self, client):
        resp = client.get("/api/indicators/schema")
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert data["status"] == "success"
        assert len(data["schemas"]) >= 20

    def test_api_indicators_list(self, client):
        resp = client.get("/api/indicators")
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert data["status"] == "success"
        assert len(data["indicators"]) >= 20

    def test_api_indicator_apply(self, client):
        payload = {
            "id": "macd",
            "indicator_id": "macd",
            "name": "Moving Average Convergence Divergence (MACD)",
            "category": "Momentum",
            "enabled": True,
            "timeframe": "15m",
            "weight": 20.0,
            "parameters": {"fast": 10, "slow": 22, "signal": 7, "source": "close"}
        }
        resp = client.post("/api/indicators/macd/apply", json=payload)
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert data["status"] == "success"
        assert "indicator" in data
        assert data["indicator"]["parameters"]["fast"] == 10

    def test_api_indicator_presets_and_history(self, client):
        # GET Presets
        resp = client.get("/api/indicator-presets")
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert len(data["presets"]) > 0

        # GET History
        resp = client.get("/api/indicator-config-history?indicator_id=macd")
        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert data["status"] == "success"

    def test_api_export_import(self, client):
        # Export
        exp_resp = client.get("/api/indicators/export")
        assert exp_resp.status_code == 200
        exp_data = json.loads(exp_resp.data)
        assert exp_data["status"] == "success"
        assert "data" in exp_data

        # Import
        imp_resp = client.post("/api/indicators/import", json=exp_data["data"])
        assert imp_resp.status_code == 200
        imp_data = json.loads(imp_resp.data)
        assert imp_data["status"] == "success"
        assert imp_data["imported_count"] > 0
