import re
from pathlib import Path

content = Path("dashboard.py").read_text(encoding="utf-8", errors="ignore")
matches = re.findall(r'@app\.route\(\s*["\']([^"\']+)["\'](?:\s*,\s*methods=\[([^\]]+)\])?\)', content)
print(f"Total routes in dashboard.py: {len(matches)}")
for route, methods in sorted(matches):
    print(f"  {route:40s} {methods if methods else 'GET'}")
