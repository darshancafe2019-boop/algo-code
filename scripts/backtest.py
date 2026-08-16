import json
from pathlib import Path
from typing import Dict, Any

import pandas as pd

from src.backtester import run_single_backtest
from src import config
from src.indicators import generate_indicators, calculate_rsi

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
RESULT_FILE = DATA_DIR / "backtest_comparison.json"


def load_data(timeframe: str) -> pd.DataFrame:
    path = DATA_DIR / f"btc_historical_{timeframe}.csv"
    if not path.exists():
        raise FileNotFoundError(f"Historical data not found: {path}")
    df = pd.read_csv(path)
    return df


def compare_strategies(primary_df: pd.DataFrame, rsi_df: pd.DataFrame, daily_df: pd.DataFrame) -> Dict[str, Any]:
    primary_df = generate_indicators(primary_df.copy())

    # Merge optional filter values for backtest reproducibility.
    primary_df = primary_df.sort_values('timestamp').reset_index(drop=True)
    rsi_df = calculate_rsi(rsi_df.copy(), length=config.RSI_LENGTH).sort_values('timestamp').reset_index(drop=True)
    daily_df = daily_df.sort_values('timestamp').reset_index(drop=True)

    primary_df['datetime'] = pd.to_datetime(primary_df['timestamp'], unit='ms')
    rsi_df['datetime'] = pd.to_datetime(rsi_df['timestamp'], unit='ms')
    daily_df['datetime'] = pd.to_datetime(daily_df['timestamp'], unit='ms')

    primary_df = pd.merge_asof(
        primary_df,
        rsi_df[['datetime', 'rsi']],
        on='datetime',
        direction='backward',
        tolerance=pd.Timedelta('5m')
    ).rename(columns={'rsi': 'rsi_5m'})

    primary_df = pd.merge_asof(
        primary_df,
        daily_df[['datetime', 'open']],
        on='datetime',
        direction='backward',
        tolerance=pd.Timedelta('1d')
    ).rename(columns={'open': 'daily_open'})

    print(f"Running old strategy backtest on {len(primary_df)} rows...")
    old_metrics, _, _ = run_single_backtest(primary_df, source_df=primary_df)

    old_use_ema9 = config.USE_EMA9_FILTER
    old_use_rsi = config.USE_RSI_FILTER
    old_use_daily = config.USE_DAILY_BIAS_FILTER

    config.USE_EMA9_FILTER = True
    config.USE_RSI_FILTER = True
    config.USE_DAILY_BIAS_FILTER = True

    print("Running new strategy backtest with EMA9, RSI, and Daily Bias filters enabled...")
    new_metrics, _, _ = run_single_backtest(primary_df, source_df=primary_df)

    config.USE_EMA9_FILTER = old_use_ema9
    config.USE_RSI_FILTER = old_use_rsi
    config.USE_DAILY_BIAS_FILTER = old_use_daily

    result = {
        "symbol": config.SYMBOL,
        "timeframe": config.TIMEFRAME,
        "old_strategy": old_metrics,
        "new_strategy": new_metrics,
    }

    RESULT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with RESULT_FILE.open("w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2)

    return result


def print_summary(result: Dict[str, Any]) -> None:
    print("\n=== Backtest Comparison ===")
    print(f"Symbol: {result['symbol']} | Timeframe: {result['timeframe']}")

    for name in ["old_strategy", "new_strategy"]:
        metrics = result[name]
        print(f"\n{name.replace('_', ' ').title()}")
        print(f"  Total Trades: {metrics['total_trades']}")
        print(f"  Win Rate: {metrics['win_rate']*100:.2f}%")
        print(f"  Net Profit: {metrics['net_profit']:.2f}")
        print(f"  Max Drawdown: {metrics['max_drawdown_pct']:.2f}%")


def main():
    primary_df = load_data(config.TIMEFRAME)
    result = compare_strategies(primary_df)
    print_summary(result)
    print(f"\nSaved comparison to {RESULT_FILE}")


if __name__ == '__main__':
    main()
