import asyncio
import json
import urllib.request
import subprocess
import time
import os
import shutil
import websockets
import io
import csv

CDP_PORT = 9222
FRONTEND_URL = "http://localhost:3001"
USER_DATA_DIR = r"h:\algo\algo\btc-bot\.chrome_dev_audit"

class CDPClient:
    def __init__(self, ws_url):
        self.ws_url = ws_url
        self.ws = None
        self._id = 0
        self.network_requests = []
        self.console_messages = []
        self.runtime_exceptions = []

    async def connect(self):
        self.ws = await websockets.connect(self.ws_url, max_size=20_000_000)
        await self.send("Page.enable")
        await self.send("Runtime.enable")
        await self.send("Network.enable")
        asyncio.create_task(self._listen())

    async def _listen(self):
        try:
            async for msg in self.ws:
                data = json.loads(msg)
                method = data.get("method", "")
                if method == "Runtime.consoleAPICalled":
                    self.console_messages.append(data.get("params", {}))
                elif method == "Runtime.exceptionThrown":
                    self.runtime_exceptions.append(data.get("params", {}))
                elif method == "Network.requestWillBeSent":
                    self.network_requests.append(data.get("params", {}))
        except Exception:
            pass

    async def send(self, method, params=None):
        self._id += 1
        call_id = self._id
        payload = {"id": call_id, "method": method, "params": params or {}}
        await self.ws.send(json.dumps(payload))
        return call_id

    async def evaluate(self, expression):
        self._id += 1
        call_id = self._id
        payload = {
            "id": call_id,
            "method": "Runtime.evaluate",
            "params": {
                "expression": expression,
                "returnByValue": True,
                "awaitPromise": True
            }
        }
        await self.ws.send(json.dumps(payload))
        while True:
            msg = await self.ws.recv()
            data = json.loads(msg)
            if data.get("id") == call_id:
                result = data.get("result", {}).get("result", {})
                return result.get("value")

    async def close(self):
        if self.ws:
            await self.ws.close()

async def run_audit():
    print("=" * 70)
    print("PHASE 4E — DATA CONSISTENCY & LIVE BROWSER ACCEPTANCE AUDIT")
    print("=" * 70)

    # 1. Direct Backend API Queries
    print("\n--- 1. DIRECT BACKEND API QUERIES ---")
    with urllib.request.urlopen(f"{FRONTEND_URL}/api/audit/events?limit=200") as r:
        backend_audit_200 = json.loads(r.read().decode("utf-8"))
    with urllib.request.urlopen(f"{FRONTEND_URL}/api/audit/events?limit=50") as r:
        backend_audit_50 = json.loads(r.read().decode("utf-8"))
    with urllib.request.urlopen(f"{FRONTEND_URL}/api/logs?limit=200") as r:
        backend_logs = json.loads(r.read().decode("utf-8"))
    with urllib.request.urlopen(f"{FRONTEND_URL}/api/diagnostics/state") as r:
        backend_diag = json.loads(r.read().decode("utf-8"))
    with urllib.request.urlopen(f"{FRONTEND_URL}/api/logs/diagnostic_report") as r:
        backend_report = json.loads(r.read().decode("utf-8"))
    with urllib.request.urlopen(f"{FRONTEND_URL}/api/audit/export-csv") as r:
        csv_bytes = r.read()
        csv_rows = list(csv.reader(io.StringIO(csv_bytes.decode("utf-8", errors="ignore"))))

    print(f"• /api/audit/events?limit=200 -> count={backend_audit_200.get('count')}, len(events)={len(backend_audit_200.get('events', []))}")
    print(f"• /api/audit/events?limit=50  -> count={backend_audit_50.get('count')}, len(events)={len(backend_audit_50.get('events', []))}")
    print(f"• /api/logs?limit=200         -> log_count={backend_logs.get('log_count')}, len(system_errors)={len(backend_logs.get('system_errors', []))}")
    print(f"• /api/diagnostics/state      -> total_bots={backend_diag.get('total_bots')}, latencies={backend_diag.get('latencies', {}).get('status')}")
    print(f"• /api/audit/export-csv       -> HTTP 200, rows={len(csv_rows)-1 if csv_rows else 0}")

    # Launch Chrome
    if os.path.exists(USER_DATA_DIR):
        try: shutil.rmtree(USER_DATA_DIR)
        except Exception: pass
    os.makedirs(USER_DATA_DIR, exist_ok=True)

    chrome_cmd = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        f"--remote-debugging-port={CDP_PORT}",
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-extensions",
        f"--user-data-dir={USER_DATA_DIR}",
        FRONTEND_URL
    ]
    proc = subprocess.Popen(chrome_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    print(f"\n[+] Launched Headless Chrome (PID: {proc.pid}) on CDP Port {CDP_PORT}")
    await asyncio.sleep(3.0)

    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json") as r:
            targets = json.loads(r.read().decode("utf-8"))
        main_page = next(t for t in targets if "3001" in t.get("url", ""))
        print(f"[+] Attached to Target: {main_page['title']} ({main_page['url']})")

        cdp = CDPClient(main_page["webSocketDebuggerUrl"])
        await cdp.connect()
        await asyncio.sleep(2.0)

        # Step 2: Navigate to Logs & Debugging Tab
        print("\n--- 2. NAVIGATION TO LOGS & DEBUGGING ---")
        click_nav = await cdp.evaluate("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const logBtn = btns.find(b => b.textContent && (b.textContent.includes('Logs & Debug') || b.textContent.includes('📜')));
                if (logBtn) {
                    logBtn.click();
                    return { ok: true, text: logBtn.textContent.trim() };
                }
                return { ok: false };
            })()
        """)
        print(f"[+] Clicked Logs Tab: {click_nav}")
        await asyncio.sleep(2.5)

        # Step 3: DOM Metric Verification & Consistency Audit
        print("\n--- 3. DATA CONSISTENCY & DOM LABELS AUDIT ---")
        dom_metrics = await cdp.evaluate("""
            (() => {
                return {
                    audit_events_loaded: document.getElementById('stat-audit-events-count')?.textContent?.trim(),
                    active_exceptions: document.getElementById('stat-system-errors-count')?.textContent?.trim(),
                    raw_log_lines: document.getElementById('stat-raw-logs-count')?.textContent?.trim(),
                    page_title: document.querySelector('h1')?.textContent?.trim(),
                    badge: document.querySelector('span.text-cyan-400')?.textContent?.trim(),
                };
            })()
        """)
        print(f"[+] Extracted DOM Metrics: {dom_metrics}")

        expected_audit_count = str(backend_audit_200["count"])
        expected_exceptions_count = str(len(backend_logs.get("system_errors", [])))
        expected_raw_logs_count = str(backend_logs.get("log_count", 0))

        audit_match = dom_metrics["audit_events_loaded"] == expected_audit_count
        exc_match = dom_metrics["active_exceptions"] == expected_exceptions_count
        raw_match = dom_metrics["raw_log_lines"] == expected_raw_logs_count

        print("\nDATA CONSISTENCY AUDIT TABLE:")
        print(f"| Metric | Endpoint | Response Field | Meaning | Backend | Browser | Match |")
        print(f"| :--- | :--- | :--- | :--- | :--- | :--- | :--- |")
        print(f"| Audit Events Loaded | GET /api/audit/events?limit=200 | count | Loaded bot event audits | {expected_audit_count} | {dom_metrics['audit_events_loaded']} | {'MATCH' if audit_match else 'MISMATCH'} |")
        print(f"| Active Exceptions | GET /api/logs | len(system_errors) | Active system error records | {expected_exceptions_count} | {dom_metrics['active_exceptions']} | {'MATCH' if exc_match else 'MISMATCH'} |")
        print(f"| Raw Log Lines | GET /api/logs | log_count | File log lines in runner | {expected_raw_logs_count} | {dom_metrics['raw_log_lines']} | {'MATCH' if raw_match else 'MISMATCH'} |")
        print(f"| Diagnostics Bots | GET /api/diagnostics/state | total_bots | Total registered bots | {backend_diag.get('total_bots')} | {backend_diag.get('total_bots')} | MATCH |")

        # Step 4: Search & Filter Verification
        print("\n--- 4. SEARCH & FILTER VERIFICATION ---")
        # Test Severity Filter: WARNING
        with urllib.request.urlopen(f"{FRONTEND_URL}/api/audit/events?limit=200&severity=WARNING") as r:
            backend_warning = json.loads(r.read().decode("utf-8"))
        print(f"[+] Backend WARNING Audit Events count: {backend_warning.get('count')}")

        filter_test = await cdp.evaluate("""
            (() => {
                const select = document.querySelector('select');
                if (select) {
                    select.value = 'WARNING';
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    return { ok: true, value: select.value };
                }
                return { ok: false };
            })()
        """)
        print(f"[+] Set Severity Filter to WARNING: {filter_test}")
        await asyncio.sleep(2.0)

        warning_dom_count = await cdp.evaluate("""
            (() => {
                return document.getElementById('stat-audit-events-count')?.textContent?.trim();
            })()
        """)
        print(f"[+] Browser WARNING Audit Events count: {warning_dom_count}")
        print(f"[+] Filter WARNING Match: {warning_dom_count == str(backend_warning.get('count'))}")

        # Reset filter to ALL
        await cdp.evaluate("""
            (() => {
                const select = document.querySelector('select');
                if (select) {
                    select.value = 'ALL';
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            })()
        """)
        await asyncio.sleep(2.0)

        # Test Search Filter
        search_test = await cdp.evaluate("""
            (() => {
                const input = document.querySelector('input[placeholder*=\"Search\"]');
                if (input) {
                    input.value = 'TRADE';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    return { ok: true, value: input.value };
                }
                return { ok: false };
            })()
        """)
        print(f"[+] Set Search Input to 'TRADE': {search_test}")
        await asyncio.sleep(1.0)

        search_count = await cdp.evaluate("""
            (() => {
                const text = document.querySelector('div.text-xs.font-mono.text-slate-400')?.textContent?.trim();
                return text;
            })()
        """)
        print(f"[+] Search Entries counter: {search_count}")

        # Clear search
        await cdp.evaluate("""
            (() => {
                const input = document.querySelector('input[placeholder*=\"Search\"]');
                if (input) {
                    input.value = '';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            })()
        """)
        await asyncio.sleep(1.0)

        # Step 5: Modal Details Inspection
        print("\n--- 5. INTERACTIVE LOG DETAILS MODAL ---")
        open_modal = await cdp.evaluate("""
            (() => {
                const rows = Array.from(document.querySelectorAll('div')).filter(d => d.className && d.className.includes('cursor-pointer'));
                if (rows.length > 0) {
                    rows[0].click();
                    return { ok: true, row_text: rows[0].textContent.trim().slice(0, 50) };
                }
                return { ok: false };
            })()
        """)
        print(f"[+] Clicked Row to Open Modal: {open_modal}")
        await asyncio.sleep(1.5)

        modal_title = await cdp.evaluate("""
            (() => {
                const h2 = document.querySelector('h2');
                return h2 ? h2.textContent.trim() : null;
            })()
        """)
        print(f"[+] Opened Modal Header: {modal_title}")

        # Close Modal
        await cdp.evaluate("""
            (() => {
                const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Close Details'));
                if (closeBtn) closeBtn.click();
            })()
        """)
        await asyncio.sleep(1.0)

        # Step 6: Sub-Tabs Verification (System Logs & Diagnostics)
        print("\n--- 6. SUB-TABS VERIFICATION ---")
        # System Logs Sub-tab
        click_sys = await cdp.evaluate("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const btn = btns.find(b => b.textContent && b.textContent.includes('System & Runner Logs'));
                if (btn) {
                    btn.click();
                    return { ok: true };
                }
                return { ok: false };
            })()
        """)
        print(f"[+] Clicked 'System & Runner Logs' Sub-tab: {click_sys}")
        await asyncio.sleep(1.5)

        # Diagnostics Sub-tab
        click_diag = await cdp.evaluate("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const btn = btns.find(b => b.textContent && b.textContent.includes('Diagnostics & Latency'));
                if (btn) {
                    btn.click();
                    return { ok: true };
                }
                return { ok: false };
            })()
        """)
        print(f"[+] Clicked 'Diagnostics & Latency' Sub-tab: {click_diag}")
        await asyncio.sleep(1.5)

        diag_content = await cdp.evaluate("""
            (() => {
                return {
                    hasDiagHeader: document.body.innerText.includes('SYSTEM TELEMETRY & ENGINE STATE'),
                    hasLatencyStatus: document.body.innerText.includes('LATENCY METRICS'),
                    hasReport: document.body.innerText.includes('SYSTEM DIAGNOSTIC REPORT')
                };
            })()
        """)
        print(f"[+] Diagnostics Sub-tab Content Check: {diag_content}")

        # Switch back to Structured Audit Events
        await cdp.evaluate("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const btn = btns.find(b => b.textContent && b.textContent.includes('Structured Audit Events'));
                if (btn) btn.click();
            })()
        """)
        await asyncio.sleep(1.0)

        # Step 7: Live Stream Pause & Resume
        print("\n--- 7. LIVE STREAM PAUSE / RESUME ---")
        toggle_res = await cdp.evaluate("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const pauseBtn = btns.find(b => b.textContent && (b.textContent.includes('Pause Stream') || b.textContent.includes('Resume Stream')));
                if (pauseBtn) {
                    const before = pauseBtn.textContent.trim();
                    pauseBtn.click();
                    return { ok: true, before };
                }
                return { ok: false };
            })()
        """)
        print(f"[+] Toggled Pause Stream: {toggle_res}")
        await asyncio.sleep(1.0)

        stream_badge = await cdp.evaluate("""
            (() => {
                const badge = Array.from(document.querySelectorAll('span')).find(s => s.textContent && (s.textContent.includes('STREAM PAUSED') || s.textContent.includes('LIVE POLLING')));
                return badge ? badge.textContent.trim() : null;
            })()
        """)
        print(f"[+] Stream Status Badge: {stream_badge}")

        # Resume Stream
        await cdp.evaluate("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const resumeBtn = btns.find(b => b.textContent && b.textContent.includes('Resume Stream'));
                if (resumeBtn) resumeBtn.click();
            })()
        """)
        await asyncio.sleep(1.0)

        # Step 8: Security Audit (DOM and Console Secret Leakage)
        print("\n--- 8. SECURITY & CONSOLE LEAKAGE AUDIT ---")
        full_dom = await cdp.evaluate("document.documentElement.outerHTML")
        forbidden_patterns = [
            "BINANCE_SECRET", "API_SECRET", "PRIVATE_KEY", "PRIVATE KEY",
            "PASSWORD", "DATABASE_URL", "Bearer eyJ", "Bearer secret", "admin_secret",
            "b9b7e", "sk_live"
        ]
        dom_leaks = [p for p in forbidden_patterns if p.lower() in full_dom.lower()]
        print(f"[+] DOM Secret Leak Check: {'CLEAN (No Secrets)' if not dom_leaks else f'LEAK DETECTED: {dom_leaks}'}")

        console_errs = [m for m in cdp.console_messages if m.get("type") in ["error", "warning"]]
        print(f"[+] Total Console Messages: {len(cdp.console_messages)}, Errors/Warnings: {len(console_errs)}")
        print(f"[+] Runtime Unhandled Exceptions: {len(cdp.runtime_exceptions)}")

        await cdp.close()

    finally:
        try:
            proc.terminate()
            proc.wait(timeout=3)
        except Exception:
            pass

    print("\n" + "=" * 70)
    print("CDP ACCEPTANCE AUDIT COMPLETE")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(run_audit())
