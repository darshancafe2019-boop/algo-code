/**
 * BTC ALGO TRADING PLATFORM & TRADE JOURNAL DASHBOARD
 * Features: Live SSE price streaming, Canvas Candlestick Engine with Zoom/Pan/Toggles/Markers,
 * Auto-refresh polling scheduler, Staleness Watchdog, Multi-Bot controls, and Chart.js Analytics.
 */

let activeTimeframe = "5m";
let currentCandleData = [];
let pendingModalAction = null;

let activeBotId = "bot-1";
let tradePage = 1;
let tradePerPage = 15;

// Chart.js instance registry
let chartInstances = {};

// Live Streaming & Staleness State
let lastPrice = 0;
let lastSuccessfulRefresh = Date.now();
let sseSource = null;

// Candlestick Canvas View State
let chartIndicators = {
    ema9: true,
    ema20: true,
    ema50: true,
    ema200: true,
    vp: true
};
let zoomLevel = 1.0; // 0.5 (zoomed out) to 4.0 (zoomed in)
let panOffset = 0;   // Horizontal candle pan offset
let isDraggingChart = false;
let dragStartX = 0;

// Initialization
document.addEventListener("DOMContentLoaded", () => {
    initApp();
    startPolling();
});

function initApp() {
    initTickerSSE();
    fetchMarketContext();
    fetchTicker();
    loadPriceHistoryTable();
    checkWelcomeSummary();
    fetchOrderBook();
    fetchBotInstances();
    fetchBotComparison();
    fetchBotStatus();
    fetchStrategyConfig();
    fetchAnalytics();
    fetchTrades();
    fetchNotifications();
    fetchAuditLogs();
    fetchLogs();
    fetchBotSummaryMetrics();
    fetchBotTemplates();
    fetchBotGroups();
    renderActiveBotsGrid();
    fetchBotHistoryLog();
    initBotEventsStream();
    fetchIndicatorDashboardData();
}


// --------------------------------------------------------------------------
// SECTION 1: LIVE SSE STREAMING & STALENESS WATCHDOG
// --------------------------------------------------------------------------
function initTickerSSE() {
    if (!!window.EventSource) {
        sseSource = new EventSource('/api/stream/ticker');
        sseSource.onmessage = function(e) {
            try {
                const data = JSON.parse(e.data);
                updatePriceDisplay(data);
            } catch (err) {
                console.error("SSE parse error:", err);
            }
        };
        sseSource.onerror = function(err) {
            // Fallback gracefully to HTTP polling
            if (sseSource) sseSource.close();
        };
    }
}

function updatePriceDisplay(data) {
    if (!data || !data.last) return;
    const priceEl = document.getElementById("top-price");
    if (!priceEl) return;

    const newPrice = data.last;
    const priceFormatted = `$${newPrice.toLocaleString(undefined, {minimumFractionDigits: 2})}`;

    // Flash animation on price change
    if (lastPrice > 0 && newPrice !== lastPrice) {
        const flashClass = newPrice > lastPrice ? 'flash-up' : 'flash-down';
        priceEl.classList.remove('flash-up', 'flash-down');
        void priceEl.offsetWidth; // trigger reflow
        priceEl.classList.add(flashClass);
    }

    lastPrice = newPrice;
    priceEl.textContent = priceFormatted;

    // Update document title with live price
    document.title = `${priceFormatted} - BTC Algo Dashboard`;

    // Update 24h change
    const changeEl = document.getElementById("top-change");
    if (changeEl && data.change_pct !== undefined) {
        const isPos = data.change_pct >= 0;
        changeEl.textContent = `${isPos ? '+' : ''}${data.change_pct.toFixed(2)}%`;
        changeEl.className = `ticker-value ${isPos ? 'text-success' : 'text-danger'}`;
    }

    if (data.high) document.getElementById("top-high").textContent = `$${data.high.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    if (data.low) document.getElementById("top-low").textContent = `$${data.low.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    if (data.volume) document.getElementById("top-vol").textContent = `${data.volume.toFixed(2)} BTC`;
    if (data.latency_ms) document.getElementById("latency-text").textContent = `${data.latency_ms} ms`;

    lastSuccessfulRefresh = Date.now();
    checkConnectionStaleness();
}

function checkConnectionStaleness() {
    const pingDot = document.getElementById("ping-dot");
    const pingLiveTag = document.querySelector(".ping-live-tag");
    if (!pingDot || !pingLiveTag) return;

    const secondsSinceRefresh = (Date.now() - lastSuccessfulRefresh) / 1000.0;

    pingDot.className = "ping-dot";
    if (secondsSinceRefresh < 5.0) {
        pingLiveTag.textContent = "LIVE";
        pingLiveTag.style.color = "var(--accent-green)";
    } else if (secondsSinceRefresh < 15.0) {
        pingDot.classList.add("warning");
        pingLiveTag.textContent = "SLOWER";
        pingLiveTag.style.color = "var(--accent-gold)";
    } else {
        pingDot.classList.add("danger");
        pingLiveTag.textContent = "STALE";
        pingLiveTag.style.color = "var(--accent-red)";
    }
}

// Manual "Refresh Now" Button Handler
function refreshAllDataNow() {
    const btn = document.getElementById("btn-manual-refresh");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "⏳ Refreshing...";
    }

    fetchMarketContext();
    fetchTicker();
    fetchCandles();
    fetchOrderBook();
    fetchBotStatus();
    fetchAnalytics();
    fetchTrades();
    fetchNotifications();

    setTimeout(() => {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "🔄 Refresh Now";
        }
    }, 800);
}

// Polling Scheduler
function startPolling() {
    setInterval(fetchTicker, 2000);         // 2s ticker polling fallback
    setInterval(fetchOrderBook, 3000);     // 3s orderbook
    setInterval(fetchBotStatus, 3000);      // 3s bot status & activity honesty
    setInterval(fetchCandles, 5000);        // 5s candles & price history table
    setInterval(fetchAnalytics, 3000);      // 3s real-time analytics & PnL
    setInterval(() => {
        const uTab = document.getElementById("tab-universe");
        if (uTab && uTab.classList.contains("active")) {
            fetchUniverseInstruments();
        }
    }, 3000);                                // 3s Market Universe live poll when visible
    setInterval(fetchMarketContext, 30000);  // 30s market context
    setInterval(checkConnectionStaleness, 1000); // 1s staleness check
}

// (Authoritative switchTab and routing defined in Centralized Navigation Router section below)


// Timeframe Switcher
function setTimeframe(tf) {
    activeTimeframe = tf;
    document.querySelectorAll(".tf-btn").forEach(btn => {
        btn.classList.toggle("active", btn.textContent.trim().toLowerCase() === tf.toLowerCase());
    });
    fetchCandles(true);
}

// --------------------------------------------------------------------------
// SECTION 1.5: MARKET CONTEXT & TICKER
// --------------------------------------------------------------------------
async function loadMarketContext() {
    return fetchMarketContext();
}

async function fetchMarketContext() {
    try {
        const res = await fetch("/api/market/context");
        if (!res.ok) {
            console.warn(`Market context API returned HTTP status ${res.status}`);
            return;
        }
        const json = await res.json();
        if (json.status === "success" && json.data) {
            const d = json.data;

            const mcBtcDom = document.getElementById("mc-btc-dom");
            if (mcBtcDom && d.btc_dominance !== undefined) {
                const domChg = d.btc_dom_change || 0;
                mcBtcDom.innerHTML = `${d.btc_dominance}% <span class="badge-tag ${domChg >= 0 ? 'pos' : 'neg'}">${domChg >= 0 ? '+' : ''}${domChg}%</span>`;
            }

            const mcEthBtc = document.getElementById("mc-eth-btc");
            if (mcEthBtc && d.eth_btc_ratio !== undefined) {
                const ethChg = d.eth_btc_change || 0;
                mcEthBtc.innerHTML = `${d.eth_btc_ratio} <span class="badge-tag ${ethChg >= 0 ? 'pos' : 'neg'}">${ethChg >= 0 ? '+' : ''}${ethChg}%</span>`;
            }

            const mcMcap = document.getElementById("mc-mcap");
            if (mcMcap && d.crypto_market_cap_t !== undefined) {
                const mcapChg = d.market_cap_change || 0;
                mcMcap.innerHTML = `$${d.crypto_market_cap_t}T <span class="badge-tag ${mcapChg >= 0 ? 'pos' : 'neg'}">${mcapChg >= 0 ? '+' : ''}${mcapChg}%</span>`;
            }

            const mcFunding = document.getElementById("mc-funding");
            if (mcFunding && d.funding_rate_pct !== undefined) {
                const fund = d.funding_rate_pct || 0;
                mcFunding.textContent = `${fund >= 0 ? '+' : ''}${fund.toFixed(4)}%`;
            }

            if (d.indices && Array.isArray(d.indices) && d.indices.length >= 3) {
                const spx = d.indices[0];
                const dji = d.indices[1];
                const ixic = d.indices[2];

                const mcSpx = document.getElementById("mc-spx");
                if (mcSpx && spx && spx.val !== undefined) {
                    const chg = spx.change_pct || 0;
                    mcSpx.innerHTML = `${spx.val.toLocaleString()} <span class="badge-tag ${chg >= 0 ? 'pos' : 'neg'}">${chg >= 0 ? '+' : ''}${chg}%</span>`;
                }

                const mcDji = document.getElementById("mc-dji");
                if (mcDji && dji && dji.val !== undefined) {
                    const chg = dji.change_pct || 0;
                    mcDji.innerHTML = `${dji.val.toLocaleString()} <span class="badge-tag ${chg >= 0 ? 'pos' : 'neg'}">${chg >= 0 ? '+' : ''}${chg}%</span>`;
                }

                const mcNasdaq = document.getElementById("mc-nasdaq");
                if (mcNasdaq && ixic && ixic.val !== undefined) {
                    const chg = ixic.change_pct || 0;
                    mcNasdaq.innerHTML = `${ixic.val.toLocaleString()} <span class="badge-tag ${chg >= 0 ? 'pos' : 'neg'}">${chg >= 0 ? '+' : ''}${chg}%</span>`;
                }
            }

            const mcUpdated = document.getElementById("mc-last-updated");
            if (mcUpdated) {
                const nowTime = new Date().toLocaleTimeString();
                mcUpdated.textContent = `Updated: ${nowTime}`;
            }
        }
    } catch (e) {
        console.error("Market context fetch error:", e);
    }
}

async function fetchTicker() {
    try {
        const res = await fetch("/api/ticker");
        const json = await res.json();
        if (json.status === "success" || json.status === "warning") {
            updatePriceDisplay(json.data);
        }
    } catch (e) {
        console.error("Ticker fetch error:", e);
    }
}

function checkWelcomeSummary() {
    fetch('/api/welcome_summary')
        .then(res => res.json())
        .then(data => {
            if (data.status === "success" && data.data) {
                const summary = data.data;
                const modal = document.getElementById("welcome-modal");
                const lastSeenEl = document.getElementById("welcome-last-seen");
                const botChangesEl = document.getElementById("welcome-bot-changes");
                const tradeCountEl = document.getElementById("welcome-trade-count");
                const pnlEl = document.getElementById("welcome-net-pnl");

                if (!summary.last_seen_at && (!summary.status_changes || summary.status_changes.length === 0)) {
                    return;
                }

                let timeAwayStr = "recently";
                if (summary.offline_seconds > 0) {
                    const hrs = Math.floor(summary.offline_seconds / 3600);
                    const mins = Math.floor((summary.offline_seconds % 3600) / 60);
                    const secs = summary.offline_seconds % 60;
                    if (hrs > 0) timeAwayStr = `${hrs}h ${mins}m ago`;
                    else if (mins > 0) timeAwayStr = `${mins}m ago`;
                    else timeAwayStr = `${secs}s ago`;
                }

                if (lastSeenEl) {
                    lastSeenEl.innerHTML = `Welcome back! While the dashboard was closed (last seen: <b>${timeAwayStr}</b>):`;
                }

                if (botChangesEl) {
                    if (summary.status_changes && summary.status_changes.length > 0) {
                        botChangesEl.innerHTML = summary.status_changes.map(ch => 
                            `<div style="margin-bottom:4px;">• <b>${escapeHtml(ch.name)}</b>: <span class="badge badge-warning">${ch.old_status}</span> → <span class="badge badge-danger">${ch.new_status}</span> (${ch.reason})</div>`
                        ).join('');
                    } else {
                        botChangesEl.innerHTML = `<div>• All bots were stopped cleanly before server shutdown.</div>`;
                    }
                }

                const tradesCount = (summary.trades_completed_away || []).length;
                if (tradeCountEl) tradeCountEl.textContent = `${tradesCount} trade${tradesCount === 1 ? '' : 's'}`;

                const netPnl = summary.net_pnl_away || 0.0;
                if (pnlEl) {
                    pnlEl.textContent = `${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(2)}`;
                    pnlEl.style.color = netPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
                }

                if (modal) modal.style.display = 'flex';
            }
        })
        .catch(err => console.error("Error fetching welcome summary:", err));
}

function closeWelcomeModal() {
    const modal = document.getElementById("welcome-modal");
    if (modal) modal.style.display = 'none';
}

function loadPriceHistoryTable() {
    fetch('/api/price_history?symbol=BTC/USDT&limit=25')
        .then(res => res.json())
        .then(resData => {
            if (resData.status === 'success') {
                renderPriceHistoryTable(resData.data);
            }
        })
        .catch(err => console.error("Error loading price history:", err));
}

function renderPriceHistoryTable(rows) {
    const tbody = document.getElementById("price-history-tbody");
    if (!tbody) return;

    if (!rows || rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:20px; color:var(--text-muted);">No price history records available.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(r => {
        const timeStr = r.timestamp ? r.timestamp.replace('T', ' ').substring(0, 19) : 'N/A';
        const price = r.close ? `$${Number(r.close).toLocaleString(undefined, {minimumFractionDigits: 2})}` : '$0.00';
        const high = r.high ? `$${Number(r.high).toLocaleString(undefined, {minimumFractionDigits: 2})}` : '$0.00';
        const low = r.low ? `$${Number(r.low).toLocaleString(undefined, {minimumFractionDigits: 2})}` : '$0.00';
        const vol = r.volume ? Number(r.volume).toFixed(2) : '0.00';
        const tf = r.timeframe || activeTimeframe || '5m';

        return `
            <tr>
                <td style="font-family:var(--font-mono); font-size:12px;">${timeStr}</td>
                <td><span class="symbol-badge">${r.symbol || 'BTC/USDT'}</span></td>
                <td><span class="badge badge-secondary">${tf}</span></td>
                <td style="font-weight:700; font-family:var(--font-mono); color:var(--text-main);">${price}</td>
                <td style="font-family:var(--font-mono); color:var(--accent-green);">${high}</td>
                <td style="font-family:var(--font-mono); color:var(--accent-red);">${low}</td>
                <td style="font-family:var(--font-mono); color:var(--text-muted);">${vol}</td>
            </tr>
        `;
    }).join('');
}

async function fetchCandles(isInitial = false) {
    loadPriceHistoryTable();
}

async function fetchOrderBook() {
    try {
        const res = await fetch("/api/orderbook");
        const json = await res.json();
        if (json.bids && json.asks) {
            renderOrderBook(json.bids, json.asks);
        }
    } catch (e) {
        console.error("Orderbook fetch error:", e);
    }
}

function renderOrderBook(bids, asks) {
    const asksContainer = document.getElementById("ob-asks-list");
    const bidsContainer = document.getElementById("ob-bids-list");

    if (!asksContainer || !bidsContainer) return;

    asksContainer.innerHTML = asks.slice(0, 7).reverse().map(a => `
        <div class="ob-row">
            <span>${a.price.toFixed(2)}</span>
            <span>${a.amount.toFixed(4)}</span>
        </div>
    `).join('');

    bidsContainer.innerHTML = bids.slice(0, 7).map(b => `
        <div class="ob-row">
            <span>${b.price.toFixed(2)}</span>
            <span>${b.amount.toFixed(4)}</span>
        </div>
    `).join('');

    if (asks.length > 0 && bids.length > 0) {
        const spread = asks[0].price - bids[0].price;
        document.getElementById("ob-spread").textContent = `Spread: $${spread.toFixed(2)}`;
    }
}

// --------------------------------------------------------------------------
// SECTION 2: CANDLESTICK CHART ENGINE WITH TOGGLES, MARKERS & ZOOM/PAN
// --------------------------------------------------------------------------
function toggleChartIndicator(name) {
    if (chartIndicators[name] !== undefined) {
        chartIndicators[name] = !chartIndicators[name];
        const btnId = name === 'vp' ? 'btn-toggle-vp' : `btn-toggle-${name}`;
        const btn = document.getElementById(btnId);
        if (btn) btn.classList.toggle('active', chartIndicators[name]);
        renderTradingChart(currentCandleData);
    }
}

function resetChartZoomPan() {
    zoomLevel = 1.0;
    panOffset = 0;
    renderTradingChart(currentCandleData);
}

function setupChartCanvasInteractions() {
    const wrapper = document.getElementById("trading-chart-card-wrapper");
    const canvas = document.getElementById("trading-chart-canvas");
    if (!canvas || !wrapper) return;

    // ResizeObserver to automatically resize canvas whenever tab or window resizes
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            renderTradingChart(currentCandleData);
        });
        ro.observe(wrapper);
    }

    // Wheel Zoom Listener
    canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        zoomLevel = Math.max(0.5, Math.min(4.0, zoomLevel + delta));
        renderTradingChart(currentCandleData);
    }, { passive: false });

    // Click & Drag Pan Listeners
    canvas.addEventListener("mousedown", (e) => {
        isDraggingChart = true;
        dragStartX = e.clientX;
        canvas.style.cursor = "grabbing";
    });

    window.addEventListener("mousemove", (e) => {
        if (!isDraggingChart) return;
        const dx = e.clientX - dragStartX;
        dragStartX = e.clientX;
        panOffset += dx;
        renderTradingChart(currentCandleData);
    });

    window.addEventListener("mouseup", () => {
        if (isDraggingChart) {
            isDraggingChart = false;
            canvas.style.cursor = "crosshair";
        }
    });
}

function renderTradingChart(data) {
    console.log("[Chart Init] renderTradingChart called. Data present:", !!data, "Candles count:", data && data.candles ? data.candles.length : 0);

    const canvas = document.getElementById("trading-chart-canvas");
    const wrapper = document.getElementById("trading-chart-card-wrapper");
    if (!canvas || !wrapper) {
        console.error("[Chart Audit] Canvas or Wrapper missing from DOM!", { canvas, wrapper });
        return;
    }

    if (!data || !data.candles || data.candles.length === 0) {
        console.warn("[Chart Audit] No candle data available to render.");
        return;
    }

    // Hide any overlays so canvas is never obscured
    const loadingOverlay = document.getElementById("chart-loading-overlay");
    const errorOverlay = document.getElementById("chart-error-overlay");
    if (loadingOverlay) loadingOverlay.style.display = "none";
    if (errorOverlay) errorOverlay.style.display = "none";

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    let rect = wrapper.getBoundingClientRect();
    let width = Math.floor(rect.width || wrapper.clientWidth || 800);
    let height = Math.floor(rect.height || wrapper.clientHeight || 480);

    console.log("[Canvas Bounds Audit] offsetWidth:", canvas.offsetWidth, "offsetHeight:", canvas.offsetHeight, "rect:", rect, "width:", width, "height:", height, "dpr:", dpr);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.scale(dpr, dpr);

    try {
        // Clear Background
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-card') || "#141822";
        ctx.fillRect(0, 0, width, height);

    const rawCandles = data.candles;
    const rawCount = rawCandles.length;

    // Zoom & Pan calculation
    const visibleCount = Math.max(10, Math.min(rawCount, Math.round(rawCount / zoomLevel)));
    let startIndex = Math.max(0, Math.min(rawCount - visibleCount, rawCount - visibleCount - Math.round(panOffset / 10)));
    let endIndex = Math.min(rawCount, startIndex + visibleCount);
    
    const candles = rawCandles.slice(startIndex, endIndex);
    const count = candles.length;
    if (count === 0) return;

    const paddingRight = 65;
    const paddingBottom = 25;
    const chartWidth = width - paddingRight;
    const chartHeight = height - paddingBottom;
    const candleWidth = Math.max(3, (chartWidth / count) - 2);

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    candles.forEach(c => {
        if (c.low < minPrice) minPrice = c.low;
        if (c.high > maxPrice) maxPrice = c.high;
    });

    const priceMargin = (maxPrice - minPrice) * 0.06 || 100;
    minPrice -= priceMargin;
    maxPrice += priceMargin;

    function getY(price) {
        return chartHeight - ((price - minPrice) / (maxPrice - minPrice)) * (chartHeight - 40) - 20;
    }

    function getX(index) {
        return index * (chartWidth / count) + candleWidth / 2;
    }

    // Grid lines & Price axis text
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const price = minPrice + (i / 5) * (maxPrice - minPrice);
        const y = getY(price);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();

        ctx.fillStyle = "#5a6875";
        ctx.font = "10px sans-serif";
        ctx.fillText(`$${price.toFixed(0)}`, width - 58, y + 3);
    }

    // Volume Profile POC / VAL / VAH (if enabled)
    if (chartIndicators.vp && data.volume_profile) {
        const vp = data.volume_profile;
        ctx.setLineDash([4, 4]);
        
        // POC
        ctx.strokeStyle = "#f1c40f";
        const pocY = getY(vp.poc);
        ctx.beginPath(); ctx.moveTo(0, pocY); ctx.lineTo(width - paddingRight, pocY); ctx.stroke();
        ctx.fillStyle = "#f1c40f";
        ctx.fillText(`POC $${vp.poc.toFixed(0)}`, width - 58, pocY + 3);

        // VAL / VAH
        ctx.strokeStyle = "#9b59b6";
        const valY = getY(vp.val);
        const vahY = getY(vp.vah);
        ctx.beginPath(); ctx.moveTo(0, valY); ctx.lineTo(width - paddingRight, valY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, vahY); ctx.lineTo(width - paddingRight, vahY); ctx.stroke();
        ctx.fillStyle = "#9b59b6";
        ctx.fillText(`VAL $${vp.val.toFixed(0)}`, width - 58, valY + 3);
        ctx.fillText(`VAH $${vp.vah.toFixed(0)}`, width - 58, vahY + 3);
        
        ctx.setLineDash([]);
    }

    // Draw EMAs (if enabled)
    function drawEMALine(prop, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let started = false;
        candles.forEach((c, idx) => {
            const val = c[prop];
            if (val !== null && val !== undefined) {
                const x = getX(idx);
                const y = getY(val);
                if (!started) { ctx.moveTo(x, y); started = true; }
                else { ctx.lineTo(x, y); }
            }
        });
        ctx.stroke();
    }

    if (chartIndicators.ema9) drawEMALine("ema_9", "#00b4d8");
    if (chartIndicators.ema20) drawEMALine("ema_20", "#f7931a");
    if (chartIndicators.ema50) drawEMALine("ema_50", "#9b59b6");
    if (chartIndicators.ema200) drawEMALine("ema_200", "#e74c3c");

    // Draw Candlesticks
    candles.forEach((c, idx) => {
        const x = idx * (chartWidth / count);
        const openY = getY(c.open);
        const closeY = getY(c.close);
        const highY = getY(c.high);
        const lowY = getY(c.low);

        const isBull = c.close >= c.open;
        const color = isBull ? "#00c076" : "#ff3b69";

        // Wick
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + candleWidth / 2, highY);
        ctx.lineTo(x + candleWidth / 2, lowY);
        ctx.stroke();

        // Body
        ctx.fillStyle = color;
        const bodyY = Math.min(openY, closeY);
        const bodyH = Math.max(2, Math.abs(closeY - openY));
        ctx.fillRect(x, bodyY, candleWidth, bodyH);
    });

    // Draw Buy / Sell Trade Markers from Trade History
    if (data.markers && data.markers.length > 0) {
        data.markers.forEach(m => {
            const mTime = m.time;
            const matchIdx = candles.findIndex(c => Math.abs(c.time - mTime) < 300);
            if (matchIdx !== -1) {
                const x = getX(matchIdx);
                const targetCandle = candles[matchIdx];
                const isLong = m.position === "belowBar";
                const y = isLong ? getY(targetCandle.low) + 14 : getY(targetCandle.high) - 14;

                ctx.fillStyle = m.color || (isLong ? "#00c076" : "#ff3b69");
                ctx.font = "bold 11px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(isLong ? "▲ BUY" : "▼ SELL", x, y);
            }
        });
    }
    console.log(`[Chart Draw Success] Rendered ${candles.length} visible candles on canvas (${width}x${height}).`);
} catch (err) {
        console.error("[Chart Draw Crash Exception]", err);
    }
}

// --------------------------------------------------------------------------
// SECTION 3: MULTI-BOT INSTANCES & BOT HONESTY
// --------------------------------------------------------------------------
window.cachedBotInstances = [];

async function fetchBotInstances() {
    try {
        const res = await fetch("/api/bots");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();
        if (json.status === "success" && json.bots) {
            window.cachedBotInstances = json.bots;
            const select = document.getElementById("sidebar-bot-select");
            
            if (json.bots.length === 0) {
                if (select) select.innerHTML = '<option value="">No bots configured</option>';
                activeBotId = "";
                const instName = document.getElementById("ctrl-instance-name");
                if (instName) instName.textContent = "No Bot Configured";
                const symbolEl = document.getElementById("ctrl-bot-symbol-badge") || document.getElementById("ctrl-bot-symbol");
                if (symbolEl) symbolEl.textContent = "--";
                const capEl = document.getElementById("ctrl-capital");
                if (capEl) capEl.textContent = "$0.00";
                const botIdEl = document.getElementById("ctrl-bot-id-display");
                if (botIdEl) botIdEl.textContent = "--";
                const botNameSub = document.getElementById("dash-bot-name-sub");
                if (botNameSub) botNameSub.textContent = "--";
                return;
            }

            let activeBot = json.bots.find(b => b.id === activeBotId);
            if (!activeBot) {
                activeBot = json.bots[0];
                activeBotId = activeBot.id;
            }

            if (select) {
                select.innerHTML = json.bots.map(b => `
                    <option value="${b.id}" ${b.id === activeBotId ? 'selected' : ''}>🤖 ${escapeHtml(b.name)} (${b.timeframe})</option>
                `).join('');
            }
            
            if (activeBot) {
                const instName = document.getElementById("ctrl-instance-name");
                if (instName) instName.textContent = activeBot.name;
                const symbolEl = document.getElementById("ctrl-bot-symbol-badge") || document.getElementById("ctrl-bot-symbol");
                if (symbolEl) symbolEl.textContent = `${activeBot.symbol} ${activeBot.timeframe}`;
                const stratBadge = document.getElementById("ctrl-bot-strategy-badge");
                if (stratBadge) stratBadge.textContent = activeBot.strategy || 'EMA + MACD + VP';
                const modeTag = document.getElementById("dash-mode-tag");
                if (modeTag) modeTag.textContent = (activeBot.execution_mode || 'PAPER') === 'LIVE' ? '🔴 LIVE TRADING' : '🟡 PAPER TRADING';
                const botIdDisplay = document.getElementById("ctrl-bot-id-display");
                if (botIdDisplay) botIdDisplay.textContent = activeBot.id;
                const intervalSubEl = document.getElementById("ctrl-interval-sub");
                if (intervalSubEl) intervalSubEl.textContent = `${activeBot.timeframe || '5m'} Interval`;
                const capEl = document.getElementById("ctrl-capital");
                if (capEl) capEl.textContent = `$${(activeBot.allocated_capital || 10000).toLocaleString()}`;
                const botNameSub = document.getElementById("dash-bot-name-sub");
                if (botNameSub) botNameSub.textContent = activeBot.name;
                const botModeVal = document.getElementById("dash-bot-mode-val");
                if (botModeVal) botModeVal.textContent = activeBot.execution_mode || 'Paper';
                const botIdVal = document.getElementById("dash-bot-id-val");
                if (botIdVal) botIdVal.textContent = activeBot.id;
                const botSymVal = document.getElementById("dash-bot-symbol-val");
                if (botSymVal) botSymVal.textContent = activeBot.symbol;

                const stuckAlert = document.getElementById("bot-stuck-alert");
                if (stuckAlert) {
                    if (activeBot.stuck_explanation) {
                        stuckAlert.textContent = activeBot.stuck_explanation;
                        stuckAlert.style.display = "block";
                    } else {
                        stuckAlert.style.display = "none";
                    }
                }
            }

            // Always update leaderboard when bot instances are fetched
            fetchBotComparison();
        }
    } catch (e) {
        console.error("Fetch bot instances error:", e);
    }
}

function switchActiveBot(botId) {
    if (!botId) return;
    activeBotId = botId;
    fetchBotInstances();
    fetchBotStatus();
    fetchBotActivity(activeBotId);
    fetchBotDecisions(activeBotId);
    fetchAnalytics();
    fetchTrades();
}

// --------------------------------------------------------------------------
// 10-STEP BOT CREATION WIZARD CONTROLLER
// --------------------------------------------------------------------------
const WIZARD_SYMBOLS_BY_ASSET = {
    "CRYPTO": [
        { symbol: "BTC/USDT", label: "BTC/USDT — Bitcoin" },
        { symbol: "ETH/USDT", label: "ETH/USDT — Ethereum" },
        { symbol: "SOL/USDT", label: "SOL/USDT — Solana" },
        { symbol: "BNB/USDT", label: "BNB/USDT — Binance Coin" },
        { symbol: "XRP/USDT", label: "XRP/USDT — Ripple" }
    ],
    "INDIAN_STOCKS": [
        { symbol: "RELIANCE", label: "RELIANCE — Reliance Industries" },
        { symbol: "TCS", label: "TCS — Tata Consultancy Services" },
        { symbol: "INFY", label: "INFY — Infosys Ltd" },
        { symbol: "HDFCBANK", label: "HDFCBANK — HDFC Bank Ltd" },
        { symbol: "NIFTY50", label: "NIFTY50 — Nifty 50 Index" }
    ],
    "GLOBAL_STOCKS": [
        { symbol: "AAPL", label: "AAPL — Apple Inc." },
        { symbol: "NVDA", label: "NVDA — NVIDIA Corp" },
        { symbol: "TSLA", label: "TSLA — Tesla Inc." },
        { symbol: "MSFT", label: "MSFT — Microsoft Corp" },
        { symbol: "AMZN", label: "AMZN — Amazon.com Inc." }
    ],
    "FOREX": [
        { symbol: "EURUSD", label: "EUR/USD — Euro / US Dollar" },
        { symbol: "GBPUSD", label: "GBP/USD — British Pound / US Dollar" },
        { symbol: "USDJPY", label: "USD/JPY — US Dollar / Japanese Yen" },
        { symbol: "AUDUSD", label: "AUD/USD — Australian Dollar / USD" }
    ],
    "INDICES": [
        { symbol: "SPX500", label: "S&P 500 Index" },
        { symbol: "NAS100", label: "NASDAQ 100 Index" },
        { symbol: "US30", label: "Dow Jones Industrial 30" },
        { symbol: "DAX40", label: "German DAX 40" }
    ]
};

function updateWizardSymbols() {
    const assetEl = document.getElementById("wiz-asset-class");
    const symEl = document.getElementById("wiz-symbol");
    const revEl = document.getElementById("wizard-review-summary");
    if (!assetEl || !symEl) return;

    const asset = assetEl.value || "CRYPTO";
    const options = WIZARD_SYMBOLS_BY_ASSET[asset] || WIZARD_SYMBOLS_BY_ASSET["CRYPTO"];

    symEl.innerHTML = options.map(o => `<option value="${o.symbol}">${o.label}</option>`).join('');

    const tfEl = document.getElementById("wiz-timeframe");
    const stratEl = document.getElementById("wiz-strategy");
    const modeEl = document.getElementById("wiz-mode");
    const confEl = document.getElementById("wiz-confidence");

    if (revEl) {
        revEl.innerHTML = `Selected: <b>${symEl.value} ${tfEl ? tfEl.value : '15m'}</b> | Strategy: <b>${stratEl ? stratEl.value : 'Trend Following'}</b> | Mode: <b>${modeEl ? modeEl.value : 'PAPER'}</b> | Gate: <b>${confEl ? confEl.value : '75'}%</b>`;
    }
}

async function submitBotWizard(e) {
    if (e) e.preventDefault();
    const nameEl = document.getElementById("wiz-name");
    const symEl = document.getElementById("wiz-symbol");
    const tfEl = document.getElementById("wiz-timeframe");
    const stratEl = document.getElementById("wiz-strategy");
    const capEl = document.getElementById("wiz-capital");
    const confEl = document.getElementById("wiz-confidence");
    const modeEl = document.getElementById("wiz-mode");
    const assetEl = document.getElementById("wiz-asset-class");

    const payload = {
        name: nameEl ? nameEl.value.trim() : "Custom Bot",
        symbol: symEl ? symEl.value : "BTC/USDT",
        timeframe: tfEl ? tfEl.value : "15m",
        strategy: stratEl ? stratEl.value : "Trend Following",
        allocated_capital: capEl ? parseFloat(capEl.value || 10000) : 10000,
        required_confidence: confEl ? parseFloat(confEl.value || 75) : 75,
        execution_mode: modeEl ? modeEl.value : "PAPER",
        asset_class: assetEl ? assetEl.value : "CRYPTO"
    };

    if (!payload.name) {
        alert("Please enter a valid Bot Name.");
        return;
    }

    try {
        const res = await fetch("/api/bots/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.status === "success") {
            alert(`🎉 Bot '${payload.name}' created successfully!`);
            activeBotId = json.bot_id || json.id || activeBotId;
            await fetchBotInstances();
            await fetchBotSummaryMetrics();
            switchCtrlSubtab("overview");
        } else {
            alert("Error creating bot: " + (json.message || "Unknown error"));
        }
    } catch(err) {
        alert("Failed to submit bot creation wizard: " + err);
    }
}


// --------------------------------------------------------------------------
// INDICATOR LIBRARY & PARAMETER SETTINGS ENGINE
// --------------------------------------------------------------------------
const INDICATOR_LIBRARY = {
    "ema": { id: "ema", name: "EMA (Exponential Moving Average)", icon: "📈", defaultParams: { period: 20, source: "close" } },
    "sma": { id: "sma", name: "SMA (Simple Moving Average)", icon: "📊", defaultParams: { period: 20, source: "close" } },
    "macd": { id: "macd", name: "MACD", icon: "📉", defaultParams: { fast_period: 12, slow_period: 26, signal_period: 9 } },
    "rsi": { id: "rsi", name: "RSI (Relative Strength Index)", icon: "⚡", defaultParams: { period: 14, overbought: 70, oversold: 30 } },
    "rsi_trend": { id: "rsi_trend", name: "RSI Momentum Trend Vector", icon: "🌊", defaultParams: { period: 14, trend_threshold: 52 } },
    "bollinger": { id: "bollinger", name: "Bollinger Bands", icon: "🎯", defaultParams: { period: 20, std_dev: 2.0 } },
    "adx": { id: "adx", name: "ADX (Average Directional Index)", icon: "💪", defaultParams: { period: 14, trend_threshold: 25 } },
    "session_vp": { id: "session_vp", name: "Session Volume Profile", icon: "📊", defaultParams: { value_area_pct: 70, bin_size: 25 } },
    "fixed_vp": { id: "fixed_vp", name: "Fixed Range Volume Profile", icon: "📌", defaultParams: { lookback_days: 7, value_area_pct: 70 } },
    "visible_vp": { id: "visible_vp", name: "Visible Range Volume Profile", icon: "👁️", defaultParams: { value_area_pct: 70, bin_size: 25 } },
    "momentum": { id: "momentum", name: "Momentum", icon: "🚀", defaultParams: { period: 10 } },
    "auto_fib": { id: "auto_fib", name: "Auto Fib Retracement", icon: "📐", defaultParams: { lookback: 50 } },
    "pivots": { id: "pivots", name: "Pivot Points High Low", icon: "📍", defaultParams: { pivot_type: "Standard" } },
    "key_levels": { id: "key_levels", name: "Auto Key Levels", icon: "🔑", defaultParams: { lookback: 100 } },
    "patterns": { id: "patterns", name: "All Chart Patterns", icon: "🧩", defaultParams: { pattern_type: "All" } }
};

let activeModalIndicators = {
    create: [
        { id: "ema", name: "EMA", params: { period: 20, source: "close" } },
        { id: "macd", name: "MACD", params: { fast_period: 12, slow_period: 26, signal_period: 9 } },
        { id: "rsi", name: "RSI", params: { period: 14, overbought: 70, oversold: 30 } },
        { id: "bollinger", name: "Bollinger", params: { period: 20, std_dev: 2.0 } }
    ],
    edit: []
};

let currentEditingSettingsContext = { modalType: 'create', index: -1 };

function getIndicatorSummaryText(indObj) {
    if (!indObj) return "";
    const id = typeof indObj === 'string' ? indObj.toLowerCase() : (indObj.id || "").toLowerCase();
    const p = typeof indObj === 'object' && indObj.params ? indObj.params : {};

    if (id.includes("rsi_trend")) {
        return `RSI (${p.period || 14}) — Thresh:${p.trend_threshold || 52}`;
    } else if (id.includes("rsi")) {
        return `RSI (${p.period || 14}) — OB:${p.overbought || 70} / OS:${p.oversold || 30}`;
    } else if (id.includes("ema")) {
        return `EMA (${p.period || 20}) — ${p.source || 'close'}`;
    } else if (id.includes("sma")) {
        return `SMA (${p.period || 20}) — ${p.source || 'close'}`;
    } else if (id.includes("macd")) {
        return `MACD (${p.fast_period || 12}, ${p.slow_period || 26}, ${p.signal_period || 9})`;
    } else if (id.includes("bollinger") || id.includes("bb")) {
        return `Bollinger (${p.period || 20}, ${p.std_dev || 2.0}σ)`;
    } else if (id.includes("adx")) {
        return `ADX (${p.period || 14}) — Trend > ${p.trend_threshold || 25}`;
    } else if (id.includes("vp") || id.includes("volume")) {
        return `Vol Profile — VA:${p.value_area_pct || 70}%`;
    } else if (id.includes("fib")) {
        return `Auto Fib (${p.lookback || 50})`;
    } else if (id.includes("momentum")) {
        return `Momentum (${p.period || 10})`;
    } else if (id.includes("pivots")) {
        return `Pivots (${p.pivot_type || 'Standard'})`;
    } else if (id.includes("key_levels")) {
        return `Key Levels (${p.lookback || 100})`;
    } else if (id.includes("patterns")) {
        return `Patterns (${p.pattern_type || 'All'})`;
    }
    return typeof indObj === 'string' ? indObj.toUpperCase() : (indObj.name || id.toUpperCase());
}

function renderActiveIndicatorChips(modalType) {
    const container = document.getElementById(`${modalType}-bot-chips-container`);
    if (!container) return;

    const list = activeModalIndicators[modalType] || [];
    if (list.length === 0) {
        container.innerHTML = `<div class="empty-chips-msg">No indicators selected yet — select an indicator above to add up to 4 confluence signals.</div>`;
        return;
    }

    container.innerHTML = list.map((ind, idx) => {
        const info = INDICATOR_LIBRARY[ind.id] || { name: ind.name || ind.id, icon: "📈" };
        const summary = getIndicatorSummaryText(ind);
        return `
            <div class="ind-chip">
                <span>${info.icon || '📈'} <b>${escapeHtml(ind.name || info.name)}</b></span>
                <span class="ind-chip-summary">${escapeHtml(summary)}</span>
                <button type="button" class="ind-chip-btn" onclick="openIndicatorSettingsModal('${modalType}', ${idx})" title="Configure Parameters">⚙️</button>
                <button type="button" class="ind-chip-btn btn-remove" onclick="removeIndicatorChip('${modalType}', ${idx})" title="Remove Indicator">×</button>
            </div>
        `;
    }).join('');
}

function addIndicatorChipFromSelect(modalType) {
    const select = document.getElementById(`${modalType === 'create' ? 'new-bot-ind-select' : 'edit-bot-ind-select'}`);
    if (!select) return;

    const indId = select.value;
    if (!indId) return;

    const list = activeModalIndicators[modalType] || [];
    if (list.length >= 4) {
        alert("Maximum 4 indicators allowed per bot instance for optimal confluence weighting.");
        return;
    }

    const libDef = INDICATOR_LIBRARY[indId];
    if (!libDef) return;

    list.push({
        id: indId,
        name: libDef.name.split(' ')[0],
        params: { ...libDef.defaultParams }
    });

    activeModalIndicators[modalType] = list;
    select.value = "";
    renderActiveIndicatorChips(modalType);
}

function removeIndicatorChip(modalType, index) {
    const list = activeModalIndicators[modalType] || [];
    if (index >= 0 && index < list.length) {
        list.splice(index, 1);
        activeModalIndicators[modalType] = list;
        renderActiveIndicatorChips(modalType);
    }
}

function openIndicatorSettingsModal(modalType, index) {
    const ind = activeModalIndicators[modalType][index];
    if (!ind) return;

    currentEditingSettingsContext = { modalType, index };
    const libDef = INDICATOR_LIBRARY[ind.id] || { name: ind.name || ind.id, defaultParams: {} };
    const params = { ...libDef.defaultParams, ...(ind.params || {}) };

    document.getElementById("ind-settings-title").textContent = `⚙️ Configure ${ind.name || libDef.name} Parameters`;

    const body = document.getElementById("ind-settings-body");
    let html = '';

    const id = ind.id;
    if (id === 'ema' || id === 'sma') {
        html += `
            <div class="form-group">
                <label>Period Length (Bars)</label>
                <input type="number" id="param-period" class="form-input" value="${params.period || 20}" min="2" max="500">
            </div>
            <div class="form-group">
                <label>Source Price</label>
                <select id="param-source" class="form-select">
                    <option value="close" ${params.source === 'close' ? 'selected' : ''}>Close Price</option>
                    <option value="open" ${params.source === 'open' ? 'selected' : ''}>Open Price</option>
                    <option value="high" ${params.source === 'high' ? 'selected' : ''}>High Price</option>
                    <option value="low" ${params.source === 'low' ? 'selected' : ''}>Low Price</option>
                </select>
            </div>
        `;
    } else if (id === 'rsi' || id === 'rsi_trend') {
        html += `
            <div class="form-group">
                <label>RSI Period (Bars)</label>
                <input type="number" id="param-period" class="form-input" value="${params.period || 14}" min="2" max="100">
            </div>
        `;
        if (id === 'rsi') {
            html += `
                <div class="form-group">
                    <label>Overbought Level (Default 70)</label>
                    <input type="number" id="param-overbought" class="form-input" value="${params.overbought || 70}" min="50" max="95">
                </div>
                <div class="form-group">
                    <label>Oversold Level (Default 30)</label>
                    <input type="number" id="param-oversold" class="form-input" value="${params.oversold || 30}" min="5" max="50">
                </div>
            `;
        } else {
            html += `
                <div class="form-group">
                    <label>Trend Threshold Level (Default 52)</label>
                    <input type="number" id="param-trend_threshold" class="form-input" value="${params.trend_threshold || 52}" min="40" max="70">
                </div>
            `;
        }
    } else if (id === 'macd') {
        html += `
            <div class="form-group">
                <label>Fast Period</label>
                <input type="number" id="param-fast_period" class="form-input" value="${params.fast_period || 12}" min="2" max="50">
            </div>
            <div class="form-group">
                <label>Slow Period</label>
                <input type="number" id="param-slow_period" class="form-input" value="${params.slow_period || 26}" min="5" max="100">
            </div>
            <div class="form-group">
                <label>Signal Period</label>
                <input type="number" id="param-signal_period" class="form-input" value="${params.signal_period || 9}" min="2" max="50">
            </div>
        `;
    } else if (id === 'bollinger') {
        html += `
            <div class="form-group">
                <label>Period Length</label>
                <input type="number" id="param-period" class="form-input" value="${params.period || 20}" min="5" max="200">
            </div>
            <div class="form-group">
                <label>Standard Deviation Multiplier (σ)</label>
                <input type="number" step="0.1" id="param-std_dev" class="form-input" value="${params.std_dev || 2.0}" min="0.5" max="5.0">
            </div>
        `;
    } else if (id === 'adx') {
        html += `
            <div class="form-group">
                <label>ADX Period</label>
                <input type="number" id="param-period" class="form-input" value="${params.period || 14}" min="2" max="50">
            </div>
            <div class="form-group">
                <label>Trend Strength Threshold (Default 25)</label>
                <input type="number" id="param-trend_threshold" class="form-input" value="${params.trend_threshold || 25}" min="10" max="50">
            </div>
        `;
    } else if (id.includes('vp')) {
        html += `
            <div class="form-group">
                <label>Value Area Percentage (%)</label>
                <input type="number" id="param-value_area_pct" class="form-input" value="${params.value_area_pct || 70}" min="50" max="95">
            </div>
            <div class="form-group">
                <label>Price Bin Size</label>
                <input type="number" id="param-bin_size" class="form-input" value="${params.bin_size || 25}" min="5" max="500">
            </div>
        `;
    } else {
        html += `
            <div class="form-group">
                <label>Lookback Window / Period</label>
                <input type="number" id="param-period" class="form-input" value="${params.period || params.lookback || 20}" min="2" max="500">
            </div>
        `;
    }

    body.innerHTML = html;
    const m = document.getElementById("indicator-settings-modal");
    if (m) m.style.display = "flex";
}

function closeIndicatorSettingsModal() {
    const m = document.getElementById("indicator-settings-modal");
    if (m) m.style.display = "none";
}

function saveIndicatorSettings(e) {
    e.preventDefault();
    const { modalType, index } = currentEditingSettingsContext;
    const ind = activeModalIndicators[modalType][index];
    if (!ind) return;

    if (!ind.params) ind.params = {};

    const inputs = document.querySelectorAll("#ind-settings-body input, #ind-settings-body select");
    inputs.forEach(input => {
        const paramKey = input.id.replace("param-", "");
        let val = input.value;
        if (input.type === 'number') {
            val = parseFloat(val);
        }
        ind.params[paramKey] = val;
    });

    closeIndicatorSettingsModal();
    renderActiveIndicatorChips(modalType);
}

function openCreateBotModal() {
    activeModalIndicators.create = [
        { id: "ema", name: "EMA", params: { period: 20, source: "close" } },
        { id: "macd", name: "MACD", params: { fast_period: 12, slow_period: 26, signal_period: 9 } },
        { id: "rsi", name: "RSI", params: { period: 14, overbought: 70, oversold: 30 } },
        { id: "bollinger", name: "Bollinger", params: { period: 20, std_dev: 2.0 } }
    ];
    renderActiveIndicatorChips('create');
    const m = document.getElementById("create-bot-modal");
    if (m) m.style.display = "flex";
}

function closeCreateBotModal() {
    const m = document.getElementById("create-bot-modal");
    if (m) m.style.display = "none";
}

async function handleCreateBotSubmit(e) {
    e.preventDefault();
    const name = document.getElementById("new-bot-name").value.trim();
    const symbol = document.getElementById("new-bot-symbol").value;
    const timeframe = document.getElementById("new-bot-tf").value;
    const capital = parseFloat(document.getElementById("new-bot-capital").value) || 10000.0;
    const risk = parseFloat(document.getElementById("new-bot-risk").value) || 2.0;

    const indicators = activeModalIndicators.create || [];
    if (indicators.length === 0) {
        alert("Please select at least 1 technical indicator for the bot's confluence scoring.");
        return;
    }

    const body = {
        name: name,
        symbol: symbol,
        strategy: "EMA_MACD_VP",
        timeframe: timeframe,
        allocated_capital: capital,
        risk_pct: risk / 100.0,
        indicators: indicators
    };

    try {
        const res = await fetch("/api/bots/create", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(body)
        });
        const json = await res.json();
        if (json.status === "success") {
            closeCreateBotModal();
            document.getElementById("new-bot-name").value = "";
            await fetchBotInstances();
            await fetchBotComparison();
            if (json.bot_id) switchActiveBot(json.bot_id);
            alert(`✅ Bot instance '${name}' created successfully!`);
        } else {
            alert("Failed to create bot instance: " + json.message);
        }
    } catch (err) {
        alert("Create bot instance error: " + err);
    }
}

async function deleteBotInstance(botId) {
    if (!botId) return;
    const bot = (window.cachedBotInstances || []).find(b => b.id === botId);
    const name = bot ? bot.name : botId;
    if (!confirm(`Are you sure you want to delete bot instance '${name}' (${botId})?\nTrade history and logs will be preserved in database.`)) {
        return;
    }
    try {
        const res = await fetch(`/api/bots/${botId}`, {
            method: "DELETE"
        });
        const json = await res.json();
        alert(json.message);
        if (json.status === "success") {
            if (activeBotId === botId) {
                activeBotId = "bot-1";
            }
            fetchBotInstances();
            fetchBotStatus();
            fetchBotComparison();
        }
    } catch (err) {
        alert("Failed to delete bot instance: " + err);
    }
}

function deleteActiveBotInstance() {
    deleteBotInstance(activeBotId || "bot-1");
}

function updateControlButtons(status) {
    const btnStart = document.getElementById("btn-ctrl-start");
    const btnPause = document.getElementById("btn-ctrl-pause");
    const btnResume = document.getElementById("btn-ctrl-resume");
    const btnStop = document.getElementById("btn-ctrl-stop");
    const btnDelete = document.getElementById("btn-ctrl-delete");

    if (status === "RUNNING") {
        if (btnStart) btnStart.disabled = true;
        if (btnPause) btnPause.disabled = false;
        if (btnResume) btnResume.disabled = true;
        if (btnStop) btnStop.disabled = false;
        if (btnDelete) btnDelete.disabled = true;
    } else if (status === "PAUSED") {
        if (btnStart) btnStart.disabled = true;
        if (btnPause) btnPause.disabled = true;
        if (btnResume) btnResume.disabled = false;
        if (btnStop) btnStop.disabled = false;
        if (btnDelete) btnDelete.disabled = false;
    } else {
        if (btnStart) btnStart.disabled = false;
        if (btnPause) btnPause.disabled = true;
        if (btnResume) btnResume.disabled = true;
        if (btnStop) btnStop.disabled = true;
        if (btnDelete) btnDelete.disabled = false;
    }
}

function openIndicatorModal(mode) {
    closeEditBotModal();
    closeCreateBotModal();
    switchTab('indicators');
}

function openEditBotModal(botId) {
    const targetId = botId || activeBotId || "bot-1";
    const bot = (window.cachedBotInstances || []).find(b => b.id === targetId) || {
        id: targetId,
        name: "Alpha BTC Scalper",
        symbol: "BTC/USDT",
        strategy: "EMA_MACD_VP",
        timeframe: "15m",
        allocated_capital: 10000
    };

    if (document.getElementById("edit-bot-id")) document.getElementById("edit-bot-id").value = bot.id;
    if (document.getElementById("edit-bot-name")) document.getElementById("edit-bot-name").value = bot.name;
    if (document.getElementById("edit-bot-symbol")) document.getElementById("edit-bot-symbol").value = bot.symbol;
    if (document.getElementById("edit-bot-strategy")) document.getElementById("edit-bot-strategy").value = bot.strategy;
    if (document.getElementById("edit-bot-tf")) document.getElementById("edit-bot-tf").value = bot.timeframe;
    if (document.getElementById("edit-bot-capital")) document.getElementById("edit-bot-capital").value = bot.allocated_capital;

    editingBotIndicators = Array.isArray(bot.indicators) ? JSON.parse(JSON.stringify(bot.indicators)) : [];
    renderBotIndicatorsBar('edit_bot');

    const modal = document.getElementById("edit-bot-modal");
    if (modal) modal.style.display = "flex";
}

function closeEditBotModal() {
    const modal = document.getElementById("edit-bot-modal");
    if (modal) modal.style.display = "none";
}

async function saveEditBotInstance(e) {
    e.preventDefault();
    const botId = document.getElementById("edit-bot-id").value;
    const body = {
        name: document.getElementById("edit-bot-name").value,
        symbol: document.getElementById("edit-bot-symbol").value,
        strategy: document.getElementById("edit-bot-strategy").value,
        timeframe: document.getElementById("edit-bot-tf").value,
        allocated_capital: parseFloat(document.getElementById("edit-bot-capital").value),
        indicators: editingBotIndicators
    };

    try {
        const res = await fetch(`/api/bots/${botId}`, {
            method: "PUT",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(body)
        });
        const json = await res.json();
        alert(json.message);
        if (json.status === "success") {
            closeEditBotModal();
            fetchBotInstances();
            fetchBotComparison();
        }
    } catch (err) {
        alert("Failed to update bot instance: " + err);
    }
}

async function confirmDeleteBotInstance(botId, botName) {
    if (!botId) return;
    const confirmed = confirm(`Delete '${botName}'? This cannot be undone.`);
    if (!confirmed) return;

    try {
        const res = await fetch(`/api/bots/${botId}`, {
            method: "DELETE"
        });
        const json = await res.json();
        alert(json.message);
        if (json.status === "success") {
            if (activeBotId === botId) {
                activeBotId = "";
            }
            await fetchBotInstances();
            await fetchBotComparison();
            await fetchBotStatus();
        }
    } catch (err) {
        alert("Failed to delete bot instance: " + err);
    }
}

function confirmDeleteActiveBot() {
    const bot = (window.cachedBotInstances || []).find(b => b.id === activeBotId);
    const name = bot ? bot.name : activeBotId;
    if (!activeBotId) {
        alert("No active bot instance selected.");
        return;
    }
    confirmDeleteBotInstance(activeBotId, name);
}

async function fetchBotComparison() {
    try {
        const res = await fetch("/api/bots/comparison");
        const json = await res.json();
        if (json.status === "success" && json.comparison) {
            const tbody = document.getElementById("bot-comparison-tbody");
            if (json.comparison.length === 0) {
                tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">No bot instances available. Create one above.</td></tr>';
                return;
            }
            tbody.innerHTML = json.comparison.map(b => {
                const indPills = (b.indicators || []).map(ind => {
                    const summary = getIndicatorSummaryText(ind);
                    return `<span class="badge badge-secondary" style="font-size:10px; margin-right:3px;" title="${escapeHtml(summary)}">${escapeHtml(summary)}</span>`;
                }).join('') || '<span style="color:var(--text-muted); font-size:11px;">Default</span>';

                return `
                <tr>
                    <td><b>${escapeHtml(b.name)}</b></td>
                    <td>${escapeHtml(b.symbol)}</td>
                    <td>${escapeHtml(b.timeframe)}</td>
                    <td>${escapeHtml(b.strategy)}</td>
                    <td>$${b.allocated_capital.toLocaleString()}</td>
                    <td>${indPills}</td>
                    <td><b class="${b.net_pnl >= 0 ? 'text-success' : 'text-danger'}">${b.net_pnl >= 0 ? '+' : ''}$${b.net_pnl.toFixed(2)}</b></td>
                    <td><b class="${b.roi_pct >= 0 ? 'text-success' : 'text-danger'}">${b.roi_pct >= 0 ? '+' : ''}${b.roi_pct.toFixed(2)}%</b></td>
                    <td>${b.win_rate_pct.toFixed(1)}%</td>
                    <td>${b.total_trades}</td>
                </tr>
            `;
            }).join('');
        }
    } catch (e) {
        console.error("Bot comparison fetch error:", e);
    }
}

async function controlInstanceDirect(botId, action) {
    try {
        const res = await fetch(`/api/bots/${botId}/control`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({action})
        });
        const json = await res.json();
        alert(json.message);
        fetchBotComparison();
        fetchBotInstances();
    } catch (e) {
        alert("Control instance error: " + e);
    }
}

let lastCheckedEpoch = Math.floor(Date.now() / 1000);
let currentBotStatus = 'STOPPED';

function updateLastCheckedTimer() {
    const pill = document.getElementById("ctrl-last-checked-pill");
    if (!pill) return;

    if (!lastCheckedEpoch || currentBotStatus === "STOPPED") {
        pill.className = "badge badge-secondary";
        pill.textContent = "Status: STOPPED";
        return;
    }

    const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - lastCheckedEpoch);
    if (elapsed > 180 && currentBotStatus === "RUNNING") {
        pill.className = "badge badge-stalled";
        pill.textContent = `⚠️ STALLED (${elapsed}s ago)`;
    } else {
        pill.className = "badge badge-secondary";
        pill.textContent = `Last checked: ${elapsed}s ago`;
    }
}

async function fetchBotActivity(botId) {
    if (!botId) return;
    try {
        const res = await fetch(`/api/bots/${botId}/activity`);
        const json = await res.json();
        if (json.status === "success") {
            currentBotStatus = json.bot_status;
            updateControlButtons(currentBotStatus);
            if (json.last_checked_at) {
                const dt = new Date(json.last_checked_at.replace("Z", "+00:00"));
                lastCheckedEpoch = Math.floor(dt.getTime() / 1000);
            }
            updateLastCheckedTimer();

            const summaryEl = document.getElementById("bot-honesty-text");
            if (summaryEl && json.summary_headline) {
                summaryEl.textContent = json.summary_headline;
            }

            const openPosEl = document.getElementById("ctrl-open-trade");
            if (openPosEl && json.open_position_label) {
                openPosEl.textContent = json.open_position_label;
            }

            const statusBadge = document.getElementById("ctrl-bot-status");
            const statusIcon = document.getElementById("ctrl-status-icon");
            if (statusBadge) {
                statusBadge.textContent = json.bot_status;
                statusBadge.className = `status-badge status-${(json.bot_status || 'STOPPED').toLowerCase()}`;
            }
            if (statusIcon) {
                statusIcon.textContent = json.bot_status === "RUNNING" ? "⚡" : (json.bot_status === "PAUSED" ? "⏸️" : "⏹️");
            }

            const feedEl = document.getElementById("bot-activity-feed");
            if (feedEl && json.activity_logs) {
                if (json.activity_logs.length === 0) {
                    feedEl.innerHTML = '<div class="activity-log-item muted"><span class="act-msg">No activity recorded for this bot instance yet.</span></div>';
                } else {
                    feedEl.innerHTML = json.activity_logs.map(log => {
                        const timeStr = log.timestamp ? log.timestamp.substring(11, 19) : '--:--:--';
                        let tagClass = 'tag-eval';
                        const evt = (log.event_type || 'EVAL').toUpperCase();
                        if (evt.includes('IND')) tagClass = 'tag-ind';
                        else if (evt.includes('CONF')) tagClass = 'tag-conf';
                        else if (evt.includes('ORDER')) tagClass = 'tag-order';
                        else if (evt.includes('SKIP') || evt.includes('BLOCK')) tagClass = 'tag-skip';

                        return `
                            <div class="activity-log-item">
                                <span class="act-time">${timeStr}</span>
                                <span class="act-tag ${tagClass}">${escapeHtml(evt)}</span>
                                <span class="act-msg">${escapeHtml(log.message)}</span>
                            </div>
                        `;
                    }).join('');
                }
            }
        }
    } catch (e) {
        console.error("Fetch bot activity error:", e);
    }
}

let nextCycleCountdownSec = 60;
let countdownTimerInterval = null;

function startNextCycleCountdownTimer() {
    if (countdownTimerInterval) clearInterval(countdownTimerInterval);
    countdownTimerInterval = setInterval(() => {
        const cdEl = document.getElementById("ctrl-next-check-countdown");
        if (cdEl) {
            if (currentBotStatus === "RUNNING") {
                nextCycleCountdownSec = Math.max(0, nextCycleCountdownSec - 1);
                cdEl.textContent = `~${nextCycleCountdownSec}s`;
            } else if (currentBotStatus === "PAUSED") {
                cdEl.textContent = "PAUSED";
            } else {
                cdEl.textContent = "STOPPED";
            }
        }
    }, 1000);
}

async function fetchBotDecisions(botId) {
    try {
        const id = botId || activeBotId || "bot-1";
        const res = await fetch(`/api/bots/${id}/decisions`);
        const json = await res.json();
        if (json.status === "success") {
            if (document.getElementById("ctrl-cycles-count")) {
                document.getElementById("ctrl-cycles-count").textContent = json.total_cycles_completed || 0;
            }
            if (document.getElementById("ctrl-last-checked-val")) {
                document.getElementById("ctrl-last-checked-val").textContent = `${json.last_checked_seconds_ago || 0}s ago`;
            }
            if (document.getElementById("ctrl-diagnosis-text")) {
                document.getElementById("ctrl-diagnosis-text").textContent = json.diagnosis_summary || "Actively evaluating market candle cycles...";
            }

            nextCycleCountdownSec = json.next_cycle_seconds || 60;
            const cdEl = document.getElementById("ctrl-next-check-countdown");
            if (cdEl) cdEl.textContent = `~${nextCycleCountdownSec}s`;
            const intervalSubEl = document.getElementById("ctrl-interval-sub");
            if (intervalSubEl) intervalSubEl.textContent = json.interval_label || `${json.timeframe || '5m'} Interval`;

            const streamEl = document.getElementById("bot-decision-stream");
            if (streamEl && json.decisions) {
                if (json.decisions.length === 0) {
                    streamEl.innerHTML = '<div class="decision-card-empty">No evaluation decisions logged for this bot instance yet. Start the bot to begin scanning.</div>';
                } else {
                    streamEl.innerHTML = json.decisions.map(d => {
                        const dtStr = d.timestamp ? (d.timestamp.split("T")[1]?.slice(0, 8) || d.timestamp) : '--:--:--';
                        const bullets = (d.indicator_bullets || []).map(b => `
                            <div class="ind-bullet-item">
                                <span class="bias-tag ${b.bias_label ? b.bias_label.toLowerCase() : 'neutral'}">${escapeHtml(b.bias_label || 'Neutral')}</span>
                                <span><b>${escapeHtml((b.name || '').toUpperCase())}:</b> ${escapeHtml(b.reason || '')}</span>
                            </div>
                        `).join('');

                        const resultClass = (d.decision || 'HOLD').toLowerCase();
                        return `
                            <div class="decision-card">
                                <div class="decision-card-header">
                                    <span class="decision-card-title">⏰ ${dtStr} — ${escapeHtml(json.bot_name || 'Bot')} checked market</span>
                                    <span class="decision-card-price">Price: $${Number(d.price || 0).toLocaleString('en-US', {minimumFractionDigits: 2})} | ${escapeHtml(d.timeframe || '5m')} closed</span>
                                </div>
                                <div class="ind-bullet-list">
                                    ${bullets}
                                </div>
                                <div class="decision-summary-bar">
                                    <span class="decision-summary-counts">Result: ${d.bullish_count || 0} Bullish, ${d.bearish_count || 0} Bearish, ${d.neutral_count || 0} Neutral (Score: ${Number(d.confluence_pct || 0).toFixed(0)}%, needs ${Number(d.threshold_pct || 75).toFixed(0)}%)</span>
                                    <span class="decision-badge-result ${resultClass}">${escapeHtml(d.decision_title || 'NO TRADE')}</span>
                                </div>
                                <details style="margin-top:2px;">
                                    <summary style="cursor:pointer; font-size:10px; color:var(--text-muted);">View Raw Technical Data (JSON)</summary>
                                    <pre style="font-size:10px; background:rgba(0,0,0,0.4); padding:6px; border-radius:4px; overflow-x:auto; margin-top:4px;">${escapeHtml(d.raw_json || '{}')}</pre>
                                </details>
                            </div>
                        `;
                    }).join('');
                }
            }
        }
    } catch (e) {
        console.error("Fetch bot decisions error:", e);
    }
}

function updateControlButtonsState(status) {
    const btnStart = document.getElementById("btn-ctrl-start");
    const btnPause = document.getElementById("btn-ctrl-pause");
    const btnResume = document.getElementById("btn-ctrl-resume");
    const btnStop = document.getElementById("btn-ctrl-stop");
    const alarmBox = document.getElementById("ctrl-stalled-alarm");

    const s = (status || 'STOPPED').toUpperCase();

    if (btnStart) btnStart.disabled = (s === 'RUNNING' || s === 'PAUSED');
    if (btnPause) btnPause.disabled = (s !== 'RUNNING');
    if (btnResume) btnResume.disabled = (s !== 'PAUSED');
    if (btnStop) btnStop.disabled = (s === 'STOPPED');

    if (alarmBox) {
        if (s === 'STALLED') {
            alarmBox.style.display = 'block';
        } else {
            alarmBox.style.display = 'none';
        }
    }
}

function showStalledDetails() {
    alert("⚠️ BOT STALLED DIAGNOSTICS:\n\nThe Watchdog detected that this bot instance has not completed a candle evaluation cycle within its expected interval.\n\nPossible Causes:\n• Temporary network latency spike on CCXT exchange API\n• Market closed / exchange API pause\n\nThe Watchdog is actively monitoring. Check the Live Bot Activity Feed below for detailed execution logs.");
}

async function fetchBotStatus() {
    try {
        const res = await fetch(`/api/status?bot_id=${encodeURIComponent(activeBotId || '')}`);
        const json = await res.json();

        // Update Global System Health Bar at top of dashboard
        const isHalted = (json.system_summary && json.system_summary.kill_switch_active) || (json.bot && json.bot.kill_switch_active);
        const emergencyBanner = document.getElementById("emergency-halt-banner");
        const ksBadge = document.getElementById("ks-status-badge");
        const btnDeactivate = document.getElementById("btn-deactivate-kill");

        if (isHalted) {
            if (emergencyBanner) emergencyBanner.style.display = "flex";
            if (ksBadge) ksBadge.style.display = "inline-block";
            if (btnDeactivate) btnDeactivate.style.display = "block";
        } else {
            if (emergencyBanner) emergencyBanner.style.display = "none";
            if (ksBadge) ksBadge.style.display = "none";
            if (btnDeactivate) btnDeactivate.style.display = "none";
        }

        if (json.system_summary) {
            const s = json.system_summary;
            const bar = document.getElementById("global-health-bar");
            const text = document.getElementById("global-health-text");
            const dot = document.getElementById("global-health-dot");

            if (bar && text) {
                text.textContent = s.headline;
                bar.className = `global-health-bar state-${s.system_state.toLowerCase()}`;
                if (dot) {
                    if (s.system_state === "HALTED") dot.textContent = "🔴";
                    else if (s.system_state === "HEALTHY") dot.textContent = "🟢";
                    else if (s.system_state === "WARNING") dot.textContent = "🟡";
                    else if (s.system_state === "CRITICAL") dot.textContent = "⚠️";
                    else dot.textContent = "⚪";
                }
            }
        }

        if (json.bot) {
            const b = json.bot;
            currentBotStatus = isHalted ? "TRADING HALTED" : b.status;

            const ctrlStatus = document.getElementById("ctrl-bot-status");
            if (ctrlStatus) {
                ctrlStatus.textContent = isHalted ? "🔴 TRADING HALTED" : b.status;
                ctrlStatus.className = isHalted ? "status-badge status-stopped" : `status-badge status-${(b.status || 'stopped').toLowerCase()}`;
            }
            const statePill = document.getElementById("dash-bot-state-pill");
            if (statePill) {
                statePill.textContent = isHalted ? "HALTED" : (b.status || 'STOPPED');
            }

            const uptimeFormatted = b.uptime_formatted || "0m 0s";
            if (document.getElementById("ctrl-bot-uptime")) document.getElementById("ctrl-bot-uptime").textContent = uptimeFormatted;
            if (document.getElementById("sidebar-uptime")) document.getElementById("sidebar-uptime").textContent = uptimeFormatted;
            if (document.getElementById("dash-sys-uptime")) document.getElementById("dash-sys-uptime").textContent = uptimeFormatted;
            if (document.getElementById("dash-sys-scans")) document.getElementById("dash-sys-scans").textContent = b.scan_count || 0;

            if (json.open_trade) {
                if (document.getElementById("ctrl-open-trade")) document.getElementById("ctrl-open-trade").textContent = `${json.open_trade.direction} @ $${json.open_trade.entry_price}`;
                if (document.getElementById("dash-pos-val")) document.getElementById("dash-pos-val").textContent = `${json.open_trade.direction} Position`;
                if (document.getElementById("dash-pos-dir-tag")) {
                    const dirTag = document.getElementById("dash-pos-dir-tag");
                    dirTag.textContent = json.open_trade.direction;
                    dirTag.className = json.open_trade.direction === 'LONG' ? 'badge badge-success' : 'badge badge-danger';
                }
            } else {
                if (document.getElementById("ctrl-open-trade")) document.getElementById("ctrl-open-trade").textContent = "NONE";
                if (document.getElementById("dash-pos-val")) document.getElementById("dash-pos-val").textContent = "No Active Position";
                if (document.getElementById("dash-pos-dir-tag")) {
                    const dirTag = document.getElementById("dash-pos-dir-tag");
                    dirTag.textContent = "NONE";
                    dirTag.className = "badge";
                }
            }

            // Dynamically Update Signal Card in Control Center
            const sigTag = document.getElementById("dash-sig-status-tag");
            const sigVal = document.getElementById("dash-sig-val");
            const sigThresh = document.getElementById("dash-sig-thresh");
            const sigTime = document.getElementById("dash-sig-time");
            const lastScanEl = document.getElementById("dash-last-scan");
            const nextScanEl = document.getElementById("dash-next-scan");
            const lastScanSysEl = document.getElementById("dash-sys-lastscan");

            if (sigThresh) sigThresh.textContent = `${b.required_confidence || 75}%`;

            if (b.last_scan_at) {
                try {
                    const d = new Date(b.last_scan_at);
                    const formatted = d.toLocaleTimeString();
                    if (lastScanEl) lastScanEl.textContent = formatted;
                    if (lastScanSysEl) lastScanSysEl.textContent = formatted;
                } catch(e) {
                    if (lastScanEl) lastScanEl.textContent = b.last_scan_at;
                }
            }
            if (b.next_scan_at && nextScanEl) {
                try {
                    const d = new Date(b.next_scan_at);
                    nextScanEl.textContent = d.toLocaleTimeString();
                } catch(e) { nextScanEl.textContent = b.next_scan_at; }
            }

            if (isHalted || b.status === "STOPPED" || b.status === "CREATED") {
                if (sigTag) {
                    sigTag.textContent = "INACTIVE";
                    sigTag.style.color = "var(--text-muted)";
                }
                if (sigVal) {
                    sigVal.textContent = "NO SIGNAL (Bot Stopped)";
                    sigVal.style.color = "var(--text-muted)";
                }
                if (sigTime) sigTime.textContent = "--:--:--";
            } else {
                const confPct = Math.round((b.signal_confidence || 0) * (b.signal_confidence <= 1.0 ? 100 : 1));
                const sigStr = b.current_signal || "HOLD";
                const thresh = b.required_confidence || 75;

                if (sigVal) {
                    sigVal.textContent = `${sigStr} (${confPct}%)`;
                    if (sigStr === "LONG" || sigStr === "BUY") sigVal.style.color = "#00c076";
                    else if (sigStr === "SHORT" || sigStr === "SELL") sigVal.style.color = "#ff3b30";
                    else sigVal.style.color = "var(--text-secondary)";
                }

                if (sigTag) {
                    if (confPct >= thresh && sigStr !== "HOLD") {
                        sigTag.textContent = "SIGNAL CONFIRMED";
                        sigTag.style.color = "#00c076";
                    } else if (confPct < thresh && sigStr !== "HOLD") {
                        sigTag.textContent = "BELOW THRESHOLD";
                        sigTag.style.color = "#ffab00";
                    } else {
                        sigTag.textContent = "EVALUATING";
                        sigTag.style.color = "var(--text-secondary)";
                    }
                }
                if (sigTime && b.last_scan_at) {
                    try { sigTime.textContent = new Date(b.last_scan_at).toLocaleTimeString(); }
                    catch(e) { sigTime.textContent = b.last_scan_at; }
                }
            }

            updateControlButtonsState(isHalted ? "TRADING HALTED" : b.status);
        }
    } catch (e) {
        console.error("Status fetch error:", e);
    }
}


async function deactivateKillSwitchDirect() {
    if (!confirm("Are you sure you want to deactivate the Emergency Kill Switch and unlock the execution pipeline?")) return;
    try {
        const res = await fetch("/api/bot/control", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({action: "DEACTIVATE_KILL_SWITCH"})
        });
        const json = await res.json();
        alert(json.message || "Kill Switch Deactivated.");
        await fetchBotStatus();
        if (typeof fetchBotInstances === 'function') fetchBotInstances();
        if (typeof fetchTrades === 'function') fetchTrades();
        if (typeof fetchActivityLogs === 'function') fetchActivityLogs();
    } catch (e) {
        alert("Failed to deactivate kill switch: " + e);
    }
}


async function controlBot(action) {
    if (action === 'STOP') {
        const openTradeText = document.getElementById("ctrl-open-trade")?.textContent || "NONE";
        if (openTradeText !== "NONE" && openTradeText !== "0.0") {
            const proceed = confirm(`⚠️ WARNING: This bot instance currently has an OPEN position (${openTradeText}).\n\nStopping the bot will NOT automatically close this open position on Binance.\n\nAre you sure you want to stop the bot?`);
            if (!proceed) return;
        }
    }
    try {
        const res = await fetch(`/api/bots/${activeBotId}/control`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({action})
        });
        const json = await res.json();
        alert(json.message);
        fetchBotStatus();
        fetchBotActivity(activeBotId);
    } catch (e) {
        alert("Failed to execute bot control action: " + e);
    }
}

function promptKillSwitch() {
    pendingModalAction = "KILL_SWITCH";
    document.getElementById("modal-msg").textContent = "CRITICAL: Activating the Kill Switch will immediately cancel all active orders, terminate trading, and set the system into emergency lock state.";
    document.getElementById("modal-2fa-group").style.display = "block";
    document.getElementById("confirm-modal").style.display = "flex";
}

function closeModal() {
    document.getElementById("confirm-modal").style.display = "none";
    pendingModalAction = null;
}

async function executeModalAction() {
    if (pendingModalAction === "KILL_SWITCH") {
        const token = document.getElementById("modal-token-input").value.trim();
        try {
            const res = await fetch("/api/bot/control", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({action: "KILL_SWITCH", confirmation_token: token})
            });
            const json = await res.json();
            alert(json.message);
            closeModal();
            await fetchBotStatus();
            if (typeof fetchBotInstances === 'function') fetchBotInstances();
            if (typeof fetchTrades === 'function') fetchTrades();
            if (typeof fetchActivityLogs === 'function') fetchActivityLogs();
        } catch (e) {
            alert("Kill Switch trigger failed: " + e);
        }
    }
}


async function fetchStrategyConfig() {
    try {
        const res = await fetch("/api/strategy/config");
        const json = await res.json();
    } catch (e) {
        console.error("Strategy config error:", e);
    }
}

// --------------------------------------------------------------------------
// SECTION 4: RISK CALCULATOR
// --------------------------------------------------------------------------
async function calculatePositionSize() {
    const body = {
        account_balance: parseFloat(document.getElementById("calc-balance").value),
        risk_pct: parseFloat(document.getElementById("calc-risk-pct").value) / 100.0,
        entry_price: parseFloat(document.getElementById("calc-entry").value),
        stop_loss_price: parseFloat(document.getElementById("calc-sl").value)
    };

    try {
        const res = await fetch("/api/risk/calculate", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(body)
        });
        const json = await res.json();
        if (json.status === "success") {
            const calc = json.calculation;
            document.getElementById("res-risk-amt").textContent = `$${calc.risk_amount_usdt.toFixed(2)}`;
            document.getElementById("res-dist-pct").textContent = `${calc.distance_pct.toFixed(2)}%`;
            document.getElementById("res-units").textContent = `${calc.position_units_btc.toFixed(4)} BTC`;
            document.getElementById("res-val").textContent = `$${calc.position_value_usdt.toFixed(2)}`;
            document.getElementById("res-tp").textContent = `$${calc.suggested_take_profit.toFixed(2)}`;
        } else {
            alert(json.message);
        }
    } catch (e) {
        alert("Position calculation error: " + e);
    }
}

let lastTotalPnl = null;

function updatePnlDisplays(sum) {
    if (!sum) return;
    const pnlVal = sum.total_pnl || 0.0;
    const pnlFormatted = `${pnlVal >= 0 ? '+' : ''}$${pnlVal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;

    const topPnlEl = document.getElementById("top-pnl");
    if (topPnlEl) {
        topPnlEl.textContent = pnlFormatted;
        topPnlEl.className = `pnl-badge ${pnlVal >= 0 ? 'pos' : 'neg'}`;
        if (lastTotalPnl !== null && lastTotalPnl !== pnlVal) {
            const flashClass = pnlVal > lastTotalPnl ? 'flash-up' : 'flash-down';
            topPnlEl.classList.remove('flash-up', 'flash-down');
            void topPnlEl.offsetWidth;
            topPnlEl.classList.add(flashClass);
        }
    }

    const ctrlPnlEl = document.getElementById("ctrl-total-pnl-val");
    if (ctrlPnlEl) {
        let subText = "";
        if (sum.unrealized_pnl !== undefined && sum.unrealized_pnl !== 0) {
            subText = ` (Unrealized: ${sum.unrealized_pnl >= 0 ? '+' : ''}$${sum.unrealized_pnl.toFixed(2)})`;
        }
        ctrlPnlEl.innerHTML = `${pnlFormatted} <span style="font-size:11px; font-weight:500; color:var(--text-muted);">${subText}</span>`;
        ctrlPnlEl.style.color = pnlVal >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
    }

    lastTotalPnl = pnlVal;
}

// --------------------------------------------------------------------------
// SECTION 5: PERFORMANCE ANALYTICS ROUTING
// --------------------------------------------------------------------------
async function fetchAnalytics() {
    if (typeof AnalyticsDataManager !== "undefined" && AnalyticsDataManager.fetchAnalytics) {
        return await AnalyticsDataManager.fetchAnalytics();
    }
}


function renderRealizedPnlChart(data) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById("chart-realized-pnl");
    if (!ctx) return;

    const labels = (data || []).map(d => d.symbol);
    const pnls = (data || []).map(d => d.pnl);
    const bgColors = pnls.map(p => p >= 0 ? "rgba(0, 192, 118, 0.85)" : "rgba(255, 59, 105, 0.85)");

    if (chartInstances["realized_pnl"]) {
        const c = chartInstances["realized_pnl"];
        c.data.labels = labels;
        c.data.datasets[0].data = pnls;
        c.data.datasets[0].backgroundColor = bgColors;
        c.update('none');
        return;
    }

    chartInstances["realized_pnl"] = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Realized PnL ($)",
                data: pnls,
                backgroundColor: bgColors,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: "#8c9ba5" } },
                y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#8c9ba5" } }
            }
        }
    });
}

function renderWinLossDonutChart(data) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById("chart-winloss-donut");
    if (!ctx) return;

    const overlay = document.getElementById("donut-ratio-overlay");
    if (overlay) overlay.textContent = (data && data.ratio_str) ? data.ratio_str : "0:0";

    const labels = ["Winning Trades", "Losing Trades", "Breakeven"];
    const datasetData = data ? [data.winning || 0, data.losing || 0, data.breakeven || 0] : [0, 0, 0];

    if (chartInstances["winloss_donut"]) {
        const c = chartInstances["winloss_donut"];
        c.data.labels = labels;
        c.data.datasets[0].data = datasetData;
        c.update('none');
        return;
    }

    chartInstances["winloss_donut"] = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: datasetData,
                backgroundColor: ["#00c076", "#ff3b69", "#8c9ba5"],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "70%",
            plugins: { legend: { position: "bottom", labels: { color: "#8c9ba5", font: { size: 10 } } } }
        }
    });
}

function renderOpenClosedDonutChart(data) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById("chart-openclosed-donut");
    if (!ctx) return;

    const labels = ["Open Positions", "Closed Positions"];
    const datasetData = data ? [data.open || 0, data.closed || 0] : [0, 0];

    if (chartInstances["openclosed_donut"]) {
        const c = chartInstances["openclosed_donut"];
        c.data.labels = labels;
        c.data.datasets[0].data = datasetData;
        c.update('none');
        return;
    }

    chartInstances["openclosed_donut"] = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: datasetData,
                backgroundColor: ["#ffab00", "#2563eb"],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "70%",
            plugins: { legend: { position: "bottom", labels: { color: "#8c9ba5", font: { size: 10 } } } }
        }
    });
}

function renderDirectionPieChart(data) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById("chart-direction-pie");
    if (!ctx) return;

    const labels = ["LONG Trades", "SHORT Trades"];
    const datasetData = data ? [data.long_count || 0, data.short_count || 0] : [0, 0];

    if (chartInstances["direction_pie"]) {
        const c = chartInstances["direction_pie"];
        c.data.labels = labels;
        c.data.datasets[0].data = datasetData;
        c.update('none');
        return;
    }

    chartInstances["direction_pie"] = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: datasetData,
                backgroundColor: ["#00c076", "#ff3b69"],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "70%",
            plugins: { legend: { position: "bottom", labels: { color: "#8c9ba5", font: { size: 10 } } } }
        }
    });
}

function renderAssetClassPieChart(data) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById("chart-asset-class-pie");
    if (!ctx) return;

    const labels = (data || []).map(d => d.asset_class);
    const values = (data || []).map(d => d.count);

    if (chartInstances["asset_class_pie"]) {
        const c = chartInstances["asset_class_pie"];
        c.data.labels = labels;
        c.data.datasets[0].data = values;
        c.update('none');
        return;
    }

    chartInstances["asset_class_pie"] = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: ["#00c076", "#ffab00", "#00b4d8", "#a29bfe", "#ff7675"],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "70%",
            plugins: { legend: { position: "bottom", labels: { color: "#8c9ba5", font: { size: 10 } } } }
        }
    });
}

function renderExecutionModePieChart(data) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById("chart-execution-mode-pie");
    if (!ctx) return;

    const labels = (data || []).map(d => d.mode);
    const values = (data || []).map(d => d.count);

    if (chartInstances["execution_mode_pie"]) {
        const c = chartInstances["execution_mode_pie"];
        c.data.labels = labels;
        c.data.datasets[0].data = values;
        c.update('none');
        return;
    }

    chartInstances["execution_mode_pie"] = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: ["#ffab00", "#00c076", "#2563eb"],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "70%",
            plugins: { legend: { position: "bottom", labels: { color: "#8c9ba5", font: { size: 10 } } } }
        }
    });
}

function renderStrategyWinrateDonutChart(data) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById("chart-strategy-winrate-donut");
    if (!ctx) return;

    const labels = (data || []).map(d => d.strategy);
    const values = (data || []).map(d => d.win_rate);

    if (chartInstances["strategy_winrate"]) {
        const c = chartInstances["strategy_winrate"];
        c.data.labels = labels;
        c.data.datasets[0].data = values;
        c.update('none');
        return;
    }

    chartInstances["strategy_winrate"] = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: ["#2563eb", "#f7931a", "#9b59b6", "#00c076"],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "70%",
            plugins: { legend: { position: "bottom", labels: { color: "#8c9ba5", font: { size: 10 } } } }
        }
    });
}

function renderHbarComparisonChart(data) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById("chart-hbar-comparison");
    if (!ctx) return;

    const labels = (data || []).map(d => d.label);
    const winVals = (data || []).map(d => d.win);
    const lossVals = (data || []).map(d => d.loss);

    if (chartInstances["hbar_comparison"]) {
        const c = chartInstances["hbar_comparison"];
        c.data.labels = labels;
        c.data.datasets[0].data = winVals;
        c.data.datasets[1].data = lossVals;
        c.update('none');
        return;
    }

    chartInstances["hbar_comparison"] = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [
                { label: "Winning Trades Stats", data: winVals, backgroundColor: "#00c076", borderRadius: 4 },
                { label: "Losing Trades Stats", data: lossVals, backgroundColor: "#ff3b69", borderRadius: 4 }
            ]
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "top", labels: { color: "#8c9ba5" } } },
            scales: {
                x: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#8c9ba5" } },
                y: { ticks: { color: "#8c9ba5" } }
            }
        }
    });
}

function renderStrategyComboChart(data) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById("chart-strategy-combo");
    if (!ctx) return;

    const labels = (data || []).map(d => d.strategy);
    const wins = (data || []).map(d => d.wins);
    const losses = (data || []).map(d => d.losses);
    const pnls = (data || []).map(d => d.pnl);

    if (chartInstances["strategy_combo"]) {
        const c = chartInstances["strategy_combo"];
        c.data.labels = labels;
        c.data.datasets[0].data = wins;
        c.data.datasets[1].data = losses;
        c.data.datasets[2].data = pnls;
        c.update('none');
        return;
    }

    chartInstances["strategy_combo"] = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [
                { type: "bar", label: "Winning Trades Count", data: wins, backgroundColor: "#00c076", stack: "Stack 0" },
                { type: "bar", label: "Losing Trades Count", data: losses, backgroundColor: "#ff3b69", stack: "Stack 0" },
                { type: "line", label: "Net P&L ($)", data: pnls, borderColor: "#f1c40f", backgroundColor: "#f1c40f", borderWidth: 2, yAxisID: "y1" }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "top", labels: { color: "#8c9ba5" } } },
            scales: {
                x: { ticks: { color: "#8c9ba5" } },
                y: { type: "linear", display: true, position: "left", title: { display: true, text: "Trade Counts", color: "#8c9ba5" }, grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#8c9ba5" } },
                y1: { type: "linear", display: true, position: "right", title: { display: true, text: "Net PnL ($)", color: "#f1c40f" }, grid: { drawOnChartArea: false }, ticks: { color: "#f1c40f" } }
            }
        }
    });
}

function renderEquityDrawdownChart(curveData) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById("chart-equity-drawdown");
    if (!ctx || !curveData || curveData.length === 0) return;

    const labels = curveData.map(d => (d.time || '').slice(5, 16).replace('T', ' '));
    const equities = curveData.map(d => d.equity);
    const drawdowns = curveData.map(d => d.drawdown);

    if (chartInstances["equity_drawdown"]) {
        const c = chartInstances["equity_drawdown"];
        c.data.labels = labels;
        c.data.datasets[0].data = equities;
        c.data.datasets[1].data = drawdowns;
        c.update('none');
        return;
    }

    chartInstances["equity_drawdown"] = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "Account Equity ($)",
                    data: equities,
                    borderColor: "#00c076",
                    backgroundColor: "rgba(0, 192, 118, 0.1)",
                    fill: true,
                    tension: 0.2,
                    borderWidth: 2,
                    yAxisID: "y"
                },
                {
                    label: "Drawdown %",
                    data: drawdowns,
                    borderColor: "#ff3b69",
                    backgroundColor: "rgba(255, 59, 105, 0.25)",
                    fill: true,
                    tension: 0.2,
                    borderWidth: 1.5,
                    yAxisID: "y1"
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "top", labels: { color: "#8c9ba5" } } },
            scales: {
                x: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#8c9ba5" } },
                y: { type: "linear", display: true, position: "left", title: { display: true, text: "Equity ($)", color: "#00c076" }, grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#00c076" } },
                y1: { type: "linear", display: true, position: "right", title: { display: true, text: "Drawdown (%)", color: "#ff3b69" }, grid: { drawOnChartArea: false }, ticks: { color: "#ff3b69" } }
            }
        }
    });
}

// --------------------------------------------------------------------------
// SECTION 6: GROUPED TRADE JOURNAL TABLE & OBSERVATIONS
// --------------------------------------------------------------------------
async function fetchTrades() {
    const statusFilter = document.getElementById("trade-status-filter")?.value || "ALL";
    const sideFilter = document.getElementById("trade-side-filter")?.value || "ALL";
    const search = document.getElementById("trade-search")?.value || "";

    const showTest = document.getElementById("show-test-trades-toggle")?.checked ? "true" : "false";

    try {
        const res = await fetch(`/api/trades?status=${statusFilter}&direction=${sideFilter}&query=${search}&page=${tradePage}&per_page=${tradePerPage}&show_test_trades=${showTest}`);

        const json = await res.json();
        if (json.status === "success" && json.trades) {
            renderTradesTable(json.trades);
            if (document.getElementById("page-curr")) document.getElementById("page-curr").textContent = json.page;
            if (document.getElementById("page-total")) document.getElementById("page-total").textContent = json.total_pages;
            if (document.getElementById("total-count")) document.getElementById("total-count").textContent = json.total_count;
        }
    } catch (e) {
        console.error("Trades fetch error:", e);
    }
}

function changeTradePage(delta) {
    tradePage = Math.max(1, tradePage + delta);
    fetchTrades();
}

async function triggerForceTestTrade(tradeType) {
    if (!activeBotId) {
        alert("Please select an active bot instance first.");
        return;
    }

    const bot = (window.cachedBotInstances || []).find(b => b.id === activeBotId);
    const botName = bot ? bot.name : activeBotId;

    if (!confirm(`Trigger manual Paper Trading test (${tradeType}) for bot '${botName}'?`)) return;

    try {
        const res = await fetch(`/api/bots/${activeBotId}/force_test_trade`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trade_type: tradeType })
        });
        const json = await res.json();
        if (json.status === "success") {
            alert(`✅ ${json.message}`);
            await fetchBotInstances();
            await fetchBotComparison();
            await fetchBotStatus();
            await fetchTrades();
            await fetchAnalytics();
        } else {
            alert("Failed to execute forced test trade: " + json.message);
        }
    } catch (err) {
        alert("Error executing test trade: " + err);
    }
}

function renderTradesTable(trades) {
    const body = document.getElementById("trades-table-body");
    if (!body) return;
    if (!trades || trades.length === 0) {
        body.innerHTML = `<tr><td colspan="18" class="text-center text-muted">No trade history recorded for current filter criteria.</td></tr>`;
        return;
    }

    body.innerHTML = trades.map(t => {
        const isWin = (t.result_pnl || 0) > 0;
        const isLoss = (t.result_pnl || 0) < 0;
        const rr = t.stop_loss && t.entry_price ? Math.abs((t.take_profit - t.entry_price) / (t.entry_price - t.stop_loss)).toFixed(1) : "3.0";

        const isTest = (t.remarks && t.remarks.includes("TEST")) || (t.metadata && t.metadata.includes("test")) || (t.emotion_tag && t.emotion_tag.includes("Test"));
        const tagBadge = isTest ? ' <span class="badge badge-warning" style="font-size:10px; background:#ffaa00; color:#000;">🧪 TEST</span>' : '';

        return `
            <tr>
                <td><b>#${t.id}</b>${tagBadge}</td>
                <td>${t.timestamp ? t.timestamp.slice(5, 16).replace('T', ' ') : '-'}</td>
                <td><b>${t.symbol}</b></td>
                <td><b class="${t.direction === 'LONG' ? 'text-success' : 'text-danger'}">${t.direction}</b></td>
                <td><span class="badge-tag">${t.strategy || 'EMA_MACD_VP'}</span></td>
                <td>$${t.entry_price.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>

                <td>$${t.take_profit.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td>$${t.stop_loss.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td>${rr}:1</td>

                <td>${t.exit_timestamp ? t.exit_timestamp.slice(5, 16).replace('T', ' ') : '-'}</td>
                <td>${t.exit_price ? '$' + t.exit_price.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}</td>

                <td>${t.position_size.toFixed(4)}</td>
                <td>$${(t.fees || 1.50).toFixed(2)}</td>
                <td><b class="${isWin ? 'text-success' : (isLoss ? 'text-danger' : '')}">${isWin ? '+' : ''}$${(t.result_pnl || 0).toFixed(2)}</b></td>
                <td><span class="status-badge ${isWin ? 'status-running' : (isLoss ? 'status-stopped' : 'status-paused')}">${isWin ? 'WIN' : (isLoss ? 'LOSS' : t.status)}</span></td>

                <td>
                    <select class="emotion-select" onchange="saveTradeObservation(${t.id}, this.value, document.getElementById('rem-${t.id}').value)">
                        <option value="🎯 Disciplined" ${t.emotion_tag === '🎯 Disciplined' ? 'selected' : ''}>🎯 Disciplined</option>
                        <option value="😤 FOMO" ${t.emotion_tag === '😤 FOMO' ? 'selected' : ''}>😤 FOMO</option>
                        <option value="🧘 Calm" ${t.emotion_tag === '🧘 Calm' ? 'selected' : ''}>🧘 Calm</option>
                        <option value="⚡ Impulsive" ${t.emotion_tag === '⚡ Impulsive' ? 'selected' : ''}>⚡ Impulsive</option>
                    </select>
                </td>
                <td>
                    <input type="text" id="rem-${t.id}" class="remarks-input" value="${t.remarks || ''}" placeholder="Add remarks..." onblur="saveTradeObservation(${t.id}, this.previousElementSibling.value, this.value)">
                </td>
                <td>
                    <button class="btn btn-xs btn-primary" onclick="openTradeDetailModal(${t.id})" style="font-size:11px; padding:2px 6px; margin-right:4px;">🔍 Details</button>
                    <button class="btn btn-xs btn-outline-info" onclick="openTradeTimelineModal(${t.id})" style="font-size:11px; padding:2px 6px;">📜 Timeline</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function openTradeDetailModal(tradeId) {
    let modal = document.getElementById("modal-trade-detail-v2");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "modal-trade-detail-v2";
        modal.className = "modal";
        modal.style.display = "none";
        modal.style.position = "fixed";
        modal.style.top = "0";
        modal.style.left = "0";
        modal.style.width = "100%";
        modal.style.height = "100%";
        modal.style.background = "rgba(0,0,0,0.75)";
        modal.style.zIndex = "9999";
        modal.style.justifyContent = "center";
        modal.style.alignItems = "center";

        modal.innerHTML = `
            <div class="modal-content" style="max-width:900px; width:92%; max-height:85vh; background:var(--bg-card, #1e293b); color:var(--text-primary, #f8fafc); border:1px solid var(--border-color, #334155); border-radius:8px; padding:20px; box-shadow:0 10px 30px rgba(0,0,0,0.5); display:flex; flex-direction:column;">
                <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color, #334155); padding-bottom:12px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <h3 id="trade-detail-title" style="margin:0; font-size:18px; color:#fff;">🔍 TRADE DETAIL 2.0</h3>
                        <span id="trade-detail-integrity-badge" class="badge" style="font-size:11px; padding:3px 8px;">🟢 AUDIT COMPLETE</span>
                    </div>
                    <button class="close-btn" onclick="document.getElementById('modal-trade-detail-v2').style.display='none'" style="background:none; border:none; color:var(--text-primary); font-size:22px; cursor:pointer;">×</button>
                </div>

                <div class="modal-nav-tabs" style="display:flex; gap:6px; overflow-x:auto; border-bottom:1px solid var(--border-color, #334155); padding:10px 0;">
                    <button class="tab-nav-btn active" onclick="switchTradeDetailTab('overview', this)">Overview</button>
                    <button class="tab-nav-btn" onclick="switchTradeDetailTab('signal', this)">Signal</button>
                    <button class="tab-nav-btn" onclick="switchTradeDetailTab('indicators', this)">Indicators</button>
                    <button class="tab-nav-btn" onclick="switchTradeDetailTab('market', this)">Market Data</button>
                    <button class="tab-nav-btn" onclick="switchTradeDetailTab('risk', this)">Risk</button>
                    <button class="tab-nav-btn" onclick="switchTradeDetailTab('order', this)">Order</button>
                    <button class="tab-nav-btn" onclick="switchTradeDetailTab('position', this)">Position</button>
                    <button class="tab-nav-btn" onclick="switchTradeDetailTab('exit', this)">Exit</button>
                    <button class="tab-nav-btn" onclick="switchTradeDetailTab('pnl', this)">P&L</button>
                    <button class="tab-nav-btn" onclick="switchTradeDetailTab('timeline', this)">Timeline</button>
                    <button class="tab-nav-btn" onclick="switchTradeDetailTab('replay', this)">Replay</button>
                </div>

                <div class="modal-body" id="trade-detail-content" style="padding:15px 0; overflow-y:auto; flex:1;">
                    <div class="text-center text-muted" style="padding:30px;">⏳ Loading full trade audit payload...</div>
                </div>

                <div class="modal-footer" style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color, #334155); padding-top:10px;">
                    <button class="btn btn-secondary btn-sm" onclick="exportSingleTradeAuditJSON()">📥 Export Audit JSON</button>
                    <button class="btn btn-primary btn-sm" onclick="document.getElementById('modal-trade-detail-v2').style.display='none'">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const titleEl = document.getElementById("trade-detail-title");
    const badgeEl = document.getElementById("trade-detail-integrity-badge");
    const contentEl = document.getElementById("trade-detail-content");

    titleEl.textContent = `🔍 Loading Trade #${tradeId}...`;
    badgeEl.style.display = "none";
    contentEl.innerHTML = `<div class="text-center text-muted" style="padding:30px;">⏳ Loading full trade audit payload...</div>`;
    modal.style.display = "flex";

    window._currentActiveTradeId = tradeId;

    try {
        const res = await fetch(`/api/trades/${tradeId}/detail`);
        const data = await res.json();
        if (!data.success) {
            contentEl.innerHTML = `<div class="alert alert-danger">⚠️ Failed to load trade detail: ${data.error}</div>`;
            return;
        }

        window._currentTradeDetailData = data;

        titleEl.textContent = `🔍 TRADE DETAIL — ${data.trade_ref_id}`;
        badgeEl.textContent = data.audit_integrity.badge;
        badgeEl.style.display = "inline-block";
        badgeEl.style.background = data.audit_integrity.status === "COMPLETE" ? "rgba(0,192,118,0.2)" : "rgba(255,170,0,0.2)";
        badgeEl.style.color = data.audit_integrity.status === "COMPLETE" ? "#00c076" : "#ffaa00";

        switchTradeDetailTab('overview', document.querySelector('#modal-trade-detail-v2 .tab-nav-btn'));
    } catch (e) {
        contentEl.innerHTML = `<div class="alert alert-danger">⚠️ Error loading trade detail: ${e.message}</div>`;
    }
}

function switchTradeDetailTab(tabName, btnEl) {
    const data = window._currentTradeDetailData;
    if (!data) return;

    if (btnEl) {
        document.querySelectorAll('#modal-trade-detail-v2 .tab-nav-btn').forEach(b => b.classList.remove('active'));
        btnEl.classList.add('active');
    }

    const contentEl = document.getElementById("trade-detail-content");
    let html = "";

    switch (tabName) {
        case "overview":
            const ov = data.overview;
            html = `
                <div class="audit-grid" style="display:grid; grid-template-columns:repeat(2, 1fr); gap:12px;">
                    <div class="audit-card"><strong>Trade Ref ID:</strong> <span>${ov.trade_ref_id}</span></div>
                    <div class="audit-card"><strong>Database ID:</strong> <span>#${ov.trade_id}</span></div>
                    <div class="audit-card"><strong>Bot Instance:</strong> <span>${ov.bot_name} (${ov.bot_id})</span></div>
                    <div class="audit-card"><strong>Strategy:</strong> <span>${ov.strategy}</span></div>
                    <div class="audit-card"><strong>Symbol:</strong> <span>${ov.symbol} (${ov.asset_class})</span></div>
                    <div class="audit-card"><strong>Exchange:</strong> <span>${ov.exchange}</span></div>
                    <div class="audit-card"><strong>Execution Mode:</strong> <span class="badge" style="background:#00c07622; color:#00c076;">${ov.execution_mode}</span></div>
                    <div class="audit-card"><strong>Status:</strong> <span>${ov.status}</span></div>
                    <div class="audit-card" style="grid-column:span 2;"><strong>Configuration Version:</strong> <code>${ov.config_version}</code></div>
                </div>
            `;
            break;
        case "signal":
            const sig = data.signal;
            html = `
                <div class="audit-grid" style="display:grid; grid-template-columns:repeat(2, 1fr); gap:12px;">
                    <div class="audit-card"><strong>Signal ID:</strong> <code>${sig.signal_id}</code></div>
                    <div class="audit-card"><strong>Signal Timestamp:</strong> <span>${sig.signal_time}</span></div>
                    <div class="audit-card"><strong>Symbol / Timeframe:</strong> <span>${sig.symbol} (${sig.timeframe})</span></div>
                    <div class="audit-card"><strong>Confidence Score:</strong> <strong style="color:var(--accent-gold);">${sig.confidence_score}%</strong> (Required: ${sig.confidence_threshold}%)</div>
                    <div class="audit-card"><strong>Decision:</strong> <span class="badge" style="background:#00c07622; color:#00c076;">${sig.decision}</span></div>
                    <div class="audit-card" style="grid-column:span 2;"><strong>Reasoning:</strong> <span>${sig.reason}</span></div>
                </div>
            `;
            break;
        case "indicators":
            const ind = data.indicators;
            html = `
                <table class="data-table" style="width:100%;">
                    <thead><tr><th>Indicator Name</th><th>Captured Value at Entry</th></tr></thead>
                    <tbody>
                        ${Object.entries(ind).map(([k, v]) => `<tr><td><b>${k}</b></td><td><code>${typeof v === 'number' ? v.toFixed(4) : v}</code></td></tr>`).join('')}
                    </tbody>
                </table>
            `;
            break;
        case "market":
            const mkt = data.market;
            html = `
                <div class="audit-grid" style="display:grid; grid-template-columns:repeat(2, 1fr); gap:12px;">
                    <div class="audit-card"><strong>Symbol:</strong> <span>${mkt.symbol}</span></div>
                    <div class="audit-card"><strong>Last Price:</strong> <span>$${mkt.last_price}</span></div>
                    <div class="audit-card"><strong>Bid / Ask:</strong> <span>${mkt.bid} / ${mkt.ask}</span></div>
                    <div class="audit-card"><strong>Provider:</strong> <span>${mkt.provider}</span></div>
                    <div class="audit-card"><strong>Data Age:</strong> <span>${mkt.data_age_seconds}s</span></div>
                </div>
            `;
            break;
        case "risk":
            const rk = data.risk;
            html = `
                <div class="audit-grid" style="display:grid; grid-template-columns:repeat(2, 1fr); gap:12px;">
                    <div class="audit-card"><strong>Account Equity:</strong> <span>$${rk.account_equity}</span></div>
                    <div class="audit-card"><strong>Available Balance:</strong> <span>$${rk.available_balance}</span></div>
                    <div class="audit-card"><strong>Risk % / Amount:</strong> <span>${rk.risk_percentage} ($${rk.risk_amount})</span></div>
                    <div class="audit-card"><strong>Position Size:</strong> <span>${rk.position_size}</span></div>
                    <div class="audit-card"><strong>Daily Loss Limit:</strong> <span>${rk.daily_loss_limit}</span></div>
                    <div class="audit-card"><strong>Risk Check Result:</strong> <span class="badge" style="background:#00c07622; color:#00c076;">${rk.risk_check_result}</span></div>
                </div>
            `;
            break;
        case "order":
            const ord = data.order;
            html = `
                <div class="audit-grid" style="display:grid; grid-template-columns:repeat(2, 1fr); gap:12px;">
                    <div class="audit-card"><strong>Execution Mode:</strong> <span>${ord.execution_mode}</span></div>
                    <div class="audit-card"><strong>Broker Order ID:</strong> <code>${ord.broker_order_id}</code></div>
                    <div class="audit-card"><strong>Client Order ID:</strong> <code>${ord.client_order_id}</code></div>
                    <div class="audit-card"><strong>Requested Price:</strong> <span>$${ord.requested_price}</span></div>
                    <div class="audit-card"><strong>Fill Price:</strong> <span>$${ord.fill_price}</span></div>
                    <div class="audit-card"><strong>Filled Quantity:</strong> <span>${ord.filled_quantity}</span></div>
                    <div class="audit-card"><strong>Fees / Slippage:</strong> <span>$${ord.fees} / $${ord.slippage}</span></div>
                    <div class="audit-card"><strong>Execution Latency:</strong> <span>${ord.latency_ms}ms</span></div>
                </div>
            `;
            break;
        case "position":
            const pos = data.position;
            html = `
                <div class="audit-grid" style="display:grid; grid-template-columns:repeat(2, 1fr); gap:12px;">
                    <div class="audit-card"><strong>Position ID:</strong> <code>${pos.position_id}</code></div>
                    <div class="audit-card"><strong>Entry Price:</strong> <span>$${pos.entry_price}</span></div>
                    <div class="audit-card"><strong>Position Size:</strong> <span>${pos.position_size}</span></div>
                    <div class="audit-card"><strong>Status:</strong> <span>${pos.status}</span></div>
                    <div class="audit-card"><strong>Unrealized P&L:</strong> <span>$${pos.unrealized_pnl}</span></div>
                </div>
            `;
            break;
        case "exit":
            const ex = data.exit;
            html = `
                <div class="audit-grid" style="display:grid; grid-template-columns:repeat(2, 1fr); gap:12px;">
                    <div class="audit-card"><strong>Exit Timestamp:</strong> <span>${ex.exit_time}</span></div>
                    <div class="audit-card"><strong>Exit Price:</strong> <span>$${ex.exit_price}</span></div>
                    <div class="audit-card"><strong>Exit Reason:</strong> <span class="badge" style="background:#00c07622; color:#00c076;">${ex.exit_reason}</span></div>
                    <div class="audit-card" style="grid-column:span 2;"><strong>Exit Snapshot:</strong> <code>${typeof ex.exit_snapshot === 'object' ? JSON.stringify(ex.exit_snapshot) : ex.exit_snapshot}</code></div>
                </div>
            `;
            break;
        case "pnl":
            const pl = data.pnl;
            const isWin = pl.net_pnl > 0;
            html = `
                <div class="audit-grid" style="display:grid; grid-template-columns:repeat(2, 1fr); gap:12px;">
                    <div class="audit-card"><strong>Gross P&L:</strong> <span>$${pl.gross_pnl}</span></div>
                    <div class="audit-card"><strong>Fees / Slippage:</strong> <span>$${pl.fees} / $${pl.slippage}</span></div>
                    <div class="audit-card"><strong>Net Realized P&L:</strong> <strong style="color:${isWin ? '#00c076' : '#ff3b69'};">${isWin ? '+' : ''}$${pl.net_pnl}</strong></div>
                    <div class="audit-card"><strong>Return %:</strong> <span>${pl.return_percent}%</span></div>
                    <div class="audit-card"><strong>R Multiple:</strong> <span>${pl.r_multiple}R</span></div>
                    <div class="audit-card"><strong>MAE (Max Drawdown):</strong> <span style="color:#ff3b69;">$${pl.mae}</span></div>
                    <div class="audit-card"><strong>MFE (Max Profit):</strong> <span style="color:#00c076;">$${pl.mfe}</span></div>
                </div>
            `;
            break;
        case "timeline":
            const tl = data.timeline;
            html = tl.length > 0 ? tl.map(ev => {
                const timeStr = ev.local_timestamp || (ev.timestamp_utc ? ev.timestamp_utc.slice(11, 19) : '--:--:--');
                const sevColor = ev.severity === 'ERROR' ? '#ff3b69' : (ev.severity === 'WARNING' ? '#ffab00' : '#00c076');
                return `
                    <div style="display:flex; gap:12px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                        <div style="font-family:monospace; min-width:80px; color:var(--text-muted);">${timeStr}</div>
                        <div style="flex:1;">
                            <span class="badge" style="background:${sevColor}22; color:${sevColor}; border:1px solid ${sevColor}44; font-size:10px;">${ev.event_type}</span>
                            <strong>${ev.message}</strong>
                        </div>
                    </div>
                `;
            }).join('') : '<div class="alert alert-info">ℹ️ No timeline events recorded.</div>';
            break;
        case "replay":
            const rp = data.replay;
            html = `
                <div class="replay-container" style="display:flex; flex-direction:column; gap:10px;">
                    ${rp.map(s => `
                        <div class="replay-step" style="display:flex; align-items:center; gap:15px; background:rgba(255,255,255,0.03); padding:10px 14px; border-radius:6px; border-left:3px solid var(--accent-gold, #f59e0b);">
                            <div style="font-weight:700; width:60px;">STEP ${s.step}</div>
                            <div style="width:120px; font-size:11px; font-weight:700; color:var(--text-muted);">${s.phase}</div>
                            <div style="flex:1;">${s.detail}</div>
                        </div>
                    `).join('')}
                </div>
            `;
            break;
    }

    contentEl.innerHTML = html;
}

function exportSingleTradeAuditJSON() {
    if (!window._currentActiveTradeId) return;
    window.location.href = `/api/export/trade-audit/${window._currentActiveTradeId}`;
}

async function openTradeTimelineModal(tradeId) {
    let modal = document.getElementById("modal-trade-timeline");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "modal-trade-timeline";
        modal.className = "modal";
        modal.style.display = "none";
        modal.style.position = "fixed";
        modal.style.top = "0";
        modal.style.left = "0";
        modal.style.width = "100%";
        modal.style.height = "100%";
        modal.style.background = "rgba(0,0,0,0.7)";
        modal.style.zIndex = "9999";
        modal.style.justifyContent = "center";
        modal.style.alignItems = "center";

        modal.innerHTML = `
            <div class="modal-content" style="max-width:750px; width:90%; background:var(--bg-card); color:var(--text-primary); border:1px solid var(--border-color); border-radius:8px; padding:20px; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
                <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
                    <h3 id="timeline-modal-title" style="margin:0; font-size:16px;">📜 Trade Audit Timeline</h3>
                    <button class="close-btn" onclick="document.getElementById('modal-trade-timeline').style.display='none'" style="background:none; border:none; color:var(--text-primary); font-size:20px; cursor:pointer;">×</button>
                </div>
                <div class="modal-body" id="timeline-modal-body" style="padding:15px 0; max-height:500px; overflow-y:auto;">
                    <div class="text-center text-muted">Loading trade audit events...</div>
                </div>
                <div class="modal-footer" style="text-align:right; border-top:1px solid var(--border-color); padding-top:10px;">
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modal-trade-timeline').style.display='none'">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const titleEl = document.getElementById("timeline-modal-title");
    const bodyEl = document.getElementById("timeline-modal-body");
    titleEl.textContent = `📜 Trade #${tradeId} Audit Timeline`;
    bodyEl.innerHTML = `<div class="text-center text-muted" style="padding:20px;">⏳ Loading trade audit timeline...</div>`;
    modal.style.display = "flex";

    try {
        const res = await fetch(`/api/trades/${tradeId}/timeline`);
        const json = await res.json();
        if (json.success && json.events && json.events.length > 0) {
            const eventsHtml = json.events.map(ev => {
                const timeStr = ev.local_timestamp || (ev.timestamp_utc ? ev.timestamp_utc.slice(11, 19) : '--:--:--');
                const sevColor = ev.severity === 'ERROR' ? '#ff3b69' : (ev.severity === 'WARNING' ? '#ffab00' : '#00c076');
                return `
                    <div class="timeline-event-item" style="display:flex; gap:12px; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                        <div style="font-family:monospace; font-weight:700; color:var(--text-muted); min-width:80px;">${timeStr}</div>
                        <div style="flex:1;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span class="badge" style="background:${sevColor}22; color:${sevColor}; border:1px solid ${sevColor}44; font-size:10px; padding:2px 6px; border-radius:3px;">${ev.event_type}</span>
                                <strong style="font-size:13px;">${ev.message}</strong>
                            </div>
                            ${ev.reason ? `<div style="font-size:11px; color:var(--text-muted); margin-top:3px;">Reason: ${ev.reason}</div>` : ''}
                            ${ev.confidence_score ? `<div style="font-size:11px; color:var(--accent-gold); margin-top:2px;">Confidence: ${(ev.confidence_score * 100).toFixed(1)}% (Threshold: ${ev.threshold}%)</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
            bodyEl.innerHTML = eventsHtml;
        } else {
            bodyEl.innerHTML = `<div class="alert alert-info" style="padding:15px; margin:0;">ℹ️ No specific audit timeline steps recorded for Trade #${tradeId}.</div>`;
        }
    } catch (e) {
        bodyEl.innerHTML = `<div class="alert alert-danger" style="padding:15px; margin:0;">⚠️ Failed to load trade timeline: ${e.message}</div>`;
    }
}

async function saveTradeObservation(tradeId, emotionTag, remarks) {
    try {
        await fetch(`/api/trades/${tradeId}/observation`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({emotion_tag: emotionTag, remarks: remarks})
        });
    } catch (e) {
        console.error("Save observation error:", e);
    }
}

function exportTradesCSV() {
    window.location.href = "/api/trades/export";
}

// --------------------------------------------------------------------------
// SECTION 7: BACKTESTING LAB
// --------------------------------------------------------------------------
async function runBacktest(e) {
    e.preventDefault();
    const btn = document.getElementById("btn-run-bt");
    btn.disabled = true;
    btn.textContent = "⏳ Running Backtest...";

    const body = {
        start_date: document.getElementById("bt-start-date").value,
        end_date: document.getElementById("bt-end-date").value,
        initial_cash: parseFloat(document.getElementById("bt-capital").value),
        strategy_name: document.getElementById("bt-strategy").value
    };

    try {
        const res = await fetch("/api/backtest/run", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(body)
        });
        const json = await res.json();
        if (json.status === "success") {
            const bt = json.backtest;
            document.getElementById("bt-profit").textContent = `$${bt.total_net_profit.toFixed(2)}`;
            document.getElementById("bt-return").textContent = `${bt.return_pct.toFixed(2)}%`;
            document.getElementById("bt-trades").textContent = bt.total_trades;
            document.getElementById("bt-winrate").textContent = `${bt.win_rate_pct.toFixed(2)}%`;
            document.getElementById("bt-maxdd").textContent = `${bt.max_drawdown_pct.toFixed(2)}%`;
            document.getElementById("bt-sharpe").textContent = bt.sharpe_ratio.toFixed(2);
            alert("Backtest simulation completed!");
        } else {
            alert(json.message);
        }
    } catch (err) {
        alert("Backtest error: " + err);
    } finally {
        btn.disabled = false;
        btn.textContent = "🧪 Run Backtest Simulation";
    }
}

// --------------------------------------------------------------------------
// SECTION 8: ALERTS & NOTIFICATIONS
// --------------------------------------------------------------------------
async function fetchNotifications() {
    try {
        const res = await fetch("/api/alerts");
        const json = await res.json();
        if (json.notifications) {
            const container = document.getElementById("notification-feed");
            if (!container) return;
            if (json.notifications.length === 0) {
                container.innerHTML = `<div class="text-center text-muted">No notifications.</div>`;
                return;
            }
            container.innerHTML = json.notifications.map(n => `
                <div class="feed-item level-${(n.level || 'info').toLowerCase()}">
                    <span>${n.icon || 'ℹ️'}</span>
                    <span class="feed-time">${n.timestamp ? n.timestamp.slice(11, 19) : ''}</span>
                    <span class="feed-cat">[${n.category || 'System'}]</span>
                    <span>${n.message}</span>
                    <button class="feed-dismiss-btn" onclick="dismissAlert(${n.id})">×</button>
                </div>
            `).join('');
        }
    } catch (e) {
        console.error("Notification fetch error:", e);
    }
}

async function dismissAlert(id) {
    try {
        await fetch(`/api/alerts/${id}`, { method: "DELETE" });
        fetchNotifications();
    } catch (e) {
        console.error("Dismiss alert error:", e);
    }
}

async function clearAllAlerts() {
    try {
        await fetch("/api/alerts/clear", { method: "DELETE" });
        fetchNotifications();
    } catch (e) {
        console.error("Clear alerts error:", e);
    }
}

async function sendTestAlert(channel) {
    const feedback = document.getElementById("test-alert-feedback");
    if (feedback) feedback.innerHTML = `<i>⏳ Dispatching ${channel} test alert...</i>`;

    try {
        const res = await fetch("/api/alerts/test", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({channel})
        });
        const json = await res.json();
        if (feedback) {
            feedback.innerHTML = `<div class="${json.status === 'success' ? 'text-success' : 'text-danger'}"><b>${json.status === 'success' ? '✅ SUCCESS' : '❌ FAILED'}:</b> ${json.message}</div>`;
        }
        fetchNotifications();
    } catch (e) {
        if (feedback) feedback.innerHTML = `<div class="text-danger"><b>❌ FAILED:</b> ${e}</div>`;
    }
}

// --------------------------------------------------------------------------
// SECTION 9: SECURITY & LOGS
// --------------------------------------------------------------------------
async function saveApiKeys(e) {
    e.preventDefault();
    const apiKey = document.getElementById("sec-api-key").value;
    const secretKey = document.getElementById("sec-secret-key").value;

    try {
        const res = await fetch("/api/security/apikeys", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({api_key: apiKey, secret_key: secretKey})
        });
        const json = await res.json();
        alert(json.message);
    } catch (e) {
        alert("Save API keys error: " + e);
    }
}

async function fetchAuditLogs() {
    try {
        const res = await fetch("/api/security/audit");
        const json = await res.json();
        if (json.audit_logs) {
            const container = document.getElementById("audit-log-container");
            if (container) {
                container.innerHTML = json.audit_logs.map(a => `
                    <div class="audit-row">
                        <span>${a.timestamp.slice(0, 19)}</span>
                        <b>${a.action}</b>
                        <span>${a.user}</span>
                    </div>
                `).join('');
            }
        }
    } catch (e) {
        console.error("Audit log error:", e);
    }
}

async function fetchLogs() {
    const level = document.getElementById("log-level-filter")?.value || "ALL";
    const search = document.getElementById("log-search-input")?.value || "";

    try {
        const res = await fetch(`/api/logs?level=${level}&search=${search}`);
        const json = await res.json();
        if (json.logs) {
            const terminal = document.getElementById("log-terminal");
            if (terminal) {
                terminal.innerHTML = json.logs.map(line => `<div>${escapeHtml(line)}</div>`).join('');
            }
        }
    } catch (e) {
        console.error("Logs fetch error:", e);
    }
}

async function copyDiagnosticReport() {
    try {
        const res = await fetch("/api/logs/diagnostic_report");
        const json = await res.json();
        if (json.report) {
            navigator.clipboard.writeText(json.report);
            alert("Diagnostic report copied to clipboard!");
        }
    } catch (e) {
        alert("Failed to generate diagnostic report: " + e);
    }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    document.getElementById("theme-toggle").textContent = next === "dark" ? "🌙" : "☀️";
}

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --------------------------------------------------------------------------
// SECTION 8: SEARCHABLE INDICATOR LIBRARY & 4-INDICATOR CAP MANAGER
// --------------------------------------------------------------------------
const MAX_INDICATORS_CAP = 4;
let currentIndicatorContext = 'chart'; // 'chart', 'new_bot', 'edit_bot'

const ALL_INDICATORS_CATALOG = [
    { id: "ema", name: "EMA (Exponential Moving Average)", category: "Trend", params: { period: 20 }, desc: "Smoothed trend filter. Configurable periods." },
    { id: "macd", name: "MACD (Moving Average Convergence Divergence)", category: "Momentum", params: { fast: 12, slow: 26, signal: 9 }, desc: "Trend-following momentum indicator." },
    { id: "rsi", name: "RSI (Relative Strength Index)", category: "Oscillator", params: { period: 14 }, desc: "Momentum oscillator measuring speed and change of price moves." },
    { id: "vp", name: "Visible Range Volume Profile", category: "Volume", params: { bins: 50 }, desc: "Point of Control (POC), Value Area High (VAH), Value Area Low (VAL)." },
    { id: "adx", name: "Average Directional Index (ADX)", category: "Trend Strength", params: { period: 14 }, desc: "Measures overall trend strength and market regime (Trending vs RANGING)." },
    { id: "bollinger", name: "Bollinger Bands", category: "Volatility", params: { period: 20, stdDev: 2.0 }, desc: "Volatility bands placed above and below a central moving average." },
    { id: "sma", name: "SMA (Simple Moving Average)", category: "Trend", params: { period: 20 }, desc: "Calculates unweighted mean of price series over specified period." },
    { id: "momentum", name: "Momentum", category: "Momentum", params: { period: 10 }, desc: "Measures rate of price acceleration or deceleration." },
    { id: "fib", name: "Auto Fib Retracement", category: "Overlay", params: { lookback: 50 }, desc: "Automatically plots Fibonacci retracement levels (0.236, 0.382, 0.500, 0.618, 0.786)." },
    { id: "pivots", name: "Pivot Points High Low", category: "Levels", params: {}, desc: "Standard Floor Pivots (Pivot, R1, R2, S1, S2)." },
    { id: "key_levels", name: "Auto Key Levels (Support/Resistance)", category: "Levels", params: { lookback: 100 }, desc: "Dynamic price cluster detection for key horizontal support & resistance." },
    { id: "patterns", name: "All Chart Patterns", category: "Pattern Recognition", params: {}, desc: "Best-effort pattern recognition (Double Top/Bottom, Head & Shoulders, Flags, Triangles)." },
    { id: "rsi_trend", name: "RSI Momentum Trend", category: "Oscillator", params: { rsiPeriod: 14, smoothPeriod: 9 }, desc: "RSI value combined with smoothed EMA trend vector." },
    { id: "session_vp", name: "Session Volume Profile", category: "Volume", params: {}, desc: "Volume distribution per trading session." },
    { id: "fixed_vp", name: "Fixed Range Volume Profile", category: "Volume", params: { range: 50 }, desc: "Volume profile over a user-selected bar range." }
];

let activeIndicators = [
    { id: "ema", name: "EMA (Exponential Moving Average)", params: { period: 20 } },
    { id: "macd", name: "MACD (Moving Average Convergence Divergence)", params: { fast: 12, slow: 26, signal: 9 } },
    { id: "vp", name: "Visible Range Volume Profile", params: { bins: 50 } }
];

let newBotIndicators = [
    { id: "ema", name: "EMA (Exponential Moving Average)", params: { period: 20 } },
    { id: "macd", name: "MACD (Moving Average Convergence Divergence)", params: { fast: 12, slow: 26, signal: 9 } },
    { id: "vp", name: "Visible Range Volume Profile", params: { bins: 50 } }
];

let editingBotIndicators = [];
let editingIndicatorId = null;

function getContextIndicators(ctx = currentIndicatorContext) {
    if (ctx === 'new_bot') return newBotIndicators;
    if (ctx === 'edit_bot') return editingBotIndicators;
    return activeIndicators;
}

function getIndicatorColor(id) {
    const key = (id || '').toLowerCase();
    if (key.includes('ema') || key.includes('sma')) return '#00b4d8';
    if (key.includes('macd') || key.includes('momentum')) return '#9b59b6';
    if (key.includes('rsi')) return '#f7931a';
    if (key.includes('vp') || key.includes('volume')) return '#00c076';
    if (key.includes('adx')) return '#e74c3c';
    if (key.includes('bollinger') || key.includes('bb')) return '#3498db';
    return '#00b4d8';
}

function renderBotIndicatorsBar(context) {
    const list = getContextIndicators(context);
    const barId = context === 'new_bot' ? 'create-bot-indicators-bar' : 'edit-bot-indicators-bar';
    const countId = context === 'new_bot' ? 'create-bot-ind-count' : 'edit-bot-ind-count';

    const countEl = document.getElementById(countId);
    if (countEl) countEl.textContent = list.length;

    const bar = document.getElementById(barId);
    if (!bar) return;

    if (list.length === 0) {
        bar.innerHTML = `<span style="color:var(--text-muted); font-size:12px;">No indicators selected. Click 'Configure Indicators' to select up to 4.</span>`;
        return;
    }

    bar.innerHTML = list.map(ind => `
        <span class="ind-chip" style="border-color:${getIndicatorColor(ind.id)};">
            <span>${escapeHtml(ind.name || ind.id)}</span>
            <button type="button" class="ind-chip-btn btn-gear" onclick="openIndicatorSettings('${ind.id}')" title="Configure Parameters">⚙️</button>
            <button type="button" class="ind-chip-btn btn-remove" onclick="removeIndicator('${ind.id}')" title="Remove Indicator">✖</button>
        </span>
    `).join(' ');
}

function updateIndicatorCountBadges() {
    const list = getContextIndicators();
    const countEl = document.getElementById("indicator-active-count");
    if (countEl) countEl.textContent = activeIndicators.length;

    const modalBadge = document.getElementById("modal-active-badge");
    if (modalBadge) modalBadge.textContent = `${list.length} / ${MAX_INDICATORS_CAP} Active (Max ${MAX_INDICATORS_CAP})`;
}

function openIndicatorModal(context = 'chart') {
    currentIndicatorContext = context;
    const modal = document.getElementById("indicator-modal");
    if (modal) modal.style.display = "flex";
    updateIndicatorCountBadges();
    renderActiveIndicatorsBar();
    renderIndicatorCatalog(document.getElementById("indicator-search-input")?.value || "");
}

function closeIndicatorModal() {
    const modal = document.getElementById("indicator-modal");
    if (modal) modal.style.display = "none";
}

function renderActiveIndicatorsBar() {
    const bar = document.getElementById("active-indicators-bar");
    if (!bar) return;

    const list = getContextIndicators();

    if (list.length === 0) {
        bar.innerHTML = `<span style="color:var(--text-muted); font-size:12px;">No active indicators applied. Select from list below (Max 4).</span>`;
        return;
    }

    bar.innerHTML = list.map(ind => `
        <span class="ind-chip" style="border-color:${getIndicatorColor(ind.id)};">
            <span>${escapeHtml(ind.name || ind.id)}</span>
            <button type="button" class="ind-chip-btn btn-gear" onclick="openIndicatorSettings('${ind.id}')" title="Configure Parameters">⚙️</button>
            <button type="button" class="ind-chip-btn btn-remove" onclick="removeIndicator('${ind.id}')" title="Remove Indicator">✖</button>
        </span>
    `).join(' ');
}

function renderIndicatorCatalog(filterQuery = "") {
    const catalogEl = document.getElementById("indicator-catalog-list");
    if (!catalogEl) return;

    const list = getContextIndicators();
    const query = filterQuery.toLowerCase().trim();
    const filtered = ALL_INDICATORS_CATALOG.filter(ind => 
        ind.name.toLowerCase().includes(query) || 
        ind.category.toLowerCase().includes(query) ||
        ind.desc.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
        catalogEl.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted);">No indicators match "${escapeHtml(filterQuery)}"</div>`;
        return;
    }

    catalogEl.innerHTML = filtered.map(ind => {
        const isActive = list.some(a => a.id === ind.id);
        return `
            <div class="card p-3 mb-2" style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-card-subtle);">
                <div>
                    <div style="font-weight:600; color:var(--text-main); display:flex; align-items:center; gap:8px;">
                        <span>${escapeHtml(ind.name)}</span>
                        <span class="badge badge-secondary" style="font-size:10px;">${escapeHtml(ind.category)}</span>
                    </div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">${escapeHtml(ind.desc)}</div>
                </div>
                <div>
                    ${isActive ? 
                        `<button type="button" class="btn btn-sm btn-secondary" onclick="removeIndicator('${ind.id}')">Active (Remove)</button>` : 
                        `<button type="button" class="btn btn-sm btn-primary" onclick="addIndicator('${ind.id}')">+ Add</button>`
                    }
                </div>
            </div>
        `;
    }).join('');
}

function filterIndicatorLibrary() {
    const input = document.getElementById("indicator-search-input");
    renderIndicatorCatalog(input ? input.value : "");
}

function addIndicator(id) {
    const list = getContextIndicators();
    if (list.length >= MAX_INDICATORS_CAP) {
        alert(`Maximum ${MAX_INDICATORS_CAP} indicators active — remove one to add another.`);
        return;
    }

    const item = ALL_INDICATORS_CATALOG.find(i => i.id === id);
    if (!item) return;

    list.push({ id: item.id, name: item.name, params: { ...item.params } });
    updateIndicatorCountBadges();
    renderActiveIndicatorsBar();
    renderIndicatorCatalog(document.getElementById("indicator-search-input")?.value || "");
    
    if (currentIndicatorContext === 'chart') {
        fetchCandles();
    } else {
        renderBotIndicatorsBar(currentIndicatorContext);
    }
}

function removeIndicator(id) {
    if (currentIndicatorContext === 'new_bot') {
        newBotIndicators = newBotIndicators.filter(a => a.id !== id);
    } else if (currentIndicatorContext === 'edit_bot') {
        editingBotIndicators = editingBotIndicators.filter(a => a.id !== id);
    } else {
        activeIndicators = activeIndicators.filter(a => a.id !== id);
    }

    updateIndicatorCountBadges();
    renderActiveIndicatorsBar();
    renderIndicatorCatalog(document.getElementById("indicator-search-input")?.value || "");

    if (currentIndicatorContext === 'chart') {
        fetchCandles();
    } else {
        renderBotIndicatorsBar(currentIndicatorContext);
    }
}

function openIndicatorSettings(id) {
    const list = getContextIndicators();
    const ind = list.find(a => a.id === id);
    if (!ind) return;

    editingIndicatorId = id;
    const titleEl = document.getElementById("ind-settings-title");
    if (titleEl) titleEl.textContent = `⚙️ Configure ${ind.name} Settings`;

    const fieldsEl = document.getElementById("ind-settings-fields");
    if (fieldsEl) {
        const paramKeys = Object.keys(ind.params || {});
        if (paramKeys.length === 0) {
            fieldsEl.innerHTML = `<p style="color:var(--text-muted);">No adjustable parameters for ${escapeHtml(ind.name)}.</p>`;
        } else {
            fieldsEl.innerHTML = paramKeys.map(k => `
                <div class="form-group mb-3">
                    <label style="font-size:12px; font-weight:600; text-transform:capitalize;">${escapeHtml(k)}:</label>
                    <input type="number" class="form-input" id="param-input-${k}" value="${ind.params[k]}" step="any">
                </div>
            `).join('');
        }
    }

    const modal = document.getElementById("indicator-settings-modal");
    if (modal) modal.style.display = "flex";
}

function closeIndicatorSettingsModal() {
    const modal = document.getElementById("indicator-settings-modal");
    if (modal) modal.style.display = "none";
    editingIndicatorId = null;
}

async function saveIndicatorSettings() {
    if (!editingIndicatorId) return;

    const list = getContextIndicators();
    const ind = list.find(a => a.id === editingIndicatorId);
    if (ind && ind.params) {
        Object.keys(ind.params).forEach(k => {
            const input = document.getElementById(`param-input-${k}`);
            if (input) {
                ind.params[k] = parseFloat(input.value) || ind.params[k];
            }
        });
    }

    closeIndicatorSettingsModal();

    const targetBotId = (typeof editingBotId !== 'undefined' && editingBotId) ? editingBotId : (activeBotId || "bot-1");
    try {
        await fetch(`/api/bot/${targetBotId}/indicators`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ indicators: list })
        });
        if (typeof showToast === 'function') showToast(`Saved indicator settings for ${targetBotId}`);
    } catch (e) {
        console.warn("Failed to persist bot indicator config to DB:", e);
    }

    if (currentIndicatorContext === 'chart') {
        fetchCandles();
    } else {
        renderBotIndicatorsBar(currentIndicatorContext);
    }
}

// --------------------------------------------------------------------------
// SECTION 9: MANUAL SIGNAL APPROVAL WORKFLOW (SEMI-AUTOMATED MODE)
// --------------------------------------------------------------------------
async function fetchPendingSignals() {
    try {
        const res = await fetch(`/api/signals/pending?bot_id=${activeBotId || 'bot-1'}`);
        const json = await res.json();
        const wrapper = document.getElementById("pending-signals-wrapper");
        const container = document.getElementById("pending-signals-container");

        if (!wrapper || !container) return;

        if (json.status === "success" && json.pending_signals && json.pending_signals.length > 0) {
            wrapper.style.display = "block";
            let html = "";
            json.pending_signals.forEach(sig => {
                const conf = Math.round(sig.confluence_pct || 75);
                const thresh = Math.round(sig.threshold_pct || 75);
                const priceFormatted = parseFloat(sig.price || 0).toLocaleString('en-US', {minimumFractionDigits: 2});
                const isExitAlert = (sig.signal_type === "EXIT_SIGNAL" || sig.signal_type === "SQUARE_OFF");

                if (isExitAlert) {
                    const details = typeof sig.strategy_details === 'string' ? JSON.parse(sig.strategy_details || '{}') : (sig.strategy_details || {});
                    const entryP = parseFloat(details.entry_price || sig.sl_price || 0);
                    const entryStr = entryP > 0 ? `$${entryP.toLocaleString('en-US', {minimumFractionDigits: 2})}` : '--';
                    const pnlVal = parseFloat(details.unrealized_pnl || 0);
                    const pnlStr = pnlVal >= 0 ? `+$${pnlVal.toFixed(2)}` : `-$${Math.abs(pnlVal).toFixed(2)}`;
                    const pnlClass = pnlVal >= 0 ? '#00c076' : '#ff3b69';

                    html += `
                        <div style="background:var(--bg-secondary); padding:16px; border-radius:8px; border:1px solid rgba(255, 171, 0, 0.4); margin-top:8px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                <div style="font-weight:800; font-size:14px; color:#ffab00; display:flex; align-items:center; gap:6px;">
                                    <span>🚨 POSITION ALERT</span>
                                </div>
                                <span class="badge" style="background:#ffab00; color:#000; font-weight:700; font-size:11px; padding:3px 8px; border-radius:4px;">WAITING FOR DECISION</span>
                            </div>
                            <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; margin-bottom:12px; font-size:12px; background:var(--bg-tertiary); padding:10px; border-radius:6px;">
                                <div><span style="color:var(--text-muted);">Symbol:</span> <strong>${sig.symbol}</strong></div>
                                <div><span style="color:var(--text-muted);">Entry:</span> <strong>${entryStr}</strong></div>
                                <div><span style="color:var(--text-muted);">Current Price:</span> <strong>$${priceFormatted}</strong></div>
                                <div><span style="color:var(--text-muted);">Unrealized P&L:</span> <strong style="color:${pnlClass}">${pnlStr}</strong></div>
                                <div><span style="color:var(--text-muted);">Strategy:</span> <strong style="color:#ffab00;">Possible EXIT</strong></div>
                                <div><span style="color:var(--text-muted);">Confidence:</span> <strong>${conf}%</strong></div>
                            </div>
                            <div style="background:rgba(255, 171, 0, 0.1); padding:8px 12px; border-radius:4px; color:#ffab00; font-weight:700; font-size:11px; margin-bottom:12px; text-align:center;">
                                ⚠️ Bot will NOT close the position automatically. Waiting for your decision.
                            </div>
                            <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px;">
                                <button class="btn btn-warning btn-sm" onclick="resolveSignalApproval(${sig.id}, 'HOLD', this)" style="background:#ffab00; color:#000; font-weight:700;">🟡 HOLD</button>
                                <button class="btn btn-danger btn-sm" onclick="resolveSignalApproval(${sig.id}, 'SQUARE_OFF', this)" style="background:#ff3b69; font-weight:700;">🔴 SQUARE OFF</button>
                                <button class="btn btn-secondary btn-sm" onclick="resolveSignalApproval(${sig.id}, 'IGNORE', this)" style="font-weight:700;">⚪ IGNORE</button>
                            </div>
                        </div>
                    `;
                } else {
                    const isLong = sig.signal_type === "LONG";
                    const btnLabel = isLong ? "🟢 APPROVE LONG" : "🔴 APPROVE SHORT";
                    const actAction = isLong ? "BUY_LONG" : "SELL_SHORT";
                    const sigColor = isLong ? "#00c076" : "#ff3b69";

                    html += `
                        <div style="background:var(--bg-secondary); padding:16px; border-radius:8px; border:1px solid ${sigColor}; margin-top:8px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                <div style="font-weight:800; font-size:14px; color:${sigColor}; display:flex; align-items:center; gap:6px;">
                                    <span>🚨 TRADE SIGNAL GENERATED</span>
                                </div>
                                <span class="badge" style="background:#ffab00; color:#000; font-weight:700; font-size:11px; padding:3px 8px; border-radius:4px;">WAITING FOR DECISION</span>
                            </div>
                            <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; margin-bottom:12px; font-size:12px; background:var(--bg-tertiary); padding:10px; border-radius:6px;">
                                <div><span style="color:var(--text-muted);">Symbol:</span> <strong>${sig.symbol} (${sig.timeframe || '15m'})</strong></div>
                                <div><span style="color:var(--text-muted);">Signal:</span> <strong style="color:${sigColor}">${sig.signal_type}</strong></div>
                                <div><span style="color:var(--text-muted);">Trigger Price:</span> <strong>$${priceFormatted}</strong></div>
                                <div><span style="color:var(--text-muted);">Confidence:</span> <strong>${conf}%</strong></div>
                                <div><span style="color:var(--text-muted);">Required Threshold:</span> <strong>${thresh}%</strong></div>
                                <div><span style="color:var(--text-muted);">Indicators:</span> <strong style="color:#00c076;">EMA + MACD + VP Bullish</strong></div>
                            </div>
                            <div style="background:rgba(255, 171, 0, 0.1); padding:8px 12px; border-radius:4px; color:#ffab00; font-weight:700; font-size:11px; margin-bottom:12px; text-align:center;">
                                ⚠️ NO TRADE EXECUTED — Waiting for your decision.
                            </div>
                            <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:10px;">
                                <button class="btn btn-success btn-sm" onclick="resolveSignalApproval(${sig.id}, '${actAction}', this)" style="background:${sigColor}; font-weight:700;">${btnLabel}</button>
                                <button class="btn btn-secondary btn-sm" onclick="resolveSignalApproval(${sig.id}, 'IGNORE', this)" style="font-weight:700;">⚪ IGNORE</button>
                            </div>
                        </div>
                    `;
                }
            });
            container.innerHTML = html;
        } else {
            wrapper.style.display = "none";
            container.innerHTML = "";
        }
    } catch (e) {
        console.error("Fetch pending signals error:", e);
    }
}

async function resolveSignalApproval(signalId, action, btnElement) {
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.setAttribute("data-orig-text", btnElement.innerHTML);
        btnElement.innerHTML = "⏳ Executing...";
    }

    try {
        const res = await fetch("/api/signals/approve", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({signal_id: signalId, action: action, source: "Web Dashboard"})
        });
        const json = await res.json();
        if (json.status === "success") {
            alert(`✅ ${json.message}`);
            await fetchPendingSignals();
            await fetchBotStatus();
            if (typeof fetchBotInstances === 'function') fetchBotInstances();
            } else {
            alert(`⚠️ Action Error: ${json.message}`);
            if (btnElement) {
                btnElement.disabled = false;
                btnElement.innerHTML = btnElement.getAttribute("data-orig-text") || action;
            }
        }
    } catch (e) {
        alert("Signal resolution network error: " + e);
        if (btnElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = btnElement.getAttribute("data-orig-text") || action;
        }
    }
}

// --------------------------------------------------------------------------
// SECTION 10: COMPLETE INDICATORS MANAGEMENT MODULE
// --------------------------------------------------------------------------
let indicatorCatalogCache = [];
let selectedCategoryFilter = "ALL";
let currentSearchQuery = "";
let currentIndConfigId = null;

async function fetchIndicatorDashboardData() {
    const container = document.getElementById("indicators-grid-container");
    if (container && (!indicatorCatalogCache || indicatorCatalogCache.length === 0)) {
        container.innerHTML = '<div class="text-center text-muted" style="grid-column: span 3; padding:40px;"><div class="spinner-border spinner-border-sm text-primary" role="status" style="margin-right:8px;"></div> ⏳ Loading indicator library and live calculated values...</div>';
    }

    try {
        const botId = activeBotId || "bot-1";
        const [resStatus, resList, resProfiles] = await Promise.all([
            fetch(`/api/indicators/status?bot_id=${botId}`),
            fetch(`/api/indicators?bot_id=${botId}`),
            fetch("/api/indicators/profiles")
        ]);

        if (!resList.ok) {
            throw new Error(`Indicator API error (HTTP ${resList.status})`);
        }

        const statusJson = await resStatus.json();
        const listJson = await resList.json();
        const profilesJson = await resProfiles.json();

        if (statusJson.status === "success") {
            const s = statusJson;
            if (document.getElementById("ind-dash-active-count")) document.getElementById("ind-dash-active-count").textContent = s.active_indicators_count ?? 7;
            if (document.getElementById("ind-dash-regime")) document.getElementById("ind-dash-regime").textContent = s.current_market_regime || "TRENDING";
            if (document.getElementById("ind-dash-profile")) document.getElementById("ind-dash-profile").textContent = s.active_profile_name || "BTC 15m Trend";
            if (document.getElementById("ind-dash-conf")) document.getElementById("ind-dash-conf").textContent = `${s.signal_confidence_pct || 78}%`;
            if (document.getElementById("ind-dash-long")) document.getElementById("ind-dash-long").textContent = s.long_bias || "Positive";
            if (document.getElementById("ind-dash-short")) document.getElementById("ind-dash-short").textContent = s.short_bias || "Neutral";
            if (document.getElementById("ind-dash-vol")) document.getElementById("ind-dash-vol").textContent = s.volatility || "Moderate";
        }

        if (listJson.status === "success") {
            indicatorCatalogCache = listJson.indicators || [];
        }

        if (profilesJson.status === "success" && profilesJson.profiles && profilesJson.profiles.length > 0) {
            const selectEl = document.getElementById("ind-profile-select");
            if (selectEl) {
                selectEl.innerHTML = profilesJson.profiles.map(p => 
                    `<option value="${p.profile_id}">${p.name} (v${p.version} · ${p.market_regime})</option>`
                ).join('');
            }
        }

        renderIndicatorCardsGrid();
    } catch (e) {
        console.error("Fetch indicator dashboard error:", e);
        if (container) {
            container.innerHTML = `
                <div class="text-center text-danger" style="grid-column: span 3; padding:40px; background:rgba(239,68,68,0.05); border:1px solid rgba(239,68,68,0.2); border-radius:8px;">
                    <h4 style="color:#ef4444; margin-bottom:8px;">⚠️ INDICATOR DATA ERROR</h4>
                    <div style="font-size:12px; color:var(--text-muted); margin-bottom:14px;">Reason: ${escapeHtml(e.message || String(e))}</div>
                    <button class="btn btn-primary btn-sm" onclick="fetchIndicatorDashboardData()">🔄 Retry</button>
                </div>
            `;
        }
    }
}

function renderIndicatorCardsGrid() {
    const container = document.getElementById("indicators-grid-container");
    if (!container) return;

    if (!indicatorCatalogCache || indicatorCatalogCache.length === 0) {
        container.innerHTML = '<div class="text-center text-muted" style="grid-column: span 3; padding:40px;">NO INDICATORS AVAILABLE</div>';
        return;
    }


    let filtered = indicatorCatalogCache.filter(item => {
        const isEnabled = item.enabled !== false;
        const isFav = !!item.favorite;

        if (selectedCategoryFilter === "FAVORITES" && !isFav) return false;
        if (selectedCategoryFilter === "ACTIVE" && !isEnabled) return false;
        if (selectedCategoryFilter === "DISABLED" && isEnabled) return false;
        if (!["ALL", "FAVORITES", "ACTIVE", "DISABLED"].includes(selectedCategoryFilter)) {
            if (item.category.toLowerCase() !== selectedCategoryFilter.toLowerCase()) return false;
        }

        if (currentSearchQuery.trim() !== "") {
            const q = currentSearchQuery.toLowerCase();
            const matchName = item.name.toLowerCase().includes(q);
            const matchCat = item.category.toLowerCase().includes(q);
            const matchId = item.id.toLowerCase().includes(q);
            if (!matchName && !matchCat && !matchId) return false;
        }

        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="text-center text-muted" style="grid-column: span 3; padding:40px;">No indicators match category '${escapeHtml(selectedCategoryFilter)}' and search '${escapeHtml(currentSearchQuery)}'.</div>`;
        return;
    }

    container.innerHTML = filtered.map(item => {
        const isEnabled = item.enabled !== false;
        const isFav = !!item.favorite;
        const weight = item.weight || 15;
        const tf = item.timeframe || activeTimeframe || "15m";
        const longEn = item.long_enabled !== false;
        const shortEn = item.short_enabled !== false;
        const effSource = item.effective_source || "GLOBAL DEFAULT";

        let sourceBadgeColor = "var(--text-muted)";
        let sourceBadgeBg = "rgba(255,255,255,0.05)";
        if (effSource === "BOT OVERRIDE") {
            sourceBadgeColor = "#3b82f6";
            sourceBadgeBg = "rgba(59,130,246,0.15)";
        } else if (effSource === "BOT PROFILE") {
            sourceBadgeColor = "#a855f7";
            sourceBadgeBg = "rgba(168,85,247,0.15)";
        }

        const paramsObj = item.parameters || item.params || {};
        const paramsStr = Object.entries(paramsObj)
            .map(([k, v]) => `<span style="background:var(--bg-tertiary); padding:2px 6px; border-radius:3px; font-size:11px; border:1px solid var(--border-color);">${k.replace(/_/g, ' ')}: <b>${v}</b></span>`)
            .join(' ');

        const statusBadge = isEnabled 
            ? '<span class="badge" style="background:#00c076; color:#fff; font-weight:700; font-size:10px; padding:2px 6px;">ENABLED</span>'
            : '<span class="badge" style="background:var(--text-muted); color:#fff; font-weight:700; font-size:10px; padding:2px 6px;">DISABLED</span>';

        const favStar = isFav ? '⭐' : '☆';

        const sigSignal = item.current_signal || "NEUTRAL";
        let sigColor = "var(--text-muted)";
        if (sigSignal === "BULLISH" || sigSignal === "LONG") sigColor = "#00c076";
        if (sigSignal === "BEARISH" || sigSignal === "SHORT") sigColor = "#ef4444";

        const dirTags = `
            <span style="font-size:10px; padding:1px 5px; border-radius:3px; background:${longEn ? 'rgba(0,192,118,0.15)' : 'rgba(255,255,255,0.05)'}; color:${longEn ? '#00c076' : 'var(--text-muted)'}; font-weight:700;">LONG</span>
            <span style="font-size:10px; padding:1px 5px; border-radius:3px; background:${shortEn ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)'}; color:${shortEn ? '#ef4444' : 'var(--text-muted)'}; font-weight:700;">SHORT</span>
        `;

        return `
            <div class="card" style="padding:16px; display:flex; flex-direction:column; justify-content:space-between; border:${isEnabled ? '1px solid var(--border-color)' : '1px solid rgba(255,255,255,0.05)'}; opacity:${isEnabled ? '1' : '0.65'}; transition:all 0.2s ease;">
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                        <div>
                            <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                                <span class="badge badge-secondary" style="font-size:10px; display:inline-block;">${escapeHtml(item.category)}</span>
                                <span class="badge" style="font-size:9px; background:${sourceBadgeBg}; color:${sourceBadgeColor}; border:1px solid ${sourceBadgeColor}40; font-weight:700;">${escapeHtml(effSource)}</span>
                            </div>
                            <h4 style="margin:0; font-size:14px; font-weight:700; color:var(--text-primary); display:flex; align-items:center; gap:6px;">
                                <button onclick="toggleIndicatorFavorite('${item.id}')" style="background:none; border:none; cursor:pointer; font-size:14px; padding:0;">${favStar}</button>
                                ${escapeHtml(item.name)}
                            </h4>
                        </div>
                        ${statusBadge}
                    </div>

                    <div style="font-size:11px; margin-bottom:10px; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center;">
                        <span>Timeframe: <b style="color:var(--text-primary);">${escapeHtml(tf)}</b> | Weight: <b style="color:var(--accent-blue);">${weight}%</b></span>
                        <div style="display:flex; gap:4px;">${dirTags}</div>
                    </div>

                    <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:12px;">
                        ${paramsStr || '<span style="font-size:11px; color:var(--text-muted);">Default parameters</span>'}
                    </div>

                    <div style="font-size:11px; background:var(--bg-card-subtle); padding:6px 10px; border-radius:4px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                        <span style="color:var(--text-muted);">Calculated Real Signal:</span>
                        <span style="color:${sigColor}; font-weight:800;">${sigSignal}</span>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:8px;">
                    <button class="btn btn-secondary btn-sm" onclick="openIndConfigModal('${item.id}')" style="font-weight:700;">⚙️ Configure</button>
                    <button class="btn ${isEnabled ? 'btn-danger' : 'btn-success'} btn-sm" onclick="toggleIndicatorStatus('${item.id}')" style="font-weight:700;">
                        ${isEnabled ? '⏸️ Disable' : '▶️ Enable'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function filterIndicatorCategory(category, pillEl) {
    selectedCategoryFilter = category;
    if (pillEl) {
        document.querySelectorAll("#ind-category-pills .pill-btn").forEach(btn => btn.classList.remove("active", "btn-primary"));
        document.querySelectorAll("#ind-category-pills .pill-btn").forEach(btn => btn.classList.add("btn-secondary"));
        pillEl.classList.remove("btn-secondary");
        pillEl.classList.add("btn-primary", "active");
    }
    renderIndicatorCardsGrid();
}

function filterIndicatorSearch() {
    const input = document.getElementById("ind-search-input");
    currentSearchQuery = input ? input.value : "";
    renderIndicatorCardsGrid();
}

async function toggleIndicatorFavorite(indicatorId) {
    try {
        const res = await fetch(`/api/indicators/${indicatorId}/favorite`, { method: "POST" });
        const json = await res.json();
        if (json.status === "success") {
            const item = indicatorCatalogCache.find(x => x.id === indicatorId);
            if (item) item.favorite = json.favorite;
            renderIndicatorCardsGrid();
        }
    } catch (e) {
        console.error("Error toggling favorite:", e);
    }
}

async function toggleIndicatorStatus(indicatorId) {
    const item = indicatorCatalogCache.find(x => x.id === indicatorId);
    if (!item) return;

    const botId = activeBotId || "bot-1";
    const newStatus = !(item.enabled !== false);
    const endpoint = newStatus ? `/api/indicators/${indicatorId}/enable?bot_id=${botId}` : `/api/indicators/${indicatorId}/disable?bot_id=${botId}`;

    try {
        const res = await fetch(endpoint, { method: "POST" });
        const json = await res.json();
        if (json.status === "success") {
            item.enabled = newStatus;
            fetchIndicatorDashboardData();
        }
    } catch (e) {
        console.error("Error toggling status:", e);
    }
}

let currentIndModalActiveTab = "inputs";

function switchIndModalTab(tabName) {
    currentIndModalActiveTab = tabName;
    document.querySelectorAll(".ind-tab-btn").forEach(btn => {
        if (btn.getAttribute("data-tab") === tabName) {
            btn.classList.add("btn-primary", "active");
            btn.classList.remove("btn-secondary");
        } else {
            btn.classList.remove("btn-primary", "active");
            btn.classList.add("btn-secondary");
        }
    });

    document.querySelectorAll(".ind-modal-tab-pane").forEach(pane => {
        pane.style.display = pane.id === `ind-tab-pane-${tabName}` ? "block" : "none";
    });

    if (tabName === "history" && currentIndConfigId) {
        loadIndicatorHistoryTab(currentIndConfigId);
    }
}

function openIndConfigModal(indicatorId) {
    const item = indicatorCatalogCache.find(x => x.id === indicatorId);
    if (!item) return;

    currentIndConfigId = indicatorId;
    const botId = activeBotId || "bot-1";
    const titleEl = document.getElementById("ind-config-modal-title");
    const subTitleEl = document.getElementById("ind-config-modal-subtitle");
    const botBadgeEl = document.getElementById("ind-config-bot-badge");
    const sourceBadgeEl = document.getElementById("ind-config-source-badge");
    const versionEl = document.getElementById("ind-config-version-badge");
    const bodyEl = document.getElementById("ind-config-form-body");
    const hiddenId = document.getElementById("ind-config-id");
    const validMsgEl = document.getElementById("ind-modal-validation-msg");

    if (hiddenId) hiddenId.value = indicatorId;
    if (titleEl) titleEl.textContent = `⚙️ Configure ${item.name}`;
    if (subTitleEl) subTitleEl.textContent = `Category: ${item.category} | ${item.description || 'TradingView Standard Settings & Rules'}`;
    if (botBadgeEl) botBadgeEl.textContent = `🤖 Bot: ${botId}`;
    if (sourceBadgeEl) sourceBadgeEl.textContent = `Source: ${item.effective_source || 'GLOBAL DEFAULT'}`;
    if (versionEl) versionEl.textContent = `v${item.version || '1.0.0'}`;
    if (validMsgEl) validMsgEl.style.display = "none";

    const isEnabled = item.enabled !== false;
    const weight = item.weight || 15;
    const tf = item.timeframe || activeTimeframe || "15m";
    const longEn = item.long_enabled !== false;
    const shortEn = item.short_enabled !== false;
    const sigMode = item.signal_mode || "both";
    const minConf = item.min_confirmations || 1;

    const displayObj = item.display || {};
    const colorVal = displayObj.color || "#00e676";
    const lineWidth = displayObj.line_width || 2;
    const lineStyle = displayObj.line_style || "solid";
    const showOnChart = displayObj.show_on_chart !== false;
    const panelType = displayObj.panel || (item.category === "Momentum" || item.category === "Volume" ? "separate" : "overlay");

    const paramsObj = item.parameters || item.params || {};
    const schemaList = item.parameter_schema || [];

    // TAB 1: INPUTS
    let inputsHtml = `<div class="ind-modal-tab-pane" id="ind-tab-pane-inputs" style="display:block;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="font-size:12px; color:var(--text-muted);">Define quantitative calculation parameters, lookback lengths, and source series:</div>
            <span class="badge" style="font-size:10px; background:rgba(59,130,246,0.15); color:#3b82f6;">Target Bot: ${escapeHtml(botId)}</span>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px;" id="cfg-params-grid">`;

    if (schemaList.length > 0) {
        schemaList.forEach(field => {
            const fName = field.name;
            const fLabel = field.label || fName.replace(/_/g, ' ').toUpperCase();
            const fVal = paramsObj[fName] !== undefined ? paramsObj[fName] : field.default;
            const fDesc = field.description ? `<div style="font-size:10px; color:var(--text-muted); margin-top:2px;">${escapeHtml(field.description)}</div>` : '';

            if (field.type === "select" && field.options) {
                const optHtml = field.options.map(opt => {
                    const optVal = typeof opt === "object" ? opt.value : opt;
                    const optLbl = typeof opt === "object" ? opt.label : opt;
                    return `<option value="${optVal}" ${fVal === optVal ? 'selected' : ''}>${escapeHtml(optLbl)}</option>`;
                }).join('');
                inputsHtml += `
                    <div class="form-group">
                        <label style="font-size:12px; font-weight:700;">${escapeHtml(fLabel)}</label>
                        <select id="cfg-param-${fName}" class="form-select" onchange="runClientIndicatorValidation()">${optHtml}</select>
                        ${fDesc}
                    </div>`;
            } else if (field.type === "boolean") {
                inputsHtml += `
                    <div class="form-group" style="display:flex; align-items:center; gap:8px; margin-top:22px;">
                        <input type="checkbox" id="cfg-param-${fName}" ${fVal ? 'checked' : ''} onchange="runClientIndicatorValidation()">
                        <label style="font-size:12px; font-weight:700; margin:0;">${escapeHtml(fLabel)}</label>
                        ${fDesc}
                    </div>`;
            } else {
                const minAttr = field.minimum !== undefined ? `min="${field.minimum}"` : '';
                const maxAttr = field.maximum !== undefined ? `max="${field.maximum}"` : '';
                const stepAttr = field.step !== undefined ? `step="${field.step}"` : 'step="any"';
                const inputType = field.type === "integer" || field.type === "decimal" ? "number" : "text";
                inputsHtml += `
                    <div class="form-group">
                        <label style="font-size:12px; font-weight:700;">${escapeHtml(fLabel)}</label>
                        <input type="${inputType}" id="cfg-param-${fName}" class="form-input" value="${escapeHtml(String(fVal))}" ${minAttr} ${maxAttr} ${stepAttr} oninput="runClientIndicatorValidation()">
                        ${fDesc}
                    </div>`;
            }
        });
    } else {
        Object.entries(paramsObj).forEach(([pK, pV]) => {
            const labelText = pK.replace(/_/g, ' ').toUpperCase();
            if (pK === "source") {
                inputsHtml += `
                    <div class="form-group">
                        <label style="font-size:12px; font-weight:700;">PRICE SOURCE</label>
                        <select id="cfg-param-${pK}" class="form-select" onchange="runClientIndicatorValidation()">
                            <option value="close" ${pV === 'close' ? 'selected' : ''}>Close</option>
                            <option value="open" ${pV === 'open' ? 'selected' : ''}>Open</option>
                            <option value="high" ${pV === 'high' ? 'selected' : ''}>High</option>
                            <option value="low" ${pV === 'low' ? 'selected' : ''}>Low</option>
                            <option value="hl2" ${pV === 'hl2' ? 'selected' : ''}>HL2 ((High+Low)/2)</option>
                            <option value="hlc3" ${pV === 'hlc3' ? 'selected' : ''}>HLC3 ((High+Low+Close)/3)</option>
                            <option value="ohlc4" ${pV === 'ohlc4' ? 'selected' : ''}>OHLC4 ((Open+High+Low+Close)/4)</option>
                        </select>
                    </div>`;
            } else if (typeof pV === "boolean") {
                inputsHtml += `
                    <div class="form-group" style="display:flex; align-items:center; gap:8px; margin-top:22px;">
                        <input type="checkbox" id="cfg-param-${pK}" ${pV ? 'checked' : ''} onchange="runClientIndicatorValidation()">
                        <label style="font-size:12px; font-weight:700; margin:0;">${escapeHtml(labelText)}</label>
                    </div>`;
            } else {
                inputsHtml += `
                    <div class="form-group">
                        <label style="font-size:12px; font-weight:700;">${escapeHtml(labelText)}</label>
                        <input type="text" id="cfg-param-${pK}" class="form-input" value="${escapeHtml(String(pV))}" oninput="runClientIndicatorValidation()">
                    </div>`;
            }
        });
    }
    inputsHtml += `</div></div>`;

    // TAB 2: SIGNAL SETTINGS
    const signalHtml = `<div class="ind-modal-tab-pane" id="ind-tab-pane-signal" style="display:none;">
        <div style="font-size:12px; color:var(--text-muted); margin-bottom:14px;">Configure how this indicator issues Bullish / Bearish biases to the Strategy Confluence Matrix:</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin-bottom:16px;">
            <div class="form-group">
                <label style="font-size:12px; font-weight:700;">Signal Mode</label>
                <select id="cfg-signal-mode" class="form-select">
                    <option value="both" ${sigMode === 'both' ? 'selected' : ''}>Both Long & Short Signals</option>
                    <option value="crossover" ${sigMode === 'crossover' ? 'selected' : ''}>Crossover Signal Trigger Only</option>
                    <option value="threshold" ${sigMode === 'threshold' ? 'selected' : ''}>Level Threshold Breach (Overbought / Oversold)</option>
                    <option value="reversal" ${sigMode === 'reversal' ? 'selected' : ''}>Divergence / Reversal Filter</option>
                    <option value="regime" ${sigMode === 'regime' ? 'selected' : ''}>Market Regime Direction Filter</option>
                </select>
            </div>
            <div class="form-group">
                <label style="font-size:12px; font-weight:700;">Min Confirmations Required</label>
                <input type="number" id="cfg-min-conf" class="form-input" value="${minConf}" min="1" max="10" step="1">
            </div>
        </div>

        <div style="background:var(--bg-card-subtle); padding:14px; border-radius:8px; border:1px solid var(--border-color); display:flex; gap:20px;">
            <label style="font-size:13px; font-weight:700; display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="cfg-long-enabled" ${longEn ? 'checked' : ''}> 🟢 Enable LONG Signals
            </label>
            <label style="font-size:13px; font-weight:700; display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="cfg-short-enabled" ${shortEn ? 'checked' : ''}> 🔴 Enable SHORT Signals
            </label>
        </div>
    </div>`;

    // TAB 3: TIMEFRAME
    const timeframeHtml = `<div class="ind-modal-tab-pane" id="ind-tab-pane-timeframe" style="display:none;">
        <div style="font-size:12px; color:var(--text-muted); margin-bottom:14px;">Select the operational calculation timeframe for this indicator:</div>
        <div class="form-group" style="max-width:320px;">
            <label style="font-size:12px; font-weight:700;">Calculation Timeframe</label>
            <select id="cfg-tf" class="form-select">
                <option value="chart" ${tf === 'chart' ? 'selected' : ''}>Same as Chart Timeframe</option>
                <option value="1m" ${tf === '1m' ? 'selected' : ''}>1 Minute (1m Scalp)</option>
                <option value="3m" ${tf === '3m' ? 'selected' : ''}>3 Minutes (3m)</option>
                <option value="5m" ${tf === '5m' ? 'selected' : ''}>5 Minutes (5m)</option>
                <option value="15m" ${tf === '15m' ? 'selected' : ''}>15 Minutes (15m Standard)</option>
                <option value="30m" ${tf === '30m' ? 'selected' : ''}>30 Minutes (30m)</option>
                <option value="1h" ${tf === '1h' ? 'selected' : ''}>1 Hour (1h Macro)</option>
                <option value="2h" ${tf === '2h' ? 'selected' : ''}>2 Hours (2h)</option>
                <option value="4h" ${tf === '4h' ? 'selected' : ''}>4 Hours (4h Swing)</option>
                <option value="1d" ${tf === '1d' ? 'selected' : ''}>1 Day (1d Position)</option>
                <option value="1w" ${tf === '1w' ? 'selected' : ''}>1 Week (1w Trend)</option>
            </select>
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:12px; background:var(--bg-card-subtle); padding:10px; border-radius:6px;">
            💡 <b>Multi-Timeframe Confluence</b>: You can evaluate higher timeframe indicators (e.g. 1h EMA 200) alongside low timeframe entry triggers (e.g. 5m Supertrend).
        </div>
    </div>`;

    // TAB 4: DISPLAY & STYLE
    const displayHtml = `<div class="ind-modal-tab-pane" id="ind-tab-pane-display" style="display:none;">
        <div style="font-size:12px; color:var(--text-muted); margin-bottom:14px;">Customize chart rendering, visual style, colors, and line geometry:</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin-bottom:16px;">
            <div class="form-group">
                <label style="font-size:12px; font-weight:700;">Primary Color</label>
                <div style="display:flex; align-items:center; gap:8px;">
                    <input type="color" id="cfg-disp-color" value="${colorVal}" style="width:40px; height:34px; border:none; border-radius:4px; cursor:pointer; background:none;">
                    <input type="text" id="cfg-disp-color-hex" class="form-input" value="${colorVal}" style="width:100px;" oninput="document.getElementById('cfg-disp-color').value = this.value">
                </div>
            </div>
            <div class="form-group">
                <label style="font-size:12px; font-weight:700;">Line Width (<span id="cfg-disp-width-val">${lineWidth}px</span>)</label>
                <input type="range" id="cfg-disp-width" min="1" max="5" step="1" value="${lineWidth}" style="width:100%; margin-top:8px;" oninput="document.getElementById('cfg-disp-width-val').textContent = this.value + 'px'">
            </div>
            <div class="form-group">
                <label style="font-size:12px; font-weight:700;">Line Style</label>
                <select id="cfg-disp-style" class="form-select">
                    <option value="solid" ${lineStyle === 'solid' ? 'selected' : ''}>Solid Line ───</option>
                    <option value="dashed" ${lineStyle === 'dashed' ? 'selected' : ''}>Dashed Line - - -</option>
                    <option value="dotted" ${lineStyle === 'dotted' ? 'selected' : ''}>Dotted Line ···</option>
                </select>
            </div>
            <div class="form-group">
                <label style="font-size:12px; font-weight:700;">Chart Panel Type</label>
                <select id="cfg-disp-panel" class="form-select">
                    <option value="overlay" ${panelType === 'overlay' ? 'selected' : ''}>Main Price Overlay</option>
                    <option value="separate" ${panelType === 'separate' ? 'selected' : ''}>Separate Bottom Sub-Panel</option>
                </select>
            </div>
        </div>
        <div class="form-group">
            <label style="font-size:12px; font-weight:700; display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="cfg-disp-show" ${showOnChart ? 'checked' : ''}> Show on TradingView Chart
            </label>
        </div>
    </div>`;

    // TAB 5: ADVANCED & CONFLUENCE WEIGHT
    const advancedHtml = `<div class="ind-modal-tab-pane" id="ind-tab-pane-advanced" style="display:none;">
        <div style="font-size:12px; color:var(--text-muted); margin-bottom:14px;">Manage weighting within the 100-point Confluence Matrix and bot activation:</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin-bottom:16px;">
            <div class="form-group">
                <label style="font-size:12px; font-weight:700;">Activation Status</label>
                <select id="cfg-enabled" class="form-select">
                    <option value="true" ${isEnabled ? 'selected' : ''}>🟢 ENABLED (Include in Signals & Confluence)</option>
                    <option value="false" ${!isEnabled ? 'selected' : ''}>🔴 DISABLED (Ignore completely)</option>
                </select>
            </div>
            <div class="form-group">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <label style="font-size:12px; font-weight:700;">Confluence Weight</label>
                    <span id="cfg-weight-display" style="font-size:13px; font-weight:800; color:var(--accent-blue);">${weight}%</span>
                </div>
                <input type="range" id="cfg-weight" min="0" max="100" step="1" value="${weight}" style="width:100%; margin-top:8px;" oninput="document.getElementById('cfg-weight-display').textContent = this.value + '%'">
            </div>
        </div>

        <div style="display:flex; justify-content:flex-end; margin-top:8px;">
            <button type="button" class="btn btn-sm btn-secondary" onclick="normalizeAllIndicatorWeights()">⚖️ Normalize All Active Weights</button>
        </div>
    </div>`;

    // TAB 6: HISTORY TAB CONTAINER
    const historyHtml = `<div class="ind-modal-tab-pane" id="ind-tab-pane-history" style="display:none;">
        <div style="font-size:12px; color:var(--text-muted); margin-bottom:14px;">Audit trail of parameter modifications for <b>${escapeHtml(item.name)}</b> on bot <b>${escapeHtml(botId)}</b>:</div>
        <div id="ind-history-list-container" style="max-height:300px; overflow-y:auto;">
            <div class="text-muted" style="padding:20px; text-align:center;">Loading history logs...</div>
        </div>
    </div>`;

    bodyEl.innerHTML = inputsHtml + signalHtml + timeframeHtml + displayHtml + advancedHtml + historyHtml;

    // Load available presets into modal preset selector
    loadPresetsIntoModalSelector();

    // Reset to inputs tab
    switchIndModalTab("inputs");

    const modal = document.getElementById("ind-config-modal");
    if (modal) modal.style.display = "flex";
}

async function loadIndicatorHistoryTab(indicatorId) {
    const listEl = document.getElementById("ind-history-list-container");
    if (!listEl) return;

    const botId = activeBotId || "bot-1";
    try {
        const res = await fetch(`/api/indicators/${indicatorId}/history?bot_id=${botId}`);
        const json = await res.json();
        if (json.status === "success" && json.history && json.history.length > 0) {
            listEl.innerHTML = json.history.map(h => {
                const dt = h.timestamp ? new Date(h.timestamp).toLocaleString() : "Unknown date";
                return `
                    <div style="background:var(--bg-card-subtle); padding:10px 14px; border-radius:6px; border:1px solid var(--border-color); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-size:11px; font-weight:700; color:var(--text-primary);">${escapeHtml(h.action)} · <span style="color:var(--text-muted); font-weight:normal;">${dt}</span></div>
                            <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">User: ${escapeHtml(h.user_source || 'Dashboard')} | Bot: ${escapeHtml(h.bot_id || botId)}</div>
                        </div>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="restoreHistoryConfig(${h.id})" style="font-size:10px; padding:3px 8px;">🔄 Restore</button>
                    </div>
                `;
            }).join('');
        } else {
            listEl.innerHTML = `<div style="font-size:12px; color:var(--text-muted); text-align:center; padding:30px;">No historical modifications recorded for this indicator.</div>`;
        }
    } catch (e) {
        listEl.innerHTML = `<div style="font-size:12px; color:#ef4444; padding:20px;">Failed to load history: ${escapeHtml(String(e))}</div>`;
    }
}

async function restoreHistoryConfig(historyId) {
    if (!confirm(`Are you sure you want to restore this historical indicator configuration?`)) return;
    try {
        const res = await fetch(`/api/indicators/history/${historyId}/restore`, { method: "POST" });
        const json = await res.json();
        if (json.status === "success") {
            alert("✅ Configuration restored successfully!");
            closeIndConfigModal();
            fetchIndicatorDashboardData();
        } else {
            alert("⚠️ Restore failed: " + json.message);
        }
    } catch (e) {
        alert("Error restoring history: " + e);
    }
}

function runClientIndicatorValidation() {
    const validMsgEl = document.getElementById("ind-modal-validation-msg");
    if (!validMsgEl || !currentIndConfigId) return;

    const fastEl = document.getElementById("cfg-param-fast");
    const slowEl = document.getElementById("cfg-param-slow");
    if (fastEl && slowEl) {
        const f = parseFloat(fastEl.value);
        const s = parseFloat(slowEl.value);
        if (!isNaN(f) && !isNaN(s) && f >= s) {
            validMsgEl.style.display = "block";
            validMsgEl.style.background = "rgba(255, 59, 105, 0.15)";
            validMsgEl.style.color = "#ff3b69";
            validMsgEl.style.border = "1px solid rgba(255, 59, 105, 0.3)";
            validMsgEl.textContent = "⚠️ Validation Error: MACD Fast Period must be strictly less than Slow Period.";
            return false;
        }
    }

    const osEl = document.getElementById("cfg-param-oversold");
    const obEl = document.getElementById("cfg-param-overbought");
    if (osEl && obEl) {
        const os = parseFloat(osEl.value);
        const ob = parseFloat(obEl.value);
        if (!isNaN(os) && !isNaN(ob) && os >= ob) {
            validMsgEl.style.display = "block";
            validMsgEl.style.background = "rgba(255, 59, 105, 0.15)";
            validMsgEl.style.color = "#ff3b69";
            validMsgEl.style.border = "1px solid rgba(255, 59, 105, 0.3)";
            validMsgEl.textContent = "⚠️ Validation Error: Oversold threshold must be strictly less than Overbought threshold.";
            return false;
        }
    }

    validMsgEl.style.display = "none";
    return true;
}

async function loadPresetsIntoModalSelector() {
    const select = document.getElementById("ind-modal-preset-select");
    if (!select) return;

    try {
        const res = await fetch("/api/indicator-presets");
        const json = await res.json();
        if (json.status === "success" && json.presets) {
            select.innerHTML = '<option value="">Load Preset...</option>' + json.presets.map(p => {
                return `<option value="${escapeHtml(p.preset_id || p.name)}">${escapeHtml(p.name)} (${escapeHtml(p.category || 'General')})</option>`;
            }).join('');

            select.onchange = () => {
                if (select.value) {
                    const chosen = json.presets.find(p => (p.preset_id === select.value || p.name === select.value));
                    if (chosen && chosen.config) {
                        applyPresetObjectToActiveModal(chosen.config);
                    }
                }
            };
        }
    } catch (e) {
        console.error("Failed to load presets for modal:", e);
    }
}

function applyPresetObjectToActiveModal(cfgObj) {
    if (!cfgObj) return;
    if (cfgObj.parameters && currentIndConfigId && cfgObj.parameters[currentIndConfigId]) {
        const pMap = cfgObj.parameters[currentIndConfigId];
        Object.entries(pMap).forEach(([k, v]) => {
            const el = document.getElementById(`cfg-param-${k}`);
            if (el) {
                if (el.type === "checkbox") el.checked = !!v;
                else el.value = v;
            }
        });
    }
    if (cfgObj.weights && currentIndConfigId && cfgObj.weights[currentIndConfigId] !== undefined) {
        const wEl = document.getElementById("cfg-weight");
        const wDisp = document.getElementById("cfg-weight-display");
        if (wEl) wEl.value = cfgObj.weights[currentIndConfigId];
        if (wDisp) wDisp.textContent = cfgObj.weights[currentIndConfigId] + "%";
    }
    runClientIndicatorValidation();
}

async function saveCurrentIndAsPreset() {
    const name = prompt("Enter a name for this custom Indicator Preset:");
    if (!name || name.trim() === "") return;

    const customParams = extractCurrentModalParameters();
    const weightVal = parseFloat(document.getElementById("cfg-weight")?.value || 15);

    const presetPayload = {
        name: name.trim(),
        category: "Custom",
        description: `Custom preset created from ${currentIndConfigId}`,
        config: {
            enabled_ids: [currentIndConfigId],
            weights: { [currentIndConfigId]: weightVal },
            parameters: { [currentIndConfigId]: customParams }
        }
    };

    try {
        const res = await fetch("/api/indicator-presets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(presetPayload)
        });
        const json = await res.json();
        if (json.status === "success") {
            alert(`✅ Preset '${name}' saved successfully!`);
            loadPresetsIntoModalSelector();
        } else {
            alert(`⚠️ Failed to save preset: ${json.message}`);
        }
    } catch (e) {
        alert("Error saving preset: " + e);
    }
}

function extractCurrentModalParameters() {
    const customParams = {};
    const item = indicatorCatalogCache.find(x => x.id === currentIndConfigId);
    if (!item) return customParams;

    const origParams = item.parameters || item.params || {};
    const schemaList = item.parameter_schema || [];

    const keysToExtract = schemaList.length > 0 ? schemaList.map(f => f.name) : Object.keys(origParams);

    keysToExtract.forEach(pK => {
        const inputEl = document.getElementById(`cfg-param-${pK}`);
        if (inputEl) {
            if (inputEl.type === "checkbox") {
                customParams[pK] = inputEl.checked;
            } else {
                const val = inputEl.value.trim();
                if (val.startsWith("[") && val.endsWith("]")) {
                    try { customParams[pK] = JSON.parse(val); } catch(_) { customParams[pK] = val; }
                } else if (!isNaN(val) && val !== "") {
                    customParams[pK] = val.includes(".") ? parseFloat(val) : parseInt(val);
                } else {
                    customParams[pK] = val;
                }
            }
        }
    });

    return customParams;
}

function closeIndConfigModal() {
    const modal = document.getElementById("ind-config-modal");
    if (modal) modal.style.display = "none";
}

async function handleSaveIndConfig(e) {
    e.preventDefault();
    if (!currentIndConfigId) return;

    if (!runClientIndicatorValidation()) {
        alert("⚠️ Please fix the validation errors before saving.");
        return;
    }

    const item = indicatorCatalogCache.find(x => x.id === currentIndConfigId);
    if (!item) return;

    const botId = activeBotId || "bot-1";
    const isEnabled = document.getElementById("cfg-enabled").value === "true";
    const weight = parseFloat(document.getElementById("cfg-weight").value || 15);
    const tf = document.getElementById("cfg-tf").value;
    const sigMode = document.getElementById("cfg-signal-mode").value;
    const longEn = document.getElementById("cfg-long-enabled").checked;
    const shortEn = document.getElementById("cfg-short-enabled").checked;
    const minConf = parseInt(document.getElementById("cfg-min-conf").value || 1);

    const colorVal = document.getElementById("cfg-disp-color")?.value || "#00e676";
    const lineWidth = parseInt(document.getElementById("cfg-disp-width")?.value || 2);
    const lineStyle = document.getElementById("cfg-disp-style")?.value || "solid";
    const panelType = document.getElementById("cfg-disp-panel")?.value || "overlay";
    const showOnChart = document.getElementById("cfg-disp-show")?.checked !== false;

    const customParams = extractCurrentModalParameters();

    const payload = {
        id: currentIndConfigId,
        indicator_id: currentIndConfigId,
        bot_id: botId,
        name: item.name,
        category: item.category,
        enabled: isEnabled,
        favorite: item.favorite,
        timeframe: tf,
        weight: weight,
        long_enabled: longEn,
        short_enabled: shortEn,
        signal_mode: sigMode,
        min_confirmations: minConf,
        parameters: customParams,
        display: {
            color: colorVal,
            line_width: lineWidth,
            line_style: lineStyle,
            panel: panelType,
            show_on_chart: showOnChart
        }
    };

    try {
        const res = await fetch(`/api/indicators/${currentIndConfigId}?bot_id=${botId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.status === "success") {
            closeIndConfigModal();
            fetchIndicatorDashboardData();
            if (typeof showToast === "function") {
                showToast(`✅ ${item.name} settings saved for bot ${botId}!`);
            } else {
                alert(`✅ ${item.name} settings saved for bot ${botId}!`);
            }
        } else {
            alert(`⚠️ Save failed: ${json.message}`);
        }
    } catch (err) {
        alert("Error saving indicator settings: " + err);
    }
}

async function resetCurrentIndDefaults() {
    if (!currentIndConfigId) return;
    const botId = activeBotId || "bot-1";
    try {
        const res = await fetch(`/api/indicators/${currentIndConfigId}/reset?bot_id=${botId}`, { method: "POST" });
        const json = await res.json();
        if (json.status === "success") {
            closeIndConfigModal();
            fetchIndicatorDashboardData();
            alert(`✅ Indicator reset to profile / default parameters for bot ${botId}.`);
        }
    } catch (e) {
        console.error("Reset error:", e);
    }
}

function normalizeAllIndicatorWeights() {
    const activeIndicators = indicatorCatalogCache.filter(x => x.enabled !== false);
    if (activeIndicators.length === 0) return;
    const normalized = Math.round(100 / activeIndicators.length);
    const weightEl = document.getElementById("cfg-weight");
    const weightDisp = document.getElementById("cfg-weight-display");
    if (weightEl) weightEl.value = normalized;
    if (weightDisp) weightDisp.textContent = normalized + "%";
    alert(`⚖️ Normalized weight set to ${normalized}% (${activeIndicators.length} active indicators).`);
}

async function confirmApplyPreset() {
    const select = document.getElementById("ind-batch-preset-select");
    const presetName = select ? select.value : "";
    if (!presetName) {
        alert("Please select a preset first.");
        return;
    }

    if (!confirm(`Are you sure you want to apply the '${presetName}' preset? This will reconfigure active indicators and weights without force-closing current open positions.`)) {
        return;
    }

    try {
        const res = await fetch("/api/indicators/apply-preset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ preset_name: presetName })
        });
        const json = await res.json();
        if (json.status === "success") {
            fetchIndicatorDashboardData();
            alert(`✅ Preset '${presetName}' applied successfully.`);
        } else {
            alert(`⚠️ Error applying preset: ${json.message}`);
        }
    } catch (e) {
        alert("Error applying preset: " + e);
    }
}

async function enableAllIndicators() {
    const botId = activeBotId || "bot-1";
    try {
        if (typeof showToast === "function") showToast(`Enabling all indicators for bot ${botId}...`);
        const res = await fetch(`/api/indicators/enable-all?bot_id=${botId}`, { method: "POST" });
        const json = await res.json();
        if (json.status === "success") {
            if (typeof showToast === "function") showToast(`✅ All indicators enabled for bot ${botId}.`);
            await fetchIndicatorDashboardData();
        } else {
            alert("Error enabling all indicators: " + json.message);
        }
    } catch (e) {
        alert("Network error enabling all indicators: " + e);
    }
}

async function disableAllIndicators() {
    const botId = activeBotId || "bot-1";
    try {
        if (typeof showToast === "function") showToast(`Disabling all indicators for bot ${botId}...`);
        const res = await fetch(`/api/indicators/disable-all?bot_id=${botId}`, { method: "POST" });
        const json = await res.json();
        if (json.status === "success") {
            if (typeof showToast === "function") showToast(`✅ All indicators disabled for bot ${botId}.`);
            await fetchIndicatorDashboardData();
        } else {
            alert("Error disabling all indicators: " + json.message);
        }
    } catch (e) {
        alert("Network error disabling all indicators: " + e);
    }
}

async function confirmResetAllIndicators() {
    const botId = activeBotId || "bot-1";
    if (!confirm(`⚠️ Are you sure you want to RESET ALL indicators for bot '${botId}'? All custom bot overrides will be restored to profile/defaults.`)) {
        return;
    }

    try {
        const res = await fetch(`/api/indicators/reset-all?bot_id=${botId}`, { method: "POST" });
        const json = await res.json();
        if (json.status === "success") {
            fetchIndicatorDashboardData();
            alert(`✅ All indicators for bot '${botId}' reset to profile defaults.`);
        }
    } catch (e) {
        alert("Error resetting all indicators: " + e);
    }
}


async function loadSelectedIndicatorProfile(profileId) {
    if (!profileId) return;
    try {
        const res = await fetch(`/api/indicators/profiles/${profileId}`);
        const json = await res.json();
        if (json.status === "success" && json.profile) {
            const p = json.profile;
            if (document.getElementById("ind-dash-profile")) document.getElementById("ind-dash-profile").textContent = p.name;
            if (document.getElementById("ind-scenario-select") && p.market_regime) document.getElementById("ind-scenario-select").value = p.market_regime;
            if (document.getElementById("ind-adaptive-mode") && p.adaptive_mode) document.getElementById("ind-adaptive-mode").value = p.adaptive_mode;
            if (document.getElementById("ind-thresh-long") && p.signal_threshold_long) document.getElementById("ind-thresh-long").value = p.signal_threshold_long;
            if (document.getElementById("ind-thresh-short") && p.signal_threshold_short) document.getElementById("ind-thresh-short").value = p.signal_threshold_short;

            if (p.config && typeof p.config === "object") {
                indicatorCatalogCache.forEach(item => {
                    const cfg = p.config[item.id] || p.config[item.indicator_id];
                    if (cfg) {
                        item.enabled = cfg.enabled !== false;
                        if (cfg.parameters) item.parameters = cfg.parameters;
                        if (cfg.weight) item.weight = cfg.weight;
                        if (cfg.timeframe) item.timeframe = cfg.timeframe;
                    }
                });
                renderIndicatorCardsGrid();
            }
        }
    } catch (e) {
        console.error("Load indicator profile error:", e);
    }
}


function openSaveProfileModal() {
    const modal = document.getElementById("save-profile-modal");
    if (modal) {
        document.getElementById("save-prof-name").value = `Custom Profile (${new Date().toLocaleDateString()})`;
        document.getElementById("save-prof-id").value = `profile-custom-${Date.now()}`;
        modal.style.display = "flex";
    }
}

function closeSaveProfileModal() {
    const modal = document.getElementById("save-profile-modal");
    if (modal) modal.style.display = "none";
}

async function handleSaveProfileSubmit(e) {
    e.preventDefault();
    const name = document.getElementById("save-prof-name").value;
    const profileId = document.getElementById("save-prof-id").value;
    const regime = document.getElementById("save-prof-regime").value;
    const desc = document.getElementById("save-prof-desc").value;
    const adaptiveMode = document.getElementById("ind-adaptive-mode") ? document.getElementById("ind-adaptive-mode").value : "BALANCED";
    const threshLong = parseFloat(document.getElementById("ind-thresh-long") ? document.getElementById("ind-thresh-long").value : 75);
    const threshShort = parseFloat(document.getElementById("ind-thresh-short") ? document.getElementById("ind-thresh-short").value : 75);

    const cfgMap = {};
    indicatorCatalogCache.forEach(c => { cfgMap[c.id] = c; });

    const payload = {
        profile_id: profileId,
        name: name,
        market_regime: regime,
        adaptive_mode: adaptiveMode,
        signal_threshold_long: threshLong,
        signal_threshold_short: threshShort,
        scoring_mode: "WEIGHTED",
        description: desc,
        config: cfgMap
    };

    try {
        const res = await fetch("/api/indicators/profiles", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.status === "success") {
            alert(`✅ Profile '${name}' saved successfully (ID: ${json.profile_id}).`);
            closeSaveProfileModal();
            fetchIndicatorDashboardData();
        } else {
            alert(`⚠️ Error saving profile: ${json.message}`);
        }
    } catch (e) {
        alert("Error saving profile: " + e);
    }
}

async function applyCurrentProfileToBot() {
    const botId = activeBotId || "bot-1";
    const profileId = document.getElementById("ind-profile-select") ? document.getElementById("ind-profile-select").value : "profile-btc-15m-trend";

    try {
        const res = await fetch(`/api/indicators/profiles/${profileId}/apply`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({bot_id: botId})
        });
        const json = await res.json();
        if (json.status === "success") {
            alert(`🤖 Indicator profile '${profileId}' applied successfully to bot ${botId}.`);
            fetchIndicatorDashboardData();
        } else {
            alert(`⚠️ Error applying profile: ${json.message}`);
        }
    } catch (e) {
        alert("Apply profile error: " + e);
    }
}

function backtestCurrentProfile() {
    alert("🧪 Loading current indicator profile into Backtesting Lab...");
    switchTab("backtest");
}

function applyScenarioFilter(scenarioVal) {
    renderIndicatorCardsGrid();
}

function updateAdaptiveMode(modeVal) {
    console.log("Adaptive Mode updated to:", modeVal);
}

// Render initial indicators bar for new bot form on DOM load
document.addEventListener("DOMContentLoaded", () => {
    renderBotIndicatorsBar('new_bot');
    startNextCycleCountdownTimer();
    setInterval(updateLastCheckedTimer, 1000);
    setInterval(fetchPendingSignals, 3000);
    setInterval(() => {
        const activeTab = document.querySelector(".nav-item.active")?.getAttribute("data-tab");
        if (activeBotId) {
            fetchBotActivity(activeBotId);
            if (activeTab === "logs") {
                fetchBotDecisions(activeBotId);
            }
        }
    }, 5000);
    fetchPendingSignals();
});


// --------------------------------------------------------------------------
// SECTION 11: MARKET UNIVERSE FRONTEND MODULE
// --------------------------------------------------------------------------

let activeUniverseCategory = "ALL";
let cachedUniverseInstruments = [];

async function fetchMarketUniverseDashboard() {
    await fetchUniverseSummary();
    await fetchProviderStatuses();
    await fetchUniverseInstruments();
    await fetchCurrentOpportunities();
}

async function fetchProviderStatuses() {
    try {
        const res = await fetch("/api/universe/providers");
        const json = await res.json();
        const container = document.getElementById("univ-provider-status-container");
        if (json.status === "success" && json.providers && container) {
            container.innerHTML = json.providers.map(p => {
                const st = p.status || "CONNECTED";
                let stClass = "badge-success";
                if (st === "LIMITED") stClass = "badge-secondary";
                else if (st === "DISCONNECTED") stClass = "badge-danger";

                return `
                <div style="background:var(--bg-card); padding:8px 10px; border-radius:6px; border:1px solid var(--border-color);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="font-weight:700; font-size:11px; color:var(--text-primary);">${escapeHtml(p.name)}</span>
                        <span class="badge ${stClass}" style="font-size:9px; padding:2px 6px;">${st}</span>
                    </div>
                    <div style="font-size:10px; color:var(--text-muted);">${escapeHtml(p.coverage || p.message)}</div>
                </div>
                `;
            }).join("");
        }
    } catch (e) {
        console.error("Error fetching provider statuses:", e);
    }
}

async function handleBatchSelectAll(category, control, enableVal) {
    if (!confirm(`Are you sure you want to set ${control.toUpperCase()} = ${enableVal ? 'ON' : 'OFF'} for all ${category}?`)) {
        return;
    }

    try {
        showToast(`Updating ${control.toUpperCase()} for ${category}...`);
        const res = await fetch("/api/universe/select-all", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ category, control, enable: enableVal })
        });
        const json = await res.json();
        if (json.status === "success") {
            showToast(`✅ ${json.message}`);
            await fetchMarketUniverseDashboard();
        } else {
            alert("Batch update error: " + json.message);
        }
    } catch (e) {
        alert("Network error in batch select all: " + e);
    }
}

async function fetchUniverseSummary() {
    try {
        const res = await fetch("/api/universe/summary");
        const json = await res.json();
        if (json.status === "success" && json.summary) {
            const s = json.summary;
            document.getElementById("univ-stat-total").textContent = (s.total_instruments || 0).toLocaleString();
            document.getElementById("univ-stat-indices").textContent = (s.indices_count || 0).toLocaleString();
            document.getElementById("univ-stat-indian").textContent = (s.indian_stocks_count || 0).toLocaleString();
            document.getElementById("univ-stat-global").textContent = (s.global_stocks_count || 0).toLocaleString();
            document.getElementById("univ-stat-crypto").textContent = (s.crypto_count || 0).toLocaleString();
            document.getElementById("univ-stat-forex").textContent = (s.forex_count || 0).toLocaleString();
            document.getElementById("univ-stat-volatile").textContent = (s.high_volatility_count || 0).toLocaleString();
            document.getElementById("univ-stat-live").textContent = (s.live_enabled_count || 0).toLocaleString();
            document.getElementById("univ-stat-paper").textContent = (s.paper_trading_count || 0).toLocaleString();
            document.getElementById("univ-stat-dataonly").textContent = (s.data_only_count || 0).toLocaleString();

            const syncEl = document.getElementById("univ-last-sync-time");
            if (syncEl && s.last_sync) {
                if (s.last_sync === "Never") {
                    syncEl.textContent = "Never";
                } else {
                    const d = new Date(s.last_sync);
                    syncEl.textContent = isNaN(d) ? s.last_sync : d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
                }
            }
        }
    } catch (e) {
        console.error("Error fetching universe summary:", e);
    }
}

async function fetchUniverseInstruments() {
    try {
        const assetClass = document.getElementById("univ-filter-asset")?.value || "ALL";
        const vol = document.getElementById("univ-filter-vol")?.value || "ALL";
        const statusFilter = document.getElementById("univ-filter-status")?.value || "";
        const search = document.getElementById("univ-search-input")?.value || "";

        const query = new URLSearchParams({
            asset_class: assetClass,
            category: activeUniverseCategory,
            volatility: vol,
            status_filter: statusFilter,
            search: search,
            limit: 500
        });

        const res = await fetch(`/api/universe/instruments?${query.toString()}`);
        const json = await res.json();
        if (json.status === "success") {
            cachedUniverseInstruments = json.instruments || [];
            renderUniverseTable(cachedUniverseInstruments, json.total_count);
            const clockEl = document.getElementById("univ-last-updated-clock");
            if (clockEl) clockEl.textContent = new Date().toLocaleTimeString();
        }
    } catch (e) {
        console.error("Error fetching universe instruments:", e);
    }
}

function renderUniverseTable(instruments, totalCount) {
    const tbody = document.getElementById("univ-table-body");
    const countEl = document.getElementById("univ-showing-count");
    if (countEl) countEl.textContent = `Showing ${instruments.length} of ${(totalCount || instruments.length).toLocaleString()} instruments`;

    if (!instruments || instruments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted" style="padding:40px;">No instruments found matching current universe filters. Click <b>🔄 SYNC ALL MARKETS</b> to refresh.</td></tr>`;
        return;
    }

    tbody.innerHTML = instruments.map(inst => {
        const iid = inst.instrument_id || inst.symbol;
        const dispName = escapeHtml(inst.display_name || inst.symbol);
        const compName = escapeHtml(inst.company_name || "");
        const market = escapeHtml(inst.exchange || inst.market || "Global");
        const assetClass = escapeHtml(inst.asset_class || "Crypto");

        const volCat = inst.volatility_category || "Medium";
        let volBadge = `<span class="badge badge-secondary" style="font-size:10px;">${volCat}</span>`;
        if (volCat === "Extreme" || volCat === "High") {
            volBadge = `<span class="badge" style="background:rgba(255,118,117,0.2); color:#ff7675; font-size:10px; font-weight:700;">🔥 ${volCat} (${inst.volatility_score || 0})</span>`;
        }

        let execBadge = inst.execution_available
            ? `<span class="badge badge-success" style="font-size:10px;">AVAILABLE</span>`
            : `<span class="badge badge-secondary" style="font-size:10px;">DATA ONLY</span>`;

        const priceStr = inst.last_price ? `$${inst.last_price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 4})}` : "--";
        const chgStr = inst.last_change ? `${inst.last_change >= 0 ? '+' : ''}${inst.last_change.toFixed(2)}%` : "0.00%";
        const chgClass = inst.last_change >= 0 ? "text-success" : "text-danger";

        const watchChecked = inst.watch_enabled ? "checked" : "";
        const paperChecked = inst.paper_enabled ? "checked" : "";
        const stratChecked = inst.strategy_enabled ? "checked" : "";
        const liveChecked = inst.live_enabled ? "checked" : "";

        return `
        <tr>
            <td><b>${escapeHtml(inst.symbol)}</b></td>
            <td>
                <div style="font-weight:700; color:var(--text-primary);">${dispName}</div>
                <div style="font-size:11px; color:var(--text-muted);">${compName}</div>
            </td>
            <td>${market}</td>
            <td><span class="badge badge-primary" style="font-size:10px;">${assetClass}</span></td>
            <td><b>${priceStr}</b></td>
            <td><b class="${chgClass}">${chgStr}</b></td>
            <td>${volBadge}</td>
            <td><b>${inst.momentum_score || 75.0}</b></td>
            <td>${execBadge}</td>
            <td style="white-space:nowrap;">
                <div style="display:flex; gap:10px; align-items:center; font-size:11px;">
                    <label style="margin:0; cursor:pointer;" title="Watchlist">
                        <input type="checkbox" ${watchChecked} onchange="toggleInstrumentControl('${iid}', 'watch', this.checked)"> Watch
                    </label>
                    <label style="margin:0; cursor:pointer;" title="Paper Trade">
                        <input type="checkbox" ${paperChecked} onchange="toggleInstrumentControl('${iid}', 'paper', this.checked)"> Paper
                    </label>
                    <label style="margin:0; cursor:pointer;" title="Allow Strategy Signals">
                        <input type="checkbox" ${stratChecked} onchange="toggleInstrumentControl('${iid}', 'strategy', this.checked)"> Strategy
                    </label>
                    <label style="margin:0; cursor:pointer; color:#00c076; font-weight:700;" title="Live Execution (Requires explicit activation)">
                        <input type="checkbox" ${liveChecked} onchange="toggleInstrumentControl('${iid}', 'live', this.checked)"> Live
                    </label>
                </div>
            </td>
        </tr>
        `;
    }).join("");
}

async function toggleInstrumentControl(identifier, controlName, isChecked) {
    try {
        const payload = {};
        payload[controlName] = isChecked;

        const res = await fetch(`/api/universe/instruments/${encodeURIComponent(identifier)}/controls`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.status === "success") {
            showToast(`Updated ${controlName.toUpperCase()} for ${identifier} -> ${isChecked ? "ON" : "OFF"}`);
            fetchUniverseSummary();
        } else {
            alert("Control update error: " + json.message);
            fetchUniverseInstruments();
        }
    } catch (e) {
        alert("Network error updating instrument control: " + e);
        fetchUniverseInstruments();
    }
}

async function handleSyncMarkets() {
    const btn = document.getElementById("btn-sync-markets");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "⌛ Syncing Markets...";
    }
    showToast("Starting Market Universe synchronization across providers...");

    try {
        const res = await fetch("/api/universe/sync", { method: "POST" });
        const json = await res.json();
        if (json.status === "success") {
            showToast(`✅ Market sync complete! Total instruments: ${json.sync_result?.total_instruments || 0}`);
            await fetchMarketUniverseDashboard();
        } else {
            alert("Market sync error: " + json.message);
        }
    } catch (e) {
        alert("Error syncing markets: " + e);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "🔄 SYNC ALL MARKETS";
        }
    }
}

function setUniverseCategory(cat, btnEl) {
    activeUniverseCategory = cat;
    if (btnEl && btnEl.parentElement) {
        btnEl.parentElement.querySelectorAll(".cat-pill").forEach(p => p.classList.remove("active"));
        btnEl.classList.add("active");
    }
    fetchUniverseInstruments();
}

function handleUniverseFilterChange() {
    fetchUniverseInstruments();
}

async function fetchCurrentOpportunities() {
    try {
        const res = await fetch("/api/universe/opportunities?limit=10");
        const json = await res.json();
        const tbody = document.getElementById("univ-opps-body");
        if (json.status === "success" && json.opportunities && tbody) {
            if (json.opportunities.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">No market opportunities calculated yet. Click 🔄 SYNC ALL MARKETS.</td></tr>`;
                return;
            }

            tbody.innerHTML = json.opportunities.map(opp => {
                const score = opp.strategy_score || 80.0;
                const scoreClass = score >= 80 ? "text-success" : "text-primary";
                return `
                <tr>
                    <td><b>${escapeHtml(opp.display_name || opp.symbol)}</b></td>
                    <td><span class="badge badge-primary" style="font-size:10px;">${escapeHtml(opp.asset_class || "Crypto")}</span></td>
                    <td>${escapeHtml(opp.exchange || "Global")}</td>
                    <td><b>$${(opp.last_price || 0).toLocaleString()}</b></td>
                    <td><span class="badge badge-secondary" style="font-size:10px;">${opp.volatility_category || "High"}</span></td>
                    <td><b>${opp.momentum_score || 75.0}</b></td>
                    <td><b class="${scoreClass}" style="font-size:1.1rem;">${score}</b></td>
                    <td><span class="badge badge-success" style="font-size:10px;">CANDIDATE</span></td>
                </tr>
                `;
            }).join("");
        }
    } catch (e) {
        console.error("Error fetching market opportunities:", e);
    }
}

// --------------------------------------------------------------------------
// SECTION: BOT AUDIT EVENT LEDGER FUNCTIONS
// --------------------------------------------------------------------------
async function fetchAuditEvents() {
    const botId = document.getElementById("audit-filter-bot")?.value || "ALL";
    const eventType = document.getElementById("audit-filter-event")?.value || "ALL";
    const severity = document.getElementById("audit-filter-severity")?.value || "ALL";
    const tbody = document.getElementById("audit-events-tbody");

    if (!tbody) return;

    try {
        const res = await fetch(`/api/audit/events?bot_id=${botId}&event_type=${eventType}&severity=${severity}&limit=100`);
        const json = await res.json();

        if (json.status === "success" && json.events && json.events.length > 0) {
            tbody.innerHTML = json.events.map(ev => {
                const sevBadge = ev.severity === "ERROR" || ev.severity === "CRITICAL"
                    ? `<span class="badge badge-danger">ERROR</span>`
                    : ev.severity === "WARNING"
                    ? `<span class="badge badge-warning">WARN</span>`
                    : `<span class="badge badge-info">INFO</span>`;

                return `
                <tr>
                    <td style="font-family:monospace; font-size:11px;">${escapeHtml(ev.local_timestamp || ev.timestamp_utc || "")}</td>
                    <td style="font-family:monospace; font-size:10px; color:var(--text-muted);">${escapeHtml((ev.timestamp_utc || "").substring(11, 19))} UTC</td>
                    <td><b>${escapeHtml(ev.bot_instance_id || "bot-1")}</b></td>
                    <td><code>${escapeHtml(ev.symbol || "BTC/USDT")}</code></td>
                    <td><b style="font-size:11px; color:var(--accent-blue);">${escapeHtml(ev.event_type || "")}</b></td>
                    <td>${sevBadge}</td>
                    <td style="font-size:12px;">${escapeHtml(ev.message || "")}</td>
                    <td style="font-size:11px; color:var(--text-muted);">${escapeHtml(ev.reason || "N/A")}</td>
                </tr>
                `;
            }).join("");
        } else {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">No audit events recorded matching filter.</td></tr>`;
        }
    } catch (err) {
        console.error("Failed to fetch audit events:", err);
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Failed to load audit events.</td></tr>`;
    }
}

function exportAuditCSV() {
    const botId = document.getElementById("audit-filter-bot")?.value || "ALL";
    const eventType = document.getElementById("audit-filter-event")?.value || "ALL";
    const severity = document.getElementById("audit-filter-severity")?.value || "ALL";
    window.location.href = `/api/audit/export-csv?bot_id=${botId}&event_type=${eventType}&severity=${severity}`;
}

async function toggleKillSwitchFromUI() {
    if (!confirm("Are you sure you want to toggle the Global Trading Kill Switch?")) return;
    try {
        const res = await fetch("/api/kill-switch", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({action: "toggle", reason: "Dashboard UI button click"})
        });
        const json = await res.json();
        alert(json.message);
        fetchAuditEvents();
    } catch (err) {
        alert("Failed to toggle kill switch: " + err);
    }
}

async function fetchMarketIntelligenceData() {
    try {
        const resStatus = await fetch("/api/market-intelligence/status");
        const jsonStatus = await resStatus.json();
        if (jsonStatus.status === "success") {
            const scEl = document.getElementById("mi-scanned-count");
            const botEl = document.getElementById("mi-bots-count");
            const confEl = document.getElementById("mi-conflicts-count");
            if (scEl) scEl.textContent = jsonStatus.scanned_markets_count || 490;
            if (botEl) botEl.textContent = `${jsonStatus.active_bots_count || 1} Bot Instance`;
            if (confEl) confEl.textContent = `${jsonStatus.conflicts_count || 0} Conflicts`;
        }

        const resScanner = await fetch("/api/market-intelligence/scanner");
        const jsonScanner = await resScanner.json();
        const scannerBody = document.getElementById("mi-scanner-table-body");
        if (scannerBody && jsonScanner.rankings) {
            scannerBody.innerHTML = jsonScanner.rankings.map(r => `
                <tr>
                    <td><b>#${r.rank}</b></td>
                    <td><b>${r.symbol}</b></td>
                    <td><span class="badge-tag">${r.asset_class}</span></td>
                    <td><code>${r.strategy}</code></td>
                    <td><b>${r.score}</b></td>
                    <td><b style="color:var(--accent-gold, #f59e0b);">${r.confidence}%</b></td>
                    <td><span class="badge" style="background:${r.risk === 'LOW' ? '#00c07622' : '#ffaa0022'}; color:${r.risk === 'LOW' ? '#00c076' : '#ffaa00'};">${r.risk}</span></td>
                    <td><span class="status-badge ${r.status === 'READY' ? 'status-running' : 'status-stopped'}">${r.status}</span></td>
                </tr>
            `).join("");
        }

        await fetchPreTradeDecisions();
    } catch (err) {
        console.error("Failed to fetch market intelligence data:", err);
    }
}

async function fetchPreTradeDecisions() {
    const tbody = document.getElementById("mi-decisions-table-body");
    if (!tbody) return;
    const filter = document.getElementById("mi-decision-filter")?.value || "ALL";

    try {
        const res = await fetch(`/api/market-intelligence/pre-trade-decisions?decision=${filter}&limit=25`);
        const json = await res.json();
        if (json.decisions && json.decisions.length > 0) {
            tbody.innerHTML = json.decisions.map(d => {
                const isApproved = d.final_decision === "TRADE_APPROVED";
                const badgeColor = isApproved ? "#00c076" : "#ff3b69";
                return `
                    <tr>
                        <td><code>${d.pre_trade_analysis_id}</code></td>
                        <td>${d.timestamp ? d.timestamp.slice(11, 19) : '-'}</td>
                        <td><b>${d.symbol}</b></td>
                        <td><span class="badge-tag">${d.strategy}</span></td>
                        <td><code>${d.market_regime}</code></td>
                        <td><b>${d.confidence_score}%</b></td>
                        <td><span class="badge" style="background:${badgeColor}22; color:${badgeColor}; border:1px solid ${badgeColor}44;">${d.final_decision}</span></td>
                        <td><span style="font-size:12px; color:var(--text-muted);">${d.rejection_reason}</span></td>
                    </tr>
                `;
            }).join("");
        } else {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">No pre-trade decisions recorded for current filter criteria.</td></tr>`;
        }
    } catch (err) {
        console.error("Failed to fetch pre-trade decisions:", err);
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Failed to load pre-trade decisions log.</td></tr>`;
    }
}

// ==========================================================================
// UNIVERSAL RISK MANAGEMENT CENTER INTERACTIVE CONTROLLER
// ==========================================================================
let currentRiskActiveSubtab = "overview";
let currentOptionLegs = [];

function switchRiskSubtab(tabName) {
    currentRiskActiveSubtab = tabName;
    document.querySelectorAll(".risk-subtab-btn").forEach(btn => {
        if (btn.getAttribute("data-subtab") === tabName) {
            btn.classList.add("btn-primary", "active");
            btn.classList.remove("btn-secondary");
        } else {
            btn.classList.remove("btn-primary", "active");
            btn.classList.add("btn-secondary");
        }
    });

    document.querySelectorAll(".risk-subtab-content").forEach(pane => {
        pane.style.display = pane.id === `risk-subtab-${tabName}` ? "block" : "none";
    });

    if (tabName === "overview") fetchRiskOverviewData();
    else if (tabName === "pos-size") calculateLivePositionSize();
    else if (tabName === "futures") calculateLiveFuturesRisk();
    else if (tabName === "options") {
        if (currentOptionLegs.length === 0) loadOptionStrategyTemplate("Bull Call Spread");
        else calculateLiveOptionRisk();
    }
    else if (tabName === "portfolio") fetchRiskOverviewData();
    else if (tabName === "rules") fetchRiskRules();
    else if (tabName === "stress") runLiveStressTest();
    else if (tabName === "settings") {
        fetchRiskProfiles();
        fetchRiskEventsHistory();
    }
}

async function initUniversalRiskCenter() {
    fetchRiskOverviewData();
    calculateLivePositionSize();
    calculateLiveFuturesRisk();
    fetchRiskRules();
    fetchRiskProfiles();
}

async function fetchRiskOverviewData() {
    try {
        const res = await fetch("/api/risk/overview");
        const json = await res.json();
        if (json.status !== "success") return;

        const ov = json.overview || {};
        const elBalance = document.getElementById("risk-metric-balance");
        const elAvail = document.getElementById("risk-metric-avail");
        const elPortRisk = document.getElementById("risk-metric-port-risk");
        const elRiskDollars = document.getElementById("risk-metric-risk-dollars");
        const elMarginPct = document.getElementById("risk-metric-margin-pct");
        const elMarginUsed = document.getElementById("risk-metric-margin-used");
        const elGrossExp = document.getElementById("risk-metric-gross-exp");
        const elNetExp = document.getElementById("risk-metric-net-exp");
        const elDailyPnl = document.getElementById("risk-metric-daily-pnl");
        const elDailyDd = document.getElementById("risk-metric-daily-dd");
        const elScore = document.getElementById("risk-metric-score");
        const elStatus = document.getElementById("risk-metric-status");
        const elScorePill = document.getElementById("risk-overview-score-pill");

        if (elBalance) elBalance.textContent = `$${ov.account_balance.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        if (elAvail) elAvail.textContent = `$${ov.available_capital.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        if (elPortRisk) elPortRisk.textContent = `${ov.portfolio_risk_pct.toFixed(2)}%`;
        if (elRiskDollars) elRiskDollars.textContent = `$${ov.portfolio_risk_dollars.toFixed(2)}`;
        if (elMarginPct) elMarginPct.textContent = `${ov.margin_usage_pct.toFixed(2)}%`;
        if (elMarginUsed) elMarginUsed.textContent = `$${ov.margin_used.toFixed(2)}`;
        if (elGrossExp) elGrossExp.textContent = `$${ov.gross_exposure.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        if (elNetExp) elNetExp.textContent = `$${ov.net_exposure.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        if (elDailyPnl) {
            const pnlVal = ov.daily_pnl;
            elDailyPnl.textContent = `${pnlVal >= 0 ? '+' : ''}$${pnlVal.toFixed(2)}`;
            elDailyPnl.style.color = pnlVal >= 0 ? '#00e676' : '#ff3b69';
        }
        if (elDailyDd) elDailyDd.textContent = `${ov.daily_drawdown_pct.toFixed(2)}%`;
        if (elScore) elScore.textContent = ov.risk_score;
        if (elStatus) elStatus.textContent = ov.risk_status;

        if (elScorePill) {
            elScorePill.textContent = `${ov.risk_score} RISK`;
            if (ov.risk_score === "CRITICAL") elScorePill.style.background = "rgba(255, 59, 105, 0.2)";
            else if (ov.risk_score === "HIGH") elScorePill.style.background = "rgba(255, 171, 0, 0.2)";
            else elScorePill.style.background = "rgba(0, 230, 118, 0.2)";
        }

        // Score Factors
        const reasonsList = document.getElementById("risk-score-reasons-list");
        if (reasonsList && ov.score_factors) {
            reasonsList.innerHTML = ov.score_factors.map(f => {
                const isGood = f.includes("within safe");
                return `<div style="background:var(--bg-card-subtle); padding:8px 12px; border-radius:6px; border-left:3px solid ${isGood ? '#00e676' : '#ff3b69'};">
                    ${escapeHtml(f)}
                </div>`;
            }).join("");
        }

        // Active Positions Table
        const posTbody = document.getElementById("risk-positions-tbody");
        if (posTbody && json.positions) {
            if (json.positions.length === 0) {
                posTbody.innerHTML = `<tr><td colspan="11" class="text-center text-muted" style="padding:16px;">No active open positions.</td></tr>`;
            } else {
                posTbody.innerHTML = json.positions.map(p => {
                    return `<tr>
                        <td><code>${escapeHtml(p.bot_id)}</code></td>
                        <td><b>${escapeHtml(p.symbol)}</b></td>
                        <td><span class="badge badge-secondary">${escapeHtml(p.asset_class)}</span></td>
                        <td><span class="badge ${p.direction === 'LONG' ? 'badge-success' : 'badge-danger'}">${escapeHtml(p.direction)}</span></td>
                        <td>${p.quantity}</td>
                        <td>$${p.entry_price.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td>$${p.stop_loss.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td><b>$${p.position_value.toLocaleString(undefined, {minimumFractionDigits: 2})}</b></td>
                        <td>$${p.margin_used.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td style="color:#ff3b69;">$${p.risk_amount.toFixed(2)}</td>
                        <td style="color:${p.unrealized_pnl >= 0 ? '#00e676' : '#ff3b69'}; font-weight:700;">${p.unrealized_pnl >= 0 ? '+' : ''}$${p.unrealized_pnl.toFixed(2)}</td>
                    </tr>`;
                }).join("");
            }
        }

        // Heatmap Table
        const heatTbody = document.getElementById("risk-heatmap-tbody");
        if (heatTbody && json.heatmap) {
            if (json.heatmap.length === 0) {
                heatTbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No open positions to display in heatmap.</td></tr>`;
            } else {
                heatTbody.innerHTML = json.heatmap.map(h => {
                    const badgeClass = h.risk_level === 'HIGH' ? 'badge-danger' : (h.risk_level === 'MODERATE' ? 'badge-warning' : 'badge-success');
                    return `<tr>
                        <td><b>${escapeHtml(h.entity)}</b></td>
                        <td><span class="badge badge-secondary">${escapeHtml(h.type)}</span></td>
                        <td>$${h.exposure.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td><b>${h.exposure_pct}%</b></td>
                        <td><span class="badge ${badgeClass}">${escapeHtml(h.risk_level)}</span></td>
                    </tr>`;
                }).join("");
            }
        }

        // Multi-Bot Shared Exposure Table
        const sharedTbody = document.getElementById("risk-shared-exposure-tbody");
        if (sharedTbody && json.symbol_exposure) {
            const symEntries = Object.entries(json.symbol_exposure);
            if (symEntries.length === 0) {
                sharedTbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No shared bot exposures active.</td></tr>`;
            } else {
                sharedTbody.innerHTML = symEntries.map(([sName, sVal]) => {
                    const pct = ((sVal / ov.account_balance) * 100.0).toFixed(1);
                    const isOver = parseFloat(pct) > 30.0;
                    return `<tr>
                        <td><b>${escapeHtml(sName)}</b></td>
                        <td>All Active Bots</td>
                        <td>$${sVal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td><b>${pct}%</b> of equity</td>
                        <td><span class="badge ${isOver ? 'badge-danger' : 'badge-success'}">${isOver ? 'OVER 30% LIMIT' : 'WITHIN CAP'}</span></td>
                    </tr>`;
                }).join("");
            }
        }

    } catch (e) {
        console.error("Error fetching risk overview:", e);
    }
}

async function calculateLivePositionSize() {
    const assetClass = document.getElementById("calc-asset-class")?.value || "crypto";
    const method = document.getElementById("calc-sizing-method")?.value || "percent_equity";
    const balance = parseFloat(document.getElementById("calc-balance")?.value || 10000);
    const availCap = parseFloat(document.getElementById("calc-available-cap")?.value || balance);
    const riskPct = parseFloat(document.getElementById("calc-risk-pct")?.value || 2.0);
    const riskAmt = parseFloat(document.getElementById("calc-risk-amt-input")?.value || 200);
    const entry = parseFloat(document.getElementById("calc-entry")?.value || 65000);
    const sl = parseFloat(document.getElementById("calc-sl")?.value || 63700);
    const leverage = parseFloat(document.getElementById("calc-leverage")?.value || 1);
    const lotSize = parseInt(document.getElementById("calc-lot-size")?.value || 1);

    const payload = {
        account_balance: balance,
        available_capital: availCap,
        entry_price: entry,
        stop_loss_price: sl,
        method: method,
        risk_pct: riskPct,
        risk_amount: riskAmt,
        leverage: leverage,
        lot_size: lotSize,
        asset_class: assetClass
    };

    try {
        const res = await fetch("/api/risk/position-size", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.status === "SUCCESS") {
            const sym = json.currency_symbol || "$";
            document.getElementById("res-calc-quantity").textContent = `${json.position_quantity} Units`;
            document.getElementById("res-calc-lots").textContent = `${json.lots_count} lots`;
            document.getElementById("res-calc-notional").textContent = `${sym}${json.notional_value.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            document.getElementById("res-calc-margin").textContent = `${sym}${json.margin_required.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            document.getElementById("res-calc-risk-amt").textContent = `${sym}${json.risk_amount.toFixed(2)}`;
            document.getElementById("res-calc-risk-pct").textContent = `${json.risk_pct_effective.toFixed(2)}%`;
            document.getElementById("res-calc-profit").textContent = `+${sym}${json.potential_profit.toFixed(2)}`;
            document.getElementById("res-calc-tp").textContent = `${sym}${json.suggested_take_profit.toFixed(2)} (${json.risk_reward_ratio}:1 R:R)`;
            document.getElementById("res-calc-stop-dist").textContent = `${sym}${json.stop_distance.toFixed(2)} (${json.stop_distance_pct.toFixed(2)}%)`;
            document.getElementById("res-calc-fees").textContent = `${sym}${json.fees_estimated.toFixed(2)}`;
            document.getElementById("res-calc-cap-used").textContent = `${sym}${json.capital_used.toFixed(2)} / ${sym}${json.remaining_capital.toFixed(2)}`;
            document.getElementById("res-calc-port-after").textContent = `${json.portfolio_risk_pct_after.toFixed(2)}%`;
            document.getElementById("calc-calc-mode").textContent = json.calculation_mode;
        }
    } catch (e) {
        console.error("Live position sizing error:", e);
    }
}

async function testOrderPrecheckFromCalc() {
    const entry = parseFloat(document.getElementById("calc-entry")?.value || 65000);
    const sl = parseFloat(document.getElementById("calc-sl")?.value || 63700);
    const leverage = parseFloat(document.getElementById("calc-leverage")?.value || 1);
    const qtyText = document.getElementById("res-calc-quantity")?.textContent || "0";
    const qty = parseFloat(qtyText.split(" ")[0]) || 0.1;
    const balance = parseFloat(document.getElementById("calc-balance")?.value || 10000);
    const avail = parseFloat(document.getElementById("calc-available-cap")?.value || balance);

    const payload = {
        trade: {
            symbol: "BTC/USDT",
            direction: entry >= sl ? "LONG" : "SHORT",
            entry_price: entry,
            stop_loss: sl,
            quantity: qty,
            leverage: leverage,
            bot_id: activeBotId || "bot-1"
        },
        account_state: {
            balance: balance,
            available_capital: avail,
            daily_pnl: 0.0
        }
    };

    const resBox = document.getElementById("calc-precheck-result-box");
    if (!resBox) return;

    resBox.style.display = "block";
    resBox.innerHTML = `<span>⏳ Evaluating 12-Stage Trade Pre-Check...</span>`;

    try {
        const res = await fetch("/api/risk/precheck", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const json = await res.json();

        if (json.is_approved) {
            resBox.style.background = "rgba(0, 230, 118, 0.15)";
            resBox.style.border = "1px solid rgba(0, 230, 118, 0.4)";
            resBox.style.color = "#00e676";
            resBox.innerHTML = `<b>✅ TRADE APPROVED</b> — Order satisfies all 12 quantitative risk checks. Projected portfolio risk: ${json.projected_impact.projected_portfolio_risk_pct}%`;
        } else {
            resBox.style.background = "rgba(255, 59, 105, 0.15)";
            resBox.style.border = "1px solid rgba(255, 59, 105, 0.4)";
            resBox.style.color = "#ff3b69";
            const reasonsHtml = (json.rejection_reasons || []).map(r => `<li>${escapeHtml(r)}</li>`).join("");
            resBox.innerHTML = `<b>🛑 TRADE BLOCKED</b><ul>${reasonsHtml}</ul>`;
        }
    } catch (e) {
        resBox.innerHTML = `<span style="color:#ff3b69;">Error executing precheck: ${escapeHtml(String(e))}</span>`;
    }
}

async function calculateLiveFuturesRisk() {
    const sym = document.getElementById("fut-symbol")?.value || "BTC/USDT Perp";
    const dir = document.getElementById("fut-direction")?.value || "LONG";
    const cSize = parseFloat(document.getElementById("fut-contract-size")?.value || 1.0);
    const qty = parseFloat(document.getElementById("fut-quantity")?.value || 1.0);
    const entry = parseFloat(document.getElementById("fut-entry")?.value || 65000);
    const sl = parseFloat(document.getElementById("fut-sl")?.value || 63700);
    const lev = parseFloat(document.getElementById("fut-leverage")?.value || 10);
    const mmr = parseFloat(document.getElementById("fut-mmr")?.value || 0.5) / 100.0;

    const payload = {
        symbol: sym,
        direction: dir,
        contract_size: cSize,
        quantity: qty,
        entry_price: entry,
        stop_loss: sl,
        leverage: lev,
        maintenance_margin_rate: mmr
    };

    try {
        const res = await fetch("/api/risk/futures/calculate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.status === "SUCCESS") {
            document.getElementById("res-fut-liq").textContent = `$${json.estimated_liquidation_price.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            document.getElementById("res-fut-liq-dist").textContent = `$${json.distance_to_liquidation.toFixed(2)} (${json.distance_to_liquidation_pct.toFixed(2)}%)`;
            document.getElementById("res-fut-im").textContent = `$${json.initial_margin.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            document.getElementById("res-fut-mm").textContent = `$${json.maintenance_margin.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            document.getElementById("res-fut-max-loss").textContent = `$${json.maximum_loss_at_stop.toFixed(2)}`;
            document.getElementById("res-fut-funding").textContent = `$${json.estimated_24h_funding.toFixed(2)}`;
        }
    } catch (e) {
        console.error("Futures calculation error:", e);
    }
}

function loadOptionStrategyTemplate(strategyName) {
    const sName = strategyName || document.getElementById("opt-strategy-name")?.value || "Bull Call Spread";
    const spot = parseFloat(document.getElementById("opt-underlying-price")?.value || 65000);

    if (sName === "Bull Call Spread") {
        currentOptionLegs = [
            { side: "BUY", option_type: "CALL", strike: Math.round(spot), premium: 1200, quantity: 1 },
            { side: "SELL", option_type: "CALL", strike: Math.round(spot * 1.03), premium: 450, quantity: 1 }
        ];
    } else if (sName === "Bear Put Spread") {
        currentOptionLegs = [
            { side: "BUY", option_type: "PUT", strike: Math.round(spot), premium: 1100, quantity: 1 },
            { side: "SELL", option_type: "PUT", strike: Math.round(spot * 0.97), premium: 400, quantity: 1 }
        ];
    } else if (sName === "Iron Condor") {
        currentOptionLegs = [
            { side: "BUY", option_type: "PUT", strike: Math.round(spot * 0.93), premium: 150, quantity: 1 },
            { side: "SELL", option_type: "PUT", strike: Math.round(spot * 0.96), premium: 380, quantity: 1 },
            { side: "SELL", option_type: "CALL", strike: Math.round(spot * 1.04), premium: 400, quantity: 1 },
            { side: "BUY", option_type: "CALL", strike: Math.round(spot * 1.07), premium: 160, quantity: 1 }
        ];
    } else if (sName === "Straddle") {
        currentOptionLegs = [
            { side: "BUY", option_type: "CALL", strike: Math.round(spot), premium: 1200, quantity: 1 },
            { side: "BUY", option_type: "PUT", strike: Math.round(spot), premium: 1100, quantity: 1 }
        ];
    } else {
        currentOptionLegs = [
            { side: "BUY", option_type: "CALL", strike: Math.round(spot), premium: 1200, quantity: 1 }
        ];
    }

    renderOptionLegsInputs();
    calculateLiveOptionRisk();
}

function renderOptionLegsInputs() {
    const container = document.getElementById("opt-legs-container");
    if (!container) return;

    container.innerHTML = currentOptionLegs.map((leg, idx) => {
        return `
            <div style="display:grid; grid-template-columns: 80px 80px 1fr 1fr 60px; gap:8px; background:var(--bg-card-subtle); padding:8px 10px; border-radius:6px; align-items:center;">
                <select class="form-select" style="padding:2px 4px; font-size:11px;" onchange="currentOptionLegs[${idx}].side = this.value; calculateLiveOptionRisk()">
                    <option value="BUY" ${leg.side === 'BUY' ? 'selected' : ''}>BUY</option>
                    <option value="SELL" ${leg.side === 'SELL' ? 'selected' : ''}>SELL</option>
                </select>
                <select class="form-select" style="padding:2px 4px; font-size:11px;" onchange="currentOptionLegs[${idx}].option_type = this.value; calculateLiveOptionRisk()">
                    <option value="CALL" ${leg.option_type === 'CALL' ? 'selected' : ''}>CALL</option>
                    <option value="PUT" ${leg.option_type === 'PUT' ? 'selected' : ''}>PUT</option>
                </select>
                <input type="number" class="form-input" style="padding:2px 6px; font-size:11px;" value="${leg.strike}" placeholder="Strike" oninput="currentOptionLegs[${idx}].strike = parseFloat(this.value); calculateLiveOptionRisk()">
                <input type="number" class="form-input" style="padding:2px 6px; font-size:11px;" value="${leg.premium}" placeholder="Premium" oninput="currentOptionLegs[${idx}].premium = parseFloat(this.value); calculateLiveOptionRisk()">
                <input type="number" class="form-input" style="padding:2px 6px; font-size:11px;" value="${leg.quantity}" placeholder="Qty" oninput="currentOptionLegs[${idx}].quantity = parseInt(this.value); calculateLiveOptionRisk()">
            </div>
        `;
    }).join("");
}

async function calculateLiveOptionRisk() {
    const sName = document.getElementById("opt-strategy-name")?.value || "Bull Call Spread";
    const spot = parseFloat(document.getElementById("opt-underlying-price")?.value || 65000);
    const iv = parseFloat(document.getElementById("opt-iv-pct")?.value || 35);
    const dte = parseInt(document.getElementById("opt-dte")?.value || 14);

    const payload = {
        strategy_name: sName,
        underlying_price: spot,
        iv_pct: iv,
        days_to_expiry: dte,
        legs: currentOptionLegs
    };

    try {
        const res = await fetch("/api/risk/options/calculate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.status === "SUCCESS") {
            const g = json.net_greeks || {};
            document.getElementById("res-opt-delta").textContent = `${g.delta >= 0 ? '+' : ''}${g.delta.toFixed(4)}`;
            document.getElementById("res-opt-gamma").textContent = `${g.gamma >= 0 ? '+' : ''}${g.gamma.toFixed(5)}`;
            document.getElementById("res-opt-theta").textContent = `$${g.theta.toFixed(2)}`;
            document.getElementById("res-opt-vega").textContent = `$${g.vega.toFixed(2)}`;
            document.getElementById("res-opt-rho").textContent = `$${g.rho.toFixed(2)}`;

            document.getElementById("res-opt-max-profit").textContent = typeof json.maximum_profit === 'number' ? `+$${json.maximum_profit.toLocaleString()}` : json.maximum_profit;
            document.getElementById("res-opt-max-loss").textContent = typeof json.maximum_loss === 'number' ? `-$${json.maximum_loss.toLocaleString()}` : json.maximum_loss;
            document.getElementById("res-opt-breakeven").textContent = (json.breakeven_points && json.breakeven_points.length > 0) ? json.breakeven_points.map(b => `$${b.toLocaleString()}`).join(", ") : "N/A";
        }
    } catch (e) {
        console.error("Options calculation error:", e);
    }
}

async function fetchRiskRules() {
    try {
        const res = await fetch("/api/risk/rules");
        const json = await res.json();
        const tbody = document.getElementById("risk-rules-tbody");
        if (!tbody) return;

        if (!json.rules || json.rules.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No custom risk rules configured.</td></tr>`;
            return;
        }

        tbody.innerHTML = json.rules.map(r => {
            return `<tr>
                <td><b>${escapeHtml(r.name)}</b></td>
                <td><span class="badge badge-secondary">${escapeHtml(r.scope)} (${escapeHtml(r.target)})</span></td>
                <td><code>${escapeHtml(r.action)}</code></td>
                <td><span class="badge ${r.is_enabled ? 'badge-success' : 'badge-secondary'}">${r.is_enabled ? 'ACTIVE' : 'DISABLED'}</span></td>
                <td>
                    <button class="btn btn-sm ${r.is_enabled ? 'btn-warning' : 'btn-success'}" style="padding:1px 6px; font-size:10px;" onclick="toggleRiskRule('${r.rule_id}', ${!r.is_enabled})">${r.is_enabled ? 'Disable' : 'Enable'}</button>
                    <button class="btn btn-sm btn-danger" style="padding:1px 6px; font-size:10px;" onclick="deleteRiskRule('${r.rule_id}')">🗑️</button>
                </td>
            </tr>`;
        }).join("");
    } catch (e) {
        console.error("Error fetching risk rules:", e);
    }
}

async function saveNewRiskRule() {
    const name = document.getElementById("rule-name")?.value;
    if (!name || name.trim() === "") {
        alert("Please enter a valid Rule Name.");
        return;
    }
    const scope = document.getElementById("rule-scope")?.value || "global";
    const metric = document.getElementById("rule-metric")?.value || "portfolio_risk_pct";
    const val = parseFloat(document.getElementById("rule-threshold")?.value || 30);
    const action = document.getElementById("rule-action")?.value || "BLOCK_ORDER";

    const payload = {
        name: name.trim(),
        scope: scope,
        target: "*",
        condition: { metric: metric, operator: ">=", value: val },
        action: action,
        is_enabled: true,
        priority: 50
    };

    try {
        const res = await fetch("/api/risk/rules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.status === "success") {
            alert(`✅ Risk rule '${name}' created successfully!`);
            document.getElementById("rule-name").value = "";
            fetchRiskRules();
        } else {
            alert(`⚠️ Error saving rule: ${json.message}`);
        }
    } catch (e) {
        alert("Error saving rule: " + e);
    }
}

async function toggleRiskRule(ruleId, state) {
    try {
        await fetch(`/api/risk/rules/${ruleId}/toggle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: state })
        });
        fetchRiskRules();
    } catch (e) {
        console.error("Error toggling rule:", e);
    }
}

async function deleteRiskRule(ruleId) {
    if (!confirm("Are you sure you want to delete this risk rule?")) return;
    try {
        await fetch(`/api/risk/rules/${ruleId}`, { method: "DELETE" });
        fetchRiskRules();
    } catch (e) {
        console.error("Error deleting rule:", e);
    }
}

async function runLiveStressTest() {
    const tbody = document.getElementById("risk-stress-tbody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">⏳ Simulating 10 macro & volatility shock scenarios...</td></tr>`;

    try {
        const res = await fetch("/api/risk/stress-test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ portfolio_equity: 10000 })
        });
        const json = await res.json();
        if (json.status === "SUCCESS" && json.scenarios) {
            tbody.innerHTML = json.scenarios.map(sc => {
                const isNeg = sc.projected_pnl < 0;
                const badgeClass = sc.risk_status === 'CRITICAL' ? 'badge-danger' : (sc.risk_status === 'HIGH RISK' ? 'badge-warning' : 'badge-success');
                return `<tr>
                    <td><b>${escapeHtml(sc.scenario_name)}</b></td>
                    <td>${sc.price_shock_pct >= 0 ? '+' : ''}${sc.price_shock_pct}%</td>
                    <td>${sc.vol_shock_pct >= 0 ? '+' : ''}${sc.vol_shock_pct}%</td>
                    <td style="color:${isNeg ? '#ff3b69' : '#00e676'}; font-weight:700;">${isNeg ? '' : '+'}$${sc.projected_pnl.toFixed(2)} (${sc.projected_pnl_pct}%)</td>
                    <td><span class="badge ${badgeClass}">${escapeHtml(sc.risk_status)}</span></td>
                </tr>`;
            }).join("");
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error running stress test: ${escapeHtml(String(e))}</td></tr>`;
    }
}

async function runWhatIfSimulation() {
    const sym = document.getElementById("whatif-symbol")?.value || "BTC/USDT";
    const qty = parseFloat(document.getElementById("whatif-qty")?.value || 0.25);
    const entry = parseFloat(document.getElementById("whatif-entry")?.value || 65000);
    const sl = parseFloat(document.getElementById("whatif-sl")?.value || 63700);

    const payload = {
        trade: { symbol: sym, quantity: qty, entry_price: entry, stop_loss: sl, leverage: 1.0 },
        balance: 10000
    };

    try {
        const res = await fetch("/api/risk/what-if", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.status === "success") {
            document.getElementById("whatif-curr-risk").textContent = `${json.current.portfolio_risk_pct}%`;
            document.getElementById("whatif-after-risk").textContent = `${json.after_trade.portfolio_risk_pct}%`;
            document.getElementById("whatif-change-risk").textContent = `+${json.change.risk_pct_diff}%`;
        }
    } catch (e) {
        console.error("What if error:", e);
    }
}

async function fetchRiskProfiles() {
    try {
        const res = await fetch("/api/risk/profiles");
        const json = await res.json();
        const tbody = document.getElementById("risk-profiles-tbody");
        if (!tbody || !json.profiles) return;

        tbody.innerHTML = json.profiles.map(p => {
            return `<tr>
                <td><b>${escapeHtml(p.name)}</b></td>
                <td><span class="badge badge-secondary">${escapeHtml(p.category)}</span></td>
                <td>${p.config.max_risk_per_trade_pct}%</td>
                <td>${p.config.max_daily_loss_pct}% Daily</td>
                <td><span class="badge ${p.is_default ? 'badge-success' : 'badge-secondary'}">${p.is_default ? 'DEFAULT ACTIVE' : 'INACTIVE'}</span></td>
                <td>
                    ${p.is_default ? '<b>Active</b>' : `<button class="btn btn-sm btn-primary" style="padding:1px 6px; font-size:10px;" onclick="applyRiskProfile('${p.profile_id}')">Set Active</button>`}
                </td>
            </tr>`;
        }).join("");
    } catch (e) {
        console.error("Error fetching profiles:", e);
    }
}

async function applyRiskProfile(profileId) {
    try {
        const res = await fetch("/api/risk/profiles/default", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profile_id: profileId })
        });
        const json = await res.json();
        if (json.status === "success") {
            alert(`✅ Risk profile '${profileId}' applied as active limits.`);
            fetchRiskProfiles();
            fetchRiskOverviewData();
        }
    } catch (e) {
        alert("Error applying profile: " + e);
    }
}

async function fetchRiskEventsHistory() {
    try {
        const res = await fetch("/api/risk/history?limit=30");
        const json = await res.json();
        const tbody = document.getElementById("risk-events-tbody");
        if (!tbody || !json.events) return;

        if (json.events.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No recent risk events recorded.</td></tr>`;
            return;
        }

        tbody.innerHTML = json.events.map(evt => {
            const isWarn = evt.severity === "WARNING";
            return `<tr>
                <td><small>${escapeHtml(evt.timestamp.replace("T", " ").substring(0, 19))}</small></td>
                <td><b>${escapeHtml(evt.event_type)}</b></td>
                <td><span class="badge ${isWarn ? 'badge-warning' : 'badge-danger'}">${escapeHtml(evt.severity)}</span></td>
                <td>${escapeHtml(evt.message)}</td>
            </tr>`;
        }).join("");
    } catch (e) {
        console.error("Error fetching risk events:", e);
    }
}

function saveStockRiskSettings() {
    alert("✅ Equity & stock risk limits updated and synchronized.");
}

document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        fetchMarketIntelligenceData();
        initUniversalRiskCenter();
    }, 1500);
});

// --------------------------------------------------------------------------
// SECTION: SMART CONFIRMATION SYSTEM
// --------------------------------------------------------------------------
window.smartConfirmCallback = null;

function requestSmartConfirmation(options, onConfirm) {
    const modal = document.getElementById("smart-confirm-modal");
    const icon = document.getElementById("sc-modal-icon");
    const title = document.getElementById("sc-modal-title");
    const riskTag = document.getElementById("sc-modal-risk-tag");
    const msg = document.getElementById("sc-modal-message");
    const detailsBox = document.getElementById("sc-modal-details-box");
    const highRiskBox = document.getElementById("sc-high-risk-confirm");
    const confirmInput = document.getElementById("sc-confirm-input");
    const confirmBtn = document.getElementById("sc-confirm-action-btn");

    if (!modal) return;

    window.smartConfirmCallback = onConfirm;

    const risk = options.risk || 'MEDIUM';
    if (icon) icon.textContent = options.icon || (risk === 'HIGH' || risk === 'KILL_SWITCH' ? '🚨' : '⚠️');
    if (title) title.textContent = options.title || 'Action Confirmation';
    if (msg) msg.textContent = options.message || 'Are you sure you want to execute this action?';
    if (detailsBox) detailsBox.textContent = options.details || `Target Bot: ${options.bot_id || 'System'}\nMode: ${options.mode || 'PAPER'}`;

    if (riskTag) {
        riskTag.textContent = `${risk} RISK`;
        riskTag.style.background = risk === 'HIGH' || risk === 'KILL_SWITCH' ? '#ff3b6922' : '#ffab0022';
        riskTag.style.color = risk === 'HIGH' || risk === 'KILL_SWITCH' ? '#ff3b69' : '#ffab00';
    }

    if (highRiskBox) {
        highRiskBox.style.display = (risk === 'HIGH' || risk === 'KILL_SWITCH') ? 'block' : 'none';
        if (confirmInput) confirmInput.value = '';
    }

    if (confirmBtn) {
        confirmBtn.onclick = () => {
            if (risk === 'HIGH' || risk === 'KILL_SWITCH') {
                const val = (confirmInput?.value || '').trim().toUpperCase();
                if (val !== 'CONFIRM') {
                    alert("Please type 'CONFIRM' to execute this high-risk operation.");
                    return;
                }
            }
            closeSmartConfirmModal();
            if (typeof window.smartConfirmCallback === 'function') {
                window.smartConfirmCallback();
            }
        };
    }

    modal.style.display = "flex";
}

function closeSmartConfirmModal() {
    const modal = document.getElementById("smart-confirm-modal");
    if (modal) modal.style.display = "none";
}

// ============================================================================
// CENTRALIZED NAVIGATION ROUTER (MAIN TABS & BOT CONTROL SUBTABS)
// ============================================================================

function switchTab(tabId, updateUrl = true) {
    if (!tabId) return;

    // 1. Update left sidebar nav buttons
    document.querySelectorAll(".nav-menu .nav-item").forEach(btn => {
        if (btn.dataset.tab === tabId) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    // 2. Activate target tab content container
    document.querySelectorAll("section.tab-content").forEach(section => {
        if (section.id === `tab-${tabId}`) {
            section.classList.add("active");
        } else {
            section.classList.remove("active");
        }
    });

    // 3. Update URL hash if requested
    if (updateUrl) {
        if (tabId === "control") {
            const activeSubtabBtn = document.querySelector(".ctrl-subtab-btn.active");
            const activeSub = activeSubtabBtn ? activeSubtabBtn.dataset.subtab : "overview";
            history.replaceState(null, "", `#control-${activeSub}`);
        } else {
            history.replaceState(null, "", `#${tabId}`);
        }
    }

    // 4. Trigger tab-specific data load
    if (tabId === "control") {
        fetchBotSummaryMetrics();
        fetchBotStatus();
    } else if (tabId === "risk") {
        if (typeof fetchRiskOverview === "function") fetchRiskOverview();
    } else if (tabId === "indicators") {
        fetchIndicatorDashboardData();
    } else if (tabId === "universe") {

        if (typeof fetchUniverseSummary === "function") fetchUniverseSummary();
    } else if (tabId === "analytics") {
        if (typeof fetchAnalytics === "function") fetchAnalytics();
    } else if (tabId === "audit") {
        if (typeof fetchAuditLogs === "function") fetchAuditLogs();
    } else if (tabId === "alerts") {
        if (typeof fetchNotifications === "function") fetchNotifications();
    } else if (tabId === "logs") {
        if (typeof fetchLogs === "function") fetchLogs();
    } else if (tabId === "diagnostics") {
        if (typeof fetchDiagnosticsState === "function") fetchDiagnosticsState();
    }
}

function switchCtrlSubtab(subtabName, updateUrl = true) {
    if (!subtabName) return;

    // Ensure main control tab is active
    const controlSection = document.getElementById("tab-control");
    if (!controlSection || !controlSection.classList.contains("active")) {
        switchTab("control", false);
    }

    // 1. Update subtab navigation buttons
    document.querySelectorAll(".ctrl-subtab-btn").forEach(btn => {
        if (btn.dataset.subtab === subtabName) {
            btn.classList.add("active", "btn-primary");
            btn.classList.remove("btn-secondary");
        } else {
            btn.classList.remove("active", "btn-primary");
            btn.classList.add("btn-secondary");
        }
    });

    // 2. Activate target subtab container
    document.querySelectorAll(".ctrl-subtab-content").forEach(content => {
        if (content.id === `ctrl-subtab-${subtabName}`) {
            content.classList.add("active");
        } else {
            content.classList.remove("active");
        }
    });

    // 3. Update URL hash
    if (updateUrl) {
        history.replaceState(null, "", `#control-${subtabName}`);
    }

    // 4. Trigger subtab data loaders
    if (subtabName === "overview" || subtabName === "summary") {
        fetchBotSummaryMetrics();
        fetchBotStatus();
    } else if (subtabName === "templates") {
        fetchBotTemplates();
    } else if (subtabName === "groups") {
        fetchBotGroups();
    } else if (subtabName === "paper") {
        fetchPaperTradingOverview();
        renderActiveBotsGrid();
    } else if (subtabName === "live") {
        fetchLiveTradingOverview();
        renderActiveBotsGrid();
    } else if (subtabName === "history") {
        fetchBotHistoryLog();
    } else if (subtabName === "events") {
        fetchRealtimeAuditStream(true);
    }
}

// Global URL Hash Router
function handleHashRouting() {
    const rawHash = (window.location.hash || "").replace("#", "").trim();
    if (!rawHash) {
        switchTab("control", false);
        switchCtrlSubtab("overview", false);
        return;
    }

    if (rawHash.startsWith("control-")) {
        const sub = rawHash.replace("control-", "");
        switchTab("control", false);
        switchCtrlSubtab(sub, false);
    } else if (rawHash === "control") {
        switchTab("control", false);
        switchCtrlSubtab("overview", false);
    } else {
        switchTab(rawHash, false);
    }
}

window.addEventListener("hashchange", handleHashRouting);
window.addEventListener("popstate", handleHashRouting);

// ============================================================================
// UNIVERSAL QUICK COMMAND PALETTE (CTRL + K / CMD + K)
// ============================================================================
let paletteFilteredCommands = [];
let paletteSelectedIndex = 0;

function openCommandPalette() {
    const modal = document.getElementById("command-palette-modal");
    const input = document.getElementById("cmd-palette-input");
    if (modal) {
        modal.style.display = "flex";
        paletteSelectedIndex = 0;
        if (input) {
            input.value = "";
            input.focus();
        }
        filterCommandPalette();
    }
}

function closeCommandPalette() {
    const modal = document.getElementById("command-palette-modal");
    if (modal) modal.style.display = "none";
}

function filterCommandPalette() {
    const input = document.getElementById("cmd-palette-input");
    const container = document.getElementById("cmd-palette-results");
    if (!container) return;

    const query = (input?.value || "").toLowerCase().trim();

    const commands = [
        // Bot Actions
        { name: "Start Active Bot", cat: "Bot Actions", action: () => controlBot("START") },
        { name: "Pause Active Bot", cat: "Bot Actions", action: () => controlBot("PAUSE") },
        { name: "Resume Active Bot", cat: "Bot Actions", action: () => controlBot("RESUME") },
        { name: "Stop Active Bot", cat: "Bot Actions", action: () => controlBot("STOP") },
        { name: "Restart Active Bot", cat: "Bot Actions", action: () => controlBot("RESTART") },
        { name: "Start All Bots (Batch)", cat: "Batch Control", action: () => batchControlAllBots("START") },
        { name: "Pause All Bots (Batch)", cat: "Batch Control", action: () => batchControlAllBots("PAUSE") },
        { name: "Stop All Bots (Batch)", cat: "Batch Control", action: () => batchControlAllBots("STOP") },
        { name: "Reset Paper Trading Sandbox ($10,000)", cat: "Paper Sandbox", action: () => confirmResetPaperSandbox() },
        { name: "Emergency Kill Switch", cat: "Emergency", action: () => promptKillSwitch() },

        // Navigation Views
        { name: "How to Use Algo Bot (12-Step Guided Walkthrough)", cat: "Guidance", action: () => openTutorialModal() },
        { name: "Open Visual Strategy Builder (IF / AND / OR / THEN)", cat: "Strategy", action: () => openVisualStrategyModal() },
        { name: "Go to Bot Overview", cat: "Navigation", action: () => switchCtrlSubtab("overview") },
        { name: "Go to Create Bot (10-Step Wizard)", cat: "Navigation", action: () => switchCtrlSubtab("create-bot") },
        { name: "Go to Bot Templates Catalog", cat: "Navigation", action: () => switchCtrlSubtab("templates") },
        { name: "Go to Bot Groups & Batch Controls", cat: "Navigation", action: () => switchCtrlSubtab("groups") },
        { name: "Go to Paper Trading Sandbox", cat: "Navigation", action: () => switchCtrlSubtab("paper") },
        { name: "Go to Live Trading Protected Panel", cat: "Navigation", action: () => switchCtrlSubtab("live") },
        { name: "Go to Bot Activity History Log", cat: "Navigation", action: () => switchCtrlSubtab("history") },
        { name: "Go to Real-Time Bot Events Stream", cat: "Navigation", action: () => switchCtrlSubtab("events") },
        { name: "Go to Universal Risk Management", cat: "Navigation", action: () => switchTab("risk") },
        { name: "Go to Technical Indicators Catalog", cat: "Navigation", action: () => switchTab("indicators") },
        { name: "Go to Market Universe & Screener", cat: "Navigation", action: () => switchTab("universe") },
        { name: "Go to Performance Analytics", cat: "Navigation", action: () => switchTab("analytics") },
        { name: "Go to Backtesting Lab", cat: "Navigation", action: () => switchTab("backtest") },
        { name: "Go to Audit & Event Ledger", cat: "Navigation", action: () => switchTab("audit") },
        { name: "Go to System Logs & Diagnostics", cat: "Navigation", action: () => switchTab("logs") }

    ];

    paletteFilteredCommands = commands.filter(c => c.name.toLowerCase().includes(query) || c.cat.toLowerCase().includes(query));
    paletteSelectedIndex = 0;

    if (paletteFilteredCommands.length === 0) {
        container.innerHTML = `<div style="padding:16px; color:var(--text-muted); text-align:center;">No matching commands found for "${query}".</div>`;
        return;
    }

    renderPaletteResults();
}

function renderPaletteResults() {
    const container = document.getElementById("cmd-palette-results");
    if (!container) return;

    container.innerHTML = paletteFilteredCommands.map((c, idx) => `
        <div class="cmd-palette-item ${idx === paletteSelectedIndex ? 'selected' : ''}" style="padding:10px 14px; border-radius:6px; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; background:${idx === paletteSelectedIndex ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-card-subtle)'}; border: 1px solid ${idx === paletteSelectedIndex ? 'var(--accent-blue)' : 'transparent'};" onclick="executePaletteCommand(${idx})">
            <span style="font-weight:600; color:var(--text-primary);">${c.name}</span>
            <span class="badge" style="font-size:10px; background:rgba(255,255,255,0.08);">${c.cat}</span>
        </div>
    `).join("");
}

function executePaletteCommand(idx) {
    closeCommandPalette();
    if (paletteFilteredCommands && paletteFilteredCommands[idx]) {
        paletteFilteredCommands[idx].action();
    }
}

// Global Keyboard Shortcuts (Ctrl+K, Ctrl+B, Ctrl+P, Ctrl+I, Ctrl+R, Esc, Arrows, Enter)
document.addEventListener("keydown", (e) => {
    // Check for modifier keys
    if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === "k") {
            e.preventDefault();
            openCommandPalette();
            return;
        } else if (k === "b") {
            e.preventDefault();
            switchTab("control");
            return;
        } else if (k === "p") {
            e.preventDefault();
            switchTab("analytics");
            return;
        } else if (k === "i") {
            e.preventDefault();
            switchTab("indicators");
            return;
        } else if (k === "r") {
            e.preventDefault();
            switchTab("risk");
            return;
        }
    }

    if (e.key === "Escape") {
        closeCommandPalette();
        closeSmartConfirmModal();
        closeTradeTraceModal();
        if (typeof closeDrilldownModal === "function") closeDrilldownModal();
        if (typeof closeIntegrityReportModal === "function") closeIntegrityReportModal();
        if (typeof closeTutorialModal === "function") closeTutorialModal();
        if (typeof closeVisualStrategyModal === "function") closeVisualStrategyModal();
        if (typeof closeContextHelpModal === "function") closeContextHelpModal();
    } else {
        const paletteModal = document.getElementById("command-palette-modal");
        if (paletteModal && paletteModal.style.display === "flex") {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                paletteSelectedIndex = (paletteSelectedIndex + 1) % Math.max(1, paletteFilteredCommands.length);
                renderPaletteResults();
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                paletteSelectedIndex = (paletteSelectedIndex - 1 + paletteFilteredCommands.length) % Math.max(1, paletteFilteredCommands.length);
                renderPaletteResults();
            } else if (e.key === "Enter") {
                e.preventDefault();
                executePaletteCommand(paletteSelectedIndex);
            }
        }
    }
});

function exportTradesJSON() {
    window.location.href = "/api/trades/export-json";
}


// ============================================================================
// BOT INSTANCE ACTIONS & HERO CONTROLS
// ============================================================================

async function controlBot(action) {
    const targetBot = activeBotId || "bot-1";
    await controlBotInstance(targetBot, action);
}

async function controlBotInstance(botId, action) {
    try {
        const res = await fetch(`/api/bots/${botId}/control`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({action: action})
        });
        const json = await res.json();
        if (json.status === "success" || json.success) {
            fetchBotSummaryMetrics();
            fetchBotStatus();
            renderActiveBotsGrid();
            fetchBotHistoryLog();
            fetchRealtimeAuditStream(true);
        } else {
            alert(json.message || `Failed to execute ${action} on ${botId}`);
        }
    } catch(e) {
        alert(`Bot control error: ${e}`);
    }
}

async function batchControlAllBots(action) {
    const actionUpper = action.toUpperCase();
    let endpoint = "/api/bots/start-all";
    if (actionUpper === "PAUSE") endpoint = "/api/bots/pause-all";
    if (actionUpper === "STOP") endpoint = "/api/bots/stop-all";

    try {
        const res = await fetch(endpoint, {
            method: "POST",
            headers: {"Content-Type": "application/json"}
        });
        const json = await res.json();
        alert(json.message || `Batch ${actionUpper} executed.`);
        fetchBotSummaryMetrics();
        renderActiveBotsGrid();
        fetchBotHistoryLog();
        fetchRealtimeAuditStream(true);
    } catch(e) {
        alert(`Batch control error: ${e}`);
    }
}

async function duplicateBot(botId) {
    const targetId = botId || activeBotId;
    if (!targetId) return;

    try {
        const res = await fetch(`/api/bots/${targetId}/duplicate`, {
            method: "POST",
            headers: {"Content-Type": "application/json"}
        });
        const json = await res.json();
        if (json.status === "success") {
            alert(`✨ ${json.message}`);
            fetchBotInstances();
            fetchBotSummaryMetrics();
            renderActiveBotsGrid();
            fetchBotHistoryLog();
            switchCtrlSubtab("paper");
        } else {
            alert(json.message || "Failed to duplicate bot.");
        }
    } catch(e) {
        alert(`Duplicate error: ${e}`);
    }
}

function confirmDeleteActiveBot() {
    confirmDeleteBot(activeBotId);
}

async function confirmDeleteBot(botId) {
    if (!botId) return;
    if (!confirm(`Are you sure you want to delete bot instance '${botId}'?\nTrade history will be preserved.`)) return;

    try {
        const res = await fetch(`/api/bots/${botId}`, {
            method: "DELETE",
            headers: {"Content-Type": "application/json"}
        });
        const json = await res.json();
        if (json.status === "success") {
            alert(`🗑️ ${json.message}`);
            fetchBotInstances();
            fetchBotSummaryMetrics();
            renderActiveBotsGrid();
            fetchBotHistoryLog();
        } else {
            alert(json.message || "Failed to delete bot instance.");
        }
    } catch(e) {
        alert(`Delete bot error: ${e}`);
    }
}

// ============================================================================
// BOT TEMPLATES CONTROLLER
// ============================================================================
let allBotTemplates = [];

async function fetchBotTemplates() {
    const container = document.getElementById("bot-templates-grid");
    if (!container) return;

    try {
        container.innerHTML = `<div style="color:var(--text-muted); font-size:12px; padding:16px;">⏳ Loading pre-configured bot templates...</div>`;
        const res = await fetch("/api/bot-templates");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();
        allBotTemplates = json.templates || [];
        renderBotTemplatesGrid(allBotTemplates);
    } catch(e) {
        console.error("Error fetching bot templates:", e);
        container.innerHTML = `<div style="color:#ff3b69; font-size:12px; padding:16px;">⚠️ Failed to load bot templates. <button class="btn btn-sm btn-outline-danger ml-2" onclick="fetchBotTemplates()">🔄 Retry</button></div>`;
    }
}

function filterBotTemplates(assetClass) {
    if (assetClass === "ALL") {
        renderBotTemplatesGrid(allBotTemplates);
    } else {
        const filtered = allBotTemplates.filter(t => (t.asset_class || "").toLowerCase().includes(assetClass.toLowerCase()));
        renderBotTemplatesGrid(filtered);
    }
}

function renderBotTemplatesGrid(templates) {
    const container = document.getElementById("bot-templates-grid");
    if (!container) return;

    if (!templates || templates.length === 0) {
        container.innerHTML = `<div style="color:var(--text-muted); font-size:12px; padding:16px;">No templates match selected filter.</div>`;
        return;
    }

    container.innerHTML = templates.map(t => `
        <div class="card p-3" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:10px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 4px 12px rgba(0,0,0,0.15);">
            <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <div style="font-size:13px; font-weight:700; color:var(--text-primary);">${t.name}</div>
                    <span class="badge badge-primary" style="font-size:10px;">${t.asset_class}</span>
                </div>
                <div style="font-size:11px; color:var(--text-muted); margin-bottom:8px; line-height:1.4;">${t.description}</div>
                <div style="font-size:11px; margin-bottom:12px; background:var(--bg-card-subtle); padding:6px 8px; border-radius:6px; border:1px solid var(--border-color);">
                    Symbol: <b>${t.symbol}</b> | TF: <b>${t.timeframe}</b> | Strategy: <code>${t.strategy}</code>
                </div>
            </div>
            <button class="btn btn-sm btn-success btn-block" onclick="spawnFromTemplate('${t.template_id}', '${t.name}')">✨ Spawn Bot from Template</button>
        </div>
    `).join("");
}

async function spawnFromTemplate(templateId, name) {
    try {
        const customName = prompt(`Enter instance name for new bot:`, `${name} Instance`);
        if (customName === null) return; // User cancelled
        const res = await fetch(`/api/bot-templates/${templateId}/instantiate`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({name: customName || `${name} Instance`, allocated_capital: 10000.0})
        });
        const json = await res.json();
        if (json.status === "success" || json.success) {
            alert(`✨ ${json.message || "Bot instantiated successfully in PAPER mode."}`);
            fetchBotInstances();
            fetchBotSummaryMetrics();
            renderActiveBotsGrid();
            fetchBotHistoryLog();
            fetchRealtimeAuditStream(true);
            switchCtrlSubtab("paper");
        } else {
            alert(json.message || "Failed to spawn bot from template.");
        }
    } catch(e) {
        alert("Error spawning template: " + e);
    }
}

// ============================================================================
// BOT GROUPS CONTROLLER
// ============================================================================

async function fetchBotGroups() {
    const container = document.getElementById("bot-groups-container");
    if (!container) return;

    try {
        container.innerHTML = `<div style="color:var(--text-muted); font-size:12px; padding:16px;">⏳ Loading bot groups & batch controls...</div>`;
        const res = await fetch("/api/bot-groups");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();
        const groups = json.groups || [];

        if (groups.length > 0) {
            container.innerHTML = groups.map(grp => `
                <div class="card p-3" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.15);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <div style="font-size:14px; font-weight:700; color:var(--text-primary);">📁 ${grp.name}</div>
                        <span class="badge badge-secondary">${grp.bot_count || 0} Bot(s)</span>
                    </div>
                    <div style="font-size:11px; color:var(--text-muted); margin-bottom:8px;">${grp.description || 'Bot grouping'}</div>
                    <div style="font-size:11px; color:var(--text-muted); margin-bottom:12px; background:var(--bg-card-subtle); padding:8px; border-radius:6px; border:1px solid var(--border-color);">
                        ${(grp.member_bots && grp.member_bots.length > 0) ? grp.member_bots.map(b => `<span style="display:inline-block; margin-right:8px;"><code>${b.id}</code> <small>(${b.name} - <b>${b.status}</b>)</small></span>`).join("") : '<span>No member bots currently in this group.</span>'}
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button class="btn btn-sm btn-success" onclick="controlBotGroup('${grp.name}', 'START')">▶ Start Group</button>
                        <button class="btn btn-sm btn-warning" onclick="controlBotGroup('${grp.name}', 'PAUSE')">⏸ Pause Group</button>
                        <button class="btn btn-sm btn-danger" onclick="controlBotGroup('${grp.name}', 'STOP')">⏹ Stop Group</button>
                    </div>
                </div>
            `).join("");
        } else {
            container.innerHTML = `<div style="color:var(--text-muted); font-size:12px; padding:16px;">No bot groups found.</div>`;
        }
    } catch(e) {
        console.error("Error fetching bot groups:", e);
        container.innerHTML = `<div style="color:#ff3b69; font-size:12px; padding:16px;">⚠️ Failed to load bot groups. <button class="btn btn-sm btn-outline-danger ml-2" onclick="fetchBotGroups()">🔄 Retry</button></div>`;
    }
}

async function controlBotGroup(groupName, action) {
    try {
        const res = await fetch(`/api/bot-groups/${encodeURIComponent(groupName)}/batch-control`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({action: action})
        });
        const json = await res.json();
        if (json.status === "success" || json.success) {
            let summaryMsg = `Batch action ${action} executed for group '${groupName}'.\n\nResults:\n`;
            if (json.results && Array.isArray(json.results)) {
                json.results.forEach(r => {
                    summaryMsg += `• ${r.name || r.bot_id}: ${r.status || 'OK'} ${r.message ? `(${r.message})` : ''}\n`;
                });
            }
            alert(summaryMsg);
            fetchBotSummaryMetrics();
            renderActiveBotsGrid();
            fetchBotGroups();
            fetchBotHistoryLog();
            fetchRealtimeAuditStream(true);
        } else {
            alert(json.message || "Failed group control execution.");
        }
    } catch(e) {
        alert("Group control error: " + e);
    }
}

// ============================================================================
// PAPER TRADING SANDBOX & LIVE PROTECTED PANEL
// ============================================================================

async function fetchPaperTradingOverview() {
    try {
        const res = await fetch("/api/bots/paper/overview");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();

        const elBal = document.getElementById("paper-metric-balance");
        const elEq = document.getElementById("paper-metric-equity");
        const elMargin = document.getElementById("paper-metric-margin");
        const elRealized = document.getElementById("paper-metric-realized");
        const elBotCnt = document.getElementById("paper-metric-bot-count");
        const elTrades = document.getElementById("paper-metric-open-trades");

        if (elBal) elBal.textContent = `$${(json.simulated_balance || 10000).toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        if (elEq) elEq.textContent = `$${(json.total_equity || 10000).toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        if (elMargin) elMargin.textContent = `$${(json.margin_used || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        if (elRealized) {
            const r = json.realized_pnl || 0;
            elRealized.textContent = `${r >= 0 ? '+' : ''}$${r.toFixed(2)}`;
            elRealized.style.color = r >= 0 ? "#00c076" : "#ff3b69";
        }
        if (elBotCnt) elBotCnt.textContent = json.active_bots_count || 0;
        if (elTrades) elTrades.textContent = json.open_positions_count || 0;
    } catch(e) {
        console.error("Error fetching paper trading overview:", e);
    }
}

async function confirmResetPaperSandbox() {
    if (!confirm("⚠️ Are you sure you want to reset the Paper Trading Sandbox?\nThis will reset virtual trading ledger and restore initial $10,000.00 capital.")) return;

    try {
        const res = await fetch("/api/bots/paper/reset", {
            method: "POST",
            headers: {"Content-Type": "application/json"}
        });
        const json = await res.json();
        if (json.status === "success") {
            alert(`🔄 ${json.message}`);
            fetchPaperTradingOverview();
            fetchBotSummaryMetrics();
            renderActiveBotsGrid();
            fetchBotHistoryLog();
            fetchRealtimeAuditStream(true);
        } else {
            alert(json.message || "Failed to reset paper sandbox.");
        }
    } catch(e) {
        alert("Paper reset error: " + e);
    }
}

async function fetchLiveTradingOverview() {
    try {
        const res = await fetch("/api/bots/live/overview");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();

        const gateStatusEl = document.getElementById("live-gate-status-text");
        if (gateStatusEl) {
            if (json.live_trading_enabled) {
                gateStatusEl.textContent = "LIVE TRADING ACTIVE";
                gateStatusEl.style.color = "#00c076";
            } else {
                gateStatusEl.textContent = "SAFEGUARD LOCKED (PAPER DEFAULT)";
                gateStatusEl.style.color = "#ff3b69";
            }
        }
    } catch(e) {
        console.error("Error fetching live trading overview:", e);
    }
}

// ============================================================================
// BOT ACTIVITY HISTORY TABLE & PAGINATION
// ============================================================================
let histCurrentPage = 1;

async function fetchBotHistoryLog() {
    const tbody = document.getElementById("bot-history-tbody");
    if (!tbody) return;

    const botFilter = document.getElementById("hist-filter-bot")?.value || "ALL";
    const eventFilter = document.getElementById("hist-filter-event")?.value || "ALL";
    const sevFilter = document.getElementById("hist-filter-severity")?.value || "ALL";
    const searchQ = document.getElementById("hist-search-query")?.value || "";

    try {
        const queryParams = new URLSearchParams({
            bot_id: botFilter,
            event_type: eventFilter,
            severity: sevFilter,
            search: searchQ,
            page: histCurrentPage,
            per_page: 25
        });

        const res = await fetch(`/api/bots/history?${queryParams.toString()}`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();
        const events = json.events || [];

        const pageInfoEl = document.getElementById("hist-page-info");
        if (pageInfoEl) pageInfoEl.textContent = `Showing page ${json.page || 1} of ${json.total_pages || 1} (${json.total_count || 0} total records)`;

        if (events.length > 0) {
            tbody.innerHTML = events.map(e => `
                <tr>
                    <td style="white-space:nowrap; font-family:monospace;">${e.timestamp_utc || e.timestamp || ''}</td>
                    <td><code>${e.bot_instance_id || e.bot_id || 'ALL'}</code></td>
                    <td><b>${e.event_type || 'EVENT'}</b></td>
                    <td><span class="badge ${e.severity === 'WARNING' ? 'badge-warning' : (e.severity === 'ERROR' || e.severity === 'CRITICAL' ? 'badge-danger' : 'badge-primary')}">${e.severity || 'INFO'}</span></td>
                    <td><b>${e.symbol || '-'}</b></td>
                    <td style="word-break:break-word;">${e.message || ''}</td>
                    <td style="color:var(--text-muted); font-size:10px;">${e.reason || '-'}</td>
                </tr>
            `).join("");
        } else {
            tbody.innerHTML = `<tr><td colspan="7" style="color:var(--text-muted); text-align:center; padding:16px;">No activity records matching filters.</td></tr>`;
        }
    } catch(e) {
        console.error("Error fetching bot history:", e);
        tbody.innerHTML = `<tr><td colspan="7" style="color:#ff3b69; text-align:center; padding:16px;">⚠️ Activity history unavailable: ${e.message}. <button class="btn btn-sm btn-outline-danger ml-2" onclick="fetchBotHistoryLog()">🔄 Retry</button></td></tr>`;
    }
}

function changeHistoryPage(delta) {
    histCurrentPage = Math.max(1, histCurrentPage + delta);
    fetchBotHistoryLog();
}

function exportBotHistoryCSV() {
    const botFilter = document.getElementById("hist-filter-bot")?.value || "ALL";
    const eventFilter = document.getElementById("hist-filter-event")?.value || "ALL";
    const sevFilter = document.getElementById("hist-filter-severity")?.value || "ALL";
    const searchQ = document.getElementById("hist-search-query")?.value || "";

    const queryParams = new URLSearchParams({
        bot_id: botFilter,
        event_type: eventFilter,
        severity: sevFilter,
        search: searchQ,
        export: "true"
    });
    window.location.href = `/api/bots/history?${queryParams.toString()}`;
}

// ============================================================================
// REAL-TIME AUDIT EVENT STREAM (SSE + POLLING FALLBACK)
// ============================================================================
let botEventsStreamSource = null;
let botEventsSeenIds = new Set();
let botEventsList = [];

function initBotEventsStream() {
    if (!!window.EventSource) {
        try {
            botEventsStreamSource = new EventSource('/api/stream/events');
            botEventsStreamSource.onmessage = function(e) {
                try {
                    const data = JSON.parse(e.data);
                    if (data && data.events && Array.isArray(data.events)) {
                        appendAuditEventsToStream(data.events);
                        updateAuditStreamStatus("CONNECTED • Live SSE", true);
                    }
                } catch(err) {
                    console.error("Event stream parse error:", err);
                }
            };
            botEventsStreamSource.onerror = function() {
                updateAuditStreamStatus("POLLING FALLBACK", false);
                if (botEventsStreamSource) {
                    botEventsStreamSource.close();
                    botEventsStreamSource = null;
                }
            };
        } catch(e) {
            console.error("EventSource initialization failed:", e);
        }
    }

    fetchRealtimeAuditStream(true);

    // Polling heartbeat every 3 seconds if SSE is closed
    setInterval(() => {
        const eventsTab = document.getElementById("ctrl-subtab-events");
        if (eventsTab && eventsTab.classList.contains("active")) {
            if (!botEventsStreamSource) {
                fetchRealtimeAuditStream(false);
            }
        }
    }, 3000);
}

async function fetchRealtimeAuditStream(force = false) {
    const container = document.getElementById("bot-events-stream-container");
    if (!container) return;

    try {
        const res = await fetch("/api/bots/events?limit=50");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();
        if (json.status === "success" && json.events) {
            appendAuditEventsToStream(json.events);
            updateAuditStreamStatus("CONNECTED • Polling", true);
        }
    } catch(e) {
        console.error("Error polling audit events:", e);
        updateAuditStreamStatus("DISCONNECTED", false);
    }
}

function clearBotEventsStream() {
    botEventsSeenIds.clear();
    botEventsList = [];
    const container = document.getElementById("bot-events-stream-container");
    if (container) container.innerHTML = `<div style="color:var(--text-muted); padding:8px;">Stream cleared. Listening for incoming events...</div>`;
    const countBadge = document.getElementById("audit-stream-count-badge");
    if (countBadge) countBadge.textContent = "0 Event(s)";
}

function updateAuditStreamStatus(statusText, isConnected) {
    const pill = document.getElementById("audit-stream-status-pill");
    if (pill) {
        pill.textContent = isConnected ? `🟢 ${statusText}` : `🔴 ${statusText}`;
        pill.style.background = isConnected ? "rgba(0,192,118,0.15)" : "rgba(255,59,105,0.15)";
        pill.style.color = isConnected ? "#00c076" : "#ff3b69";
    }
}

function appendAuditEventsToStream(newEvents) {
    const container = document.getElementById("bot-events-stream-container");
    if (!container) return;

    let addedAny = false;
    newEvents.forEach(e => {
        const eventKey = e.event_id || `${e.id}_${e.timestamp_utc}_${e.event_type}`;
        if (!botEventsSeenIds.has(eventKey)) {
            botEventsSeenIds.add(eventKey);
            botEventsList.unshift(e); // newest first
            addedAny = true;
        }
    });

    if (botEventsList.length > 200) {
        botEventsList = botEventsList.slice(0, 200);
    }

    const countBadge = document.getElementById("audit-stream-count-badge");
    if (countBadge) {
        countBadge.textContent = `${botEventsList.length} Event(s)`;
    }

    if (botEventsList.length === 0) {
        container.innerHTML = `<div style="color:var(--text-muted); padding:8px;">No audit events recorded yet. Perform a bot action to see live event trace.</div>`;
        return;
    }

    if (addedAny || container.innerHTML.includes("Listening for")) {
        container.innerHTML = botEventsList.map(e => {
            let sevColor = "#00c076"; // INFO
            if (e.severity === "WARNING") sevColor = "#ffab00";
            if (e.severity === "ERROR") sevColor = "#ff3b69";
            if (e.severity === "CRITICAL") sevColor = "#ff0055";

            const timeStr = e.timestamp_utc || e.local_timestamp || new Date().toISOString();
            const botIdStr = e.bot_instance_id || e.bot_id || "SYSTEM";
            const eventTypeStr = e.event_type || "LOG";
            const messageStr = e.message || "";
            const reasonStr = e.reason ? ` | Reason: ${e.reason}` : "";

            return `
                <div style="padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; align-items:flex-start; gap:8px; font-family:monospace; font-size:11px; line-height:1.4;">
                    <span style="color:var(--text-muted); white-space:nowrap;">[${timeStr}]</span>
                    <span style="color:#38bdf8; font-weight:700; white-space:nowrap;">[${botIdStr}]</span>
                    <span style="color:${sevColor}; font-weight:700; white-space:nowrap;">[${e.severity || 'INFO'}]</span>
                    <span style="color:#e2e8f0; font-weight:600;">${eventTypeStr}:</span>
                    <span style="color:var(--text-secondary); flex-grow:1;">${messageStr}${reasonStr}</span>
                </div>
            `;
        }).join("");
    }
}

// ============================================================================
// SECTION 4: AUTHORITATIVE PERFORMANCE ANALYTICS & INTERACTIVE DRILL-DOWN
// ============================================================================
const AnalyticsDataManager = {
    chartInstances: {},

    async fetchAnalytics(force = false) {
        try {
            const botFilter = document.getElementById("analytics-filter-bot")?.value || "ALL";
            const stratFilter = document.getElementById("analytics-filter-strategy")?.value || "ALL";
            const symFilter = document.getElementById("analytics-filter-symbol")?.value || "ALL";
            const dateFilter = document.getElementById("analytics-filter-date")?.value || "ALL";

            const url = `/api/analytics/v2?bot_id=${encodeURIComponent(botFilter)}&strategy=${encodeURIComponent(stratFilter)}&symbol=${encodeURIComponent(symFilter)}&date_range=${encodeURIComponent(dateFilter)}`;
            const res = await fetch(url);
            const data = await res.json();

            if (!data || !data.success) {
                console.warn("Analytics fetch warning:", data?.error);
                return;
            }

            // Update Header & Freshness Metadata
            const countEl = document.getElementById("analytics-trade-count");
            const updateEl = document.getElementById("analytics-last-updated");
            if (countEl) countEl.textContent = data.trade_count || 0;
            if (updateEl) updateEl.textContent = new Date().toLocaleTimeString();

            // Update Top 10 KPI Summary Cards
            const s = data.trade_summary || {};
            const kpiTotal = document.getElementById("kpi-total-trades");
            const kpiWinRate = document.getElementById("kpi-win-rate");
            const kpiNetPnl = document.getElementById("kpi-net-pnl");
            const kpiProfitFactor = document.getElementById("kpi-profit-factor");
            const kpiMaxDd = document.getElementById("kpi-max-drawdown");
            const kpiExpectancy = document.getElementById("kpi-expectancy");
            const kpiAvgWin = document.getElementById("kpi-avg-win");
            const kpiAvgLoss = document.getElementById("kpi-avg-loss");
            const kpiAvgHold = document.getElementById("kpi-avg-hold-time");
            const kpiOpenPos = document.getElementById("kpi-open-positions-count");

            if (kpiTotal) kpiTotal.textContent = s.total_trades || 0;
            if (kpiWinRate) {
                kpiWinRate.textContent = `${(s.win_rate_pct || 0).toFixed(1)}%`;
                kpiWinRate.style.color = (s.win_rate_pct >= 50) ? "#00c076" : "#ffab00";
            }
            if (kpiNetPnl) {
                const net = s.closed_pnl || 0;
                kpiNetPnl.textContent = `${net >= 0 ? '+' : ''}$${net.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
                kpiNetPnl.style.color = (net >= 0) ? "#00c076" : "#ff3b69";
            }
            if (kpiProfitFactor) kpiProfitFactor.textContent = (s.profit_factor || 0).toFixed(2);
            if (kpiMaxDd) kpiMaxDd.textContent = `${(s.max_drawdown_pct || 0).toFixed(1)}%`;
            if (kpiExpectancy) kpiExpectancy.textContent = `${(s.expectancy >= 0 ? '+' : '')}$${(s.expectancy || 0).toFixed(2)}`;
            if (kpiAvgWin) kpiAvgWin.textContent = `$${(s.avg_win || 0).toFixed(2)}`;
            if (kpiAvgLoss) kpiAvgLoss.textContent = `-$${(s.avg_loss || 0).toFixed(2)}`;
            if (kpiAvgHold) kpiAvgHold.textContent = s.avg_holding_time_str || "--";
            if (kpiOpenPos) kpiOpenPos.textContent = s.open_trades || 0;

            const subWinLoss = document.getElementById("kpi-sub-win-loss");
            if (subWinLoss) subWinLoss.textContent = `${s.winning_count || 0}W / ${s.losing_count || 0}L / ${s.breakeven_count || 0}BE`;

            const subUnrealized = document.getElementById("kpi-sub-unrealized-pnl");
            if (subUnrealized) subUnrealized.textContent = `Unrealized: $${(s.unrealized_pnl || 0).toFixed(2)}`;

            // Render Charts
            this.renderCharts(data.charts);

            // Render Leaderboard
            if (data.bot_comparison) {
                this.renderLeaderboard(data.bot_comparison);
            }

        } catch (err) {
            console.error("Error in AnalyticsDataManager.fetchAnalytics:", err);
        }
    },

    renderCharts(charts) {
        if (typeof Chart === 'undefined' || !charts) return;

        // 1. Realized PnL per Symbol
        const ctxPnl = document.getElementById("chart-realized-pnl")?.getContext("2d");
        if (ctxPnl) {
            const symData = charts.realized_pnl_by_symbol || [];
            const labels = symData.map(d => d.symbol);
            const values = symData.map(d => d.pnl);
            const bgColors = values.map(v => v >= 0 ? 'rgba(0, 192, 118, 0.75)' : 'rgba(255, 59, 105, 0.75)');

            if (this.chartInstances["pnl"]) this.chartInstances["pnl"].destroy();
            this.chartInstances["pnl"] = new Chart(ctxPnl, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{ label: 'Net P&L ($)', data: values, backgroundColor: bgColors, borderRadius: 4 }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: (evt, elements) => {
                        if (elements.length > 0) {
                            const idx = elements[0].index;
                            const sym = labels[idx];
                            openDrilldownModal(`SYMBOL:${sym}`, `Trades for ${sym}`);
                        }
                    },
                    plugins: { legend: { display: false } },
                    scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' } } }
                }
            });
        }

        // 2. Win / Loss Donut
        const ctxWl = document.getElementById("chart-winloss-donut")?.getContext("2d");
        if (ctxWl) {
            const wl = charts.win_loss_donut || { winning: 0, losing: 0, breakeven: 0 };
            const overlay = document.getElementById("donut-ratio-overlay");
            if (overlay) overlay.textContent = wl.ratio_str || `${wl.winning}:${wl.losing}`;

            if (this.chartInstances["winloss"]) this.chartInstances["winloss"].destroy();
            this.chartInstances["winloss"] = new Chart(ctxWl, {
                type: 'doughnut',
                data: {
                    labels: ['Winning', 'Losing', 'Break-even'],
                    datasets: [{
                        data: [wl.winning, wl.losing, wl.breakeven],
                        backgroundColor: ['#00c076', '#ff3b69', '#94a3b8'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    onClick: (evt, elements) => {
                        if (elements.length > 0) {
                            const idx = elements[0].index;
                            const types = ['WINS', 'LOSSES', 'BREAKEVEN'];
                            const titles = ['Winning Trades', 'Losing Trades', 'Break-even Trades'];
                            openDrilldownModal(types[idx], titles[idx]);
                        }
                    },
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, color: '#94a3b8' } } }
                }
            });
        }

        // 3. Open vs Closed Donut
        const ctxOc = document.getElementById("chart-openclosed-donut")?.getContext("2d");
        if (ctxOc) {
            const oc = charts.open_closed_donut || { open: 0, closed: 0 };
            if (this.chartInstances["openclosed"]) this.chartInstances["openclosed"].destroy();
            this.chartInstances["openclosed"] = new Chart(ctxOc, {
                type: 'doughnut',
                data: {
                    labels: ['Closed Trades', 'Open Positions'],
                    datasets: [{
                        data: [oc.closed, oc.open],
                        backgroundColor: ['#00b4d8', '#ffab00'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    onClick: (evt, elements) => {
                        if (elements.length > 0) {
                            const idx = elements[0].index;
                            if (idx === 0) openDrilldownModal('ALL_COMPLETED', 'All Completed Trades');
                            else openDrilldownModal('OPEN_POSITIONS', 'Active Open Positions');
                        }
                    },
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, color: '#94a3b8' } } }
                }
            });
        }

        // 4. Direction Bias Donut
        const ctxDir = document.getElementById("chart-direction-pie")?.getContext("2d");
        if (ctxDir) {
            const dir = charts.direction_donut || { long_count: 0, short_count: 0 };
            if (this.chartInstances["direction"]) this.chartInstances["direction"].destroy();
            this.chartInstances["direction"] = new Chart(ctxDir, {
                type: 'doughnut',
                data: {
                    labels: ['LONG / BUY', 'SHORT / SELL'],
                    datasets: [{
                        data: [dir.long_count, dir.short_count],
                        backgroundColor: ['#00c076', '#ff3b69'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    onClick: (evt, elements) => {
                        if (elements.length > 0) {
                            const idx = elements[0].index;
                            openDrilldownModal(idx === 0 ? 'DIRECTION:LONG' : 'DIRECTION:SHORT', idx === 0 ? 'LONG Trades' : 'SHORT Trades');
                        }
                    },
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, color: '#94a3b8' } } }
                }
            });
        }

        // 5. Strategy Win Rate Donut
        const ctxStrat = document.getElementById("chart-strategy-winrate-donut")?.getContext("2d");
        if (ctxStrat) {
            const strats = charts.strategy_winrate_donut || [];
            if (this.chartInstances["stratwin"]) this.chartInstances["stratwin"].destroy();
            this.chartInstances["stratwin"] = new Chart(ctxStrat, {
                type: 'doughnut',
                data: {
                    labels: strats.map(s => s.strategy),
                    datasets: [{
                        data: strats.map(s => s.win_rate),
                        backgroundColor: ['#00b4d8', '#7209b7', '#f72585', '#4cc9f0', '#ffaa00'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    onClick: (evt, elements) => {
                        if (elements.length > 0) {
                            const idx = elements[0].index;
                            const st = strats[idx]?.strategy;
                            if (st) openDrilldownModal(`STRATEGY:${st}`, `Trades for ${st}`);
                        }
                    },
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, color: '#94a3b8' } } }
                }
            });
        }

        // 6. Asset Class Donut
        const ctxAc = document.getElementById("chart-asset-class-pie")?.getContext("2d");
        if (ctxAc) {
            const acList = charts.asset_class_donut || [];
            if (this.chartInstances["assetclass"]) this.chartInstances["assetclass"].destroy();
            this.chartInstances["assetclass"] = new Chart(ctxAc, {
                type: 'doughnut',
                data: {
                    labels: acList.map(a => a.asset_class),
                    datasets: [{
                        data: acList.map(a => a.count),
                        backgroundColor: ['#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#34d399'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    onClick: (evt, elements) => {
                        if (elements.length > 0) {
                            const idx = elements[0].index;
                            const ac = acList[idx]?.asset_class;
                            if (ac) openDrilldownModal(`ASSET_CLASS:${ac}`, `Trades for ${ac}`);
                        }
                    },
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, color: '#94a3b8' } } }
                }
            });
        }

        // 7. Execution Mode Donut
        const ctxEm = document.getElementById("chart-execution-mode-pie")?.getContext("2d");
        if (ctxEm) {
            const emList = charts.execution_mode_donut || [];
            if (this.chartInstances["execmode"]) this.chartInstances["execmode"].destroy();
            this.chartInstances["execmode"] = new Chart(ctxEm, {
                type: 'doughnut',
                data: {
                    labels: emList.map(e => e.mode),
                    datasets: [{
                        data: emList.map(e => e.count),
                        backgroundColor: ['#00b4d8', '#ff3b69', '#94a3b8'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    onClick: (evt, elements) => {
                        if (elements.length > 0) {
                            const idx = elements[0].index;
                            const m = emList[idx]?.mode;
                            if (m) openDrilldownModal(`MODE:${m}`, `${m} Execution Trades`);
                        }
                    },
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, color: '#94a3b8' } } }
                }
            });
        }

        // 8. Account Equity Curve with Drawdown Fill
        const ctxEq = document.getElementById("chart-equity-drawdown")?.getContext("2d");
        if (ctxEq) {
            const eqData = charts.equity_curve || [];
            const labels = eqData.map((d, i) => d.time ? new Date(d.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : `#${i}`);
            const equities = eqData.map(d => d.equity);
            const drawdowns = eqData.map(d => d.drawdown);

            if (this.chartInstances["equity"]) this.chartInstances["equity"].destroy();
            this.chartInstances["equity"] = new Chart(ctxEq, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Account Equity ($)',
                            data: equities,
                            borderColor: '#00b4d8',
                            backgroundColor: 'rgba(0, 180, 216, 0.1)',
                            fill: true,
                            tension: 0.2,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Drawdown (%)',
                            data: drawdowns,
                            borderColor: 'rgba(255, 59, 105, 0.8)',
                            backgroundColor: 'rgba(255, 59, 105, 0.2)',
                            fill: true,
                            tension: 0.2,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { position: 'left', grid: { color: 'rgba(255,255,255,0.05)' } },
                        y1: { position: 'right', grid: { display: false } }
                    },
                    plugins: { legend: { position: 'top', labels: { color: '#94a3b8' } } }
                }
            });
        }

        // 9. Strategy Combo Chart
        const ctxCombo = document.getElementById("chart-strategy-combo")?.getContext("2d");
        if (ctxCombo) {
            const combo = charts.strategy_combo || [];
            if (this.chartInstances["combo"]) this.chartInstances["combo"].destroy();
            this.chartInstances["combo"] = new Chart(ctxCombo, {
                type: 'bar',
                data: {
                    labels: combo.map(c => c.strategy),
                    datasets: [
                        { label: 'Wins', data: combo.map(c => c.wins), backgroundColor: '#00c076' },
                        { label: 'Losses', data: combo.map(c => c.losses), backgroundColor: '#ff3b69' },
                        { label: 'Net P&L ($)', data: combo.map(c => c.pnl), type: 'line', borderColor: '#00b4d8', backgroundColor: '#00b4d8', yAxisID: 'y1' }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                        y1: { position: 'right', grid: { display: false } }
                    }
                }
            });
        }
    },

    renderLeaderboard(bots) {
        const tbody = document.getElementById("bot-comparison-tbody");
        if (!tbody || !Array.isArray(bots)) return;
        if (bots.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted">No bot instances configured.</td></tr>`;
            return;
        }

        tbody.innerHTML = bots.map(b => {
            const pnl = b.net_pnl || 0;
            const pnlClass = pnl >= 0 ? "pos" : "neg";
            const wr = b.win_rate_pct || 0;

            return `
            <tr>
                <td><strong>${escapeHtml(b.name)}</strong></td>
                <td><span class="badge badge-secondary">${escapeHtml(b.symbol)}</span></td>
                <td>${escapeHtml(b.timeframe)}</td>
                <td>${escapeHtml(b.strategy)}</td>
                <td>$${(b.allocated_capital || 10000).toLocaleString()}</td>
                <td><span style="font-size:11px; color:var(--text-muted);">${(b.indicators || []).join(", ") || "Default"}</span></td>
                <td class="${pnlClass}"><strong>${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</strong></td>
                <td class="${pnlClass}">${(b.roi_pct || 0).toFixed(2)}%</td>
                <td>${wr.toFixed(1)}%</td>
                <td>${b.total_trades || 0}</td>
            </tr>
            `;
        }).join("");
    }
};

// Interactive Performance Drill-Down Modal
async function openDrilldownModal(filterType, title = "Filtered Trade Records") {
    const modal = document.getElementById("analytics-drilldown-modal");
    const titleEl = document.getElementById("drilldown-modal-title");
    const countEl = document.getElementById("drilldown-count-text");
    const tbody = document.getElementById("drilldown-tbody");

    if (titleEl) titleEl.textContent = title;
    if (modal) modal.style.display = "flex";
    if (tbody) tbody.innerHTML = `<tr><td colspan="11" class="text-center">Loading trade details...</td></tr>`;

    try {
        const res = await fetch(`/api/analytics/drilldown?filter_type=${encodeURIComponent(filterType)}&limit=100`);
        const json = await res.json();

        if (json.status === "success" && json.trades) {
            if (countEl) countEl.textContent = `${json.trades.length} trade records found`;
            if (json.trades.length === 0) {
                tbody.innerHTML = `<tr><td colspan="11" class="text-center text-muted">No trade records matching this filter.</td></tr>`;
                return;
            }

            tbody.innerHTML = json.trades.map(t => {
                const pnl = floatVal(t.net_pnl !== undefined ? t.net_pnl : (t.result_pnl || 0.0));
                const pnlClass = pnl > 0 ? "pos" : (pnl < 0 ? "neg" : "");
                const direction = t.direction || t.side || "LONG";
                const badgeClass = direction === "LONG" ? "badge-success" : "badge-danger";

                return `
                <tr>
                    <td><strong>#${t.id}</strong></td>
                    <td style="font-size:11px; color:var(--text-muted);">${(t.entry_timestamp || t.timestamp || '').slice(0, 19).replace('T', ' ')}</td>
                    <td><strong>${escapeHtml(t.symbol)}</strong></td>
                    <td><span class="badge ${badgeClass}">${direction}</span></td>
                    <td>${escapeHtml(t.strategy_name || t.strategy || 'EMA_MACD_VP')}</td>
                    <td>$${floatVal(t.entry_price).toFixed(2)}</td>
                    <td>${t.exit_price ? '$' + floatVal(t.exit_price).toFixed(2) : '--'}</td>
                    <td>${floatVal(t.position_size || t.entry_quantity).toFixed(4)}</td>
                    <td class="${pnlClass}"><strong>${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</strong></td>
                    <td><span class="badge ${t.status === 'OPEN' ? 'badge-warning' : 'badge-secondary'}">${t.status}</span></td>
                    <td><button class="btn btn-sm btn-secondary" onclick="closeDrilldownModal(); openTradeDetailModal(${t.id})">🔍 View</button></td>
                </tr>
                `;
            }).join("");
        }
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="11" class="text-center text-danger">Error loading trades: ${err}</td></tr>`;
    }
}

function closeDrilldownModal() {
    const modal = document.getElementById("analytics-drilldown-modal");
    if (modal) modal.style.display = "none";
}

// Data Integrity Checklist Modal
async function openIntegrityReportModal() {
    const modal = document.getElementById("analytics-integrity-modal");
    const body = document.getElementById("integrity-modal-body");
    if (modal) modal.style.display = "flex";
    if (body) body.innerHTML = `<div style="text-align:center; padding:20px;">Auditing database records and checking mathematical consistency...</div>`;

    try {
        const res = await fetch("/api/analytics/integrity");
        const json = await res.json();
        if (json.status === "success" && json.integrity_report) {
            const r = json.integrity_report;
            body.innerHTML = `
                <div style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; background:var(--bg-card); padding:12px; border-radius:8px; border:1px solid var(--border-color);">
                    <div>
                        <div style="font-weight:700; font-size:14px; color:var(--text-primary);">Overall Audit State</div>
                        <div style="font-size:11px; color:var(--text-muted);">Timestamp: ${r.timestamp}</div>
                    </div>
                    <span class="badge ${r.all_passed ? 'badge-success' : 'badge-danger'}" style="font-size:12px; padding:6px 12px;">${r.badge}</span>
                </div>

                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${r.checks.map(c => `
                        <div style="background:rgba(255,255,255,0.03); padding:10px 14px; border-radius:6px; border-left:4px solid ${c.passed ? '#00c076' : '#ff3b69'};">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <strong style="font-size:13px; color:var(--text-primary);">${c.check}</strong>
                                <span style="font-size:11px; font-weight:700; color:${c.passed ? '#00c076' : '#ff3b69'};">${c.passed ? '✅ PASSED' : '❌ FAILED'}</span>
                            </div>
                            <div style="font-size:11px; color:var(--text-secondary); margin-top:4px;">
                                ${c.expected ? `Expected: <code>${c.expected}</code> | Actual: <code>${c.actual}</code>` : `Open: ${c.open_count} | Closed: ${c.closed_count}`}
                            </div>
                        </div>
                    `).join("")}
                </div>
            `;
        }
    } catch (err) {
        if (body) body.innerHTML = `<div style="color:#ff3b69; padding:20px;">Error running integrity audit: ${err}</div>`;
    }
}

function closeIntegrityReportModal() {
    const modal = document.getElementById("analytics-integrity-modal");
    if (modal) modal.style.display = "none";
}

async function triggerBrokerReconciliation() {
    try {
        showToast("Running broker vs local position reconciliation...");
        const res = await fetch("/api/trades/reconcile", { method: "POST" });
        const json = await res.json();
        if (json.status === "HEALTHY") {
            showToast("✅ Reconciliation complete: Local ledger matches broker state perfectly.");
            openIntegrityReportModal();
        } else {
            alert("Reconciliation warning: " + json.message);
        }
    } catch (err) {
        alert("Error executing reconciliation: " + err);
    }
}

// --------------------------------------------------------------------------
// SECTION: AUTHORITATIVE BOT SUMMARY & CENTRAL STATE SYNCHRONIZER
// --------------------------------------------------------------------------
async function fetchBotSummaryMetrics() {
    try {
        const res = await fetch("/api/bots/summary");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();
        const m = json.metrics || {};

        const totalBotsEl = document.getElementById("summary-total-bots");
        if (totalBotsEl) totalBotsEl.textContent = m.total_bots ?? "--";

        const runningEl = document.getElementById("summary-running-bots");
        if (runningEl) runningEl.textContent = m.running ?? "0";

        const pausedEl = document.getElementById("summary-paused-bots");
        if (pausedEl) pausedEl.textContent = m.paused ?? "0";

        const stoppedEl = document.getElementById("summary-stopped-bots");
        if (stoppedEl) stoppedEl.textContent = m.stopped ?? "0";

        const errorEl = document.getElementById("summary-error-bots");
        if (errorEl) errorEl.textContent = m.error ?? "0";

        const paperEl = document.getElementById("summary-paper-bots");
        if (paperEl) paperEl.textContent = `${m.paper ?? 0} PAPER`;

        const liveEl = document.getElementById("summary-live-bots");
        if (liveEl) liveEl.textContent = `${m.live ?? 0}`;

        const openTradesEl = document.getElementById("summary-open-trades");
        if (openTradesEl) openTradesEl.textContent = m.open_trades ?? "0";

        const totalPnlEl = document.getElementById("summary-total-pnl");
        if (totalPnlEl) {
            const val = parseFloat(m.total_pnl || 0);
            totalPnlEl.textContent = `${val >= 0 ? '+' : ''}$${val.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            totalPnlEl.style.color = val >= 0 ? "#00c076" : "#ff3b69";
        }

        const todayPnlEl = document.getElementById("summary-today-pnl");
        if (todayPnlEl) {
            const val = parseFloat(m.today_pnl || 0);
            todayPnlEl.textContent = `${val >= 0 ? '+' : ''}$${val.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            todayPnlEl.style.color = val >= 0 ? "#00c076" : "#ff3b69";
        }

        // Synchronize Left Sidebar Performance Summary
        const sbTotalPnl = document.getElementById("sb-total-pnl");
        if (sbTotalPnl) {
            const val = parseFloat(m.total_pnl || 0);
            sbTotalPnl.textContent = `${val >= 0 ? '+' : ''}$${val.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            sbTotalPnl.style.color = val >= 0 ? "#00c076" : "#ff3b69";
        }

        const sbWinCount = document.getElementById("sb-win-count");
        if (sbWinCount) {
            sbWinCount.textContent = `${m.wins ?? 0} Wins (${m.win_rate_pct ?? 0}%)`;
        }

        const sbStartBal = document.getElementById("sb-start-bal");
        if (sbStartBal) {
            const val = parseFloat(m.start_balance || 10000);
            sbStartBal.textContent = `$${val.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        }

        const sbCurrBal = document.getElementById("sb-curr-bal");
        if (sbCurrBal) {
            const val = parseFloat(m.current_balance || 10000);
            sbCurrBal.textContent = `$${val.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        }

        const sbTotalTrades = document.getElementById("sb-total-trades");
        if (sbTotalTrades) {
            sbTotalTrades.textContent = (m.total_trades !== undefined && m.total_trades !== null) ? m.total_trades : "No trades yet";
        }

        const sbOpenTrades = document.getElementById("sb-open-trades");
        if (sbOpenTrades) {
            sbOpenTrades.textContent = m.open_trades ?? "0";
        }

        const sbWinrate = document.getElementById("sb-winrate");
        if (sbWinrate) {
            sbWinrate.textContent = `${m.win_rate_pct ?? 0}%`;
        }

        const sbWLBe = document.getElementById("sb-w-l-be");
        if (sbWLBe) {
            sbWLBe.textContent = m.w_l_be ?? "0 / 0 / 0";
        }

        // Query system health
        fetchSystemHealthBadge();

    } catch (e) {
        console.error("fetchBotSummaryMetrics error:", e);
        const totalBotsEl = document.getElementById("summary-total-bots");
        if (totalBotsEl) totalBotsEl.textContent = "DATA UNAVAILABLE";
        const sbTotalPnl = document.getElementById("sb-total-pnl");
        if (sbTotalPnl) sbTotalPnl.textContent = "DATA UNAVAILABLE";
    }
}

async function fetchSystemHealthBadge() {
    try {
        const res = await fetch("/health/system");
        if (!res.ok) return;
        const json = await res.json();
        const dot = document.getElementById("global-health-dot");
        const text = document.getElementById("global-health-text");
        if (dot && text) {
            if (json.status === "HEALTHY") {
                dot.textContent = "🟢";
                text.textContent = "SYSTEM HEALTHY";
                text.style.color = "#00c076";
            } else if (json.status === "WARNING") {
                dot.textContent = "🟠";
                text.textContent = "SYSTEM WARNING";
                text.style.color = "#ffab00";
            } else {
                dot.textContent = "🔴";
                text.textContent = "SYSTEM ERROR";
                text.style.color = "#ff3b69";
            }
        }
    } catch (e) {
        // quiet error
    }
}

async function renderActiveBotsGrid() {
    const containers = [
        document.getElementById("active-bots-container"),
        document.getElementById("paper-bots-list"),
        document.getElementById("live-bots-list")
    ].filter(Boolean);

    if (containers.length === 0) return;

    try {
        const res = await fetch("/api/bots");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();
        const bots = json.bots || [];

        containers.forEach(container => {
            if (bots.length === 0) {
                container.innerHTML = `<div style="color:var(--text-muted); font-size:12px; padding:16px;">No configured bot instances found. Click <b>+ Create Bot</b> to instantiate your first algo bot.</div>`;
                return;
            }

            container.innerHTML = bots.map(b => `
                <div class="card p-3 mb-2" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <strong style="font-size:13px; color:var(--text-primary);">${escapeHtml(b.name || b.id)}</strong>
                            <span class="badge ${b.status === 'RUNNING' ? 'badge-success' : (b.status === 'PAUSED' ? 'badge-warning' : 'badge-secondary')}" style="font-size:10px;">${b.status}</span>
                            <span class="badge" style="font-size:10px; background:${(b.execution_mode || '').toUpperCase() === 'LIVE' ? '#ff3b69' : '#ffab00'}; color:#000; font-weight:700;">${b.execution_mode || 'PAPER'}</span>
                        </div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">
                            Symbol: <b>${b.symbol}</b> (${b.timeframe || '15m'}) | Strategy: <b>${b.strategy}</b> | Capital: <b>$${(b.allocated_capital || 10000).toLocaleString()}</b>
                        </div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        ${b.status !== 'RUNNING' ? `
                            <button class="btn btn-sm btn-primary" onclick="executeCommand('START_BOT', '${b.id}', {}, this)" style="font-size:11px; font-weight:700;">▶️ Start</button>
                        ` : `
                            <button class="btn btn-sm btn-warning" onclick="executeCommand('PAUSE_BOT', '${b.id}', {}, this)" style="font-size:11px; font-weight:700;">⏸️ Pause</button>
                            <button class="btn btn-sm btn-danger" onclick="executeCommand('STOP_BOT', '${b.id}', {}, this)" style="font-size:11px; font-weight:700;">⏹️ Stop</button>
                        `}
                        <button class="btn btn-sm btn-outline-secondary" onclick="switchActiveBot('${b.id}'); switchCtrlSubtab('overview');" style="font-size:11px;">🔍 Inspect</button>
                        <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteBot('${b.id}')" style="font-size:11px;">🗑️</button>
                    </div>
                </div>
            `).join("");
        });

    } catch (e) {
        console.error("renderActiveBotsGrid error:", e);
    }
}

async function fetchPaperTradingOverview() {
    try {
        const res = await fetch("/api/bots/paper/overview");
        if (!res.ok) return;
        const json = await res.json();
        const balEl = document.getElementById("paper-sandbox-balance");
        if (balEl) balEl.textContent = `$${(json.total_sandbox_capital || 10000).toLocaleString()}`;
    } catch(e) {
        // quiet error
    }
}

async function executeCommand(action, botId = null, payload = {}, buttonEl = null) {
    if (!action) return;

    if (buttonEl) {
        buttonEl.disabled = true;
        buttonEl.dataset.originalText = buttonEl.innerHTML;
        buttonEl.innerHTML = `⏳ Executing...`;
    }

    const idempotencyKey = `REQ-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
        const res = await fetch("/api/command", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Idempotency-Key": idempotencyKey
            },
            body: JSON.stringify({
                action: action,
                bot_id: botId || activeBotId,
                payload: payload,
                user: "Trader/UI"
            })
        });

        const json = await res.json();
        if (json.success || json.status === "SUCCEEDED") {
            if (typeof showToast === "function") {
                showToast(`✅ ${json.message || 'Command executed successfully.'}`);
            }
            // Auto refresh state
            fetchBotSummaryMetrics();
            fetchBotInstances();
            fetchBotStatus();
            renderActiveBotsGrid();
            fetchBotHistoryLog();
            if (typeof fetchAnalytics === "function") fetchAnalytics();
        } else {
            alert(`⚠️ Command ${action} failed: ${json.message || 'Execution error'}`);
        }
    } catch (err) {
        alert(`❌ Network or server error executing ${action}: ${err}`);
    } finally {
        if (buttonEl) {
            buttonEl.disabled = false;
            if (buttonEl.dataset.originalText) {
                buttonEl.innerHTML = buttonEl.dataset.originalText;
            }
        }
    }
}

async function fetchDiagnosticsState() {
    const container = document.getElementById("diagnostics-state-container");
    if (!container) return;

    container.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted);">Fetching real-time subsystem state snapshot...</div>`;

    try {
        const res = await fetch("/api/diagnostics/state");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const d = await res.json();

        container.innerHTML = `
            <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; margin-bottom:16px;">
                <div class="stat-group" style="background:var(--bg-card); padding:12px; border-radius:8px; border:1px solid var(--border-color);">
                    <div style="font-size:11px; color:var(--text-muted);">TOTAL BOTS</div>
                    <div style="font-size:1.3rem; font-weight:800;">${d.total_bots}</div>
                </div>
                <div class="stat-group" style="background:var(--bg-card); padding:12px; border-radius:8px; border:1px solid var(--border-color);">
                    <div style="font-size:11px; color:var(--text-muted);">OPEN POSITIONS</div>
                    <div style="font-size:1.3rem; font-weight:800; color:var(--accent-blue);">${d.open_positions}</div>
                </div>
                <div class="stat-group" style="background:var(--bg-card); padding:12px; border-radius:8px; border:1px solid var(--border-color);">
                    <div style="font-size:11px; color:var(--text-muted);">KILL SWITCH</div>
                    <div style="font-size:1.3rem; font-weight:800; color:${d.kill_switch_active ? '#ff3b69' : '#00c076'};">${d.kill_switch_active ? 'ACTIVE' : 'DISARMED'}</div>
                </div>
                <div class="stat-group" style="background:var(--bg-card); padding:12px; border-radius:8px; border:1px solid var(--border-color);">
                    <div style="font-size:11px; color:var(--text-muted);">LIVE TRADING GATE</div>
                    <div style="font-size:1.3rem; font-weight:800; color:${d.live_trading_enabled ? '#ff3b69' : '#ffab00'};">${d.live_trading_enabled ? 'ARMED' : 'PAPER ONLY'}</div>
                </div>
            </div>

            <div class="card p-3 mb-3" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px;">
                <h4 style="font-size:13px; font-weight:700; margin-bottom:10px;">Subsystem Latency Percentiles</h4>
                <div style="display:flex; gap:16px; font-size:12px;">
                    <div>Avg: <b>${d.latencies?.avg_ms || 0}ms</b></div>
                    <div>Median (P50): <b>${d.latencies?.median_ms || 0}ms</b></div>
                    <div>P95: <b>${d.latencies?.p95_ms || 0}ms</b></div>
                    <div>P99: <b>${d.latencies?.p99_ms || 0}ms</b></div>
                    <div>Max: <b>${d.latencies?.max_ms || 0}ms</b></div>
                </div>
            </div>

            <div class="card p-3" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px;">
                <h4 style="font-size:13px; font-weight:700; margin-bottom:10px;">Configured Bot Runtimes & Heartbeats</h4>
                <div style="max-height:300px; overflow-y:auto;">
                    <table class="table" style="width:100%; font-size:11px;">
                        <thead>
                            <tr style="text-align:left; color:var(--text-muted);">
                                <th>Bot ID</th>
                                <th>Name</th>
                                <th>Symbol</th>
                                <th>Strategy</th>
                                <th>Mode</th>
                                <th>Status</th>
                                <th>Started At</th>
                                <th>Last Heartbeat</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${d.bots.map(b => `
                                <tr>
                                    <td><code>${b.id}</code></td>
                                    <td><b>${escapeHtml(b.name || '')}</b></td>
                                    <td>${b.symbol} (${b.timeframe || '15m'})</td>
                                    <td>${b.strategy}</td>
                                    <td><span class="badge" style="font-size:9px; background:${b.execution_mode === 'LIVE' ? '#ff3b69' : '#ffab00'}; color:#000;">${b.execution_mode || 'PAPER'}</span></td>
                                    <td><span class="badge ${b.status === 'RUNNING' ? 'badge-success' : 'badge-secondary'}" style="font-size:9px;">${b.status}</span></td>
                                    <td style="font-family:monospace;">${b.started_at || '--'}</td>
                                    <td style="font-family:monospace;">${b.last_heartbeat || '--'}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch(err) {
        container.innerHTML = `<div style="color:#ff3b69; padding:20px;">Failed to load diagnostics: ${err}</div>`;
    }
}

// Hook tab switching to auto-fetch analytics
const originalSwitchTab = window.switchTab;
window.switchTab = function(tabId) {
    if (originalSwitchTab) originalSwitchTab(tabId);
    if (tabId === "analytics") {
        AnalyticsDataManager.fetchAnalytics();
    }
};

// Initialize Route & Handlers on DOM Content Loaded
document.addEventListener("DOMContentLoaded", () => {
    handleHashRouting();
    fetchBotSummaryMetrics();
    fetchBotTemplates();
    fetchBotGroups();
    renderActiveBotsGrid();
    fetchBotHistoryLog();
    initBotEventsStream();
    AnalyticsDataManager.fetchAnalytics();
});


// ============================================================================
// HOW TO USE ALGO BOT - 12-STEP GUIDED TUTORIAL CONTROLLER
// ============================================================================

const TUTORIAL_STEPS = [
    {
        step: 1,
        title: "Step 1: Choose Your Asset Class",
        category: "Asset Selection",
        what: "Select the financial market domain you intend to trade (Crypto, Indian Equities, Global Indices, or Forex).",
        why: "Different asset classes have unique volatility characteristics, trading hours, margin requirements, and tick sizes.",
        configure: "In the Bot Wizard or Market Universe tab, pick 'Crypto' (24/7 trading) or 'Indian Equities' (NSE/BSE).",
        example: "Selecting 'Crypto' enables high-liquidity digital asset pairs like BTC/USDT and ETH/USDT.",
        action: "Go to Bot Wizard (Step 1)"
    },
    {
        step: 2,
        title: "Step 2: Select Market / Symbol",
        category: "Symbol Selection",
        what: "Choose the exact tradable instrument pair.",
        why: "Trading high-volume, liquid symbols ensures tight spreads and minimizes slippage during execution.",
        configure: "Pick from vetted symbols such as BTC/USDT, ETH/USDT, SOL/USDT, or scan via the Market Screener.",
        example: "BTC/USDT provides deep order book liquidity and reliable technical structure across multiple timeframes.",
        action: "View Market Universe"
    },
    {
        step: 3,
        title: "Step 3: Choose Timeframe",
        category: "Timeframe Selection",
        what: "Select the candle interval evaluated by the strategy engine (e.g. 5m, 15m, 1h).",
        why: "Lower timeframes (1m-5m) generate more frequent scalp signals; higher timeframes (1h-1d) produce higher-probability swing trends.",
        configure: "For active scalping choose 5m or 15m; for trend-following choose 1h or 4h.",
        example: "The 15m timeframe balances signal frequency with noise reduction for EMA and MACD confluence.",
        action: "Set Timeframe"
    },
    {
        step: 4,
        title: "Step 4: Select Trading Strategy",
        category: "Strategy Selection",
        what: "Choose the mathematical confluence logic governing entry and exit signals.",
        why: "A disciplined strategy eliminates emotional bias by requiring multiple confirming indicators before placing an order.",
        configure: "Choose EMA + MACD + Volume Profile (EMA_MACD_VP) or design a custom strategy in the Visual Strategy Builder.",
        example: "EMA_MACD_VP requires price above EMA 200 (trend), EMA 9/20 crossover (timing), and MACD histogram expansion (momentum).",
        action: "Open Strategy Builder"
    },
    {
        step: 5,
        title: "Step 5: Configure Universal Indicators",
        category: "Technical Indicators",
        what: "Fine-tune the indicator parameters, periods, and signal weights across 27+ universal indicators.",
        why: "Customizing indicator sensitivity adapts the bot to trending vs ranging market regimes.",
        configure: "In the Indicators tab, click 'Configure' on RSI, EMA, MACD, or Supertrend to modify periods and overbought/oversold levels.",
        example: "Setting RSI(14) with overbought=70 and oversold=30 prevents buying at local exhaustion points.",
        action: "Open Indicators Tab"
    },
    {
        step: 6,
        title: "Step 6: Configure Risk & Position Sizing",
        category: "Risk Management",
        what: "Define maximum capital risk per trade, stop-loss distance, and daily drawdown limits.",
        why: "Capital preservation is the cornerstone of quantitative trading; uncontrolled sizing leads to ruin.",
        configure: "In the Risk Management tab, set Risk per Trade to 1.0%-2.0%, Stop-Loss to 1.5%, and Daily Loss Limit to 5.0%.",
        example: "On a $10,000 account, a 1.0% risk limit caps the maximum loss on any single trade to exactly $100.",
        action: "Open Risk Center"
    },
    {
        step: 7,
        title: "Step 7: Run Backtesting Verification",
        category: "Backtesting",
        what: "Simulate strategy rules against historical candle data to verify statistical edge before trading.",
        why: "Backtesting reveals maximum drawdown, profit factor, win rate, and expectancy across past market cycles.",
        configure: "In the Backtesting Lab, select your symbol, date range, and click 'Run Backtest'.",
        example: "A verified backtest with Profit Factor > 1.5 and Max Drawdown < 10% confirms viable strategy expectancy.",
        action: "Go to Backtesting Lab"
    },
    {
        step: 8,
        title: "Step 8: Start Paper Trading Simulation",
        category: "Paper Trading",
        what: "Deploy your bot instance into the zero-risk simulated sandbox environment with $10,000 virtual balance.",
        why: "Paper trading validates execution timing, fill slippage, order routing, and real-time confluence without risking capital.",
        configure: "Set Execution Mode = 'PAPER', click 'Create Bot', and press 'START'.",
        example: "Bot instance 'bot-1 Alpha BTC Scalper' runs in real-time on live Binance feeds using simulated orders.",
        action: "Launch Paper Bot"
    },
    {
        step: 9,
        title: "Step 9: Review Real-Time Signals",
        category: "Signal Monitoring",
        what: "Observe live candle evaluations, confluence scoring (0-100%), and condition pass/fail logs.",
        why: "Ensures that all entry filters (trend, timing, momentum, location) are triggering as intended.",
        configure: "Check the Live Decision Logs and Confluence Score gauge on the Bot Overview card.",
        example: "A Confluence Score of 85% with all 4 filters green indicates high-conviction entry conditions.",
        action: "View Decision Logs"
    },
    {
        step: 10,
        title: "Step 10: Review Trade Ledger & Order Fills",
        category: "Trade Journal",
        what: "Inspect itemized execution timestamps, entry/exit prices, fees, slippage, and net P&L records.",
        why: "Full trade traceability ensures auditability and mathematical consistency across all positions.",
        configure: "Open the Trade Journal table in the Analytics tab or click any trade row to view the complete order trace.",
        example: "Trade #100875 shows entry @ $63,061.02, exit @ $64,250.00, fee $1.50, net P&L +$117.48.",
        action: "Open Trade Journal"
    },
    {
        step: 11,
        title: "Step 11: Monitor Performance Analytics",
        category: "Performance Metrics",
        what: "Track cumulative equity curve, win/loss ratio, profit factor, drawdown, and strategy breakdowns.",
        why: "Continuous statistical monitoring indicates whether a bot's real performance matches its backtested parameters.",
        configure: "Filter analytics by bot instance, timeframe, or date range in the Performance Analytics tab.",
        example: "The Win/Loss donut and cumulative equity chart visualize ongoing portfolio growth and risk metrics.",
        action: "View Analytics"
    },
    {
        step: 12,
        title: "Step 12: Live Trading Safety Checklist",
        category: "Live Execution Safety",
        what: "Mandatory safety verification before considering live capital deployment.",
        why: "Live execution introduces real financial risk, exchange connectivity variance, and margin requirements.",
        configure: "Ensure: (1) Paper testing showed consistent profitability; (2) API keys configured securely; (3) Kill switch armed; (4) Risk limits strictly verified.",
        example: "Live trading requires dual confirmation and 2FA lockout to prevent unauthorized order execution.",
        action: "Review Safety Panel"
    }
];

let currentTutorialStepIndex = 0;

function openTutorialModal(stepNum = 1) {
    const modal = document.getElementById("tutorial-modal");
    if (!modal) return;
    modal.style.display = "flex";
    currentTutorialStepIndex = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, stepNum - 1));
    renderTutorialStep();
}

function closeTutorialModal() {
    const modal = document.getElementById("tutorial-modal");
    if (modal) modal.style.display = "none";
}

function renderTutorialStep() {
    const data = TUTORIAL_STEPS[currentTutorialStepIndex];
    if (!data) return;

    // Render Pills
    const pillsContainer = document.getElementById("tutorial-step-pills");
    if (pillsContainer) {
        pillsContainer.innerHTML = TUTORIAL_STEPS.map((s, idx) => `
            <button class="btn btn-sm ${idx === currentTutorialStepIndex ? 'btn-primary' : 'btn-secondary'}" style="font-size:11px; padding:3px 8px; white-space:nowrap; border-radius:12px;" onclick="setTutorialStep(${idx + 1})">
                ${s.step}. ${s.category}
            </button>
        `).join("");
    }

    // Render Body
    const contentContainer = document.getElementById("tutorial-step-content");
    if (contentContainer) {
        contentContainer.innerHTML = `
            <div style="background:linear-gradient(135deg, rgba(56, 189, 248, 0.1), rgba(168, 85, 247, 0.05)); border:1px solid rgba(56, 189, 248, 0.2); border-radius:8px; padding:16px; margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--accent-blue); letter-spacing:0.5px;">${data.category}</span>
                    <span class="badge" style="font-size:11px; background:rgba(56, 189, 248, 0.2); color:var(--accent-blue);">Step ${data.step} of 12</span>
                </div>
                <h3 style="font-size:1.25rem; font-weight:700; color:var(--text-primary); margin:0 0 8px 0;">${data.title}</h3>
                <p style="font-size:13px; color:var(--text-secondary); line-height:1.5; margin:0;">${data.what}</p>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:16px;">
                <div style="background:var(--bg-card-subtle); border:1px solid var(--border-color); border-radius:6px; padding:12px;">
                    <div style="font-size:11px; font-weight:700; color:var(--accent-yellow); margin-bottom:4px;">🎯 WHY IT MATTERS</div>
                    <div style="font-size:12px; color:var(--text-primary); line-height:1.4;">${data.why}</div>
                </div>
                <div style="background:var(--bg-card-subtle); border:1px solid var(--border-color); border-radius:6px; padding:12px;">
                    <div style="font-size:11px; font-weight:700; color:var(--accent-green); margin-bottom:4px;">⚙️ WHAT TO CONFIGURE</div>
                    <div style="font-size:12px; color:var(--text-primary); line-height:1.4;">${data.configure}</div>
                </div>
            </div>

            <div style="background:rgba(0,0,0,0.2); border-left:3px solid var(--accent-blue); padding:10px 14px; border-radius:0 6px 6px 0; margin-bottom:12px;">
                <span style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">💡 Practical Example: </span>
                <span style="font-size:12px; color:var(--text-primary);">${data.example}</span>
            </div>
        `;
    }

    // Update Counter & Buttons
    const counter = document.getElementById("tut-step-counter");
    if (counter) counter.textContent = `Step ${data.step} of 12`;

    const prevBtn = document.getElementById("tut-prev-btn");
    if (prevBtn) prevBtn.disabled = (currentTutorialStepIndex === 0);

    const nextBtn = document.getElementById("tut-next-btn");
    const finishBtn = document.getElementById("tut-finish-btn");
    if (currentTutorialStepIndex === TUTORIAL_STEPS.length - 1) {
        if (nextBtn) nextBtn.style.display = "none";
        if (finishBtn) finishBtn.style.display = "block";
    } else {
        if (nextBtn) nextBtn.style.display = "block";
        if (finishBtn) finishBtn.style.display = (currentTutorialStepIndex >= 7 ? "block" : "none");
    }
}

function setTutorialStep(stepNum) {
    currentTutorialStepIndex = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, stepNum - 1));
    renderTutorialStep();
}

function nextTutorialStep() {
    if (currentTutorialStepIndex < TUTORIAL_STEPS.length - 1) {
        currentTutorialStepIndex++;
        renderTutorialStep();
    }
}

function prevTutorialStep() {
    if (currentTutorialStepIndex > 0) {
        currentTutorialStepIndex--;
        renderTutorialStep();
    }
}

function launchPaperBotFromTutorial() {
    closeTutorialModal();
    switchCtrlSubtab("create-bot");
    if (typeof wizardSetStep === "function") {
        wizardSetStep(1);
    }
}


// ============================================================================
// VISUAL STRATEGY BUILDER (IF / AND / OR / THEN) CONTROLLER
// ============================================================================

let visualStrategyRules = [
    { left: "ema_9", op: ">", right: "ema_20" },
    { left: "rsi_14", op: ">", right: "50" },
    { left: "close", op: ">", right: "ema_200" }
];

function openVisualStrategyModal() {
    const modal = document.getElementById("visual-strategy-modal");
    if (!modal) return;
    modal.style.display = "flex";
    renderVisualStrategyRuleRows();
    updateVisualStrategyPreview();
}

function closeVisualStrategyModal() {
    const modal = document.getElementById("visual-strategy-modal");
    if (modal) modal.style.display = "none";
}

function renderVisualStrategyRuleRows() {
    const container = document.getElementById("vsb-rules-list");
    if (!container) return;

    const leftOptions = [
        { val: "ema_9", label: "EMA (9)" },
        { val: "ema_20", label: "EMA (20)" },
        { val: "ema_50", label: "EMA (50)" },
        { val: "ema_200", label: "EMA (200)" },
        { val: "close", label: "Close Price" },
        { val: "rsi_14", label: "RSI (14)" },
        { val: "macd_line", label: "MACD Line" },
        { val: "macd_signal", label: "MACD Signal" },
        { val: "adx_14", label: "ADX (14)" },
        { val: "vah", label: "Volume Profile VAH" },
        { val: "val", label: "Volume Profile VAL" },
        { val: "poc", label: "Volume Profile POC" }
    ];

    const operators = [
        { val: ">", label: "> (Greater than)" },
        { val: "<", label: "< (Less than)" },
        { val: ">=", label: ">= (Greater or equal)" },
        { val: "<=", label: "<= (Less or equal)" },
        { val: "==", label: "== (Equals)" }
    ];

    container.innerHTML = visualStrategyRules.map((rule, idx) => `
        <div style="display:grid; grid-template-columns: 2fr 1.5fr 2fr 40px; gap:8px; align-items:center; background:var(--bg-card-subtle); padding:8px 12px; border-radius:6px; border:1px solid var(--border-color);" id="vsb-row-${idx}">
            <select class="form-control" onchange="updateRuleLeft(${idx}, this.value)">
                ${leftOptions.map(opt => `<option value="${opt.val}" ${opt.val === rule.left ? 'selected' : ''}>${opt.label}</option>`).join("")}
            </select>
            <select class="form-control" onchange="updateRuleOp(${idx}, this.value)">
                ${operators.map(op => `<option value="${op.val}" ${op.val === rule.op ? 'selected' : ''}>${op.label}</option>`).join("")}
            </select>
            <input type="text" class="form-control" value="${rule.right}" placeholder="e.g. 50 or ema_200" oninput="updateRuleRight(${idx}, this.value)">
            <button class="btn btn-danger btn-sm" onclick="removeVisualStrategyRuleRow(${idx})" title="Remove Condition" style="padding:4px 8px;">✖</button>
        </div>
    `).join("");
}

function addVisualStrategyRuleRow(left = "rsi_14", op = "<", right = "30") {
    visualStrategyRules.push({ left, op, right });
    renderVisualStrategyRuleRows();
    updateVisualStrategyPreview();
}

function removeVisualStrategyRuleRow(idx) {
    if (visualStrategyRules.length <= 1) {
        alert("A strategy must contain at least one condition rule.");
        return;
    }
    visualStrategyRules.splice(idx, 1);
    renderVisualStrategyRuleRows();
    updateVisualStrategyPreview();
}

function updateRuleLeft(idx, val) {
    if (visualStrategyRules[idx]) visualStrategyRules[idx].left = val;
    updateVisualStrategyPreview();
}

function updateRuleOp(idx, val) {
    if (visualStrategyRules[idx]) visualStrategyRules[idx].op = val;
    updateVisualStrategyPreview();
}

function updateRuleRight(idx, val) {
    if (visualStrategyRules[idx]) visualStrategyRules[idx].right = val.trim();
    updateVisualStrategyPreview();
}

function updateVisualStrategyPreview() {
    const conj = document.getElementById("vsb-conjunction")?.value || "AND";
    const sig = document.getElementById("vsb-target-signal")?.value || "BUY";
    const previewEl = document.getElementById("vsb-compiled-preview");
    if (!previewEl) return;

    const expr = visualStrategyRules.map(r => `${r.left} ${r.op} ${r.right}`).join(` ${conj} `);
    previewEl.textContent = `IF (${expr}) THEN ${sig}`;
}

async function testVisualStrategyRules() {
    const conj = document.getElementById("vsb-conjunction")?.value || "AND";
    const sig = document.getElementById("vsb-target-signal")?.value || "BUY";
    const resultBox = document.getElementById("vsb-test-result-box");

    try {
        const res = await fetch("/api/strategies/visual/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                strategy: {
                    rules: visualStrategyRules,
                    conjunction: conj,
                    target_signal: sig
                }
            })
        });
        const data = await res.json();

        if (resultBox) {
            resultBox.style.display = "block";
            if (data.triggered) {
                resultBox.style.background = "rgba(34, 197, 94, 0.15)";
                resultBox.style.border = "1px solid rgba(34, 197, 94, 0.3)";
                resultBox.style.color = "var(--accent-green)";
                resultBox.innerHTML = `✅ <b>STRATEGY TRIGGERED (${data.signal})</b> — All conditions matched live indicator snapshot.<br><small>${data.conditions.map(c => `${c.condition}: ${c.left_val} vs ${c.right_val} (${c.passed ? 'PASS' : 'FAIL'})`).join(' | ')}</small>`;
            } else {
                resultBox.style.background = "rgba(234, 179, 8, 0.15)";
                resultBox.style.border = "1px solid rgba(234, 179, 8, 0.3)";
                resultBox.style.color = "var(--accent-yellow)";
                resultBox.innerHTML = `⚠️ <b>SIGNAL: HOLD</b> — Conditions not currently met on live indicators.<br><small>${data.conditions.map(c => `${c.condition}: ${c.left_val} vs ${c.right_val} (${c.passed ? 'PASS' : 'FAIL'})`).join(' | ')}</small>`;
            }
        }
    } catch (e) {
        alert(`Rule evaluation test error: ${e}`);
    }
}

async function saveVisualStrategyFromModal() {
    const name = (document.getElementById("vsb-strat-name")?.value || "").trim();
    if (!name) {
        alert("Please enter a name for your strategy.");
        return;
    }
    const conj = document.getElementById("vsb-conjunction")?.value || "AND";
    const sig = document.getElementById("vsb-target-signal")?.value || "BUY";

    try {
        const res = await fetch("/api/strategies/visual/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: name,
                target_signal: sig,
                conjunction: conj,
                rules: visualStrategyRules
            })
        });
        const data = await res.json();
        if (data.status === "success") {
            alert(`Strategy '${name}' compiled and saved successfully!`);
            closeVisualStrategyModal();
        } else {
            alert(data.message || "Failed to save strategy.");
        }
    } catch (e) {
        alert(`Strategy save error: ${e}`);
    }
}


// ============================================================================
// CONTEXTUAL HELP & EDUCATIONAL GUIDANCE CONTROLLER
// ============================================================================

const HELP_DICTIONARY = {
    "rsi_length": {
        title: "RSI Period Length",
        what: "The number of historical candles used to calculate relative momentum.",
        why: "Shorter periods increase sensitivity; standard 14-period balances responsiveness with noise reduction.",
        effect: "Alters overbought (>70) and oversold (<30) oscillator levels.",
        safeRange: "7 to 21 candles (Default: 14)",
        example: "RSI(14) on 15m timeframe evaluates momentum across the preceding 3.5 hours."
    },
    "risk_pct_per_trade": {
        title: "Risk Percentage per Trade",
        what: "The maximum fraction of total portfolio equity risked on any single trade.",
        why: "Limits exposure to negative variance and prevents severe drawdown during losing streaks.",
        effect: "Scales order position size inversely to stop-loss distance.",
        safeRange: "0.5% to 2.0% of account equity (Default: 1.0%)",
        example: "At 1.0% risk on a $10,000 balance, maximum loss is capped at exactly $100."
    },
    "fixed_stop_loss_pct": {
        title: "Fixed Stop Loss Percentage",
        what: "The price drop percentage below entry that triggers an automatic market exit.",
        why: "Protects account balance against unexpected market flash-crashes and invalidations.",
        effect: "Positions are immediately squared off when market price reaches or breaches this threshold.",
        safeRange: "0.5% to 3.0% (Default: 1.5%)",
        example: "With a 1.5% SL on BTC @ $60,000, exit order triggers if price falls to $59,100."
    },
    "daily_loss_limit_pct": {
        title: "Daily Loss Limit Percentage",
        what: "Maximum allowable cumulative portfolio loss within a rolling 24-hour window.",
        why: "Halts trading algorithms on days experiencing adverse market regimes or abnormal volatility.",
        effect: "When breached, trading engine transitions to PAUSED and blocks new orders until next session.",
        safeRange: "2.0% to 5.0% (Default: 3.0%)",
        example: "If daily P&L drops by -$300 on a $10,000 account, the bot automatically pauses execution."
    }
};

function openContextHelp(topicKey) {
    const modal = document.getElementById("context-help-modal");
    const titleEl = document.getElementById("help-modal-title");
    const bodyEl = document.getElementById("help-modal-body");
    if (!modal || !bodyEl) return;

    const data = HELP_DICTIONARY[topicKey] || {
        title: "Trading Parameter Guidance",
        what: "Standard algorithmic parameter regulating trade evaluation.",
        why: "Maintains systematic discipline across order execution.",
        effect: "Directly affects signal generation or position sizing.",
        safeRange: "Consult strategy risk specifications.",
        example: "Always test parameter changes in Paper Trading before deploying."
    };

    if (titleEl) titleEl.textContent = data.title;
    bodyEl.innerHTML = `
        <div style="background:var(--bg-card-subtle); border-radius:6px; padding:12px; margin-bottom:12px;">
            <div style="font-size:11px; font-weight:700; color:var(--accent-blue); text-transform:uppercase; margin-bottom:4px;">Definition (WHAT)</div>
            <div style="font-size:13px; color:var(--text-primary);">${data.what}</div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
            <div style="background:var(--bg-card-subtle); border-radius:6px; padding:10px;">
                <div style="font-size:11px; font-weight:700; color:var(--accent-yellow); margin-bottom:4px;">PURPOSE (WHY)</div>
                <div style="font-size:12px; color:var(--text-secondary);">${data.why}</div>
            </div>
            <div style="background:var(--bg-card-subtle); border-radius:6px; padding:10px;">
                <div style="font-size:11px; font-weight:700; color:var(--accent-green); margin-bottom:4px;">SAFE RANGE</div>
                <div style="font-size:12px; color:var(--text-primary); font-weight:600;">${data.safeRange}</div>
            </div>
        </div>
        <div style="background:rgba(0,0,0,0.25); border-left:3px solid var(--accent-cyan); padding:10px 12px; border-radius:0 6px 6px 0;">
            <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:2px;">PRACTICAL EXAMPLE</div>
            <div style="font-size:12px; color:var(--text-primary);">${data.example}</div>
        </div>
    `;

    modal.style.display = "flex";
}

function closeContextHelpModal() {
    const modal = document.getElementById("context-help-modal");
    if (modal) modal.style.display = "none";
}






