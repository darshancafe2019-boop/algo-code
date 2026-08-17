import asyncio
import json
import urllib.request
import websockets
import subprocess
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


async def inspect():
    user_data = r"C:\Users\Admin\AppData\Local\Temp\cdp_text_dump"
    cmd = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        "--remote-debugging-port=9666",
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        f"--user-data-dir={user_data}",
        "http://localhost:3001"
    ]
    proc = subprocess.Popen(cmd)
    time.sleep(3.0)
    try:
        with urllib.request.urlopen("http://127.0.0.1:9666/json") as r:
            targets = json.loads(r.read())
        p = next(t for t in targets if "3001" in t.get("url", ""))
        ws = await websockets.connect(p["webSocketDebuggerUrl"])
        
        # Click backtesting tab
        await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": "document.getElementById('nav-tab-backtesting').click()"}}))
        await asyncio.sleep(2.0)
        
        await ws.send(json.dumps({"id": 2, "method": "Runtime.evaluate", "params": {"expression": "document.querySelector('main').innerText", "returnByValue": True}}))
        
        while True:
            raw = await ws.recv()
            msg = json.loads(raw)
            if msg.get("id") == 2:
                print("MAIN TEXT:\n" + str(msg.get("result", {}).get("result", {}).get("value")))
                break
    finally:
        proc.terminate()

if __name__ == "__main__":
    asyncio.run(inspect())
