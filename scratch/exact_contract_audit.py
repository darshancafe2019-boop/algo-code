import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import os
import re
from pathlib import Path

dashboard_py = Path("dashboard.py").read_text(encoding="utf-8", errors="ignore")

# Parse all Flask routes
flask_routes = []
# Find all @app.route decorations followed by def function_name
for match in re.finditer(r'@app\.route\(\s*["\']([^"\']+)["\'](?:\s*,\s*methods=\[([^\]]+)\])?\)', dashboard_py):
    path = match.group(1)
    methods_str = match.group(2)
    if methods_str:
        methods = [x.strip().strip("'\"") for x in methods_str.split(",")]
    else:
        methods = ["GET"]
    flask_routes.append({"path": path, "methods": methods})

print(f"Total Flask Routes Parsed: {len(flask_routes)}")

# Scan all frontend ts/tsx files
frontend_dir = Path("frontend")
frontend_api_calls = []

for root, _, files in os.walk(frontend_dir):
    if ".next" in root or "node_modules" in root:
        continue
    for f in files:
        if f.endswith(".ts") or f.endswith(".tsx"):
            fpath = Path(root) / f
            content = fpath.read_text(encoding="utf-8", errors="ignore")
            
            # match fetch(...)
            for m in re.finditer(r'fetch\(\s*[`"\'](/api/[^`"\'?\s]+)[^`"\']*[`"\'](?:\s*,\s*\{[^}]*?method:\s*["\'](\w+)["\'])?', content, re.DOTALL):
                raw_ep = m.group(1)
                method = m.group(2).upper() if m.group(2) else "GET"
                frontend_api_calls.append({
                    "file": str(fpath.relative_to(frontend_dir)),
                    "endpoint": raw_ep,
                    "method": method
                })
            # match window.open('/api/...')
            for m in re.finditer(r'window\.open\(\s*[`"\'](/api/[^`"\'?\s]+)[^`"\']*[`"\']', content):
                frontend_api_calls.append({
                    "file": str(fpath.relative_to(frontend_dir)),
                    "endpoint": m.group(1),
                    "method": "GET"
                })

def match_route(ep, method):
    # 1. Exact string match first
    for fr in flask_routes:
        if fr["path"] == ep:
            if method in fr["methods"] or ("GET" in fr["methods"] and method == "GET"):
                return fr, True
            
    # 2. Parameterized regex match
    norm_ep = re.sub(r'\$\{[^}]+\}', '__PARAM__', ep)
    for fr in flask_routes:
        fr_path = fr["path"]
        regex_path = re.sub(r'<[^>]+>', '[^/]+', fr_path)
        regex_pattern = f"^{regex_path}$"
        test_ep = re.sub(r'__PARAM__', 'test_id', norm_ep)
        if re.match(regex_pattern, test_ep) or re.match(regex_pattern, ep):
            if method in fr["methods"] or ("GET" in fr["methods"] and method == "GET"):
                return fr, True

    # 3. Check if path matched but method didn't
    for fr in flask_routes:
        if fr["path"] == ep or re.match(f"^{re.sub(r'<[^>]+>', '[^/]+', fr['path'])}$", re.sub(r'\$\{[^}]+\}', 'test_id', ep)):
            return fr, False

    return None, False

grouped = {}
for call in frontend_api_calls:
    key = (call["endpoint"], call["method"])
    if key not in grouped:
        grouped[key] = []
    grouped[key].append(call["file"])

print(f"Unique Frontend API Signatures: {len(grouped)}\n")
print("=" * 115)
print(f"{'Frontend API':<45} | {'Method':<6} | {'Flask Route Match':<35} | {'Status':<15}")
print("=" * 115)

all_matched = True
for (ep, method), files in sorted(grouped.items()):
    matched_flask, method_ok = match_route(ep, method)
    if matched_flask and method_ok:
        status = "EXACT MATCH"
        match_str = matched_flask["path"]
    elif matched_flask and not method_ok:
        status = f"METHOD MISMATCH ({matched_flask['methods']})"
        match_str = matched_flask["path"]
        all_matched = False
    else:
        status = "NOT FOUND"
        match_str = "NONE"
        all_matched = False
    print(f"{ep:<45} | {method:<6} | {match_str:<35} | {status:<15}")

print("=" * 115)
print(f"All Frontend API Calls Validated Against Backend Contracts: {'YES' if all_matched else 'NO'}")
