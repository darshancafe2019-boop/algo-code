import sys
from pathlib import Path

# Add project source to sys.path dynamically
project_dir = Path(__file__).resolve().parent.parent
if str(project_dir) not in sys.path:
    sys.path.append(str(project_dir))

from src.data_fetcher import DataFetcher
from src.indicators import generate_indicators
import pandas as pd

def main():
    print("Initializing DataFetcher and fetching 3 years of BTC/USDT hourly data...")
    fetcher = DataFetcher(use_testnet=False)
    
    # We fetch 3 years from 2023-07-01 to 2026-07-15
    start_date = "2023-07-01"
    end_date = "2026-07-15"
    
    # Fetch historical data
    df = fetcher.fetch_historical_ohlcv(
        symbol="BTC/USDT",
        timeframe="1h",
        start_date_str=start_date,
        end_date_str=end_date
    )
    
    if df.empty:
        print("Failed to fetch data. Dataframe is empty.")
        return
        
    print(f"Successfully fetched {len(df)} candles.")
    
    print("Calculating EMA, MACD, and Volume Profile (POC, VAL, VAH)...")
    df_indicators = generate_indicators(df)
    
    # Find the first row where Volume Profile is fully populated
    # 30 days of 1h candles is 720 candles
    valid_vp = df_indicators.dropna(subset=['poc', 'val', 'vah'])
    
    print(f"Total rows with indicators computed: {len(valid_vp)}")
    
    print("\n--- FIRST 5 ROWS WITH CALCULATED VOLUME PROFILE ---")
    print(valid_vp[['timestamp', 'close', 'ema_9', 'ema_20', 'ema_50', 'ema_200', 'macd_line', 'poc', 'val', 'vah']].head().to_string(index=False))
    
    print("\n--- LAST 20 ROWS OF DATA ---")
    print(df_indicators[['timestamp', 'close', 'ema_9', 'ema_20', 'ema_50', 'ema_200', 'macd_line', 'poc', 'val', 'vah']].tail(20).to_string(index=False))
    
    # Save historical data inside the data directory
    output_file = project_dir / "data" / "btc_historical_1h.csv"
    df_indicators.to_csv(output_file, index=False)
    print(f"\nSaved raw data with indicators to {output_file}")

if __name__ == "__main__":
    main()
