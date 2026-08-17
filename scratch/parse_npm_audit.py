import json
import subprocess

out = subprocess.run(["npm.cmd", "audit", "--omit=dev", "--json"], cwd="frontend", capture_output=True, text=True)
try:
    audit_data = json.loads(out.stdout)
    vulns = audit_data.get("vulnerabilities", {})
    print(f"Total Vulnerabilities in production dependencies: {len(vulns)}")
    for name, v in vulns.items():
        print(f"Package: {name}")
        print(f"  Severity: {v.get('severity')}")
        print(f"  Range: {v.get('range')}")
        print(f"  Fix Available: {v.get('fixAvailable')}")
        for via in v.get("via", []):
            if isinstance(via, dict):
                print(f"    - [{via.get('severity')}] {via.get('title')} ({via.get('url')})")
            else:
                print(f"    - via {via}")
except Exception as e:
    print("Error parsing npm audit json:", e)
    print("Raw output:", out.stdout[:500])
