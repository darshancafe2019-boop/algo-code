import logging
from typing import Dict, Any, Tuple
from src import config, db

logger = logging.getLogger("OrderRouter")


class MultiAssetOrderRouter:
    """
    Asset-class specific Order Router with Live Trading Protection & Safety Flags.
    Routes signals to Crypto, Stock (Indian/Global), or Forex Execution Adapters.
    """

    @staticmethod
    def route_order(
        symbol: str,
        signal_type: str,
        position_size: float,
        price: float,
        asset_class: str = "Crypto",
        is_live: bool = False
    ) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Routes order to appropriate adapter while verifying safety controls.
        """
        # Safety Check 1: Instrument controls
        inst = db.get_market_instrument(symbol)
        if inst:
            if is_live and not inst.get("live_enabled", False):
                return False, f"Live trading disabled for instrument '{symbol}'. Must explicitly activate Live control.", {}
            if inst.get("tradability") == "DATA_ONLY":
                return False, f"Instrument '{symbol}' is DATA ONLY. Execution adapter unavailable.", {}


        # Safety Check 2: Global & Asset-Class Safety Flags
        master_live = getattr(config, "MASTER_LIVE_TRADING", False)
        if is_live and not master_live:
            return False, "MASTER_LIVE_TRADING is OFF. Live order rejected.", {}

        if is_live:
            if asset_class == "Crypto" and not getattr(config, "CRYPTO_LIVE_TRADING", True):
                return False, "CRYPTO_LIVE_TRADING flag is disabled.", {}
            elif asset_class == "Stock" and inst and inst.get("country") == "IN" and not getattr(config, "INDIAN_STOCK_LIVE_TRADING", False):
                return False, "INDIAN_STOCK_LIVE_TRADING flag is disabled.", {}
            elif asset_class == "Stock" and inst and inst.get("country") != "IN" and not getattr(config, "GLOBAL_STOCK_LIVE_TRADING", False):
                return False, "GLOBAL_STOCK_LIVE_TRADING flag is disabled.", {}
            elif asset_class == "Forex" and not getattr(config, "FOREX_LIVE_TRADING", False):
                return False, "FOREX_LIVE_TRADING flag is disabled.", {}

        # Route to Adapter
        if asset_class == "Crypto":
            adapter_name = "CCXT Binance Adapter"
        elif asset_class == "Stock" and inst and inst.get("country") == "IN":
            adapter_name = "Indian Stock Broker Adapter (NSE Paper/Zerodha)"
        elif asset_class == "Stock":
            adapter_name = "Global Stock Broker Adapter (Alpaca/Paper)"
        elif asset_class == "Forex":
            adapter_name = "Forex Broker Adapter (OANDA Paper)"
        else:
            adapter_name = "Paper Execution Adapter"

        mode_str = "LIVE REAL-MONEY" if is_live else "PAPER SIMULATION"
        logger.info(f"Routed {signal_type} for {symbol} ({asset_class}) via {adapter_name} [{mode_str}] @ ${price:,.2f}")

        return True, f"Order routed successfully via {adapter_name} [{mode_str}]", {
            "adapter": adapter_name,
            "symbol": symbol,
            "signal_type": signal_type,
            "price": price,
            "size": position_size,
            "mode": mode_str
        }
