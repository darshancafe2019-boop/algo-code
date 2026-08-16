import sys
from pathlib import Path

# Add project source to sys.path dynamically
project_dir = Path(__file__).resolve().parent.parent
if str(project_dir) not in sys.path:
    sys.path.append(str(project_dir))

import pandas as pd
import logging
from src.backtester import run_single_backtest, run_walk_forward_testing, save_backtest_run_details
from src import config

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

def main():
    data_file = project_dir / "data" / "btc_historical_1h.csv"
    if not data_file.exists():
        print(f"Historical data file not found at {data_file}. Please run verify_indicators.py first.")
        return
        
    print(f"Loading historical data from {data_file}...")
    df = pd.read_csv(data_file)
    
    print(f"Loaded {len(df)} candles.")
    
    print("\n=============================================")
    print("1. RUNNING FULL HISTORICAL BACKTEST")
    print("=============================================")
    metrics, trades, final_cash = run_single_backtest(df)
    
    print(f"Initial Cash: $10,000.00")
    print(f"Final Cash:   ${final_cash:.2f}")
    print(f"Total Trades: {metrics['total_trades']}")
    print(f"Win Rate:     {metrics['win_rate']*100:.2f}%")
    print(f"Avg Win:      ${metrics['avg_win']:.2f}")
    print(f"Avg Loss:     ${metrics['avg_loss']:.2f}")
    print(f"Profit Factor: {metrics['profit_factor']:.2f}")
    print(f"Max Drawdown:  {metrics['max_drawdown_pct']:.2f}%")
    print(f"Sharpe Ratio:  {metrics['sharpe_ratio']:.4f}")
    
    print("\nSaving full backtest details...")
    save_backtest_run_details(metrics, symbol=config.SYMBOL, timeframe=config.TIMEFRAME)
    
    print("\n=============================================")
    print("2. RUNNING WALK-FORWARD ANALYSIS (3 Folds)")
    print("=============================================")
    wf_results = run_walk_forward_testing(df, num_folds=3)
    
    for res in wf_results:
        print(f"\nFold {res['fold']}:")
        print(f"  Train: Trades={res['train_trades']}, WinRate={res['train_win_rate']*100:.1f}%, Profit=${res['train_profit']:.2f}, PF={res['train_pf']:.2f}, DD={res['train_dd']:.2f}%, Sharpe={res['train_sharpe']:.4f}")
        print(f"  Test:  Trades={res['test_trades']}, WinRate={res['test_win_rate']*100:.1f}%, Profit=${res['test_profit']:.2f}, PF={res['test_pf']:.2f}, DD={res['test_dd']:.2f}%, Sharpe={res['test_sharpe']:.4f}")

if __name__ == "__main__":
    main()
