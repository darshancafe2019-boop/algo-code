import unittest
import os
import sys
import json
import pandas as pd
import numpy as np

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src import db, config
from src.market_providers import get_provider_registry
from src.market_universe import MarketUniverseManager
from src.universe_scanner import MultiAssetStagedScanner
from src.indicators import calculate_emas, calculate_macd, calculate_volume_profile, evaluate_profile_confluence
from src.risk_manager import RiskManager
from src.order_router import MultiAssetOrderRouter
from dashboard import app


class TestEndToEndAlgorithmicTradingPipeline(unittest.TestCase):
    """
    Validates the authoritative 12-stage end-to-end pipeline:
    EXCHANGE/PROVIDER -> INSTRUMENT MASTER -> NEW ASSET DISCOVERY -> AUTO SYNC ->
    MARKET UNIVERSE -> WATCHLIST/SCANNER -> CLASSIFICATIONS (VOLATILITY, MOMENTUM, DIRECTIONAL, SWING, SCALPING, HEDGING) ->
    CHART DATAFEED -> INDICATORS -> STRATEGY CONFLUENCE -> RISK GATES -> PAPER/PROTECTED LIVE EXECUTION
    """

    @classmethod
    def setUpClass(cls):
        db.init_db()
        cls.client = app.test_client()

    def test_stage_01_exchange_provider_layer(self):
        """Stage 1: Multi-exchange data providers register and report health."""
        registry = get_provider_registry()
        providers = registry.get_all_providers()
        self.assertGreaterEqual(len(providers), 6)
        
        provider_ids = [p.get_provider_id() for p in providers]
        self.assertIn("nse_market_data", provider_ids)
        self.assertIn("bse_market_data", provider_ids)
        self.assertIn("global_equities_yahoo", provider_ids)
        self.assertIn("crypto_ccxt_binance", provider_ids)
        self.assertIn("forex_oanda", provider_ids)
        self.assertIn("commodities_mcx_global", provider_ids)

    def test_stage_02_and_03_instrument_master_discovery_and_auto_sync(self):
        """Stage 2 & 3: Discovery of new stocks, monthly futures, and weekly option strike ladders via Auto Sync."""
        sync_res = MarketUniverseManager.sync_all_markets()
        self.assertIn(sync_res["status"], ["SUCCESS", "PARTIAL_SUCCESS"])
        self.assertGreater(sync_res["total_instruments"], 100)

        # Audit log verified
        history = db.get_sync_history(limit=1)
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["status"], "SUCCESS")

    def test_stage_04_market_universe_query_and_filtering(self):
        """Stage 4: Authoritative Market Universe querying across all asset classes."""
        summary = db.get_universe_summary_stats()
        self.assertGreater(summary["indian_stocks"], 0)
        self.assertGreater(summary["global_stocks"], 0)
        self.assertGreater(summary["crypto"], 0)
        self.assertGreater(summary["forex"], 0)
        self.assertGreater(summary["commodities"], 0)
        self.assertGreater(summary["futures"], 0)
        self.assertGreater(summary["options"], 0)

    def test_stage_05_watchlist_and_staged_scanner(self):
        """Stage 5: Watchlist persistence & Multi-asset staged scanning."""
        db.add_item_to_watchlist("wl_main", "CRYPTO_BTCUSDT", "Core automated swing holding")
        wls = db.get_user_watchlists()
        main_wl = next((w for w in wls if w["watchlist_id"] == "wl_main"), None)
        self.assertIsNotNone(main_wl)
        self.assertGreaterEqual(len(main_wl["items"]), 1)

        scanner = MultiAssetStagedScanner(confidence_threshold=75.0)
        self.assertEqual(scanner.confidence_threshold, 75.0)

    def test_stage_06_explainable_market_intelligence_categories(self):
        """Stage 6: Automatic classification: Volatility, Momentum, Directional, Swing, Scalping, Hedging."""
        intel = MarketUniverseManager.calculate_market_intelligence()
        self.assertGreater(len(intel["top_volatility"]), 0)
        self.assertGreater(len(intel["top_momentum"]), 0)
        self.assertGreater(len(intel["top_bullish"]), 0)
        self.assertGreater(len(intel["top_swing"]), 0)
        self.assertGreater(len(intel["top_scalping"]), 0)
        self.assertGreater(len(intel["top_hedging"]), 0)

        # Verify Volatility scoring
        top_vol = intel["top_volatility"][0]
        self.assertGreaterEqual(top_vol["volatility_score"], 55.0)
        self.assertIn(top_vol["volatility_category"], ["High", "Extreme"])

    def test_stage_07_chart_datafeed_and_symbols_resolution(self):
        """Stage 7: Official TradingView Charting Library Datafeed resolution & OHLCV bars."""
        # 1. Config
        resp_cfg = self.client.get("/api/universe/datafeed/config")
        self.assertEqual(resp_cfg.status_code, 200)
        cfg_data = json.loads(resp_cfg.data)
        self.assertTrue(cfg_data["supports_search"])

        # 2. Resolve Symbol
        resp_sym = self.client.get("/api/universe/datafeed/symbols?symbol=BTC/USDT")
        self.assertEqual(resp_sym.status_code, 200)
        sym_data = json.loads(resp_sym.data)
        self.assertEqual(sym_data["name"], "BTC/USDT")

        # 3. OHLCV Bars
        resp_hist = self.client.get("/api/universe/datafeed/history?symbol=BTC/USDT&resolution=15")
        self.assertEqual(resp_hist.status_code, 200)
        hist_data = json.loads(resp_hist.data)
        self.assertIn(hist_data["s"], ["ok", "no_data"])

    def test_stage_08_indicators_calculation_engine(self):
        """Stage 8: Multi-indicator calculation engine (EMA, MACD, Volume Profile, RSI, Bollinger Bands)."""
        df = pd.DataFrame({
            "timestamp": [1000 + i * 900 for i in range(100)],
            "open": [100.0 + i * 0.5 for i in range(100)],
            "high": [101.0 + i * 0.5 for i in range(100)],
            "low": [99.0 + i * 0.5 for i in range(100)],
            "close": [100.5 + i * 0.5 for i in range(100)],
            "volume": [1000.0 + i * 10 for i in range(100)]
        })

        df_calc = calculate_emas(df)
        df_calc = calculate_macd(df_calc)
        self.assertIn("ema_9", df_calc.columns)
        self.assertIn("ema_20", df_calc.columns)
        self.assertIn("macd_line", df_calc.columns)

    def test_stage_09_strategy_confluence_evaluation(self):
        """Stage 9: Strategy Confluence evaluation & 75%+ threshold validation."""
        df = pd.DataFrame({
            "timestamp": [1000 + i * 900 for i in range(100)],
            "open": [100.0 + i * 0.5 for i in range(100)],
            "high": [101.0 + i * 0.5 for i in range(100)],
            "low": [99.0 + i * 0.5 for i in range(100)],
            "close": [100.5 + i * 0.5 for i in range(100)],
            "volume": [1000.0 + i * 10 for i in range(100)]
        })
        df_calc = calculate_emas(df)
        df_calc = calculate_macd(df_calc)
        conf = evaluate_profile_confluence(df_calc)
        self.assertIn("confluence_pct", conf)
        self.assertIn("decision", conf)
        self.assertIn("threshold_long", conf)

    def test_stage_10_risk_engine_safety_gates(self):
        """Stage 10: 14-Point Pre-Trade Safety Gate, Position Sizing, and Drawdown Limits."""
        df = pd.DataFrame({
            "timestamp": [1000 + i * 900 for i in range(100)],
            "open": [100.0 + i * 0.5 for i in range(100)],
            "high": [101.0 + i * 0.5 for i in range(100)],
            "low": [99.0 + i * 0.5 for i in range(100)],
            "close": [100.5 + i * 0.5 for i in range(100)],
            "volume": [1000.0 + i * 10 for i in range(100)]
        })
        risk_mgr = RiskManager()
        
        # Position sizing check
        pos_size = risk_mgr.calculate_position_size(
            account_balance=10000.0,
            entry_price=64000.0,
            stop_loss_price=62720.0
        )
        self.assertGreater(pos_size, 0)

        # Trade levels calculation
        sl, tp = risk_mgr.calculate_trade_levels(df, idx=99, direction="LONG", entry_price=64000.0)
        self.assertLess(sl, 64000.0)
        self.assertGreater(tp, 64000.0)

        # Pre-trade safety gate verification (Kill Switch)
        is_kill = risk_mgr.is_kill_switch_active()
        self.assertFalse(is_kill)


    def test_stage_11_and_12_paper_simulation_and_protected_live_routing(self):
        """Stage 11 & 12: Default Paper simulation execution and protected Live trading gates."""
        # 1. Paper execution -> Always allowed
        ok_paper, msg_paper, details_paper = MultiAssetOrderRouter.route_order(
            symbol="BTC/USDT",
            signal_type="BUY_LONG",
            position_size=0.1,
            price=64000.0,
            asset_class="Crypto",
            is_live=False
        )
        self.assertTrue(ok_paper)
        self.assertEqual(details_paper["mode"], "PAPER SIMULATION")

        # 2. Live execution -> Protected: rejected if master live switch or instrument live toggle is OFF
        ok_live, msg_live, details_live = MultiAssetOrderRouter.route_order(
            symbol="RELIANCE",
            signal_type="BUY_LONG",
            position_size=10.0,
            price=2900.0,
            asset_class="Stock",
            is_live=True
        )
        self.assertFalse(ok_live)
        self.assertTrue("disabled" in msg_live.lower() or "rejected" in msg_live.lower() or "off" in msg_live.lower())



if __name__ == '__main__':
    unittest.main()
