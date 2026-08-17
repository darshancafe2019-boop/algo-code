import os
import re
import json
import urllib.request
import urllib.error
from pathlib import Path

print("=" * 80)
print("PHASE 5: COMPREHENSIVE PRODUCTION READINESS & FULL SYSTEM AUDIT")
print("=" * 80)

# ==============================================================================
# 1. API CONTRACT AUDIT (SCAN ALL FRONTEND API CALLS vs FLASK ROUTES)
# ==============================================================================
print("\n[SECTION 1 & 4] SCANNING FRONTEND API CALLS AGAINST FLASK BACKEND ROUTES...")

# Extract all routes from dashboard.py
dashboard_py = Path("dashboard.py").read_text(encoding="utf-8", errors="ignore")
flask_routes = {}
# Regex to find @app.route("...", methods=[...])
route_matches = re.findall(r'@app\.route\(\s*["\']([^"\']+)["\'](?:\s*,\s*methods=\[([^\]]+)\])?\)', dashboard_py)
for path, methods_str in route_matches:
    if methods_str:
        methods = [m.strip().strip("'\"") for m in methods_str.split(",")]
    else:
        methods = ["GET"]
    flask_routes[path] = methods

# Scan all frontend ts/tsx files for fetch("/api/...")
frontend_dir = Path("frontend")
api_calls = []

for root, _, files in os.walk(frontend_dir):
    if ".next" in root or "node_modules" in root:
        continue
    for f in files:
        if f.endswith(".ts") or f.endswith(".tsx"):
            fpath = Path(root) / f
            content = fpath.read_text(encoding="utf-8", errors="ignore")
            # find fetch calls
            matches = re.findall(r'fetch\(\s*[`"\'](/api/[^`"\'?\s]+)[^`"\']*[`"\'](?:\s*,\s*\{[^}]*method:\s*["\'](\w+)["\'])?', content)
            for raw_endpoint, method in matches:
                m = method.upper() if method else "GET"
                api_calls.append({
                    "file": str(fpath.relative_to(frontend_dir)),
                    "endpoint": raw_endpoint,
                    "method": m
                })
            # Also catch window.open('/api/...')
            win_matches = re.findall(r'window\.open\(\s*[`"\'](/api/[^`"\'?\s]+)[^`"\']*[`"\']', content)
            for raw_endpoint in win_matches:
                api_calls.append({
                    "file": str(fpath.relative_to(frontend_dir)),
                    "endpoint": raw_endpoint,
                    "method": "GET"
                })

# Deduplicate and sort
unique_api_calls = {}
for call in api_calls:
    key = (call["endpoint"], call["method"])
    if key not in unique_api_calls:
        unique_api_calls[key] = []
    unique_api_calls[key].append(call["file"])

print(f"Total Unique Frontend API Call Signatures Found: {len(unique_api_calls)}")
print(f"Total Backend Routes in dashboard.py: {len(flask_routes)}")

# Verify each frontend API against Flask routes
print("\n| Frontend Endpoint | Method | Backend Route Match | Used By Component(s) | Status |")
print("| :--- | :---: | :--- | :--- | :---: |")

dead_endpoints = []
for (ep, method), files in sorted(unique_api_calls.items()):
    # Convert parameterized path e.g. /api/signals/${id}/approve -> /api/signals/<id>/approve
    # or match exact / prefix
    matched_flask = None
    for fr in flask_routes:
        # Simple route matcher for param e.g. /api/signals/<int:signal_id>/approve vs /api/signals/
        fr_regex = re.sub(r'<[^>]+>', r'[^/]+', fr)
        if re.fullmatch(fr_regex, ep) or fr == ep:
            matched_flask = fr
            break
        # Also handle template string patterns in ep
        ep_normalized = re.sub(r'\$\{[^}]+\}', '[^/]+', ep)
        if re.fullmatch(fr_regex, ep_normalized):
            matched_flask = fr
            break

    files_summary = ", ".join(sorted(set(files))[:2])
    if len(set(files)) > 2:
        files_summary += f" (+{len(set(files))-2} more)"

    if matched_flask:
        flask_methods = flask_routes[matched_flask]
        method_ok = method in flask_methods or ("GET" in flask_methods and method == "GET")
        status = "EXACT MATCH" if method_ok else f"METHOD MISMATCH (Flask: {flask_methods})"
    else:
        status = "UNMATCHED (DEAD/MISSING)"
        dead_endpoints.append((ep, method, files))

    print(f"| `{ep}` | `{method}` | `{matched_flask or 'NONE'}` | {files_summary} | **{status}** |")

print(f"\nDead / Unmatched Endpoints Count: {len(dead_endpoints)}")

# ==============================================================================
# 2. OLD FRONTEND INDEPENDENCE AUDIT
# ==============================================================================
print("\n" + "=" * 80)
print("[SECTION 3] OLD FRONTEND INDEPENDENCE AUDIT")
print("=" * 80)

old_references = []
for root, _, files in os.walk(frontend_dir):
    if ".next" in root or "node_modules" in root:
        continue
    for f in files:
        if f.endswith(".ts") or f.endswith(".tsx") or f.endswith(".js") or f.endswith(".mjs"):
            fpath = Path(root) / f
            content = fpath.read_text(encoding="utf-8", errors="ignore")
            if "dashboard.js" in content or "static/js" in content:
                old_references.append(str(fpath.relative_to(frontend_dir)))

print(f"References to static/js/dashboard.js in Next.js code: {len(old_references)}")
if not old_references:
    print("✓ PASS: New Next.js frontend has ZERO dependencies on legacy static/js/dashboard.js")

# ==============================================================================
# 3. TANSTACK QUERY & POLLING AUDIT
# ==============================================================================
print("\n" + "=" * 80)
print("[SECTION 6] TANSTACK QUERY & RECURRING DATA FETCH AUDIT")
print("=" * 80)

intervals_found = []
for root, _, files in os.walk(frontend_dir / "components"):
    for f in files:
        if f.endswith(".tsx") or f.endswith(".ts"):
            fpath = Path(root) / f
            content = fpath.read_text(encoding="utf-8", errors="ignore")
            # Look for refetchInterval
            refetch_matches = re.findall(r'refetchInterval:\s*([^,\n]+)', content)
            query_keys = re.findall(r'queryKey:\s*\[([^\]]+)\]', content)
            set_intervals = re.findall(r'setInterval\(', content)
            
            if refetch_matches or query_keys or set_intervals:
                intervals_found.append({
                    "file": str(fpath.relative_to(frontend_dir)),
                    "query_keys": [k.strip() for k in query_keys],
                    "refetch_intervals": [r.strip() for r in refetch_matches],
                    "has_raw_set_interval": len(set_intervals) > 0
                })

for item in intervals_found:
    print(f"• {item['file']}:")
    if item['query_keys']:
        print(f"    Queries: {item['query_keys']}")
    if item['refetch_intervals']:
        print(f"    Refetch Intervals: {item['refetch_intervals']}")
    if item['has_raw_set_interval']:
        print(f"    ⚠️ Raw setInterval detected!")

# ==============================================================================
# 4. SECURITY AUDIT (SECRETS & SENSITIVE PATTERNS IN FRONTEND)
# ==============================================================================
print("\n" + "=" * 80)
print("[SECTION 15] SECURITY & SENSITIVE CREDENTIAL LEAKAGE AUDIT")
print("=" * 80)

forbidden_patterns = [
    r'api_secret\s*=\s*["\'][^"\']+["\']',
    r'API_SECRET\s*=\s*["\'][^"\']+["\']',
    r'private_key\s*=\s*["\'][^"\']+["\']',
    r'PRIVATE_KEY\s*=\s*["\'][^"\']+["\']',
    r'password\s*=\s*["\'][^"\']+["\']',
    r'TOKEN\s*=\s*["\'][a-zA-Z0-9_\-]{20,}["\']',
    r'Bearer\s+ey[a-zA-Z0-9_\-\.]+',
    r'sk_live_[0-9a-zA-Z]+'
]

security_leaks = []
for root, _, files in os.walk(frontend_dir):
    if ".next" in root or "node_modules" in root or ".git" in root:
        continue
    for f in files:
        if f.endswith(".ts") or f.endswith(".tsx") or f.endswith(".json") or f.endswith(".js"):
            fpath = Path(root) / f
            content = fpath.read_text(encoding="utf-8", errors="ignore")
            for pat in forbidden_patterns:
                m = re.findall(pat, content)
                if m:
                    security_leaks.append((str(fpath.relative_to(frontend_dir)), pat, m))

print(f"Hardcoded API Secrets / Keys / Tokens in frontend source: {len(security_leaks)}")
if not security_leaks:
    print("✓ PASS: 0 hardcoded secrets, private keys, or auth tokens found in frontend repository.")

print("\n" + "=" * 80)
print("AUDIT SCRIPT EXECUTION FINISHED")
print("=" * 80)
