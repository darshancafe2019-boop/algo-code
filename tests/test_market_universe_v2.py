import unittest
import os
import sys
import json

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src import db, config
from src.market_providers import (
    get_provider_registry,
    NSEMarketProvider,
    BSEMarketProvider,
    YahooFinanceGlobalProvider,
    CCXTCryptoProvider,
    OandaForexProvider,
    CommoditiesProvider
)
from src.market_universe import MarketUniverseManager, calculate_volatility_score
from dashboard import app


class TestMarketUniverseV2Engine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db.init_db()
        cls.client = app.test_client()

    def test_01_multi_provider_registry_and_health(self):
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

        statuses = registry.get_provider_statuses()
        self.assertGreaterEqual(len(statuses), 6)
        for st in statuses:
            self.assertIn("status", st)
            self.assertIn("latency_ms", st)
            self.assertIn("coverage", st)

    def test_02_full_sync_and_canonical_normalization(self):
        res = MarketUniverseManager.sync_all_markets()
        self.assertIn(res["status"], ["SUCCESS", "PARTIAL_SUCCESS"])
        self.assertGreater(res["total_instruments"], 100)

        # Verify normalized columns in DB
        sample = db.get_instrument_by_canonical("RELIANCE")
        self.assertIsNotNone(sample)
        self.assertEqual(sample["exchange"], "NSE")
        self.assertEqual(sample["currency"], "INR")
        self.assertEqual(sample["instrument_type"], "EQUITY")
        self.assertIn("lot_size", sample)
        self.assertIn("tick_size", sample)
        self.assertIn("volatility_score", sample)
        self.assertIn("momentum_score", sample)

    def test_03_option_chain_and_greeks_engine(self):
        chain = MarketUniverseManager.get_option_chain(underlying="NIFTY50")
        self.assertIsNotNone(chain)
        self.assertEqual(chain["underlying"], "NIFTY50")
        self.assertGreater(chain["spot_price"], 0)
        self.assertGreater(len(chain["strikes"]), 0)

        first_strike = chain["strikes"][0]
        self.assertIn("strike", first_strike)
        self.assertIn("call", first_strike)
        self.assertIn("put", first_strike)
        if first_strike["call"]:
            self.assertIn("delta", first_strike["call"])
            self.assertIn("implied_volatility", first_strike["call"])
            self.assertIn("open_interest", first_strike["call"])

    def test_04_futures_chain_term_structure(self):
        fut_chain = MarketUniverseManager.get_futures_chain(underlying="NIFTY50")
        self.assertGreaterEqual(len(fut_chain), 2)
        near_contract = fut_chain[0]
        self.assertIn("expiry", near_contract)
        self.assertIn("last_price", near_contract)
        self.assertIn("days_to_expiry", near_contract)
        self.assertIn("basis", near_contract)

    def test_05_market_intelligence_rankings(self):
        intel = MarketUniverseManager.calculate_market_intelligence()
        self.assertIn("top_volatility", intel)
        self.assertIn("top_momentum", intel)
        self.assertIn("top_bullish", intel)
        self.assertIn("top_bearish", intel)
        self.assertIn("top_swing", intel)
        self.assertIn("top_scalping", intel)
        self.assertIn("top_hedging", intel)

        self.assertGreater(len(intel["top_volatility"]), 0)
        self.assertGreater(len(intel["top_momentum"]), 0)

    def test_06_strategy_permissions_matrix(self):
        # Save permission
        ok = db.save_strategy_permission(
            bot_id="bot-1",
            asset_class="CRYPTO",
            strategy_name="EMA_MACD_VP",
            is_allowed=True,
            reason="High liquidity verified"
        )
        self.assertTrue(ok)

        # Retrieve permissions
        perms = db.get_strategy_permissions_matrix(bot_id="bot-1")
        self.assertGreaterEqual(len(perms), 1)
        self.assertEqual(perms[0]["strategy_name"], "EMA_MACD_VP")
        self.assertEqual(perms[0]["is_allowed"], 1)

    def test_07_user_watchlists_crud(self):
        # Add item to watchlist
        ok_add = db.add_item_to_watchlist("wl_main", "CRYPTO_BTCUSDT", "Key core crypto holding")
        self.assertTrue(ok_add)

        # Fetch watchlists
        wls = db.get_user_watchlists()
        self.assertGreaterEqual(len(wls), 1)
        main_wl = next((w for w in wls if w["watchlist_id"] == "wl_main"), None)
        self.assertIsNotNone(main_wl)
        self.assertGreaterEqual(len(main_wl["items"]), 1)

        # Remove item
        ok_rem = db.remove_item_from_watchlist("wl_main", "CRYPTO_BTCUSDT")
        self.assertTrue(ok_rem)

    def test_08_rest_api_universe_v2_endpoints(self):
        # 1. Summary
        resp = self.client.get("/api/universe/summary")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "success")
        self.assertGreater(data["summary"]["total_instruments"], 0)

        # 2. Instruments Master with Filters
        resp = self.client.get("/api/universe/instruments?exchange=NSE&instrument_type=EQUITY&limit=10")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "success")
        self.assertGreater(len(data["instruments"]), 0)

        # 3. Provider Health
        resp = self.client.get("/api/universe/providers")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "success")
        self.assertGreaterEqual(len(data["providers"]), 6)

        # 4. Option Chain
        resp = self.client.get("/api/universe/option-chain?underlying=NIFTY50")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "success")
        self.assertIn("strikes", data["data"])

        # 5. Futures Chain
        resp = self.client.get("/api/universe/futures-chain?underlying=NIFTY50")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "success")
        self.assertIn("contracts", data)

        # 6. Intelligence
        resp = self.client.get("/api/universe/intelligence")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "success")
        self.assertIn("intelligence", data)

        # 7. TradingView Datafeed Config
        resp = self.client.get("/api/universe/datafeed/config")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertTrue(data["supports_search"])
        self.assertIn("exchanges", data)

        # 8. TradingView Symbol Resolve
        resp = self.client.get("/api/universe/datafeed/symbols?symbol=RELIANCE")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["name"], "RELIANCE")
        self.assertEqual(data["exchange"], "NSE")


if __name__ == '__main__':
    unittest.main()
