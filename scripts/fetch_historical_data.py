import argparse
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

from src.data_fetcher import DataFetcher
from src import config


def save_csv(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    print(f"Saved {len(df)} candles to {path}")


def build_output_name(timeframe: str) -> str:
    safe_tf = timeframe.replace('/', '_')
    return f"btc_historical_{safe_tf}.csv"


def main():
    parser = argparse.ArgumentParser(description="Fetch Binance historical OHLCV data for the bot.")
    parser.add_argument("--months", type=int, default=12, help="Months of history to fetch (default: 12)")
    parser.add_argument("--symbol", default=config.SYMBOL, help="Trading symbol to fetch")
    parser.add_argument("--timeframe", default=config.TIMEFRAME, help="Primary timeframe to fetch")
    args = parser.parse_args()

    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=max(30, args.months * 30))
    start_str = start_date.strftime("%Y-%m-%d")
    print(f"Fetching {args.months} months of history for {args.symbol} starting {start_str}...")

    fetcher = DataFetcher(use_testnet=False)

    primary_df = fetcher.fetch_historical_ohlcv(args.symbol, args.timeframe, start_str)
    save_csv(primary_df, config.BASE_DIR / "data" / build_output_name(args.timeframe))

    rsi_df = fetcher.fetch_historical_ohlcv(args.symbol, config.RSI_TIMEFRAME, start_str)
    save_csv(rsi_df, config.BASE_DIR / "data" / build_output_name(config.RSI_TIMEFRAME))

    daily_df = fetcher.fetch_historical_ohlcv(args.symbol, "1d", start_str)
    save_csv(daily_df, config.BASE_DIR / "data" / build_output_name("1d"))

    print("Historical data fetch complete.")


if __name__ == '__main__':
    main()
