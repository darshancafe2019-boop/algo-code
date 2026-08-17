import os
import re

MUTATING_METHODS = ["POST", "PUT", "DELETE", "PATCH"]

mutations_in_mount = []
for root, dirs, files in os.walk("frontend/components"):
    for file in files:
        if file.endswith(".tsx") or file.endswith(".ts"):
            fpath = os.path.join(root, file)
            with open(fpath, "r", encoding="utf-8") as f:
                content = f.read()
                # Check for fetch with POST/PUT/DELETE inside useEffect
                use_effects = re.findall(r'useEffect\s*\(\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[', content)
                for ue in use_effects:
                    for method in MUTATING_METHODS:
                        if f'method: "{method}"' in ue or f"method: '{method}'" in ue:
                            mutations_in_mount.append((fpath, "useEffect", method))
                
                # Check for useQuery performing POST
                use_queries = re.findall(r'useQuery\s*\(\s*\{([\s\S]*?)\}\s*\)', content)
                for uq in use_queries:
                    for method in MUTATING_METHODS:
                        if f'method: "{method}"' in uq or f"method: '{method}'" in uq:
                            mutations_in_mount.append((fpath, "useQuery", method))

print(f"Total Mutating Requests in useEffect or useQuery: {len(mutations_in_mount)}")
for fpath, loc, method in mutations_in_mount:
    print(f"  • {fpath} -> {loc} -> {method}")
