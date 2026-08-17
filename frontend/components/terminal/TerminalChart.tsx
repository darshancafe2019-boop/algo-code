"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Eye,
  Layers,
  Activity,
} from "lucide-react";

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DrawingObject {
  id: string;
  type: "trendline" | "horizontal_line" | "vertical_line" | "fibonacci" | "rectangle";
  startX: number;
  startY: number;
  endX?: number;
  endY?: number;
  priceStart?: number;
  priceEnd?: number;
  timeStart?: string;
  timeEnd?: string;
}

interface TerminalChartProps {
  symbol: string;
  timeframe: string;
  chartType: "candles" | "ohlc" | "line" | "area";
  activeTool: string;
  drawings: DrawingObject[];
  onAddDrawing: (drawing: DrawingObject) => void;
  showIndicators: {
    ema9: boolean;
    ema21: boolean;
    ema50: boolean;
    bb: boolean;
    rsi: boolean;
    macd: boolean;
  };
}

export function TerminalChart({
  symbol,
  timeframe,
  chartType,
  activeTool,
  drawings,
  onAddDrawing,
  showIndicators,
}: TerminalChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverData, setHoverData] = useState<{
    candle: Candle | null;
    x: number;
    y: number;
    price: number;
  } | null>(null);

  const [panOffset, setPanOffset] = useState<number>(0);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [currentDraw, setCurrentDraw] = useState<DrawingObject | null>(null);

  // Fetch real candles from backend
  const { data: rawCandles, isLoading, isError, refetch } = useQuery<Candle[]>({
    queryKey: ["candles", symbol, timeframe],
    queryFn: async () => {
      const res = await fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=120`);
      if (!res.ok) {
        // Fallback to price_history if candles endpoint returns empty
        const alt = await fetch(`/api/price_history?symbol=${encodeURIComponent(symbol)}&limit=100`);
        if (!alt.ok) throw new Error("Failed to fetch candle data");
        const altData = await alt.json();
        return (altData.data || altData || []) as Candle[];
      }
      const data = await res.json();
      return (data.candles || data.data || data || []) as Candle[];
    },
    refetchInterval: 5000,
  });

  // Ensure candles are sorted chronologically
  const candles = useMemo(() => {
    if (!rawCandles || rawCandles.length === 0) return [];
    return [...rawCandles].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [rawCandles]);

  // Compute EMAs
  const ema9 = useMemo(() => computeEMA(candles, 9), [candles]);
  const ema21 = useMemo(() => computeEMA(candles, 21), [candles]);
  const ema50 = useMemo(() => computeEMA(candles, 50), [candles]);
  const { upperBB, lowerBB, middleBB } = useMemo(() => computeBollingerBands(candles, 20, 2), [candles]);
  const rsi = useMemo(() => computeRSI(candles, 14), [candles]);
  const { macdLine, signalLine, histogram } = useMemo(() => computeMACD(candles, 12, 26, 9), [candles]);

  // Canvas Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current || candles.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Handle high DPI
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Layout configuration
    const rsiHeight = showIndicators.rsi ? 80 : 0;
    const macdHeight = showIndicators.macd ? 80 : 0;
    const subPanelsHeight = rsiHeight + macdHeight;
    const mainChartHeight = height - subPanelsHeight - 30; // 30px for time axis
    const chartWidth = width - 65; // 65px for price axis

    ctx.clearRect(0, 0, width, height);

    // Dark Background
    ctx.fillStyle = "#0B0F17";
    ctx.fillRect(0, 0, width, height);

    // Determine visible candle window
    const visibleCount = Math.max(20, Math.min(candles.length, Math.floor((candles.length / zoomLevel))));
    const startIndex = Math.max(0, Math.min(candles.length - visibleCount, candles.length - visibleCount - panOffset));
    const visibleCandles = candles.slice(startIndex, startIndex + visibleCount);

    if (visibleCandles.length === 0) return;

    // Price scaling
    let minPrice = Math.min(...visibleCandles.map((c) => c.low));
    let maxPrice = Math.max(...visibleCandles.map((c) => c.high));
    const pricePadding = (maxPrice - minPrice) * 0.05 || 1;
    minPrice -= pricePadding;
    maxPrice += pricePadding;
    const priceRange = maxPrice - minPrice || 1;

    // Max volume for scaling
    const maxVolume = Math.max(...visibleCandles.map((c) => c.volume), 1);

    const candleWidth = chartWidth / visibleCandles.length;
    const candleBodyWidth = Math.max(1, candleWidth * 0.7);

    // Coordinate converters
    const getX = (index: number) => index * candleWidth + candleWidth / 2;
    const getY = (price: number) => mainChartHeight - ((price - minPrice) / priceRange) * mainChartHeight;

    // 1. Gridlines
    ctx.strokeStyle = "#1A2333";
    ctx.lineWidth = 1;
    const gridRows = 6;
    for (let i = 0; i <= gridRows; i++) {
      const y = (mainChartHeight / gridRows) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      // Price labels on right Y-axis
      const priceAtY = maxPrice - (i / gridRows) * priceRange;
      ctx.fillStyle = "#64748B";
      ctx.font = "10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(priceAtY >= 1000 ? `$${priceAtY.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `$${priceAtY.toFixed(4)}`, chartWidth + 5, y + 4);
    }

    // 2. Volume Bars (Bottom 20% of main chart)
    const volHeightMax = mainChartHeight * 0.2;
    visibleCandles.forEach((candle, i) => {
      const x = getX(i);
      const isUp = candle.close >= candle.open;
      const volHeight = (candle.volume / maxVolume) * volHeightMax;
      const volY = mainChartHeight - volHeight;

      ctx.fillStyle = isUp ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)";
      ctx.fillRect(x - candleBodyWidth / 2, volY, candleBodyWidth, volHeight);
    });

    // 3. Bollinger Bands Fill & Lines
    if (showIndicators.bb && upperBB.length > 0 && lowerBB.length > 0) {
      ctx.beginPath();
      for (let i = 0; i < visibleCandles.length; i++) {
        const fullIdx = startIndex + i;
        const uPrice = upperBB[fullIdx];
        if (uPrice !== undefined) {
          const x = getX(i);
          const y = getY(uPrice);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      for (let i = visibleCandles.length - 1; i >= 0; i--) {
        const fullIdx = startIndex + i;
        const lPrice = lowerBB[fullIdx];
        if (lPrice !== undefined) {
          const x = getX(i);
          const y = getY(lPrice);
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(59, 130, 246, 0.06)";
      ctx.fill();

      // Draw Upper and Lower BB lines
      drawIndicatorLine(ctx, visibleCandles, upperBB, startIndex, getX, getY, "rgba(59, 130, 246, 0.6)", 1);
      drawIndicatorLine(ctx, visibleCandles, lowerBB, startIndex, getX, getY, "rgba(59, 130, 246, 0.6)", 1);
      drawIndicatorLine(ctx, visibleCandles, middleBB, startIndex, getX, getY, "rgba(234, 179, 8, 0.5)", 1, [2, 2]);
    }

    // 4. EMA Lines
    if (showIndicators.ema9) drawIndicatorLine(ctx, visibleCandles, ema9, startIndex, getX, getY, "#38BDF8", 1.5);
    if (showIndicators.ema21) drawIndicatorLine(ctx, visibleCandles, ema21, startIndex, getX, getY, "#F59E0B", 1.5);
    if (showIndicators.ema50) drawIndicatorLine(ctx, visibleCandles, ema50, startIndex, getX, getY, "#EC4899", 1.5);

    // 5. Candlesticks / OHLC / Line / Area
    visibleCandles.forEach((candle, i) => {
      const x = getX(i);
      const openY = getY(candle.open);
      const closeY = getY(candle.close);
      const highY = getY(candle.high);
      const lowY = getY(candle.low);
      const isUp = candle.close >= candle.open;
      const color = isUp ? "#10B981" : "#EF4444";

      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      if (chartType === "candles") {
        // High-Low Wick
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        ctx.stroke();

        // Open-Close Body
        const topY = Math.min(openY, closeY);
        const bodyHeight = Math.max(2, Math.abs(closeY - openY));
        ctx.fillRect(x - candleBodyWidth / 2, topY, candleBodyWidth, bodyHeight);
      } else if (chartType === "ohlc") {
        // Vertical bar
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        // Open tick (left)
        ctx.moveTo(x - candleBodyWidth / 2, openY);
        ctx.lineTo(x, openY);
        // Close tick (right)
        ctx.moveTo(x, closeY);
        ctx.lineTo(x + candleBodyWidth / 2, closeY);
        ctx.stroke();
      }
    });

    if (chartType === "line" || chartType === "area") {
      ctx.beginPath();
      visibleCandles.forEach((candle, i) => {
        const x = getX(i);
        const y = getY(candle.close);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = "#38BDF8";
      ctx.lineWidth = 2;
      ctx.stroke();

      if (chartType === "area") {
        ctx.lineTo(getX(visibleCandles.length - 1), mainChartHeight);
        ctx.lineTo(getX(0), mainChartHeight);
        ctx.closePath();
        const gradient = ctx.createLinearGradient(0, 0, 0, mainChartHeight);
        gradient.addColorStop(0, "rgba(56, 189, 248, 0.3)");
        gradient.addColorStop(1, "rgba(56, 189, 248, 0.0)");
        ctx.fillStyle = gradient;
        ctx.fill();
      }
    }

    // 6. User Drawings
    drawings.forEach((d) => {
      renderDrawingObject(ctx, d, chartWidth, mainChartHeight, minPrice, priceRange);
    });

    if (currentDraw) {
      renderDrawingObject(ctx, currentDraw, chartWidth, mainChartHeight, minPrice, priceRange);
    }

    // 7. Time Axis Labels (Bottom of main chart)
    ctx.fillStyle = "#64748B";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    const labelStep = Math.max(1, Math.floor(visibleCandles.length / 6));
    for (let i = 0; i < visibleCandles.length; i += labelStep) {
      const c = visibleCandles[i];
      const x = getX(i);
      const timeStr = formatCandleTime(c.timestamp, timeframe);
      ctx.fillText(timeStr, x, mainChartHeight + 16);
    }

    // 8. Crosshair Cursor & Axis Badges
    if (hoverData) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(hoverData.x, 0);
      ctx.lineTo(hoverData.x, height);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, hoverData.y);
      ctx.lineTo(chartWidth, hoverData.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Price badge on Y-Axis
      ctx.fillStyle = "#1E293B";
      ctx.fillRect(chartWidth + 2, hoverData.y - 10, 60, 20);
      ctx.fillStyle = "#F8FAFC";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`$${hoverData.price.toFixed(2)}`, chartWidth + 6, hoverData.y + 4);
    }

    // 9. Sub-Panel: RSI (14)
    let currentSubY = mainChartHeight + 30;
    if (showIndicators.rsi) {
      renderRsiPanel(ctx, 0, currentSubY, chartWidth, rsiHeight, visibleCandles, rsi, startIndex, getX);
      currentSubY += rsiHeight;
    }

    // 10. Sub-Panel: MACD
    if (showIndicators.macd) {
      renderMacdPanel(ctx, 0, currentSubY, chartWidth, macdHeight, visibleCandles, macdLine, signalLine, histogram, startIndex, getX);
    }
  }, [
    candles,
    zoomLevel,
    panOffset,
    chartType,
    hoverData,
    drawings,
    currentDraw,
    showIndicators,
    ema9,
    ema21,
    ema50,
    upperBB,
    lowerBB,
    middleBB,
    rsi,
    macdLine,
    signalLine,
    histogram,
    timeframe,
  ]);

  // Mouse Interaction Handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const visibleCount = Math.max(20, Math.min(candles.length, Math.floor(candles.length / zoomLevel)));
    const startIndex = Math.max(0, Math.min(candles.length - visibleCount, candles.length - visibleCount - panOffset));
    const visibleCandles = candles.slice(startIndex, startIndex + visibleCount);
    const chartWidth = rect.width - 65;
    const candleWidth = chartWidth / visibleCandles.length;

    const candleIdx = Math.floor(x / candleWidth);
    const candle = visibleCandles[candleIdx] || null;

    let minPrice = Math.min(...visibleCandles.map((c) => c.low));
    let maxPrice = Math.max(...visibleCandles.map((c) => c.high));
    const pricePadding = (maxPrice - minPrice) * 0.05 || 1;
    minPrice -= pricePadding;
    maxPrice += pricePadding;
    const priceRange = maxPrice - minPrice || 1;
    const priceAtY = maxPrice - (y / (rect.height - 30)) * priceRange;

    setHoverData({
      candle,
      x,
      y,
      price: priceAtY,
    });

    // Handle Active Drawing update
    if (isDrawing && currentDraw) {
      setCurrentDraw({
        ...currentDraw,
        endX: x,
        endY: y,
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeTool || activeTool === "cursor" || activeTool === "crosshair") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setCurrentDraw({
      id: `draw_${Date.now()}`,
      type: activeTool as any,
      startX: x,
      startY: y,
      endX: x,
      endY: y,
    });
  };

  const handleMouseUp = () => {
    if (isDrawing && currentDraw) {
      onAddDrawing(currentDraw);
      setIsDrawing(false);
      setCurrentDraw(null);
    }
  };

  const latestCandle = candles[candles.length - 1];
  const activeDisplayCandle = hoverData?.candle || latestCandle;
  const candleChange = activeDisplayCandle
    ? ((activeDisplayCandle.close - activeDisplayCandle.open) / activeDisplayCandle.open) * 100
    : 0;

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col bg-[#0B0F17] select-none overflow-hidden">
      {/* Top Chart Info & OHLCV Bar */}
      <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-3 bg-[#0E1524] border-b border-[#1A2333] z-10">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-white tracking-wider flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-cyan-400" />
            {symbol} • {timeframe.toUpperCase()}
          </span>

          {activeDisplayCandle && (
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="text-slate-400">O: <strong className="text-slate-200">${activeDisplayCandle.open.toLocaleString()}</strong></span>
              <span className="text-slate-400">H: <strong className="text-slate-200">${activeDisplayCandle.high.toLocaleString()}</strong></span>
              <span className="text-slate-400">L: <strong className="text-slate-200">${activeDisplayCandle.low.toLocaleString()}</strong></span>
              <span className="text-slate-400">C: <strong className={candleChange >= 0 ? "text-emerald-400" : "text-red-400"}>${activeDisplayCandle.close.toLocaleString()}</strong></span>
              <span className={candleChange >= 0 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                {candleChange >= 0 ? "+" : ""}{candleChange.toFixed(2)}%
              </span>
              <span className="text-slate-400 hidden sm:inline">Vol: <strong className="text-slate-300">{activeDisplayCandle.volume.toLocaleString()}</strong></span>
            </div>
          )}
        </div>

        {/* Quick Zoom & Reset Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoomLevel((z) => Math.min(4, z + 0.25))}
            className="p-1 rounded bg-[#162032] hover:bg-[#1E293B] text-slate-300 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
            className="p-1 rounded bg-[#162032] hover:bg-[#1E293B] text-slate-300 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              setZoomLevel(1);
              setPanOffset(0);
            }}
            className="p-1 rounded bg-[#162032] hover:bg-[#1E293B] text-slate-300 transition-colors"
            title="Reset Scale"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => refetch()}
            className="p-1 rounded bg-[#162032] hover:bg-[#1E293B] text-slate-300 transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Main Interactive Canvas */}
      <div className="relative flex-1 w-full h-full cursor-crosshair">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0B0F17]/80 backdrop-blur-sm z-20">
            <div className="flex items-center gap-2 text-cyan-400 font-medium text-xs">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Loading Real Market Candles...</span>
            </div>
          </div>
        )}

        {isError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0B0F17]/90 z-20">
            <div className="text-center p-4">
              <p className="text-red-400 font-bold text-xs mb-2">MARKET DATA DISCONNECTED</p>
              <button
                onClick={() => refetch()}
                className="px-3 py-1 bg-red-600/30 border border-red-500 rounded text-red-300 text-xs hover:bg-red-600/50"
              >
                Retry Connection
              </button>
            </div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => setHoverData(null)}
          className="w-full h-full block"
        />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Helper Math & Indicator Functions
// ----------------------------------------------------------------------------

function computeEMA(candles: Candle[], period: number): number[] {
  if (candles.length === 0) return [];
  const k = 2 / (period + 1);
  const emaArray: number[] = [];
  let prevEma = candles[0].close;

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      emaArray.push(NaN);
    } else if (i === period - 1) {
      const sum = candles.slice(0, period).reduce((acc, c) => acc + c.close, 0);
      prevEma = sum / period;
      emaArray.push(prevEma);
    } else {
      const currEma = candles[i].close * k + prevEma * (1 - k);
      emaArray.push(currEma);
      prevEma = currEma;
    }
  }
  return emaArray;
}

function computeBollingerBands(candles: Candle[], period: number = 20, multiplier: number = 2) {
  const upperBB: number[] = [];
  const lowerBB: number[] = [];
  const middleBB: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      upperBB.push(NaN);
      lowerBB.push(NaN);
      middleBB.push(NaN);
    } else {
      const slice = candles.slice(i - period + 1, i + 1).map((c) => c.close);
      const sma = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((acc, val) => acc + Math.pow(val - sma, 2), 0) / period;
      const stdDev = Math.sqrt(variance);

      middleBB.push(sma);
      upperBB.push(sma + multiplier * stdDev);
      lowerBB.push(sma - multiplier * stdDev);
    }
  }
  return { upperBB, lowerBB, middleBB };
}

function computeRSI(candles: Candle[], period: number = 14): number[] {
  if (candles.length <= period) return [];
  const rsi: number[] = new Array(period).fill(NaN);
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi.push(100 - 100 / (1 + rs));

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));
  }

  return rsi;
}

function computeMACD(candles: Candle[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fastEma = computeEMA(candles, fastPeriod);
  const slowEma = computeEMA(candles, slowPeriod);
  const macdLine: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (isNaN(fastEma[i]) || isNaN(slowEma[i])) {
      macdLine.push(NaN);
    } else {
      macdLine.push(fastEma[i] - slowEma[i]);
    }
  }

  const validMacd = macdLine.filter((v) => !isNaN(v));
  const dummyCandles: Candle[] = validMacd.map((val) => ({
    timestamp: "",
    open: val,
    high: val,
    low: val,
    close: val,
    volume: 0,
  }));
  const rawSignal = computeEMA(dummyCandles, signalPeriod);

  const signalLine: number[] = new Array(candles.length - validMacd.length).fill(NaN).concat(rawSignal);
  const histogram: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (isNaN(macdLine[i]) || isNaN(signalLine[i])) {
      histogram.push(NaN);
    } else {
      histogram.push(macdLine[i] - signalLine[i]);
    }
  }

  return { macdLine, signalLine, histogram };
}

function drawIndicatorLine(
  ctx: CanvasRenderingContext2D,
  visibleCandles: Candle[],
  series: number[],
  startIndex: number,
  getX: (i: number) => number,
  getY: (p: number) => number,
  color: string,
  lineWidth = 1.5,
  dash: number[] = []
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.beginPath();
  let first = true;

  for (let i = 0; i < visibleCandles.length; i++) {
    const val = series[startIndex + i];
    if (val !== undefined && !isNaN(val)) {
      const x = getX(i);
      const y = getY(val);
      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function renderDrawingObject(
  ctx: CanvasRenderingContext2D,
  d: DrawingObject,
  chartWidth: number,
  mainChartHeight: number,
  minPrice: number,
  priceRange: number
) {
  ctx.strokeStyle = "#38BDF8";
  ctx.lineWidth = 1.8;

  if (d.type === "trendline") {
    ctx.beginPath();
    ctx.moveTo(d.startX, d.startY);
    ctx.lineTo(d.endX || d.startX, d.endY || d.startY);
    ctx.stroke();
  } else if (d.type === "horizontal_line") {
    ctx.beginPath();
    ctx.moveTo(0, d.startY);
    ctx.lineTo(chartWidth, d.startY);
    ctx.stroke();
  } else if (d.type === "vertical_line") {
    ctx.beginPath();
    ctx.moveTo(d.startX, 0);
    ctx.lineTo(d.startX, mainChartHeight);
    ctx.stroke();
  } else if (d.type === "fibonacci") {
    const y1 = d.startY;
    const y2 = d.endY || d.startY;
    const diff = y2 - y1;
    const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
    const colors = ["#EF4444", "#F59E0B", "#10B981", "#38BDF8", "#6366F1", "#EC4899", "#8B5CF6"];

    levels.forEach((lvl, idx) => {
      const y = y1 + diff * lvl;
      ctx.strokeStyle = colors[idx % colors.length];
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      ctx.fillStyle = colors[idx % colors.length];
      ctx.font = "9px monospace";
      ctx.fillText(`${(lvl * 100).toFixed(1)}%`, 5, y - 2);
    });
  } else if (d.type === "rectangle") {
    ctx.fillStyle = "rgba(56, 189, 248, 0.1)";
    const w = (d.endX || d.startX) - d.startX;
    const h = (d.endY || d.startY) - d.startY;
    ctx.fillRect(d.startX, d.startY, w, h);
    ctx.strokeRect(d.startX, d.startY, w, h);
  }
}

function renderRsiPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  visibleCandles: Candle[],
  rsiSeries: number[],
  startIndex: number,
  getX: (i: number) => number
) {
  // Panel background & divider
  ctx.fillStyle = "#090D14";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#1A2333";
  ctx.strokeRect(x, y, w, h);

  // Label
  ctx.fillStyle = "#94A3B8";
  ctx.font = "10px monospace";
  ctx.textAlign = "left";
  ctx.fillText("RSI (14)", x + 6, y + 14);

  // Threshold levels 70 & 30
  const y70 = y + h - (70 / 100) * (h - 20) - 10;
  const y30 = y + h - (30 / 100) * (h - 20) - 10;

  ctx.strokeStyle = "rgba(239, 68, 68, 0.4)";
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(x, y70);
  ctx.lineTo(x + w, y70);
  ctx.stroke();

  ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
  ctx.beginPath();
  ctx.moveTo(x, y30);
  ctx.lineTo(x + w, y30);
  ctx.stroke();
  ctx.setLineDash([]);

  // RSI Line
  ctx.strokeStyle = "#A855F7";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let first = true;

  for (let i = 0; i < visibleCandles.length; i++) {
    const val = rsiSeries[startIndex + i];
    if (val !== undefined && !isNaN(val)) {
      const cx = getX(i);
      const cy = y + h - (val / 100) * (h - 20) - 10;
      if (first) {
        ctx.moveTo(cx, cy);
        first = false;
      } else {
        ctx.lineTo(cx, cy);
      }
    }
  }
  ctx.stroke();
}

function renderMacdPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  visibleCandles: Candle[],
  macdLine: number[],
  signalLine: number[],
  histogram: number[],
  startIndex: number,
  getX: (i: number) => number
) {
  // Panel background
  ctx.fillStyle = "#090D14";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#1A2333";
  ctx.strokeRect(x, y, w, h);

  // Label
  ctx.fillStyle = "#94A3B8";
  ctx.font = "10px monospace";
  ctx.textAlign = "left";
  ctx.fillText("MACD (12, 26, 9)", x + 6, y + 14);

  const midY = y + h / 2;
  ctx.strokeStyle = "#1E293B";
  ctx.beginPath();
  ctx.moveTo(x, midY);
  ctx.lineTo(x + w, midY);
  ctx.stroke();

  // Find max MACD range
  let maxAbs = 1;
  for (let i = 0; i < visibleCandles.length; i++) {
    const m = Math.abs(macdLine[startIndex + i] || 0);
    const s = Math.abs(signalLine[startIndex + i] || 0);
    const hg = Math.abs(histogram[startIndex + i] || 0);
    maxAbs = Math.max(maxAbs, m, s, hg);
  }

  // Draw Histogram Bars
  visibleCandles.forEach((_, i) => {
    const hg = histogram[startIndex + i];
    if (hg !== undefined && !isNaN(hg)) {
      const cx = getX(i);
      const barH = (hg / maxAbs) * (h / 2 - 10);
      ctx.fillStyle = hg >= 0 ? "rgba(16, 185, 129, 0.6)" : "rgba(239, 68, 68, 0.6)";
      ctx.fillRect(cx - 2, midY, 4, -barH);
    }
  });

  // Draw MACD Line & Signal Line
  const getSubY = (val: number) => midY - (val / maxAbs) * (h / 2 - 10);
  drawIndicatorLine(ctx, visibleCandles, macdLine, startIndex, getX, getSubY, "#38BDF8", 1.5);
  drawIndicatorLine(ctx, visibleCandles, signalLine, startIndex, getX, getSubY, "#F97316", 1.5);
}

function formatCandleTime(ts: string, timeframe: string): string {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    if (timeframe === "1d") {
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  } catch {
    return ts;
  }
}
