import os
import urllib.request
import json

print("=" * 80)
print("PHASE 5: CONTROLLED FAULT ISOLATION AUDIT")
print("=" * 80)

# Verify that all components have ErrorBoundary wrappers in app/page.tsx
page_tsx = open("frontend/app/page.tsx", "r", encoding="utf-8").read()
sections = [
    ("GlobalHealthBar", "Global System Health Bar Failed"),
    ("Navbar", "Navigation Bar Failed"),
    ("BotControlTab", "Bot Control & Instances Tab Failed"),
    ("PerformanceAnalytics", "Performance Analytics Tab Failed"),
    ("TradeJournal", "Trade Journal Tab Failed"),
    ("MarketUniverse", "Market Universe Tab Failed"),
    ("AccountSecurity", "Account & Security Tab Failed"),
    ("RiskManagement", "Risk Management Tab Failed"),
    ("BacktestingLab", "Backtesting Lab Tab Failed"),
    ("AlertsMonitoring", "Alerts & Monitoring Tab Failed"),
    ("LogsDebugging", "Logs & Debugging Tab Failed")
]

print("1. ERROR BOUNDARY WRAPPER AUDIT:")
all_wrapped = True
for comp, err_title in sections:
    has_wrapper = err_title in page_tsx and comp in page_tsx
    print(f"  • {comp:<25}: Wrapped in ErrorBoundary ('{err_title}') -> {'PASS' if has_wrapper else 'FAIL'}")
    if not has_wrapper:
        all_wrapped = False

print(f"\nAll Major Sections Have Fault-Isolation Wrappers: {'YES' if all_wrapped else 'NO'}")

# Verify that each component has its own local error UI component
error_uis = [
    ("AccountSecurityError.tsx", "frontend/components/account-security/AccountSecurityError.tsx"),
    ("AlertError.tsx", "frontend/components/alerts/AlertError.tsx"),
    ("AnalyticsError.tsx", "frontend/components/analytics/AnalyticsError.tsx"),
    ("BacktestError.tsx", "frontend/components/backtesting/BacktestError.tsx"),
    ("LogsError.tsx", "frontend/components/logs/LogsError.tsx"),
    ("RiskError.tsx", "frontend/components/risk-management/RiskError.tsx")
]

print("\n2. LOCAL ERROR FALLBACK UI COMPONENTS AUDIT:")
for name, fpath in error_uis:
    exists = os.path.exists(fpath)
    print(f"  • {name:<30}: {'EXISTS (PASS)' if exists else 'MISSING (FAIL)'}")

print("\n" + "=" * 80)
print("FAULT ISOLATION AUDIT COMPLETE")
print("=" * 80)
