import os
from pathlib import Path
from dotenv import load_dotenv

# ==========================================
# LOAD ENVIRONMENT VARIABLES
# ==========================================
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

# ==========================================
# EXCHANGE & TELEGRAM KEYS
# ==========================================
BINANCE_TESTNET_API_KEY = os.getenv("BINANCE_TESTNET_API_KEY", "")
BINANCE_TESTNET_SECRET_KEY = os.getenv("BINANCE_TESTNET_SECRET_KEY", "")

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

# ==========================================
# FILE PATHS & DIRECTORIES
# ==========================================
BASE_DIR = Path(__file__).resolve().parent.parent

DB_PATH = BASE_DIR / os.getenv("DB_PATH", "data/trading_bot.db")
BACKUP_PATH = BASE_DIR / os.getenv("BACKUP_PATH", "backup/")
DATA_DIR = BASE_DIR / "data"
LOG_DIR = BASE_DIR / "logs"

DB_PATH.parent.mkdir(parents=True, exist_ok=True)
BACKUP_PATH.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)

# ==========================================
# BOT IDENTIFICATION & EXECUTION SAFETY FLAGS
# ==========================================
BOT_NAME = os.getenv("BOT_NAME", "BTC Trading Bot")
EXCHANGE_NAME = os.getenv("EXCHANGE_NAME", "Binance")
TRADING_MODE = os.getenv("TRADING_MODE", "PAPER")
LIVE_TRADING_ENABLED = os.getenv("LIVE_TRADING_ENABLED", "false").lower() == "true"
MASTER_LIVE_TRADING = os.getenv("MASTER_LIVE_TRADING", "false").lower() == "true"

# Server-side in-memory safety state (Resets to False on launch/restart)
LIVE_TRADING_ARMED = False
POSITION_MISMATCH_LOCKED = False
KILL_SWITCH_FILE = DATA_DIR / "KILL_SWITCH"
GLOBAL_KILL_SWITCH = False

REQUIRE_SIGNAL_APPROVAL = os.getenv("REQUIRE_SIGNAL_APPROVAL", "true").lower() == "true"
SIGNAL_THRESHOLD_PCT = float(os.getenv("SIGNAL_THRESHOLD_PCT", "75.0"))

# ==========================================
# TESTING MODE
# ==========================================
TEST_MODE = os.getenv("TEST_MODE", "false").lower() == "true"
PAPER_TRADING = os.getenv("PAPER_TRADING", "true").lower() == "true"
VERBOSE_LOGGING = os.getenv("VERBOSE_LOGGING", "true").lower() == "true"
FORCE_TEST_SIGNAL = os.getenv("FORCE_TEST_SIGNAL", "false").lower() == "true"
TEST_TELEGRAM_ONLY = os.getenv("TEST_TELEGRAM_ONLY", "false").lower() == "true"

# ==========================================
# SERVER-SIDE HARD SAFETY LIMITS
# ==========================================
MAX_POSITION_SIZE = float(os.getenv("MAX_POSITION_SIZE", "1.0"))
MAX_ORDER_VALUE = float(os.getenv("MAX_ORDER_VALUE", "10000.0"))
MAX_DAILY_LOSS = float(os.getenv("MAX_DAILY_LOSS", "500.0"))
MAX_TOTAL_EXPOSURE = float(os.getenv("MAX_TOTAL_EXPOSURE", "25000.0"))
MAX_OPEN_POSITIONS = int(os.getenv("MAX_OPEN_POSITIONS", "3"))
MAX_TRADES_PER_DAY = int(os.getenv("MAX_TRADES_PER_DAY", "20"))
MAX_MARKET_DATA_AGE_SECONDS = int(os.getenv("MAX_MARKET_DATA_AGE_SECONDS", "60"))

# ==========================================
# BOT SCHEDULING
# ==========================================
CHECK_INTERVAL_MINS = int(os.getenv("CHECK_INTERVAL_MINS", "1"))
HEARTBEAT_MINUTES = int(os.getenv("HEARTBEAT_MINUTES", "5"))

# ==========================================
# EXCHANGE SETTINGS
# ==========================================
SYMBOL = os.getenv("SYMBOL", "BTC/USDT")
TIMEFRAME = os.getenv("TIMEFRAME", "5m")
SUPPORTED_TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d"]

# ==========================================
# EMA SETTINGS
# ==========================================
EMA_FAST_CROSS = int(os.getenv("EMA_FAST_CROSS", "9"))
EMA_SLOW_CROSS = int(os.getenv("EMA_SLOW_CROSS", "20"))
EMA_SUPPORT = int(os.getenv("EMA_SUPPORT", "50"))
EMA_TREND_FILTER = int(os.getenv("EMA_TREND_FILTER", "200"))

# ==========================================
# MACD SETTINGS
# ==========================================
MACD_FAST = int(os.getenv("MACD_FAST", "12"))
MACD_SLOW = int(os.getenv("MACD_SLOW", "26"))
MACD_SIGNAL = int(os.getenv("MACD_SIGNAL", "9"))

# ==========================================
# VOLUME PROFILE SETTINGS
# ==========================================
VP_LOOKBACK_DAYS = int(os.getenv("VP_LOOKBACK_DAYS", "7"))
VP_VALUE_AREA_PCT = float(os.getenv("VP_VALUE_AREA_PCT", "0.70"))
VP_BUFFER_PCT = float(os.getenv("VP_BUFFER_PCT", "0.02"))
VP_BIN_SIZE_USDT = float(os.getenv("VP_BIN_SIZE_USDT", "25.0"))

# ==========================================
# STRATEGY OPTIONS
# ==========================================
ALLOW_SHORTS = os.getenv("ALLOW_SHORTS", "true").lower() == "true"
USE_EMA9_FILTER = os.getenv("USE_EMA9_FILTER", "false").lower() == "true"
USE_RSI_FILTER = os.getenv("USE_RSI_FILTER", "false").lower() == "true"
USE_DAILY_BIAS_FILTER = os.getenv("USE_DAILY_BIAS_FILTER", "false").lower() == "true"
RSI_TIMEFRAME = os.getenv("RSI_TIMEFRAME", "5m")
RSI_LENGTH = int(os.getenv("RSI_LENGTH", "14"))

# ==========================================
# RISK MANAGEMENT
# ==========================================
RISK_PCT_PER_TRADE = float(os.getenv("RISK_PCT_PER_TRADE", "0.02"))
MAX_CONCURRENT_POSITIONS = int(os.getenv("MAX_CONCURRENT_POSITIONS", "1"))
DAILY_LOSS_LIMIT_PCT = float(os.getenv("DAILY_LOSS_LIMIT_PCT", "-0.20"))
STOP_LOSS_METHOD = os.getenv("STOP_LOSS_METHOD", "tighter")
SWING_LOOKBACK_CANDLES = int(os.getenv("SWING_LOOKBACK_CANDLES", "5"))
TAKE_PROFIT_METHOD = os.getenv("TAKE_PROFIT_METHOD", "risk_reward")
FIXED_STOP_LOSS_PCT = float(os.getenv("FIXED_STOP_LOSS_PCT", "0.10"))
FIXED_RISK_REWARD_RATIO = float(os.getenv("FIXED_RISK_REWARD_RATIO", "3.0"))

# ==========================================
# KILL SWITCH
# ==========================================
KILL_SWITCH_FILE = BASE_DIR / os.getenv("KILL_SWITCH_FILE", "kill_switch.flag")

# ==========================================
# BACKTEST SETTINGS
# ==========================================
BACKTEST_FEE_PCT = float(os.getenv("BACKTEST_FEE_PCT", "0.0010"))
BACKTEST_SLIPPAGE_PCT = float(os.getenv("BACKTEST_SLIPPAGE_PCT", "0.0005"))

# ==========================================
# LOGGING
# ==========================================
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOG_TO_FILE = os.getenv("LOG_TO_FILE", "true").lower() == "true"
LOG_FILE = BASE_DIR / os.getenv("LOG_FILE", "logs/trading_bot.log")
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

# ==========================================
# TELEGRAM ALERTS
# ==========================================
SEND_STARTUP_MESSAGE = os.getenv("SEND_STARTUP_MESSAGE", "true").lower() == "true"
SEND_TRADE_ALERTS = os.getenv("SEND_TRADE_ALERTS", "true").lower() == "true"
SEND_ERROR_ALERTS = os.getenv("SEND_ERROR_ALERTS", "true").lower() == "true"
SEND_HEARTBEAT_MESSAGES = os.getenv("SEND_HEARTBEAT_MESSAGES", "false").lower() == "true"

# ==========================================
# DATABASE
# ==========================================
SAVE_ALL_CANDLES = os.getenv("SAVE_ALL_CANDLES", "false").lower() == "true"
SAVE_SIGNALS = os.getenv("SAVE_SIGNALS", "true").lower() == "true"
SAVE_TRADES = os.getenv("SAVE_TRADES", "true").lower() == "true"
DB_BACKUP_ENABLED = os.getenv("DB_BACKUP_ENABLED", "true").lower() == "true"
DB_BACKUP_INTERVAL_HOURS = int(os.getenv("DB_BACKUP_INTERVAL_HOURS", "24"))
DB_INTEGRITY_CHECK_ENABLED = os.getenv("DB_INTEGRITY_CHECK_ENABLED", "true").lower() == "true"

# ==========================================
# DEBUG
# ==========================================
PRINT_INDICATORS = os.getenv("PRINT_INDICATORS", "true").lower() == "true"
PRINT_SIGNALS = os.getenv("PRINT_SIGNALS", "true").lower() == "true"
PRINT_ORDER_DETAILS = os.getenv("PRINT_ORDER_DETAILS", "true").lower() == "true"

# ==========================================
# HEARTBEAT
# ==========================================
HEARTBEAT_MINUTES = int(os.getenv("HEARTBEAT_MINUTES", "5"))

# ==========================================
# MULTI-INDICATOR CONFLUENCE STRATEGY
# ==========================================
CONFLUENCE_THRESHOLD = float(os.getenv("CONFLUENCE_THRESHOLD", "0.75"))
REQUIRED_CONFLUENCE_COUNT = int(os.getenv("REQUIRED_CONFLUENCE_COUNT", "3"))
MAX_INDICATOR_LIMIT = int(os.getenv("MAX_INDICATOR_LIMIT", "12"))
ACTIVE_INDICATORS_DEFAULT = ["ema", "macd", "rsi", "vp"]