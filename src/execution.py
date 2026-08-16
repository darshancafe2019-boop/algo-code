import logging
from typing import Any, Dict

logger = logging.getLogger("ExecutionEngine")


class ExecutionEngine:
    """Simple execution wrapper around a CCXT exchange instance.

    Designed for Binance Spot Testnet usage. Methods will load markets,
    round amounts using exchange helpers, validate against market limits,
    and submit market orders.
    """

    def __init__(self, exchange: Any):
        self.exchange = exchange
        try:
            # Ensure market metadata is available
            self.exchange.load_markets()
        except Exception as e:
            logger.warning("ExecutionEngine: failed to load markets: %s", e)

    def _check_minimums(self, symbol: str, amount: float, ref_price: float) -> None:
        market = self.exchange.market(symbol)
        limits = market.get('limits', {}) if market else {}
        amount_limit = limits.get('amount', {})
        min_amount = amount_limit.get('min')
        if min_amount is not None and amount < float(min_amount):
            raise ValueError(f"Amount {amount} below market minimum amount {min_amount} for {symbol}")

        cost_limit = limits.get('cost', {})
        min_cost = cost_limit.get('min')
        if min_cost is not None:
            cost = float(amount) * float(ref_price)
            if cost < float(min_cost):
                raise ValueError(f"Order cost {cost} below market minimum cost {min_cost} for {symbol}")

    def market_buy(self, symbol: str, amount: float, ref_price: float) -> Dict[str, Any]:
        amt = float(amount)
        try:
            # Use exchange helper to round to proper precision
            amt = float(self.exchange.amount_to_precision(symbol, amt))
        except Exception:
            amt = round(amt, 8)

        # Validate against market minima using provided ref_price
        self._check_minimums(symbol, amt, ref_price)

        order = self.exchange.create_order(symbol, 'market', 'buy', amt)

        filled = order.get('filled') if order.get('filled') is not None else amt
        average = order.get('average') if order.get('average') is not None else ref_price

        return {
            'order_id': order.get('id'),
            'filled_amount': float(filled),
            'average_price': float(average),
            'raw': order,
        }

    def market_sell(self, symbol: str, amount: float, ref_price: float) -> Dict[str, Any]:
        amt = float(amount)
        try:
            amt = float(self.exchange.amount_to_precision(symbol, amt))
        except Exception:
            amt = round(amt, 8)

        self._check_minimums(symbol, amt, ref_price)

        order = self.exchange.create_order(symbol, 'market', 'sell', amt)

        filled = order.get('filled') if order.get('filled') is not None else amt
        average = order.get('average') if order.get('average') is not None else ref_price

        return {
            'order_id': order.get('id'),
            'filled_amount': float(filled),
            'average_price': float(average),
            'raw': order,
        }
