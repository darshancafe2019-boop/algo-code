from pathlib import Path
import re

text = Path("dashboard.py").read_text(encoding="utf-8", errors="ignore")
for line_no, line in enumerate(text.splitlines(), 1):
    if "@app.route" in line and any(k in line.lower() for k in ["decision", "activity", "event", "feed"]):
        print(f"L{line_no}: {line}")
