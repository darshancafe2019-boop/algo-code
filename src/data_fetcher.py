import time
import logging
import threading
from typing import Optional, Dict
import pandas as pd
import ccxt
from src import config

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("DataFetcher")


class DataFetcher:
    """
    Handles fetching of historical and live crypto market data using ccxt.
    Uses Binance Mainnet public endpoints for historical data (no API key needed).
    Uses Binance Testnet (Sandbox) for live runner order/balance checks if configured.
    Implements a thread-safe singleton pattern per environment (Mainnet/Testnet).
    """
    _instances: Dict[bool, "DataFetcher"] = {}
    _lock = threading.Lock()

    def __new__(cls, use_testnet: bool = False):
        with cls._lock:
            if use_testnet not in cls._instances:
                instance = super(DataFetcher, cls).__new__(cls)
                instance._initialized = False
                cls._instances[use_testnet] = instance
            return cls._instances[use_testnet]

    def __init__(self, use_testnet: bool = False):
        if getattr(self, "_initialized", False):
            return
        self.use_testnet = use_testnet
        
        if self.use_testnet:
            logger.info("Initializing CCXT Binance in TESTNET mode.")
            # Set credentials for Testnet
            self.exchange = ccxt.binance({
                'apiKey': config.BINANCE_TESTNET_API_KEY,
                'secret': config.BINANCE_TESTNET_SECRET_KEY,
                'enableRateLimit': True,
                'timeout': 10000,
            })
            self.exchange.set_sandbox_mode(True)
        else:
            logger.info("Initializing CCXT Binance in MAINNET mode (Public endpoints).")
            # Public mainnet needs no API credentials
            self.exchange = ccxt.binance({
                'enableRateLimit': True,
                'timeout': 10000,
            })
        self._initialized = True

    def fetch_historical_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        start_date_str: str,
        end_date_str: Optional[str] = None
    ) -> pd.DataFrame:
        """
        Fetches historical OHLCV candles from Binance Mainnet by handling pagination.
        
        Args:
            symbol (str): The trading pair, e.g. "BTC/USDT".
            timeframe (str): Candle timeframe, e.g. "1h", "4h".
            start_date_str (str): Start date string (YYYY-MM-DD).
            end_date_str (str, optional): End date string (YYYY-MM-DD). If None, fetches up to now.
            
        Returns:
            pd.DataFrame: Pandas DataFrame with columns: [timestamp, open, high, low, close, volume]
        """
        # Ensure we use Mainnet public endpoint for deep historical data
        if self.use_testnet:
            logger.warning("Forcing Mainnet connection for deep historical data fetch.")
            mainnet_exchange = get_mainnet_fetcher().exchange
        else:
            mainnet_exchange = self.exchange

        # Parse start and end times to milliseconds
        since = int(pd.to_datetime(start_date_str, utc=True).timestamp() * 1000)
        end_time = int(pd.to_datetime(end_date_str, utc=True).timestamp() * 1000) if end_date_str else None

        all_candles = []
        limit = 1000  # Binance maximum candle limit per request
        
        logger.info(f"Starting historical fetch for {symbol} {timeframe} from {start_date_str}...")

        while True:
            try:
                # Fetch chunk of candles
                candles = mainnet_exchange.fetch_ohlcv(
                    symbol=symbol,
                    timeframe=timeframe,
                    since=since,
                    limit=limit
                )
                
                if not candles:
                    logger.info("No more candles returned by the API.")
                    break
                
                # Check if the last candle exceeds our end_time (if defined)
                last_timestamp = candles[-1][0]
                
                all_candles.extend(candles)
                
                # Next request starts right after the last candle received
                since = last_timestamp + 1
                
                # Progress logging
                last_date = pd.to_datetime(last_timestamp, unit='ms')
                logger.info(f"Fetched {len(candles)} candles. Latest timestamp: {last_date}")

                # Stop conditions
                if len(candles) < limit:
                    logger.info("Fetched final chunk of candles.")
                    break
                
                if end_time and last_timestamp >= end_time:
                    logger.info(f"Reached end date limit: {end_date_str}")
                    break

                # Sleep to respect rate limits
                time.sleep(mainnet_exchange.rateLimit / 1000.0)

            except ccxt.NetworkError as ne:
                logger.error(f"Network error during fetch: {ne}. Retrying in 10 seconds...")
                time.sleep(10)
            except ccxt.ExchangeError as ee:
                logger.error(f"Exchange error during fetch: {ee}. Stopping fetch.")
                break
            except Exception as e:
                logger.error(f"Unexpected error: {e}. Stopping fetch.")
                break

        # Process candles into a dataframe
        if not all_candles:
            return pd.DataFrame()

        df = pd.DataFrame(
            all_candles,
            columns=["timestamp", "open", "high", "low", "close", "volume"]
        )
        
        # Deduplicate and sort
        df.drop_duplicates(subset=["timestamp"], inplace=True)
        df.sort_values(by="timestamp", inplace=True)
        df.reset_index(drop=True, inplace=True)

        # Filter out rows beyond end_time if end_time was specified
        if end_time:
            df = df[df["timestamp"] <= end_time]

        return df

    def fetch_live_ohlcv(self, symbol: str, timeframe: str, limit: int = 500) -> pd.DataFrame:
        """
        Fetches the most recent live candles for indicator calculations.
        If use_testnet is True, checks credentials. Note that Testnet candles can be
        unstable/disjointed, so using Mainnet public endpoint is generally preferred
        for live indicator checks unless explicitly required.
        
        Args:
            symbol (str): The trading pair, e.g. "BTC/USDT".
            timeframe (str): Candle timeframe, e.g. "1h", "4h".
            limit (int): Number of recent candles to fetch (e.g. 500 to cover 200 EMA).
            
        Returns:
            pd.DataFrame: Pandas DataFrame of recent candles.
        """
        try:
            candles = self.exchange.fetch_ohlcv(
                symbol=symbol,
                timeframe=timeframe,
                limit=limit
            )
            df = pd.DataFrame(
                candles,
                columns=["timestamp", "open", "high", "low", "close", "volume"]
            )
            df.sort_values(by="timestamp", inplace=True)
            df.reset_index(drop=True, inplace=True)
            return df
        except ccxt.RateLimitExceeded as rle:
            logger.error(f"CCXT Rate Limit Exceeded (429) for {symbol} {timeframe}: {rle}. Backing off 30s...")
            time.sleep(30)
            raise rle
        except (ccxt.RequestTimeout, ccxt.NetworkError) as net_err:
            logger.error(f"CCXT Network/Timeout error for {symbol} {timeframe}: {net_err}")
            raise net_err
        except Exception as e:
            logger.error(f"Error fetching live OHLCV for {symbol} {timeframe}: {e}")
            raise e

    def fetch_testnet_balance(self) -> float:
        """
        Fetches the USDT balance of the Binance Testnet account.
        This verifies that the credentials work on Testnet.
        
        Returns:
            float: Available USDT balance.
        """
        if not self.use_testnet:
            raise ValueError("Testnet balance can only be fetched when initialized in TESTNET mode.")
            
        try:
            balance = self.exchange.fetch_balance()
            usdt_balance = balance.get('USDT', {}).get('free', 0.0)
            logger.info(f"Testnet free USDT balance: {usdt_balance}")
            return float(usdt_balance)
        except Exception as e:
            logger.error(f"Error fetching Testnet balance: {e}")
            raise e


def get_mainnet_fetcher() -> DataFetcher:
    """Return the shared thread-safe singleton DataFetcher for Binance Mainnet."""
    return DataFetcher(use_testnet=False)


def get_testnet_fetcher() -> DataFetcher:
    """Return the shared thread-safe singleton DataFetcher for Binance Testnet."""
    return DataFetcher(use_testnet=True)

