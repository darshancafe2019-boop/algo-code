import os
import re

PATTERNS = [
    r'API_SECRET',
    r'PRIVATE_KEY',
    r'PASSWORD',
    r'SECRET_KEY',
    r'DATABASE_URL',
    r'Bearer\s+[A-Za-z0-9_\-\.]{20,}',
    r'NEXT_PUBLIC_[A-Za-z0-9_]*(?:SECRET|KEY|PASS|TOKEN)'
]

matches = []
for root, dirs, files in os.walk("frontend"):
    if "node_modules" in root or ".next" in root or ".git" in root:
        continue
    for file in files:
        fpath = os.path.join(root, file)
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                content = f.read()
                for p in PATTERNS:
                    found = re.findall(p, content, re.IGNORECASE)
                    if found:
                        matches.append((fpath, p, found))
        except Exception:
            pass

print(f"Total Secret Pattern Matches in frontend source: {len(matches)}")
for fpath, p, found in matches:
    print(f"  • File: {fpath} | Pattern: {p} | Matches: {found[:3]}")
