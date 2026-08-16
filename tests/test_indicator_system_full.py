import unittest
import json
import os
import sqlite3
import pandas as pd
import numpy as np
from datetime import datetime, timezone

from src import config, db, indicators
import dashboard


class TestIndicatorSystemFull(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        db.init_db()
        cls.app = dashboard.app.test_client()

    def test_01_db_seeding_and_registry(self):
        """Verify DB seeding loads all registry indicators correctly."""
        configs = db.get_all_indicator_configs()
        self.assertGreaterEqual(len(configs), 30)

        # Check key indicators present
        ind_ids = [c["indicator_id"] for c in configs]
        for key in ["ema_9", "ema_200", "macd", "rsi", "bollinger", "atr", "volume_profile"]:
            self.assertIn(key, ind_ids)

    def test_02_get_and_update_indicator_config(self):
        """Verify fetching and saving an indicator configuration persists to DB."""
        cfg = db.get_indicator_config("macd")
        self.assertIsNotNone(cfg)
        self.assertEqual(cfg["indicator_id"], "macd")

        # Update params
        updated_cfg = dict(cfg)
        updated_cfg["weight"] = 25.0
        updated_cfg["timeframe"] = "30m"
        updated_cfg["parameters"] = {"fast": 10, "slow": 22, "signal": 8, "source": "close"}

        ok, msg = db.save_indicator_config(updated_cfg)
        self.assertTrue(ok)

        # Verify persistence
        reloaded = db.get_indicator_config("macd")
        self.assertEqual(reloaded["weight"], 25.0)
        self.assertEqual(reloaded["timeframe"], "30m")
        self.assertEqual(reloaded["parameters"]["fast"], 10)

    def test_03_enable_disable_toggle(self):
        """Verify enable/disable state toggles correctly in DB."""
        db.set_indicator_enabled("rsi", False)
        cfg = db.get_indicator_config("rsi")
        self.assertFalse(cfg["enabled"])

        db.set_indicator_enabled("rsi", True)
        cfg = db.get_indicator_config("rsi")
        self.assertTrue(cfg["enabled"])

    def test_04_favorite_toggle(self):
        """Verify favorite status toggles in DB."""
        db.toggle_indicator_favorite("bollinger")
        cfg = db.get_indicator_config("bollinger")
        fav_state = cfg["favorite"]

        ok, new_state = db.toggle_indicator_favorite("bollinger")
        self.assertTrue(ok)
        self.assertEqual(new_state, not fav_state)

    def test_05_apply_preset(self):
        """Verify applying a preset configures weights and enabled status."""
        ok, res = db.apply_indicator_preset("Conservative")
        self.assertTrue(ok)

        configs = db.get_all_indicator_configs()
        enabled_ids = [c["indicator_id"] for c in configs if c["enabled"]]
        self.assertIn("ema_50", enabled_ids)
        self.assertIn("ema_200", enabled_ids)
        self.assertIn("macd", enabled_ids)

    def test_06_reset_defaults(self):
        """Verify resetting a single indicator and reset-all functionality."""
        db.save_indicator_config({"id": "adx", "weight": 99, "parameters": {"period": 99}})
        self.assertEqual(db.get_indicator_config("adx")["weight"], 99)

        db.reset_indicator_config("adx")
        self.assertEqual(db.get_indicator_config("adx")["weight"], 15.0)

        db.reset_all_indicator_configs()
        configs = db.get_all_indicator_configs()
        self.assertGreaterEqual(len(configs), 30)

    def test_07_rest_api_endpoints(self):
        """Verify Flask REST API endpoints for indicator management."""
        res = self.app.get("/api/indicators")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data["status"], "success")

        # GET detail
        res = self.app.get("/api/indicators/ema_20")
        self.assertEqual(res.status_code, 200)

        # PUT update
        res = self.app.put("/api/indicators/ema_20", json={
            "name": "EMA 20",
            "category": "Trend",
            "enabled": True,
            "weight": 18.0,
            "timeframe": "15m",
            "parameters": {"length": 20, "source": "close"}
        })
        self.assertEqual(res.status_code, 200)

        # Enable/Disable
        res = self.app.post("/api/indicators/ema_20/disable")
        self.assertEqual(res.status_code, 200)
        res = self.app.post("/api/indicators/ema_20/enable")
        self.assertEqual(res.status_code, 200)

        # Favorite
        res = self.app.post("/api/indicators/ema_20/favorite")
        self.assertEqual(res.status_code, 200)

    def test_08_evaluate_confluence_with_db_config(self):
        """Verify evaluate_profile_confluence runs smoothly using DB configs."""
        dates = pd.date_range(end=datetime.now(timezone.utc), periods=100, freq="15min")
        np.random.seed(42)
        close = 50000.0 + np.cumsum(np.random.randn(100) * 100)
        df = pd.DataFrame({
            "timestamp": dates,
            "open": close - 10,
            "high": close + 50,
            "low": close - 50,
            "close": close,
            "volume": np.random.randint(100, 1000, 100)
        })

        res = indicators.evaluate_profile_confluence(df)
        self.assertIn(res["decision"], ["LONG", "SHORT", "HOLD"])
        self.assertIn("bull_score", res)
        self.assertIn("bear_score", res)
        self.assertIn("indicators", res)


if __name__ == "__main__":
    unittest.main()
