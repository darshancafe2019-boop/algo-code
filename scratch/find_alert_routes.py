from pathlib import Path
import re

text = Path("dashboard.py").read_text(encoding="utf-8", errors="ignore")
for line_no, line in enumerate(text.splitlines(), 1):
    if "/api/alerts" in line or "/api/decision" in line or "alerts" in line.lower() and "@app.route" in line:
        print(f"L{line_no}: {line}")
