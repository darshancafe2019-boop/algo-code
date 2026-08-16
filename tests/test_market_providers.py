import unittest
import os
import sys
import json

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src import db, config
from src.market_providers import (
    get_provider_registry,
    CCXTCryptoProvider,
    IndianMarketProvider,
    GlobalMarketProvider,
    ForexMarketProvider,
    IndexMarketProvider
)
from src.market_universe import MarketUniverseManager
from src.universe_scanner import MultiAssetStagedScanner
from dashboard import app


class TestMarketProvidersSystem(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db.init_db()
        cls.client = app.test_client()

    def test_01_provider_registry(self):
        registry = get_provider_registry()
        providers = registry.get_all_providers()
        self.assertGreaterEqual(len(providers), 5)

        statuses = registry.get_provider_statuses()
        self.assertGreaterEqual(len(statuses), 5)
        for st in statuses:
            self.assertIn("provider_id", st)
            self.assertIn("status", st)

    def test_02_concrete_providers_instruments(self):
        crypto_p = CCXTCryptoProvider()
        crypto_insts = crypto_p.get_instruments()
        self.assertGreater(len(crypto_insts), 0)
        self.assertEqual(crypto_insts[0]["asset_class"], "Crypto")

        indian_p = IndianMarketProvider()
        indian_insts = indian_p.get_instruments()
        self.assertGreater(len(indian_insts), 0)
        self.assertEqual(indian_insts[0]["asset_class"], "Stock")

        global_p = GlobalMarketProvider()
        global_insts = global_p.get_instruments()
        self.assertGreater(len(global_insts), 0)
        self.assertEqual(global_insts[0]["asset_class"], "Stock")

        forex_p = ForexMarketProvider()
        forex_insts = forex_p.get_instruments()
        self.assertGreater(len(forex_insts), 0)
        self.assertEqual(forex_insts[0]["asset_class"], "Forex")

        idx_p = IndexMarketProvider()
        idx_insts = idx_p.get_instruments()
        self.assertGreater(len(idx_insts), 0)
        self.assertEqual(idx_insts[0]["asset_class"], "Indices")

    def test_03_symbol_display_name_normalization(self):
        crypto_p = CCXTCryptoProvider()
        insts = crypto_p.get_instruments()
        btc_inst = next((i for i in insts if "BTC" in i["symbol"]), None)
        self.assertIsNotNone(btc_inst)
        self.assertIn("Bitcoin", btc_inst["display_name"])
        self.assertEqual(btc_inst["canonical_symbol"], "BTCUSDT")

    def test_04_dynamic_sync_all_markets(self):
        res = MarketUniverseManager.sync_all_markets()
        self.assertEqual(res["status"], "SUCCESS")
        self.assertGreater(res["total_instruments"], 0)
        self.assertIn("providers", res)

    def test_05_rest_api_providers_and_select_all(self):
        resp = self.client.get("/api/universe/providers")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "success")
        self.assertGreaterEqual(len(data["providers"]), 5)

        resp_batch = self.client.post("/api/universe/select-all", json={
            "category": "INDIAN STOCKS",
            "control": "strategy",
            "enable": True
        })
        self.assertEqual(resp_batch.status_code, 200)
        data_batch = json.loads(resp_batch.data)
        self.assertEqual(data_batch["status"], "success")
        self.assertGreater(data_batch["affected_count"], 0)

    def test_06_strategy_75pct_threshold_regression(self):
        scanner = MultiAssetStagedScanner(confidence_threshold=75.0)
        self.assertEqual(scanner.confidence_threshold, 75.0)

    def test_07_provider_health_and_coverage_descriptions(self):
        registry = get_provider_registry()
        statuses = registry.get_provider_statuses()
        
        global_st = next((s for s in statuses if s["provider_id"] == "global_equities_yahoo"), None)
        self.assertIsNotNone(global_st)
        self.assertEqual(global_st["status"], "LIMITED")
        self.assertIn("limited", global_st["coverage"].lower())

        crypto_st = next((s for s in statuses if s["provider_id"] == "crypto_ccxt_binance"), None)
        self.assertIsNotNone(crypto_st)
        self.assertIn("Binance Spot", crypto_st["coverage"])


if __name__ == '__main__':
    unittest.main()
