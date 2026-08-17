import os
import sqlite3
from pathlib import Path

base = Path(".")
for root, dirs, files in os.walk(base):
    if ".git" in root or ".next" in root or "node_modules" in root:
        continue
    for f in files:
        if f.endswith(".db") or f.endswith(".sqlite"):
            db_path = Path(root) / f
            print(f"=== DB: {db_path} (size={db_path.stat().st_size} bytes) ===", flush=True)
            try:
                conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
                c = conn.cursor()
                c.execute("SELECT name FROM sqlite_master WHERE type='table'")
                tables = [r[0] for r in c.fetchall()]
                print("  Tables:", tables, flush=True)
                for t in ["bot_event_audit", "audit_log", "system_errors", "bot_instances", "trades_log"]:
                    if t in tables:
                        c.execute(f"SELECT COUNT(*) FROM {t}")
                        print(f"    Table '{t}': {c.fetchone()[0]} rows", flush=True)
                conn.close()
            except Exception as e:
                print("  Error:", e, flush=True)
