import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import sqlite3
from src import config, audit

print("DB_PATH:", config.DB_PATH)
conn = sqlite3.connect(str(config.DB_PATH))
c = conn.cursor()
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in c.fetchall()]
print("Tables:", tables)

for t in ["bot_event_audit", "audit_log", "system_errors", "bot_instances", "trades_log", "alert_notifications"]:
    if t in tables:
        c.execute(f"SELECT COUNT(*) FROM {t}")
        cnt = c.fetchone()[0]
        print(f"Table '{t}': COUNT = {cnt}")
    else:
        print(f"Table '{t}': NOT FOUND")

# Check bot_event_audit distinct event_types and severity
if "bot_event_audit" in tables:
    c.execute("SELECT severity, COUNT(*) FROM bot_event_audit GROUP BY severity")
    print("Severity distribution in bot_event_audit:", c.fetchall())
    c.execute("SELECT event_type, COUNT(*) FROM bot_event_audit GROUP BY event_type")
    print("Event types in bot_event_audit:", c.fetchall()[:10])

# Check system_errors
if "system_errors" in tables:
    c.execute("SELECT * FROM system_errors LIMIT 5")
    print("Sample system_errors:", c.fetchall())

# Check audit_log
if "audit_log" in tables:
    c.execute("SELECT * FROM audit_log LIMIT 5")
    print("Sample audit_log:", c.fetchall())

conn.close()
