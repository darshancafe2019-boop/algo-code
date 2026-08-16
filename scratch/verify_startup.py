import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import db, config, audit, trade_ledger, pnl_engine, indicator_cache, latency_profiler, performance_analytics, universal_risk_engine, indicator_schema, market_universe, execution_service
from src.process_manager import bot_manager

print("All core bot modules imported successfully!")
bots = db.safe_query("SELECT * FROM bot_instances")
print(f"Configured bot instances in DB: {len(bots)}")
for b in bots:
    print(f"  - {b['id']}: {b['name']} ({b['symbol']}, {b['strategy']}, mode: {b.get('execution_mode', 'PAPER')})")
print("Bot system health: OPERATIONAL & READY")
