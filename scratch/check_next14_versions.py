import json
import subprocess

out = subprocess.check_output(["npm.cmd", "view", "next", "versions", "--json"], cwd="frontend", text=True)
versions = json.loads(out)
v14 = [v for v in versions if v.startswith("14.") and not "canary" in v and not "preview" in v]
print("All stable 14.x versions of Next.js:")
print(v14)
print(f"Latest stable 14.x version: {v14[-1]}")
