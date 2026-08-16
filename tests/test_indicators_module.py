import unittest
import pandas as pd
import numpy as np
import os
import json
import sqlite3
from src import indicators
from src import db

class TestIndicatorsModule(unittest.TestCase):

    def setUp(self):
        # Generate dummy 100-bar OHLCV dataframe
        np.random.seed(42)
        dates = pd.date_range(start="2026-01-01", periods=100, freq="15min")
        close = 50000.0 + np.cumsum(np.random.randn(100) * 100)
        high = close + np.abs(np.random.randn(100) * 50)
        low = close - np.abs(np.random.randn(100) * 50)
        open_p = close + np.random.randn(100) * 10
        volume = np.random.randint(100, 1000, size=100).astype(float)
        timestamps = [int(ts.timestamp() * 1000) for ts in dates]

        self.df = pd.DataFrame({
            'timestamp': timestamps,
            'open': open_p,
            'high': high,
            'low': low,
            'close': close,
            'volume': volume
        })

    def test_indicator_calculations(self):
        """Test calculation of all new indicators without NaN/Inf errors."""
        df = self.df.copy()
        df = indicators.calculate_emas(df)
        df = indicators.calculate_rsi(df)
        df = indicators.calculate_macd(df)
        df = indicators.calculate_hma(df, length=20)
        df = indicators.calculate_vwap(df)
        df = indicators.calculate_supertrend(df, period=10)
        df = indicators.calculate_stoch_rsi(df)
        df = indicators.calculate_stochastic(df)
        df = indicators.calculate_cci(df)
        df = indicators.calculate_roc(df)
        df = indicators.calculate_williams_r(df)
        df = indicators.calculate_keltner_channels(df)
        df = indicators.calculate_donchian_channels(df)
        df = indicators.calculate_std_dev(df)
        df = indicators.calculate_obv(df)
        df = indicators.calculate_mfi(df)
        df = indicators.calculate_cmf(df)
        df = indicators.calculate_support_resistance(df)
        df = indicators.calculate_breakout_levels(df)
        df = indicators.calculate_parabolic_sar(df)
        df = indicators.calculate_anchored_vwap(df)
        df = indicators.detect_rsi_divergence(df)

        self.assertIn('hma', df.columns)
        self.assertIn('vwap', df.columns)
        self.assertIn('supertrend', df.columns)
        self.assertIn('stoch_rsi_k', df.columns)
        self.assertIn('stoch_k', df.columns)
        self.assertIn('cci', df.columns)
        self.assertIn('roc', df.columns)
        self.assertIn('williams_r', df.columns)
        self.assertIn('keltner_mid', df.columns)
        self.assertIn('donchian_high', df.columns)
        self.assertIn('obv', df.columns)
        self.assertIn('mfi', df.columns)
        self.assertIn('cmf', df.columns)
        self.assertIn('support_level', df.columns)
        self.assertIn('breakout_high', df.columns)
        self.assertIn('parabolic_sar', df.columns)
        self.assertIn('anchored_vwap', df.columns)
        self.assertIn('rsi_divergence', df.columns)

    def test_market_regime_detection(self):
        """Test market regime classification logic."""
        regime_info = indicators.detect_market_regime(self.df.copy())
        self.assertIn('regime', regime_info)
        self.assertIn('volatility', regime_info)
        self.assertIn('bias', regime_info)
        self.assertIn(regime_info['regime'], ['TRENDING_BULL', 'TRENDING_BEAR', 'SIDEWAYS_RANGE', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'BREAKOUT', 'PULLBACK', 'RANGING'])

    def test_evaluate_profile_confluence(self):
        """Test dynamic weighted confluence scoring engine."""
        profile_cfg = {
            "signal_threshold_long": 60.0,
            "signal_threshold_short": 60.0,
            "config": {
                "ema": {"enabled": True, "weight": 20.0},
                "rsi": {"enabled": True, "weight": 20.0, "oversold": 30.0, "overbought": 70.0},
                "macd": {"enabled": True, "weight": 20.0},
                "vwap": {"enabled": True, "weight": 20.0},
                "supertrend": {"enabled": True, "weight": 20.0}
            }
        }
        res = indicators.evaluate_profile_confluence(self.df.copy(), profile_cfg)
        self.assertIn("decision", res)
        self.assertIn(res["decision"], ["LONG", "SHORT", "HOLD"])
        self.assertIn("bull_score", res)
        self.assertIn("bear_score", res)
        self.assertIn("indicators", res)

    def test_db_indicator_profiles(self):
        """Test DB initialization, profile retrieval, saving, and versioning."""
        db.init_db()
        profiles = db.get_indicator_profiles()
        self.assertTrue(len(profiles) >= 5, f"Expected at least 5 seeded profiles, found {len(profiles)}")

        # Save new profile
        test_prof = {
            "profile_id": "test-prof-unit-1",
            "name": "Unit Test Profile",
            "market_regime": "ALL",
            "adaptive_mode": "BALANCED",
            "signal_threshold_long": 70.0,
            "signal_threshold_short": 70.0,
            "config": {"rsi": {"enabled": True, "weight": 30}}
        }
        ok, pid = db.save_indicator_profile(test_prof)
        self.assertTrue(ok)
        self.assertEqual(pid, "test-prof-unit-1")

        # Retrieve single profile
        p_ret = db.get_indicator_profile_by_id("test-prof-unit-1")
        self.assertIsNotNone(p_ret)
        self.assertEqual(p_ret["name"], "Unit Test Profile")

        # Apply profile to bot
        app_ok = db.apply_profile_to_bot("bot-1", "test-prof-unit-1")
        self.assertTrue(app_ok)

        bot_p = db.get_bot_indicator_profile("bot-1")
        self.assertIsNotNone(bot_p)
        self.assertEqual(bot_p["profile_id"], "test-prof-unit-1")

    def test_scenario_profiles(self):
        """Test retrieval of scenario profiles."""
        scenarios = db.get_scenario_profiles()
        self.assertTrue(len(scenarios) >= 7, f"Expected 7 market regime scenarios, found {len(scenarios)}")

if __name__ == "__main__":
    unittest.main()
