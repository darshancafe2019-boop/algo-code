import urllib.request
import sys

ports = [3000, 3001, 5000, 5001]
paths = ["/", "/api/health", "/api/logs", "/api/audit/events", "/api/diagnostics/state"]

for p in ports:
    print(f"=== Port {p} ===", flush=True)
    for path in paths:
        url = f"http://localhost:{p}{path}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Probe/1.0"})
            with urllib.request.urlopen(req, timeout=0.5) as res:
                body = res.read().decode('utf-8', errors='ignore')
                print(f"  {url} -> {res.getcode()} (len={len(body)})", flush=True)
        except Exception as e:
            print(f"  {url} -> {type(e).__name__}: {e}", flush=True)
print("Done probe", flush=True)
