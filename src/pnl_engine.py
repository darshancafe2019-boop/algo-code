import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("PnLEngine")

# Currency Conversion Rates to USD baseline (Dynamic/Configurable)
CURRENCY_RATES_TO_USD = {
    "USD": 1.0,
    "USDT": 1.0,
    "USDC": 1.0,
    "BUSD": 1.0,
    "INR": 0.0115,   # ~87 INR per USD
    "EUR": 1.08,
    "GBP": 1.28
}


def normalize_currency_amount(
    amount: float,
    from_currency: str = "USDT",
    to_currency: str = "USD"
) -> Dict[str, Any]:
    """
    Normalizes monetary values across multiple currencies to prevent illegal cross-currency direct aggregation.
    """
    src_curr = (from_currency or "USDT").upper()
    dst_curr = (to_currency or "USD").upper()

    usd_pegs = {"USD", "USDT", "USDC", "BUSD"}
    if src_curr == dst_curr or (src_curr in usd_pegs and dst_curr in usd_pegs):
        return {
            "original_amount": amount,
            "original_currency": src_curr,
            "normalized_amount": round(amount, 2),
            "normalized_currency": dst_curr,
            "exchange_rate": 1.0,
            "is_converted": False
        }

    src_rate = CURRENCY_RATES_TO_USD.get(src_curr, 1.0)
    dst_rate = CURRENCY_RATES_TO_USD.get(dst_curr, 1.0)

    # Convert src -> USD -> dst
    usd_val = amount * src_rate
    final_val = (usd_val / dst_rate) if dst_rate > 0 else usd_val

    return {
        "original_amount": amount,
        "original_currency": src_curr,
        "normalized_amount": round(final_val, 2),
        "normalized_currency": dst_curr,
        "exchange_rate": round(src_rate / dst_rate, 4) if dst_rate > 0 else 1.0,
        "is_converted": True
    }


def compute_authoritative_pnl(
    direction: str,
    entry_price: float,
    exit_price: float,
    quantity: float,
    fees: float = 0.0,
    slippage: float = 0.0,
    funding: float = 0.0,
    taxes: float = 0.0,
    stop_loss: Optional[float] = None,
    currency: str = "USDT"
) -> Dict[str, Any]:
    """
    Single Authoritative P&L Calculation Engine for all pages, dashboards, and audit ledgers.

    Formulas:
    - Long Gross P&L:  (exit_price - entry_price) * quantity
    - Short Gross P&L: (entry_price - exit_price) * quantity
    - Net P&L: Gross P&L - fees - slippage - funding - taxes
    - P&L %: (Net P&L / (entry_price * quantity)) * 100
    - R-Multiple: (Profit per unit / Planned risk per unit)
    """
    is_long = direction.upper() in ["LONG", "BUY"]
    qty = abs(float(quantity or 0.0))
    entry_p = float(entry_price or 0.0)
    exit_p = float(exit_price or 0.0)
    f_total = float(fees or 0.0)
    slip_total = float(slippage or 0.0)
    fund_total = float(funding or 0.0)
    tax_total = float(taxes or 0.0)

    if qty <= 0 or entry_p <= 0:
        return {
            "gross_pnl": 0.0,
            "net_pnl": 0.0,
            "pnl_percentage": 0.0,
            "r_multiple": 0.0,
            "fees": f_total,
            "slippage": slip_total,
            "funding": fund_total,
            "taxes": tax_total,
            "currency": currency,
            "direction": direction
        }

    # Gross P&L
    if is_long:
        gross_pnl = (exit_p - entry_p) * qty
    else:
        gross_pnl = (entry_p - exit_p) * qty

    # Total Deductions
    total_costs = f_total + slip_total + fund_total + tax_total

    # Net P&L
    net_pnl = gross_pnl - total_costs

    # P&L Percentage
    notional = entry_p * qty
    pnl_pct = (net_pnl / notional * 100.0) if notional > 0 else 0.0

    # R-Multiple Calculation
    sl = float(stop_loss or 0.0)
    if sl > 0:
        planned_risk_per_unit = abs(entry_p - sl)
    else:
        planned_risk_per_unit = entry_p * 0.02

    profit_per_unit = (exit_p - entry_p) if is_long else (entry_p - exit_p)
    r_multiple = round(profit_per_unit / planned_risk_per_unit, 2) if planned_risk_per_unit > 0 else 0.0

    return {
        "gross_pnl": round(gross_pnl, 2),
        "net_pnl": round(net_pnl, 2),
        "pnl_percentage": round(pnl_pct, 2),
        "r_multiple": r_multiple,
        "fees": round(f_total, 2),
        "slippage": round(slip_total, 2),
        "funding": round(fund_total, 2),
        "taxes": round(tax_total, 2),
        "total_costs": round(total_costs, 2),
        "notional_value": round(notional, 2),
        "currency": currency,
        "direction": direction,
        "is_win": net_pnl > 0,
        "is_loss": net_pnl < 0,
        "is_breakeven": net_pnl == 0
    }


def compute_unrealized_pnl(
    direction: str,
    entry_price: float,
    live_price: float,
    quantity: float,
    estimated_fees: float = 0.0
) -> Dict[str, Any]:
    """
    Computes real-time mark-to-market unrealized P&L for open positions.
    """
    is_long = direction.upper() in ["LONG", "BUY"]
    qty = abs(float(quantity or 0.0))
    entry_p = float(entry_price or 0.0)
    live_p = float(live_price or 0.0)

    if qty <= 0 or entry_p <= 0 or live_p <= 0:
        return {
            "unrealized_gross_pnl": 0.0,
            "unrealized_net_pnl": 0.0,
            "unrealized_pnl_pct": 0.0
        }

    if is_long:
        gross_upnl = (live_p - entry_p) * qty
    else:
        gross_upnl = (entry_p - live_p) * qty

    net_upnl = gross_upnl - float(estimated_fees)
    notional = entry_p * qty
    upnl_pct = (net_upnl / notional * 100.0) if notional > 0 else 0.0

    return {
        "unrealized_gross_pnl": round(gross_upnl, 2),
        "unrealized_net_pnl": round(net_upnl, 2),
        "unrealized_pnl_pct": round(upnl_pct, 2)
    }
