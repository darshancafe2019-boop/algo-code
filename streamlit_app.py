import os
import sqlite3
import sys
from pathlib import Path
from datetime import datetime, timezone

import pandas as pd
import streamlit as st
from streamlit_autorefresh import st_autorefresh

project_root = Path(__file__).resolve().parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src import config

st.set_page_config(page_title="BTC Bot Dashboard", page_icon="📈", layout="wide")
st_autorefresh(interval=10000, key="btc_dashboard_refresh")


@st.cache_data(ttl=5)
def load_summary() -> dict:
    conn = sqlite3.connect(str(config.DB_PATH))
    conn.row_factory = sqlite3.Row
    summary = {}
    summary["heartbeat"] = conn.execute("SELECT timestamp, status, details FROM heartbeat_log ORDER BY id DESC LIMIT 1").fetchone()
    summary["open_trade"] = conn.execute("SELECT * FROM trades_log WHERE status='OPEN' ORDER BY id DESC LIMIT 1").fetchone()
    summary["trade_history"] = conn.execute("SELECT * FROM trades_log ORDER BY id DESC LIMIT 10").fetchall()
    summary["signals"] = conn.execute("SELECT timestamp, signal_type, price, is_blocked, reason FROM signals_log ORDER BY id DESC LIMIT 20").fetchall()
    summary["errors"] = conn.execute("SELECT timestamp, error_message FROM system_errors ORDER BY id DESC LIMIT 10").fetchall()
    summary["health"] = conn.execute("SELECT * FROM system_health ORDER BY id DESC LIMIT 1").fetchone()
    conn.close()
    return {key: (dict(value) if value is not None else None) for key, value in summary.items()}


st.title("BTC Trading Bot Dashboard")
st.caption(f"{config.BOT_NAME} · {config.SYMBOL} · {config.TIMEFRAME}")

summary = load_summary()
heartbeat = summary.get("heartbeat") or {}
open_trade = summary.get("open_trade") or {}
health = summary.get("health") or {}

col1, col2, col3, col4 = st.columns(4)
col1.metric("Status", heartbeat.get("status", "UNKNOWN"))
col2.metric("Balance", f"{health.get('balance', 0):.2f} USDT")
col3.metric("Open Trade", "YES" if open_trade else "NO")
col4.metric("Internet", "CONNECTED" if health.get("internet_connected") else "OFFLINE")

with st.expander("Live Diagnostics", expanded=True):
    st.json({
        "exchange": config.EXCHANGE_NAME,
        "mode": config.TRADING_MODE,
        "timeframe": config.TIMEFRAME,
        "telegram_enabled": bool(config.TELEGRAM_BOT_TOKEN and config.TELEGRAM_CHAT_ID),
        "force_test_signal": config.FORCE_TEST_SIGNAL,
        "test_telegram_only": config.TEST_TELEGRAM_ONLY,
        "heartbeat": heartbeat,
        "health": health,
    })

st.subheader("Recent Signals")
signals_df = pd.DataFrame(summary.get("signals") or [])
if not signals_df.empty:
    st.dataframe(signals_df, use_container_width=True)
else:
    st.info("No signals recorded yet.")

st.subheader("Trade History")
trades_df = pd.DataFrame(summary.get("trade_history") or [])
if not trades_df.empty:
    st.dataframe(trades_df, use_container_width=True)
else:
    st.info("No trades recorded yet.")

st.subheader("Recent Errors")
errors_df = pd.DataFrame(summary.get("errors") or [])
if not errors_df.empty:
    st.dataframe(errors_df, use_container_width=True)
else:
    st.info("No errors recorded yet.")
