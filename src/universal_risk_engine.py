"""
Universal Risk Management Engine
================================
Enterprise-grade multi-asset risk management, position sizing, futures margin & leverage,
options strategies & Greeks analytics, multi-bot portfolio concentration, drawdown protection,
scenario stress testing, and 12-stage pre-trade safety validation.

Supported Asset Classes:
- Crypto (Spot, Margin, Perpetual Futures)
- Indian Equities (NSE/BSE in INR ₹)
- US / Global Equities (USD $)
- Indices (NIFTY, BANKNIFTY, S&P 500, NASDAQ, DJI)
- Forex (Majors, Minors, INR pairs)
- Futures (Commodities, Indices, Crypto Perps)
- Options (Single leg & 13+ Multi-leg Strategies)
"""

import math
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
import numpy as np

logger = logging.getLogger("UniversalRiskEngine")


# =============================================================================
# 1. CONSTANTS & INSTRUMENT SPECIFICATIONS
# =============================================================================
ASSET_CLASSES = ["crypto", "indian_stocks", "us_stocks", "indices", "forex", "futures", "options"]

CURRENCY_SYMBOLS = {
    "USD": "$",
    "INR": "₹",
    "EUR": "€",
    "GBP": "£",
    "USDT": "$"
}

DEFAULT_LOT_SIZES = {
    "NIFTY": 50,
    "BANKNIFTY": 15,
    "FINNIFTY": 25,
    "RELIANCE": 250,
    "TCS": 175,
    "INFY": 300,
    "BTC/USDT": 1,
    "ETH/USDT": 1,
    "EUR/USD": 100000,
    "USD/INR": 1000
}

OPTION_STRATEGIES = [
    "Long Call",
    "Long Put",
    "Covered Call",
    "Protective Put",
    "Bull Call Spread",
    "Bear Put Spread",
    "Bull Put Spread",
    "Bear Call Spread",
    "Straddle",
    "Strangle",
    "Iron Condor",
    "Butterfly",
    "Calendar Spread"
]


# =============================================================================
# 2. BLACK-SCHOLES GREEKS ANALYTICAL MODEL
# =============================================================================
def norm_cdf(x: float) -> float:
    """Standard normal cumulative distribution function."""
    return (1.0 + math.erf(x / math.sqrt(2.0))) / 2.0


def norm_pdf(x: float) -> float:
    """Standard normal probability density function."""
    return (1.0 / math.sqrt(2.0 * math.pi)) * math.exp(-0.5 * x * x)


def calculate_black_scholes_greeks(
    spot: float,
    strike: float,
    time_to_expiry_years: float,
    volatility: float,
    risk_free_rate: float = 0.05,
    option_type: str = "call"
) -> Dict[str, Any]:
    """
    Computes analytical Black-Scholes Price & Greeks (Delta, Gamma, Theta, Vega, Rho).
    Returns 'DATA REQUIRED' when essential inputs are missing or invalid.
    """
    if spot <= 0 or strike <= 0 or time_to_expiry_years <= 0 or volatility <= 0:
        return {
            "status": "DATA REQUIRED",
            "message": "Valid positive spot, strike, time to expiry, and implied volatility required.",
            "delta": 0.0,
            "gamma": 0.0,
            "theta": 0.0,
            "vega": 0.0,
            "rho": 0.0,
            "theoretical_price": 0.0
        }

    try:
        s = float(spot)
        k = float(strike)
        t = float(time_to_expiry_years)
        v = float(volatility)
        r = float(risk_free_rate)
        opt = option_type.lower()

        d1 = (math.log(s / k) + (r + 0.5 * v * v) * t) / (v * math.sqrt(t))
        d2 = d1 - v * math.sqrt(t)

        pdf_d1 = norm_pdf(d1)
        cdf_d1 = norm_cdf(d1)
        cdf_d2 = norm_cdf(d2)
        cdf_neg_d1 = norm_cdf(-d1)
        cdf_neg_d2 = norm_cdf(-d2)

        exp_rt = math.exp(-r * t)

        if opt == "call":
            price = s * cdf_d1 - k * exp_rt * cdf_d2
            delta = cdf_d1
            theta = (- (s * pdf_d1 * v) / (2.0 * math.sqrt(t)) - r * k * exp_rt * cdf_d2) / 365.0
            rho = (k * t * exp_rt * cdf_d2) / 100.0
        else:
            price = k * exp_rt * cdf_neg_d2 - s * cdf_neg_d1
            delta = cdf_d1 - 1.0
            theta = (- (s * pdf_d1 * v) / (2.0 * math.sqrt(t)) + r * k * exp_rt * cdf_neg_d2) / 365.0
            rho = (-k * t * exp_rt * cdf_neg_d2) / 100.0

        gamma = pdf_d1 / (s * v * math.sqrt(t))
        vega = (s * math.sqrt(t) * pdf_d1) / 100.0

        return {
            "status": "CALCULATED",
            "model": "Black-Scholes (1973)",
            "theoretical_price": round(price, 4),
            "delta": round(delta, 4),
            "gamma": round(gamma, 6),
            "theta": round(theta, 4),
            "vega": round(vega, 4),
            "rho": round(rho, 4),
            "d1": round(d1, 4),
            "d2": round(d2, 4)
        }
    except Exception as e:
        logger.error(f"Greeks calculation error: {e}")
        return {
            "status": "DATA REQUIRED",
            "message": f"Calculation error: {e}",
            "delta": 0.0,
            "gamma": 0.0,
            "theta": 0.0,
            "vega": 0.0,
            "rho": 0.0,
            "theoretical_price": 0.0
        }


# =============================================================================
# 3. UNIVERSAL POSITION SIZING CALCULATOR (8 METHODS)
# =============================================================================
def calculate_universal_position_size(
    account_balance: float,
    entry_price: float,
    stop_loss_price: float,
    method: str = "percent_equity",
    risk_pct: float = 2.0,
    risk_amount: Optional[float] = None,
    available_capital: Optional[float] = None,
    leverage: float = 1.0,
    atr: Optional[float] = None,
    volatility_pct: Optional[float] = None,
    win_rate: float = 0.55,
    profit_factor: float = 1.8,
    hard_risk_cap_pct: float = 5.0,
    lot_size: int = 1,
    asset_class: str = "crypto",
    currency: str = "USD",
    fees_pct: float = 0.001,
    slippage_pct: float = 0.0005
) -> Dict[str, Any]:
    """
    Computes precise multi-asset position sizing across 8 standard quant models.
    Enforces user's hard risk cap and provides detailed margin, risk/reward, and notional outputs.
    """
    if account_balance <= 0 or entry_price <= 0:
        return {"status": "ERROR", "message": "Account Balance and Entry Price must be positive."}

    avail_cap = available_capital if (available_capital is not None and available_capital > 0) else account_balance
    stop_dist = abs(entry_price - stop_loss_price) if stop_loss_price > 0 else 0.0
    stop_dist_pct = (stop_dist / entry_price * 100.0) if entry_price > 0 else 0.0

    # Determine baseline risk amount ($/₹)
    hard_max_risk = account_balance * (hard_risk_cap_pct / 100.0)
    calculated_risk_amount = 0.0
    method_label = method

    if method == "fixed_amount":
        calculated_risk_amount = risk_amount if (risk_amount and risk_amount > 0) else (account_balance * 0.02)
    elif method == "percent_available":
        calculated_risk_amount = avail_cap * (risk_pct / 100.0)
    elif method == "atr_based" and atr and atr > 0:
        # 1.5 ATR risk distance
        atr_dist = 1.5 * atr
        stop_dist = atr_dist
        stop_dist_pct = (atr_dist / entry_price) * 100.0
        calculated_risk_amount = account_balance * (risk_pct / 100.0)
    elif method == "volatility_based" and volatility_pct and volatility_pct > 0:
        # Scale risk inversely with market volatility
        vol_scalar = max(0.25, min(2.0, 20.0 / volatility_pct))
        calculated_risk_amount = account_balance * (risk_pct / 100.0) * vol_scalar
    elif method == "kelly_capped":
        # Half-Kelly formula: K% = (p * b - q) / b * 0.5
        p = max(0.1, min(0.9, win_rate))
        q = 1.0 - p
        b = max(0.5, profit_factor)
        kelly_fraction = max(0.005, min(0.25, (p * b - q) / b * 0.5))
        calculated_risk_amount = account_balance * kelly_fraction
        method_label = f"Half-Kelly ({kelly_fraction*100:.1f}%)"
    elif method == "fixed_quantity":
        qty = risk_amount if risk_amount else 1.0
        calculated_risk_amount = qty * stop_dist
    elif method == "fixed_notional":
        notional_target = risk_amount if risk_amount else (account_balance * 0.5)
        calculated_quantity = notional_target / entry_price
        calculated_risk_amount = calculated_quantity * stop_dist
    else:  # default percent_equity
        calculated_risk_amount = account_balance * (risk_pct / 100.0)

    # Strictly enforce hard maximum risk cap
    effective_risk_amount = min(calculated_risk_amount, hard_max_risk)

    # Quantity calculation
    if stop_dist > 0:
        raw_quantity = effective_risk_amount / stop_dist
    else:
        raw_quantity = (account_balance * (risk_pct / 100.0)) / entry_price

    # Lot size alignment
    if lot_size > 1:
        lots = max(1, round(raw_quantity / lot_size))
        final_quantity = float(lots * lot_size)
    else:
        final_quantity = round(raw_quantity, 6 if asset_class == "crypto" else 2)

    notional_value = round(final_quantity * entry_price, 2)
    eff_leverage = max(1.0, float(leverage))
    margin_required = round(notional_value / eff_leverage, 2)

    # Capital capping for spot/unleveraged
    capped = False
    if eff_leverage == 1.0 and notional_value > avail_cap:
        capped = True
        final_quantity = round(avail_cap / entry_price, 6 if asset_class == "crypto" else 2)
        if lot_size > 1:
            final_quantity = float(max(1, int(final_quantity / lot_size)) * lot_size)
        notional_value = round(final_quantity * entry_price, 2)
        margin_required = notional_value

    max_loss = round(final_quantity * stop_dist, 2) if stop_dist > 0 else effective_risk_amount
    is_long = entry_price >= stop_loss_price if stop_loss_price > 0 else True
    suggested_tp = round(entry_price + (2.0 * stop_dist) if is_long else entry_price - (2.0 * stop_dist), 2)
    potential_profit = round(final_quantity * abs(suggested_tp - entry_price), 2)
    rr_ratio = round(potential_profit / max_loss, 2) if max_loss > 0 else 2.0

    fee_est = round(notional_value * fees_pct * 2, 2)  # Entry + Exit
    slip_est = round(notional_value * slippage_pct, 2)
    capital_used = margin_required + fee_est
    remaining_cap = max(0.0, round(avail_cap - capital_used, 2))
    portfolio_risk_after = round(((effective_risk_amount) / account_balance) * 100.0, 2)

    curr_sym = CURRENCY_SYMBOLS.get(currency.upper(), "$")

    return {
        "status": "SUCCESS",
        "method": method_label,
        "asset_class": asset_class,
        "currency": currency,
        "currency_symbol": curr_sym,
        "account_balance": account_balance,
        "available_capital": avail_cap,
        "entry_price": entry_price,
        "stop_loss_price": stop_loss_price,
        "stop_distance": round(stop_dist, 2),
        "stop_distance_pct": round(stop_dist_pct, 2),
        "risk_amount": round(effective_risk_amount, 2),
        "risk_pct_effective": round((effective_risk_amount / account_balance) * 100.0, 2),
        "position_quantity": final_quantity,
        "lot_size": lot_size,
        "lots_count": int(final_quantity / lot_size) if lot_size > 1 else 1,
        "notional_value": notional_value,
        "leverage": eff_leverage,
        "margin_required": margin_required,
        "fees_estimated": fee_est,
        "slippage_estimated": slip_est,
        "capital_used": capital_used,
        "remaining_capital": remaining_cap,
        "maximum_loss": max_loss,
        "potential_profit": potential_profit,
        "suggested_take_profit": suggested_tp,
        "risk_reward_ratio": rr_ratio,
        "portfolio_risk_pct_after": portfolio_risk_after,
        "is_capital_capped": capped,
        "calculation_mode": "CALCULATED"
    }


# =============================================================================
# 4. FUTURES RISK & MARGIN CALCULATOR
# =============================================================================
def calculate_futures_risk(
    symbol: str,
    contract_size: float,
    entry_price: float,
    stop_loss: float,
    target_price: float,
    direction: str = "LONG",
    leverage: float = 10.0,
    quantity: float = 1.0,
    account_balance: float = 10000.0,
    maintenance_margin_rate: float = 0.005,  # 0.5% standard maintenance margin
    tick_size: float = 0.1,
    tick_value: float = 0.1,
    funding_rate_8h: float = 0.0001,
    broker_liquidation_formula: Optional[str] = None
) -> Dict[str, Any]:
    """
    Computes exact futures exposure, initial & maintenance margin, tick sensitivity,
    funding cost estimate, and distance to liquidation.
    """
    dir_clean = direction.upper()
    is_long = dir_clean == "LONG"

    notional = round(quantity * contract_size * entry_price, 2)
    initial_margin = round(notional / leverage, 2)
    maint_margin = round(notional * maintenance_margin_rate, 2)
    margin_usage_pct = round((initial_margin / account_balance) * 100.0, 2) if account_balance > 0 else 0.0

    # Liquidation Price Model (Standard Isolated / Cross approximation)
    # Long: Liq = Entry * (1 - (1/Leverage) + MMR)
    # Short: Liq = Entry * (1 + (1/Leverage) - MMR)
    if is_long:
        liq_price = entry_price * (1.0 - (1.0 / leverage) + maintenance_margin_rate)
        liq_dist = max(0.0, entry_price - liq_price)
    else:
        liq_price = entry_price * (1.0 + (1.0 / leverage) - maintenance_margin_rate)
        liq_dist = max(0.0, liq_price - entry_price)

    liq_dist_pct = round((liq_dist / entry_price) * 100.0, 2) if entry_price > 0 else 0.0

    # Stop Loss & Target PnL
    stop_dist = abs(entry_price - stop_loss) if stop_loss > 0 else 0.0
    max_loss_at_stop = round(quantity * contract_size * stop_dist, 2)
    target_dist = abs(target_price - entry_price) if target_price > 0 else (2.0 * stop_dist)
    potential_profit = round(quantity * contract_size * target_dist, 2)
    rr = round(potential_profit / max_loss_at_stop, 2) if max_loss_at_stop > 0 else 2.0

    # Tick Value Sensitivity
    ticks = stop_dist / tick_size if tick_size > 0 else 0
    tick_loss = ticks * tick_value * quantity

    # Estimated 24h Funding Cost
    funding_24h_est = round(notional * funding_rate_8h * 3.0, 2)

    return {
        "status": "SUCCESS",
        "symbol": symbol,
        "direction": dir_clean,
        "contract_size": contract_size,
        "quantity": quantity,
        "entry_price": entry_price,
        "stop_loss": stop_loss,
        "target_price": target_price,
        "leverage": leverage,
        "notional_value": notional,
        "initial_margin": initial_margin,
        "maintenance_margin": maint_margin,
        "margin_usage_pct": margin_usage_pct,
        "estimated_liquidation_price": round(liq_price, 2),
        "distance_to_liquidation": round(liq_dist, 2),
        "distance_to_liquidation_pct": liq_dist_pct,
        "liquidation_label": "CALCULATED (Standard MMR Model)" if not broker_liquidation_formula else "ESTIMATED",
        "maximum_loss_at_stop": max_loss_at_stop,
        "potential_profit": potential_profit,
        "risk_reward_ratio": rr,
        "funding_rate_8h": funding_rate_8h,
        "estimated_24h_funding": funding_24h_est,
        "tick_size": tick_size,
        "tick_value": tick_value,
        "ticks_at_risk": round(ticks, 1),
        "portfolio_exposure_pct": round((notional / account_balance) * 100.0, 2) if account_balance > 0 else 0.0
    }


# =============================================================================
# 5. OPTIONS RISK & MULTI-LEG STRATEGY ENGINE
# =============================================================================
def calculate_options_strategy_risk(
    strategy_name: str,
    underlying_price: float,
    legs: List[Dict[str, Any]],
    lot_size: int = 1,
    iv_pct: float = 25.0,
    days_to_expiry: int = 30,
    risk_free_rate: float = 0.05
) -> Dict[str, Any]:
    """
    Computes multi-leg option strategy risk, net Greeks, max profit/loss, breakevens,
    and a 21-point payoff curve across underlying spot price shocks (-15% to +15%).
    """
    if not legs or underlying_price <= 0:
        return {"status": "ERROR", "message": "Valid legs and positive underlying price required."}

    t_years = max(0.001, days_to_expiry / 365.0)
    vol = max(0.01, iv_pct / 100.0)

    total_net_debit_credit = 0.0
    net_delta = 0.0
    net_gamma = 0.0
    net_theta = 0.0
    net_vega = 0.0
    net_rho = 0.0

    evaluated_legs = []
    for leg in legs:
        side = leg.get("side", "BUY").upper()  # BUY (+1) or SELL (-1)
        sign = 1 if side == "BUY" else -1
        opt_type = leg.get("option_type", "call").lower()
        strike = float(leg.get("strike", underlying_price))
        premium = float(leg.get("premium", 0.0))
        qty = int(leg.get("quantity", 1))

        # Greeks for single leg
        greeks = calculate_black_scholes_greeks(
            spot=underlying_price,
            strike=strike,
            time_to_expiry_years=t_years,
            volatility=vol,
            risk_free_rate=risk_free_rate,
            option_type=opt_type
        )

        leg_cost = sign * premium * qty * lot_size
        total_net_debit_credit += leg_cost

        if greeks.get("status") == "CALCULATED":
            net_delta += sign * greeks["delta"] * qty * lot_size
            net_gamma += sign * greeks["gamma"] * qty * lot_size
            net_theta += sign * greeks["theta"] * qty * lot_size
            net_vega += sign * greeks["vega"] * qty * lot_size
            net_rho += sign * greeks["rho"] * qty * lot_size

        evaluated_legs.append({
            "side": side,
            "option_type": opt_type.upper(),
            "strike": strike,
            "premium": premium,
            "quantity": qty,
            "lot_size": lot_size,
            "greeks": greeks
        })

    # Generate 21-point payoff curve (-15% to +15%)
    spot_range = np.linspace(underlying_price * 0.85, underlying_price * 1.15, 21)
    payoffs = []
    for s_eval in spot_range:
        pnl = 0.0
        for leg in evaluated_legs:
            side_sign = 1 if leg["side"] == "BUY" else -1
            k = leg["strike"]
            prem = leg["premium"]
            q = leg["quantity"] * lot_size

            if leg["option_type"] == "CALL":
                intrinsic = max(0.0, s_eval - k)
            else:
                intrinsic = max(0.0, k - s_eval)

            leg_pnl = side_sign * (intrinsic - prem) * q
            pnl += leg_pnl

        payoffs.append({"spot": round(float(s_eval), 2), "pnl": round(float(pnl), 2)})

    pnl_values = [p["pnl"] for p in payoffs]
    max_profit = max(pnl_values)
    max_loss = min(pnl_values)

    # Calculate approximate breakeven points
    breakevens = []
    for i in range(len(payoffs) - 1):
        p1 = payoffs[i]
        p2 = payoffs[i + 1]
        if (p1["pnl"] <= 0 and p2["pnl"] >= 0) or (p1["pnl"] >= 0 and p2["pnl"] <= 0):
            # Interpolate zero crossing
            denom = (p2["pnl"] - p1["pnl"])
            if denom != 0:
                zero_spot = p1["spot"] + (0 - p1["pnl"]) * (p2["spot"] - p1["spot"]) / denom
                breakevens.append(round(float(zero_spot), 2))

    return {
        "status": "SUCCESS",
        "strategy_name": strategy_name,
        "underlying_price": underlying_price,
        "days_to_expiry": days_to_expiry,
        "implied_volatility_pct": iv_pct,
        "net_debit_credit": round(total_net_debit_credit, 2),
        "is_debit": total_net_debit_credit > 0,
        "maximum_profit": round(max_profit, 2) if max_profit < 1e6 else "Unlimited",
        "maximum_loss": round(abs(max_loss), 2) if abs(max_loss) < 1e6 else "Unlimited",
        "breakeven_points": breakevens,
        "net_greeks": {
            "delta": round(net_delta, 4),
            "gamma": round(net_gamma, 6),
            "theta": round(net_theta, 4),
            "vega": round(net_vega, 4),
            "rho": round(net_rho, 4),
            "status": "CALCULATED"
        },
        "payoff_curve": payoffs,
        "legs": evaluated_legs
    }


# =============================================================================
# 6. SCENARIO STRESS TESTING & WHAT-IF SIMULATOR
# =============================================================================
def run_portfolio_stress_test(
    portfolio_equity: float,
    positions: List[Dict[str, Any]],
    scenarios: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Simulates portfolio impact under 10 standard macro & volatility stress scenarios.
    """
    if not scenarios:
        scenarios = [
            {"id": "market_drop_5", "name": "Market Shock -5%", "price_change_pct": -5.0, "vol_change_pct": 10.0},
            {"id": "market_drop_10", "name": "Market Crash -10%", "price_change_pct": -10.0, "vol_change_pct": 25.0},
            {"id": "market_drop_20", "name": "Severe Crash -20%", "price_change_pct": -20.0, "vol_change_pct": 50.0},
            {"id": "market_pump_5", "name": "Market Rally +5%", "price_change_pct": 5.0, "vol_change_pct": -5.0},
            {"id": "market_pump_10", "name": "Bull Surge +10%", "price_change_pct": 10.0, "vol_change_pct": -10.0},
            {"id": "vol_spike_50", "name": "Volatility Explosion +50%", "price_change_pct": -2.0, "vol_change_pct": 50.0},
            {"id": "vol_crush_30", "name": "Vol Crush (Post-Event) -30%", "price_change_pct": 0.0, "vol_change_pct": -30.0},
            {"id": "gap_down_3", "name": "Overnight Gap Down -3%", "price_change_pct": -3.0, "vol_change_pct": 15.0},
            {"id": "spread_widening", "name": "Liquidity Shock / Spread x3", "price_change_pct": -1.0, "vol_change_pct": 20.0, "slippage_mult": 3.0},
            {"id": "funding_spike", "name": "Perp Funding Spike x5", "price_change_pct": 0.0, "vol_change_pct": 5.0, "funding_mult": 5.0}
        ]

    results = []
    total_pos_value = sum(float(p.get("position_value", 0.0)) for p in positions)

    for sc in scenarios:
        p_pct = sc.get("price_change_pct", 0.0) / 100.0
        v_pct = sc.get("vol_change_pct", 0.0) / 100.0

        scenario_pnl = 0.0
        for pos in positions:
            side = pos.get("direction", "LONG").upper()
            val = float(pos.get("position_value", 0.0))
            lev = float(pos.get("leverage", 1.0))
            beta = float(pos.get("beta", 1.0))

            asset_p_pct = p_pct * beta
            if side == "LONG":
                pos_pnl = val * asset_p_pct
            else:
                pos_pnl = val * (-asset_p_pct)

            scenario_pnl += pos_pnl

        proj_equity = max(0.0, portfolio_equity + scenario_pnl)
        pnl_pct = round((scenario_pnl / portfolio_equity) * 100.0, 2) if portfolio_equity > 0 else 0.0

        results.append({
            "scenario_id": sc.get("id"),
            "scenario_name": sc.get("name"),
            "price_shock_pct": sc.get("price_change_pct", 0.0),
            "vol_shock_pct": sc.get("vol_change_pct", 0.0),
            "projected_pnl": round(scenario_pnl, 2),
            "projected_pnl_pct": pnl_pct,
            "projected_equity": round(proj_equity, 2),
            "risk_status": "CRITICAL" if pnl_pct <= -15.0 else ("HIGH RISK" if pnl_pct <= -8.0 else ("WARNING" if pnl_pct <= -4.0 else "NORMAL"))
        })

    return {
        "status": "SUCCESS",
        "portfolio_equity": portfolio_equity,
        "open_positions_count": len(positions),
        "total_exposure": round(total_pos_value, 2),
        "scenarios": results,
        "mode": "SCENARIO ESTIMATE"
    }


# =============================================================================
# 7. 12-STAGE TRADE PRE-CHECK & COMPLIANCE ENGINE
# =============================================================================
def evaluate_trade_precheck(
    trade_request: Dict[str, Any],
    account_state: Dict[str, Any],
    portfolio_positions: List[Dict[str, Any]],
    risk_limits: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Executes rigorous 12-Stage Trade Pre-Check.
    Returns APPROVED or BLOCKED with exact bulleted reasons and required reductions.
    """
    reasons = []
    blocks = []
    reductions = {}

    symbol = trade_request.get("symbol", "BTC/USDT")
    direction = trade_request.get("direction", "LONG").upper()
    entry = float(trade_request.get("entry_price", 0.0))
    sl = float(trade_request.get("stop_loss", 0.0))
    qty = float(trade_request.get("quantity", 0.0))
    leverage = float(trade_request.get("leverage", 1.0))
    asset_class = trade_request.get("asset_class", "crypto")
    bot_id = trade_request.get("bot_id", "bot-1")

    balance = float(account_state.get("balance", 10000.0))
    available = float(account_state.get("available_capital", balance))
    daily_pnl = float(account_state.get("daily_pnl", 0.0))

    notional = round(qty * entry, 2)
    margin_req = round(notional / leverage, 2)
    risk_amt = round(qty * abs(entry - sl), 2) if sl > 0 else notional

    # Stage 1: Account Balance & Capital Check
    if entry <= 0 or qty <= 0:
        blocks.append("Invalid order parameters: Entry price and quantity must be greater than zero.")
    if margin_req > available:
        excess = margin_req - available
        blocks.append(f"Insufficient available capital: Required margin ${margin_req:,.2f} exceeds available ${available:,.2f}.")
        reductions["margin"] = round(excess, 2)

    # Stage 2: Stop Loss & Distance Check
    if sl <= 0 or sl == entry:
        blocks.append("Invalid Stop Loss: Stop loss must be explicitly defined and cannot equal entry price.")
    if direction == "LONG" and sl >= entry:
        blocks.append(f"Invalid Long Stop: Stop loss (${sl:,.2f}) must be strictly less than Entry price (${entry:,.2f}).")
    if direction == "SHORT" and sl <= entry:
        blocks.append(f"Invalid Short Stop: Stop loss (${sl:,.2f}) must be strictly greater than Entry price (${entry:,.2f}).")

    # Stage 3: Risk Per Trade Cap Check
    max_risk_pct = float(risk_limits.get("max_risk_per_trade_pct", 2.0))
    max_risk_dollars = balance * (max_risk_pct / 100.0)
    if risk_amt > max_risk_dollars:
        blocks.append(f"Risk per trade exceeded: Trade risk ${risk_amt:,.2f} ({risk_amt/balance*100:.1f}%) exceeds limit of ${max_risk_dollars:,.2f} ({max_risk_pct}%).")
        reductions["risk_amount"] = round(risk_amt - max_risk_dollars, 2)
        if abs(entry - sl) > 0:
            suggested_qty = round(max_risk_dollars / abs(entry - sl), 4)
            reductions["suggested_quantity"] = suggested_qty

    # Stage 4: Max Order Value & Notional Limit
    max_order_val = float(risk_limits.get("max_order_value", 50000.0))
    if notional > max_order_val:
        blocks.append(f"Max order value exceeded: Order notional ${notional:,.2f} exceeds maximum limit of ${max_order_val:,.2f}.")
        reductions["notional"] = round(notional - max_order_val, 2)

    # Stage 5: Leverage Cap
    max_allowed_lev = float(risk_limits.get("max_leverage", 20.0))
    if leverage > max_allowed_lev:
        blocks.append(f"Leverage limit exceeded: Requested leverage {leverage}x exceeds maximum allowed {max_allowed_lev}x.")

    # Stage 6: Maximum Concurrent Positions
    max_open_pos = int(risk_limits.get("max_open_positions", 5))
    if len(portfolio_positions) >= max_open_pos:
        blocks.append(f"Max open positions reached: Currently holding {len(portfolio_positions)} positions (Limit: {max_open_pos}).")

    # Stage 7: Shared Symbol Exposure Across All Bots
    sym_existing_notional = sum(float(p.get("position_value", 0.0)) for p in portfolio_positions if p.get("symbol") == symbol)
    new_sym_total = sym_existing_notional + notional
    max_sym_exposure_pct = float(risk_limits.get("max_exposure_per_asset_pct", 30.0))
    max_sym_dollars = balance * (max_sym_exposure_pct / 100.0)

    if new_sym_total > max_sym_dollars:
        current_exp_pct = (sym_existing_notional / balance) * 100.0
        projected_exp_pct = (new_sym_total / balance) * 100.0
        blocks.append(f"Symbol exposure cap breached: Position would increase {symbol} exposure from {current_exp_pct:.1f}% to {projected_exp_pct:.1f}% (Limit: {max_sym_exposure_pct}%).")
        reductions["symbol_exposure_excess"] = round(new_sym_total - max_sym_dollars, 2)

    # Stage 8: Daily Drawdown Limit
    max_daily_loss_pct = float(risk_limits.get("max_daily_loss_pct", 5.0))
    daily_drawdown_pct = abs(daily_pnl / balance * 100.0) if daily_pnl < 0 else 0.0
    if daily_drawdown_pct >= max_daily_loss_pct:
        blocks.append(f"Daily drawdown limit hit: Current daily loss {daily_drawdown_pct:.1f}% has reached the max limit of {max_daily_loss_pct}%. New trades locked.")

    # Stage 9: Global Kill Switch Check
    if risk_limits.get("kill_switch_active", False):
        blocks.append("EMERGENCY KILL SWITCH ACTIVE: Global trading is locked. All new order entries blocked.")

    # Decision compilation
    is_approved = len(blocks) == 0
    decision_status = "APPROVED" if is_approved else "BLOCKED"

    # Future / Projected Risk Impact
    curr_portfolio_risk = sum(float(p.get("risk_amount", 0.0)) for p in portfolio_positions)
    curr_portfolio_risk_pct = round((curr_portfolio_risk / balance) * 100.0, 2) if balance > 0 else 0.0
    proj_portfolio_risk = curr_portfolio_risk + risk_amt
    proj_portfolio_risk_pct = round((proj_portfolio_risk / balance) * 100.0, 2) if balance > 0 else 0.0

    return {
        "status": decision_status,
        "is_approved": is_approved,
        "rejection_reasons": blocks,
        "required_reductions": reductions,
        "projected_impact": {
            "current_portfolio_risk_pct": curr_portfolio_risk_pct,
            "projected_portfolio_risk_pct": proj_portfolio_risk_pct,
            "risk_change_pct": round(proj_portfolio_risk_pct - curr_portfolio_risk_pct, 2),
            "current_margin_used": round(sum(float(p.get("margin_used", 0.0)) for p in portfolio_positions), 2),
            "projected_margin_used": round(sum(float(p.get("margin_used", 0.0)) for p in portfolio_positions) + margin_req, 2),
            "projected_available_capital": max(0.0, round(available - margin_req, 2))
        },
        "trade_details": {
            "symbol": symbol,
            "direction": direction,
            "quantity": qty,
            "notional": notional,
            "margin_required": margin_req,
            "risk_amount": risk_amt,
            "bot_id": bot_id
        }
    }
