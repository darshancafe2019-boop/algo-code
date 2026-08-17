import os
import subprocess
import glob

# 1. Pytest test files & cases
out = subprocess.check_output(["h:/algo/algo/.venv/Scripts/pytest.exe", "--collect-only", "-q", "tests/"], text=True)
lines = [l.strip() for l in out.strip().split("\n") if l.strip()]
test_cases = [l for l in lines if not l.startswith("tests/") and not "collected" in l and not "warning" in l]
test_files = glob.glob("tests/**/test_*.py", recursive=True) + glob.glob("tests/test_*.py")

# 2. Browser CDP test scripts
cdp_scripts = glob.glob("tests/*cdp*.py") + glob.glob("scratch/*cdp*.py") + glob.glob("tests/*acceptance*.py")

print("=" * 60)
print("TEST INVENTORY CLARIFICATION")
print("=" * 60)
print(f"Total Pytest Test Files: {len(test_files)}")
for tf in sorted(test_files):
    print(f"  • {tf}")

print(f"\nTotal Pytest Collected Test Cases: {len(test_cases)}")
print(f"Total CDP/Browser Audit Scripts: {len(cdp_scripts)}")
for cs in sorted(cdp_scripts):
    print(f"  • {cs}")
