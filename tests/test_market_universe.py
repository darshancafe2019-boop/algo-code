import unittest
import os
import sys
import json

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src import db, config
from src.market_universe import MarketUniverseManager, calculate_volatility_score
from src.universe_scanner import MultiAssetStagedScanner
from src.order_router import MultiAssetOrderRouter
from dashboard import app


class TestMarketUniverseSystem(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db.init_db()
        cls.client = app.test_client()

    def test_01_volatility_score_calculation(self):
        score, cat = calculate_volatility_score(change_pct=6.5, high_price=110.0, low_price=90.0, close_price=100.0)
        self.assertGreaterEqual(score, 50.0)
        self.assertIn(cat, ["High", "Extreme"])

    def test_02_market_universe_sync(self):
        res = MarketUniverseManager.sync_all_markets()
        self.assertEqual(res["status"], "SUCCESS")
        self.assertGreater(res["total_instruments"], 0)

        stats = db.get_universe_summary_stats()
        self.assertGreater(stats["total_instruments"], 0)
        self.assertGreater(stats["crypto_count"], 0)
        self.assertGreater(stats["indian_stocks_count"], 0)
        self.assertGreater(stats["global_stocks_count"], 0)
        self.assertGreater(stats["forex_count"], 0)
        self.assertGreater(stats["indices_count"], 0)

    def test_03_query_and_search_universe(self):
        # Query Crypto
        res = db.get_market_universe(asset_class="Crypto")
        self.assertGreater(len(res["instruments"]), 0)

        # Search Reliance
        res_rel = db.get_market_universe(search="RELIANCE")
        self.assertGreater(len(res_rel["instruments"]), 0)
        self.assertEqual(res_rel["instruments"][0]["symbol"], "RELIANCE")

        # Search Bitcoin
        res_btc = db.get_market_universe(search="Bitcoin")
        self.assertGreater(len(res_btc["instruments"]), 0)

    def test_04_instrument_controls_toggle(self):
        # Update Reliance controls
        ok, res_id = db.update_instrument_controls("RELIANCE", watch=True, paper=True, strategy=True, live=False)
        self.assertTrue(ok)

        inst = db.get_market_instrument("RELIANCE")
        self.assertIsNotNone(inst)
        self.assertTrue(inst["watch_enabled"])
        self.assertTrue(inst["paper_enabled"])
        self.assertTrue(inst["strategy_enabled"])
        self.assertFalse(inst["live_enabled"])

    def test_05_rest_api_universe_endpoints(self):
        # Summary
        resp = self.client.get("/api/universe/summary")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "success")
        self.assertGreater(data["summary"]["total_instruments"], 0)

        # Instruments list
        resp = self.client.get("/api/universe/instruments?asset_class=Stock")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "success")
        self.assertGreater(len(data["instruments"]), 0)

        # Controls update
        resp = self.client.post("/api/universe/instruments/BTCUSDT/controls", json={"watch": True, "paper": True})
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "success")

        # Opportunities
        resp = self.client.get("/api/universe/opportunities?limit=5")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "success")

    def test_06_order_router_safety_checks(self):
        # Live order when live is disabled for instrument -> should reject
        ok, msg, details = MultiAssetOrderRouter.route_order("RELIANCE", "BUY_LONG", 1.0, 2900.0, asset_class="Stock", is_live=True)
        self.assertFalse(ok)
        self.assertIn("Live trading disabled", msg)

        # Paper order for Crypto -> should pass
        ok_p, msg_p, details_p = MultiAssetOrderRouter.route_order("BTC/USDT", "BUY_LONG", 0.1, 64000.0, asset_class="Crypto", is_live=False)
        self.assertTrue(ok_p)
        self.assertEqual(details_p["mode"], "PAPER SIMULATION")

    def test_07_staged_scanner_and_75pct_threshold(self):
        scanner = MultiAssetStagedScanner(confidence_threshold=75.0)
        self.assertEqual(scanner.confidence_threshold, 75.0)


if __name__ == '__main__':
    unittest.main()
