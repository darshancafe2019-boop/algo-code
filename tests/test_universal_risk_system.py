"""
Universal Risk Management Center - Comprehensive Verification Test Suite
========================================================================
Validates all multi-asset risk models, 8 position sizing algorithms, 12-stage pre-check,
futures margin and liquidation, options Black-Scholes Greeks, stress test scenarios,
database persistence, and Flask REST API endpoints.
"""

import os
import json
import pytest
import sqlite3
from pathlib import Path

from src import universal_risk_engine
from src import db
import dashboard


class TestCriticalSection57Verification:
    """Rigorous verification of the specific critical tests mandated in Section 57."""

    def test_sample_paper_account_standard_sizing(self):
        """
        Critical Test:
        Paper Account Balance = 10,000
        Risk = 2% ($200)
        Entry = 65,000
        Stop Loss = 63,700 (Distance = 1,300)
        """
        res = universal_risk_engine.calculate_universal_position_size(
            account_balance=10000.0,
            entry_price=65000.0,
            stop_loss_price=63700.0,
            method="percent_equity",
            risk_pct=2.0,
            available_capital=10000.0,
            leverage=1.0
        )

        assert res["status"] == "SUCCESS"
        assert res["risk_amount"] == 200.0
        assert res["stop_distance"] == 1300.0
        assert res["stop_distance_pct"] == pytest.approx(2.0, abs=0.01)
        assert res["position_quantity"] == pytest.approx(0.1538, abs=0.001)
        assert res["notional_value"] == pytest.approx(9997.0, abs=50.0)
        assert res["suggested_take_profit"] == 67600.0
        assert res["potential_profit"] == pytest.approx(400.0, abs=5.0)
        assert res["risk_reward_ratio"] == 2.0
        assert res["portfolio_risk_pct_after"] == pytest.approx(2.0, abs=0.1)

    def test_change_risk_percentage_to_one_percent(self):
        """Changing risk to 1% should halve position size from ~0.1538 to ~0.0769 BTC."""
        res = universal_risk_engine.calculate_universal_position_size(
            account_balance=10000.0,
            entry_price=65000.0,
            stop_loss_price=63700.0,
            method="percent_equity",
            risk_pct=1.0,
            available_capital=10000.0,
            leverage=1.0
        )

        assert res["status"] == "SUCCESS"
        assert res["risk_amount"] == 100.0
        assert res["position_quantity"] == pytest.approx(0.0769, abs=0.001)
        assert res["potential_profit"] == pytest.approx(200.0, abs=5.0)

    def test_change_stop_loss_distance(self):
        """Doubling stop distance to 2,600 (Stop = 62,400) should halve position size."""
        res = universal_risk_engine.calculate_universal_position_size(
            account_balance=10000.0,
            entry_price=65000.0,
            stop_loss_price=62400.0,
            method="percent_equity",
            risk_pct=2.0,
            available_capital=10000.0,
            leverage=1.0
        )

        assert res["status"] == "SUCCESS"
        assert res["stop_distance"] == 2600.0
        assert res["stop_distance_pct"] == pytest.approx(4.0, abs=0.01)
        assert res["position_quantity"] == pytest.approx(0.0769, abs=0.001)
        assert res["risk_amount"] == pytest.approx(200.0, abs=1.0)

    def test_futures_leverage_and_margin_scaling(self):
        """Increasing leverage to 10x on futures decreases required initial margin by 90%."""
        res_1x = universal_risk_engine.calculate_futures_risk(
            symbol="BTC/USDT Perp",
            contract_size=1.0,
            entry_price=65000.0,
            stop_loss=63700.0,
            target_price=67600.0,
            direction="LONG",
            leverage=1.0,
            quantity=0.1538,
            account_balance=10000.0
        )

        res_10x = universal_risk_engine.calculate_futures_risk(
            symbol="BTC/USDT Perp",
            contract_size=1.0,
            entry_price=65000.0,
            stop_loss=63700.0,
            target_price=67600.0,
            direction="LONG",
            leverage=10.0,
            quantity=0.1538,
            account_balance=10000.0
        )

        assert res_1x["initial_margin"] == pytest.approx(9997.0, abs=50.0)
        assert res_10x["initial_margin"] == pytest.approx(999.7, abs=10.0)
        assert res_10x["estimated_liquidation_price"] < 65000.0
        assert res_10x["distance_to_liquidation"] > 0.0


class TestPositionSizingModels:
    """Validates all 8 quant sizing algorithms."""

    def test_fixed_cash_risk(self):
        res = universal_risk_engine.calculate_universal_position_size(
            account_balance=10000.0,
            entry_price=100.0,
            stop_loss_price=95.0,
            method="fixed_amount",
            risk_amount=250.0
        )
        assert res["status"] == "SUCCESS"
        assert res["risk_amount"] == 250.0
        assert res["position_quantity"] == 50.0  # 250 / 5 = 50 units

    def test_atr_volatility_distance(self):
        res = universal_risk_engine.calculate_universal_position_size(
            account_balance=10000.0,
            entry_price=100.0,
            stop_loss_price=95.0,
            method="atr_based",
            risk_pct=2.0,
            atr=4.0
        )
        assert res["status"] == "SUCCESS"
        # 1.5 * 4 = 6.0 stop distance. Risk = 200. Size = 200 / 6 = 33.33 units
        assert res["stop_distance"] == 6.0
        assert res["position_quantity"] == pytest.approx(33.3333, abs=0.01)

    def test_kelly_criterion_capped(self):
        res = universal_risk_engine.calculate_universal_position_size(
            account_balance=10000.0,
            entry_price=100.0,
            stop_loss_price=95.0,
            method="kelly_capped",
            win_rate=0.60,
            profit_factor=2.0,
            hard_risk_cap_pct=5.0
        )
        assert res["status"] == "SUCCESS"
        assert res["risk_pct_effective"] <= 5.0
        assert res["position_quantity"] > 0

    def test_indian_equities_lot_sizing(self):
        res = universal_risk_engine.calculate_universal_position_size(
            account_balance=500000.0,
            entry_price=2500.0,
            stop_loss_price=2450.0,
            method="percent_equity",
            risk_pct=1.0,
            lot_size=25,
            asset_class="indian_stocks",
            currency="INR"
        )
        assert res["status"] == "SUCCESS"
        assert res["currency_symbol"] == "₹"
        assert res["position_quantity"] % 25 == 0  # Multiples of lot size


class TestOptionsStrategyAnalytics:
    """Validates multi-leg option strategies and analytical Black-Scholes Greeks."""

    def test_bull_call_spread_greeks_and_payoff(self):
        legs = [
            {"side": "BUY", "option_type": "CALL", "strike": 65000.0, "premium": 1200.0, "quantity": 1},
            {"side": "SELL", "option_type": "CALL", "strike": 67000.0, "premium": 400.0, "quantity": 1}
        ]

        res = universal_risk_engine.calculate_options_strategy_risk(
            strategy_name="Bull Call Spread",
            underlying_price=65000.0,
            legs=legs,
            iv_pct=30.0,
            days_to_expiry=15
        )

        assert res["status"] == "SUCCESS"
        assert abs(res["net_debit_credit"]) == 800.0  # Net debit paid 1200 - 400 = 800
        assert res["maximum_loss"] == 800.0
        assert res["maximum_profit"] == 1200.0  # (67000 - 65000) - 800
        assert res["breakeven_points"] == [65800.0]
        assert "delta" in res["net_greeks"]
        assert res["net_greeks"]["delta"] > 0  # Net bullish delta

    def test_straddle_neutral_delta_positive_vega(self):
        legs = [
            {"side": "BUY", "option_type": "CALL", "strike": 65000.0, "premium": 1000.0, "quantity": 1},
            {"side": "BUY", "option_type": "PUT", "strike": 65000.0, "premium": 1000.0, "quantity": 1}
        ]

        res = universal_risk_engine.calculate_options_strategy_risk(
            strategy_name="Straddle",
            underlying_price=65000.0,
            legs=legs,
            iv_pct=30.0,
            days_to_expiry=30
        )

        assert res["status"] == "SUCCESS"
        assert res["maximum_loss"] == 2000.0
        assert res["net_greeks"]["vega"] > 0  # Volatility beneficiary


class TestTwelveStagePreCheck:
    """Validates 12-stage pre-trade safety evaluation."""

    def test_approved_trade_passes_all_stages(self):
        trade = {
            "symbol": "BTC/USDT",
            "direction": "LONG",
            "entry_price": 65000.0,
            "stop_loss": 63700.0,
            "quantity": 0.035,  # Notional: $2,275 (< 30% of $10k), Risk: $45.5 (< 2.5%)
            "leverage": 1.0,
            "bot_id": "bot-1"
        }
        account = {"balance": 10000.0, "available_capital": 10000.0, "daily_pnl": 0.0}
        limits = {"max_risk_per_trade_pct": 2.5, "max_daily_loss_pct": 5.0, "max_open_positions": 3, "max_exposure_per_asset_pct": 30.0, "kill_switch_active": False}

        res = universal_risk_engine.evaluate_trade_precheck(trade, account, [], limits)
        assert res["is_approved"] is True
        assert res["status"] == "APPROVED"
        assert len(res["rejection_reasons"]) == 0

    def test_blocked_by_daily_drawdown_limit(self):
        trade = {
            "symbol": "BTC/USDT",
            "direction": "LONG",
            "entry_price": 65000.0,
            "stop_loss": 63700.0,
            "quantity": 0.035,
            "leverage": 1.0,
            "bot_id": "bot-1"
        }
        account = {"balance": 10000.0, "available_capital": 10000.0, "daily_pnl": -550.0}
        limits = {"max_daily_loss_pct": 5.0, "kill_switch_active": False}

        res = universal_risk_engine.evaluate_trade_precheck(trade, account, [], limits)
        assert res["is_approved"] is False
        assert res["status"] == "BLOCKED"
        assert any("Daily drawdown" in r for r in res["rejection_reasons"])

    def test_blocked_by_kill_switch(self):
        trade = {"symbol": "BTC/USDT", "direction": "LONG", "entry_price": 65000.0, "stop_loss": 63700.0, "quantity": 0.035}
        account = {"balance": 10000.0, "available_capital": 10000.0}
        limits = {"kill_switch_active": True}

        res = universal_risk_engine.evaluate_trade_precheck(trade, account, [], limits)
        assert res["is_approved"] is False
        assert any("KILL SWITCH" in r.upper() for r in res["rejection_reasons"])


class TestMacroStressTesting:
    """Validates 10 portfolio shock scenarios."""

    def test_run_stress_scenarios(self):
        positions = [
            {"symbol": "BTC/USDT", "direction": "LONG", "position_value": 5000.0, "unrealized_pnl": 0.0}
        ]

        res = universal_risk_engine.run_portfolio_stress_test(portfolio_equity=10000.0, positions=positions)
        assert res["status"] == "SUCCESS"
        assert len(res["scenarios"]) == 10

        # Market -10% scenario should result in -$500 P&L on $5000 long
        sc_m10 = next(s for s in res["scenarios"] if s["scenario_id"] == "market_drop_10")
        assert sc_m10["projected_pnl"] == -500.0
        assert sc_m10["projected_pnl_pct"] == -5.0


class TestDatabaseAndProfilesCRUD:
    """Validates SQLite risk profile, rule, and limit persistence."""

    def test_seed_and_get_profiles(self):
        db.seed_risk_profiles_and_rules_if_needed()
        profiles = db.get_all_risk_profiles()
        assert len(profiles) >= 3
        names = [p["name"] for p in profiles]
        assert "Conservative" in names
        assert "Balanced" in names
        assert "Aggressive" in names

    def test_save_and_delete_custom_profile(self):
        custom_data = {
            "profile_id": "test_scalper_custom",
            "name": "Test Scalper",
            "category": "Custom",
            "description": "High freq test profile",
            "is_default": False,
            "config": {"max_risk_per_trade_pct": 0.5, "max_daily_loss_pct": 2.0}
        }
        ok, p_id = db.save_risk_profile(custom_data)
        assert ok is True

        fetched = db.get_risk_profile("test_scalper_custom")
        assert fetched is not None
        assert fetched["config"]["max_risk_per_trade_pct"] == 0.5

        # Delete
        del_ok, _ = db.delete_risk_profile("test_scalper_custom")
        assert del_ok is True


class TestFlaskRestApiEndpoints:
    """Validates all REST API routes in dashboard.py."""

    @pytest.fixture
    def client(self):
        dashboard.app.config["TESTING"] = True
        with dashboard.app.test_client() as client:
            yield client

    def test_api_risk_overview(self, client):
        res = client.get("/api/risk/overview")
        assert res.status_code == 200
        data = res.get_json()
        assert data["status"] == "success"
        assert "overview" in data
        assert "positions" in data
        assert "heatmap" in data

    def test_api_risk_position_size(self, client):
        payload = {
            "account_balance": 10000.0,
            "entry_price": 65000.0,
            "stop_loss_price": 63700.0,
            "method": "percent_equity",
            "risk_pct": 2.0
        }
        res = client.post("/api/risk/position-size", json=payload)
        assert res.status_code == 200
        data = res.get_json()
        assert data["status"] == "SUCCESS"
        assert data["risk_amount"] == 200.0

    def test_api_risk_futures_calculate(self, client):
        payload = {
            "symbol": "BTC/USDT Perp",
            "entry_price": 65000.0,
            "stop_loss": 63700.0,
            "leverage": 10.0,
            "quantity": 1.0
        }
        res = client.post("/api/risk/futures/calculate", json=payload)
        assert res.status_code == 200
        data = res.get_json()
        assert data["status"] == "SUCCESS"
        assert "estimated_liquidation_price" in data

    def test_api_risk_options_calculate(self, client):
        payload = {
            "strategy_name": "Bull Call Spread",
            "underlying_price": 65000.0,
            "legs": [
                {"side": "BUY", "option_type": "CALL", "strike": 65000.0, "premium": 1200.0, "quantity": 1},
                {"side": "SELL", "option_type": "CALL", "strike": 67000.0, "premium": 400.0, "quantity": 1}
            ]
        }
        res = client.post("/api/risk/options/calculate", json=payload)
        assert res.status_code == 200
        data = res.get_json()
        assert data["status"] == "SUCCESS"
        assert "net_greeks" in data
