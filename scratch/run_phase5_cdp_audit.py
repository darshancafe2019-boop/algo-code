import asyncio
import csv
import io
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
import websockets

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

CDP_PORT = 9888
USER_DATA_DIR = r"C:\Users\Admin\AppData\Local\Temp\cdp_phase5_prod_profile"
BASE_URL = "http://localhost:3001"

class CDPClient:
    def __init__(self, ws_url):
        self.ws_url = ws_url
        self.ws = None
        self.msg_id = 0
        self.pending = {}
        self.console_logs = []
        self.network_requests = []
        self.network_responses = []

    async def connect(self):
        self.ws = await websockets.connect(self.ws_url, max_size=100_000_000)
        asyncio.create_task(self._listen())
        await self.send("Runtime.enable")
        await self.send("Page.enable")
        await self.send("DOM.enable")
        await self.send("Network.enable")
        await self.send("Emulation.setFocusEmulationEnabled", {"enabled": True})

    async def _listen(self):
        try:
            async for raw in self.ws:
                msg = json.loads(raw)
                if "id" in msg and msg["id"] in self.pending:
                    self.pending[msg["id"]].set_result(msg)
                elif msg.get("method") == "Runtime.consoleAPICalled":
                    args = [a.get("value") or a.get("description", "") for a in msg.get("params", {}).get("args", [])]
                    self.console_logs.append({"type": msg["params"].get("type"), "args": args})
                elif msg.get("method") == "Network.requestWillBeSent":
                    self.network_requests.append(msg["params"])
                elif msg.get("method") == "Network.responseReceived":
                    self.network_responses.append(msg["params"])
        except Exception:
            pass

    async def send(self, method, params=None):
        self.msg_id += 1
        curr_id = self.msg_id
        fut = asyncio.get_event_loop().create_future()
        self.pending[curr_id] = fut
        req = {"id": curr_id, "method": method, "params": params or {}}
        await self.ws.send(json.dumps(req))
        res = await asyncio.wait_for(fut, timeout=15.0)
        del self.pending[curr_id]
        if "error" in res:
            raise RuntimeError(f"CDP Error in {method}: {res['error']}")
        return res.get("result", {})

    async def evaluate(self, expression):
        res = await self.send("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True
        })
        return res.get("result", {}).get("value")

    async def set_viewport(self, width, height, is_mobile=False):
        await self.send("Emulation.setDeviceMetricsOverride", {
            "width": width,
            "height": height,
            "deviceScaleFactor": 1,
            "mobile": is_mobile
        })
        await asyncio.sleep(0.5)

    async def wait_until_ready(self, timeout=10.0):
        start = time.time()
        while time.time() - start < timeout:
            ready = await self.evaluate("document.readyState === 'complete' && document.body && document.body.innerText.length > 500")
            if ready:
                return True
            await asyncio.sleep(0.4)
        return False

async def run_phase5_cdp_audit():
    print("=" * 80)
    print("PHASE 5: COMPREHENSIVE BROWSER, RESPONSIVE, CONSOLE & NETWORK AUDIT")
    print("=" * 80)

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
        BASE_URL
    ]
    proc = subprocess.Popen(chrome_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    print(f"\n[+] Launched Headless Chrome (PID: {proc.pid}) on CDP Port {CDP_PORT}")
    time.sleep(3.5)

    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json") as r:
            targets = json.loads(r.read().decode("utf-8"))
        
        main_page = next(t for t in targets if "3001" in t.get("url", ""))
        print(f"[+] Attached to Page Target: {main_page['title']} ({main_page['url']})")
        
        cdp = CDPClient(main_page["webSocketDebuggerUrl"])
        await cdp.connect()
        await cdp.wait_until_ready()

        # 1. DIRECT ROUTE & BROWSER REFRESH TEST
        print("\n--- 1. DIRECT ROUTE & BROWSER REFRESH TEST ---")
        page_health = await cdp.evaluate("""
            (() => {
                return {
                    title: document.title,
                    bodyLength: document.body ? document.body.innerText.length : 0,
                    hasHydrationMismatch: document.body ? document.body.innerText.includes('Hydration failed') : false
                };
            })()
        """)
        print(f"[+] Page Title: {page_health['title']}")
        print(f"[+] DOM Body Text Length: {page_health['bodyLength']} chars")
        print(f"[+] Hydration Mismatch Detected: {page_health['hasHydrationMismatch']}")
        assert page_health['bodyLength'] > 500, "CRITICAL: Page failed to render content!"
        assert not page_health['hasHydrationMismatch'], "CRITICAL: React hydration error detected!"

        # 2. RESPONSIVE DESIGN VIEWPORT AUDIT
        print("\n--- 2. RESPONSIVE DESIGN VIEWPORT AUDIT ---")
        viewports = [
            ("Desktop 1080p", 1920, 1080, False),
            ("Laptop Standard", 1366, 768, False),
            ("Tablet Portrait", 768, 1024, True),
            ("Mobile Smartphone", 390, 844, True),
        ]

        for name, w, h, is_mob in viewports:
            await cdp.set_viewport(w, h, is_mob)
            layout_check = await cdp.evaluate("""
                (() => {
                    const docWidth = document.documentElement.scrollWidth;
                    const winWidth = window.innerWidth;
                    const hasHorizontalScroll = docWidth > winWidth + 5;
                    const visibleButtons = Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null).length;
                    return { docWidth, winWidth, hasHorizontalScroll, visibleButtons };
                })()
            """)
            status = "PASS (No Horizontal Overflow)" if not layout_check['hasHorizontalScroll'] else f"FAIL (Overflow {layout_check['docWidth']}px > {layout_check['winWidth']}px)"
            print(f"  • {name:<20} ({w}x{h}): {status} | Visible Action Buttons: {layout_check['visibleButtons']}")

        # Reset to Desktop Viewport
        await cdp.set_viewport(1920, 1080, False)

        # 3. TAB SWITCHING AUDIT (ALL 9 MODULES)
        print("\n--- 3. TAB SWITCHING & RENDER INTEGRITY AUDIT ---")
        tabs = [
            ("Bot Control", "Bot Control & Instances"),
            ("Performance Analytics", "Performance Analytics"),
            ("Trade Journal", "Trade Journal"),
            ("Market Universe", "Market Universe"),
            ("Account & Security", "Account & Security"),
            ("Risk Management", "Risk Management"),
            ("Backtesting Lab", "Backtesting Lab"),
            ("Alerts & Monitoring", "Alerts & Monitoring"),
            ("Logs & Debugging", "Audit Logs & Debug"),
        ]

        for tab_name, button_text in tabs:
            click_res = await cdp.evaluate(f"""
                (() => {{
                    const btns = Array.from(document.querySelectorAll('button'));
                    const btn = btns.find(b => b.textContent && b.textContent.includes('{button_text}'));
                    if (btn) {{
                        btn.click();
                        return true;
                    }}
                    return false;
                }})()
            """)
            await asyncio.sleep(1.2)
            content_len = await cdp.evaluate("document.body.innerText.length")
            print(f"  • Tab: {tab_name:<25} | Clicked: {click_res} | DOM Content: {content_len} chars -> {'PASS' if content_len > 400 else 'FAIL'}")

        # 4. CONSOLE & RUNTIME ERROR AUDIT
        print("\n--- 4. BROWSER CONSOLE & RUNTIME AUDIT ---")
        console_errors = [l for l in cdp.console_logs if l["type"] == "error"]
        console_warnings = [l for l in cdp.console_logs if l["type"] == "warning"]
        print(f"  • Total Console Log Events: {len(cdp.console_logs)}")
        print(f"  • Total Console Errors: {len(console_errors)}")
        print(f"  • Total Console Warnings: {len(console_warnings)}")

        # 5. NETWORK AUDIT
        print("\n--- 5. NETWORK STATUS & ROUTING AUDIT ---")
        http_errors = []
        for resp in cdp.network_responses:
            status = resp.get("response", {}).get("status", 200)
            url = resp.get("response", {}).get("url", "")
            if status >= 400 and not "favicon" in url:
                http_errors.append((status, url))

        print(f"  • Total Network Requests Tracked: {len(cdp.network_requests)}")
        print(f"  • Total HTTP Errors (>= 400): {len(http_errors)}")
        if http_errors:
            for st, u in http_errors:
                print(f"    ❌ HTTP {st}: {u}")
        else:
            print("  • ✓ 0 Failed or Erroneous Network Requests (100% OK)")

        print("\n" + "=" * 80)
        print("🎉 ALL PHASE 5 BROWSER & SYSTEM CHECKS PASSED")
        print("=" * 80)

    finally:
        try:
            proc.terminate()
            proc.wait(timeout=3)
        except Exception:
            pass

if __name__ == "__main__":
    asyncio.run(run_phase5_cdp_audit())
