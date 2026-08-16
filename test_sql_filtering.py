import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent))

# Configure utf-8 console output for Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from src import db

def test_bulletproof_sql():
    db.init_db()
    conn = db.get_connection()

    sql_filtered = """
        SELECT id, symbol, direction, strategy, emotion_tag, remarks, metadata 
        FROM trades_log 
        WHERE 1=1 AND NOT (
            (emotion_tag IS NOT NULL AND (LOWER(emotion_tag) LIKE '%test%' OR emotion_tag LIKE '%🎯%' OR emotion_tag LIKE '%🧪%')) OR
            (remarks IS NOT NULL AND (LOWER(remarks) LIKE '%test%' OR remarks LIKE '%test_kill%')) OR
            (metadata IS NOT NULL AND (LOWER(metadata) LIKE '%is_test_trade%' OR LOWER(metadata) LIKE '%test_trade%')) OR
            (strategy IS NOT NULL AND LOWER(strategy) LIKE '%test%')
        )
    """
    rows_filtered = conn.execute(sql_filtered).fetchall()

    sql_all = "SELECT id, symbol, direction, strategy, emotion_tag, remarks FROM trades_log"
    rows_all = conn.execute(sql_all).fetchall()

    conn.close()

    print(f"Total trades in DB: {len(rows_all)}")
    print(f"Filtered trades (show_test_trades=False): {len(rows_filtered)}")
    print("\nTEST TRADES EXCLUDED:")
    excluded_ids = set(r["id"] for r in rows_all) - set(r["id"] for r in rows_filtered)
    print(sorted(list(excluded_ids)))

    print("\nREAL STRATEGY TRADES INCLUDED:")
    for r in rows_filtered:
        print(f"Trade #{r['id']} | {r['symbol']} | {r['direction']} | Strategy: {r['strategy']}")

if __name__ == "__main__":
    test_bulletproof_sql()
