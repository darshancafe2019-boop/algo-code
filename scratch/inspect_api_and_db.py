import urllib.request
import json
import sqlite3
import csv
import io

BASE_URL = "http://localhost:3001"

print("==================================================")
print("1. DIRECT API RESPONSES & COUNTS")
print("==================================================")

# 1. /api/audit/events default
with urllib.request.urlopen(f"{BASE_URL}/api/audit/events") as r:
    audit_default = json.loads(r.read().decode('utf-8'))
    print(f"/api/audit/events (default limit 100): status={audit_default.get('status')}, count={audit_default.get('count')}, len(events)={len(audit_default.get('events', []))}")

# 2. /api/audit/events?limit=50
with urllib.request.urlopen(f"{BASE_URL}/api/audit/events?limit=50") as r:
    audit_50 = json.loads(r.read().decode('utf-8'))
    print(f"/api/audit/events?limit=50: status={audit_50.get('status')}, count={audit_50.get('count')}, len(events)={len(audit_50.get('events', []))}")

# 3. /api/audit/events?limit=200
with urllib.request.urlopen(f"{BASE_URL}/api/audit/events?limit=200") as r:
    audit_200 = json.loads(r.read().decode('utf-8'))
    print(f"/api/audit/events?limit=200: status={audit_200.get('status')}, count={audit_200.get('count')}, len(events)={len(audit_200.get('events', []))}")

# 4. /api/logs default
with urllib.request.urlopen(f"{BASE_URL}/api/logs") as r:
    logs_default = json.loads(r.read().decode('utf-8'))
    print(f"/api/logs (default limit 150): status={logs_default.get('status')}, log_count={logs_default.get('log_count')}, len(logs)={len(logs_default.get('logs', []))}, len(system_errors)={len(logs_default.get('system_errors', []))}")

# 5. /api/logs?limit=200
with urllib.request.urlopen(f"{BASE_URL}/api/logs?limit=200") as r:
    logs_200 = json.loads(r.read().decode('utf-8'))
    print(f"/api/logs?limit=200: status={logs_200.get('status')}, log_count={logs_200.get('log_count')}, len(logs)={len(logs_200.get('logs', []))}, len(system_errors)={len(logs_200.get('system_errors', []))}")

# 6. /api/diagnostics/state
with urllib.request.urlopen(f"{BASE_URL}/api/diagnostics/state") as r:
    diag_state = json.loads(r.read().decode('utf-8'))
    print(f"/api/diagnostics/state: total_bots={diag_state.get('total_bots')}, open_positions={diag_state.get('open_positions')}, len(recent_closed_trades)={len(diag_state.get('recent_closed_trades', []))}")

# 7. /api/logs/diagnostic_report
with urllib.request.urlopen(f"{BASE_URL}/api/logs/diagnostic_report") as r:
    report = json.loads(r.read().decode('utf-8'))
    report_text = report.get('report', '')
    print(f"/api/logs/diagnostic_report: status={report.get('status')}, report_lines={len(report_text.splitlines())}")

# 8. /api/audit/export-csv
with urllib.request.urlopen(f"{BASE_URL}/api/audit/export-csv") as r:
    csv_bytes = r.read()
    csv_text = csv_bytes.decode('utf-8', errors='ignore')
    csv_reader = list(csv.reader(io.StringIO(csv_text)))
    print(f"/api/audit/export-csv: HTTP {r.getcode()}, headers={csv_reader[0] if csv_reader else []}, data_rows_count={len(csv_reader)-1 if csv_reader else 0}")

print("\n==================================================")
print("2. DATABASE TABLE COUNTS")
print("==================================================")
conn = sqlite3.connect("bot_database.db")
c = conn.cursor()
for table in ["bot_event_audit", "audit_log", "system_errors", "bot_instances", "trades_log", "alert_notifications"]:
    try:
        c.execute(f"SELECT COUNT(*) FROM {table}")
        cnt = c.fetchone()[0]
        print(f"Table '{table}': Total Rows = {cnt}")
    except Exception as e:
        print(f"Table '{table}': {e}")
conn.close()
