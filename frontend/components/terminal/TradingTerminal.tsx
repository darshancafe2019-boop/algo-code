"use client";

import React, { useState } from "react";
import { useActiveBot } from "@/context/ActiveBotContext";
import { TerminalChart, DrawingObject } from "./TerminalChart";
import { TerminalWatchlist } from "./TerminalWatchlist";
import { TerminalScanner } from "./TerminalScanner";
import { TerminalOrderPanel } from "./TerminalOrderPanel";
import { TerminalPositionsPanel } from "./TerminalPositionsPanel";
import {
  MousePointer,
  Crosshair,
  Minus,
  MoveVertical,
  Activity,
  Layers,
  Square,
  Trash2,
  ListFilter,
  Radar,
  Send,
  BarChart2,
  TrendingUp,
  Sliders,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export function TradingTerminal() {
  const { activeSymbol, setActiveSymbol, activeTimeframe, setActiveTimeframe } = useActiveBot();

  // Chart configuration state
  const [chartType, setChartType] = useState<"candles" | "ohlc" | "line" | "area">("candles");
  const [activeTool, setActiveTool] = useState<string>("crosshair");
  const [drawings, setDrawings] = useState<DrawingObject[]>([]);
  const [showIndicators, setShowIndicators] = useState({
    ema9: true,
    ema21: true,
    ema50: false,
    bb: false,
    rsi: true,
    macd: true,
  });

  const [indicatorDropdownOpen, setIndicatorDropdownOpen] = useState(false);

  // Right Panel Tab state
  const [rightPanelTab, setRightPanelTab] = useState<"watchlist" | "scanner" | "order">("order");
  const [bottomDockCollapsed, setBottomDockCollapsed] = useState(false);

  const handleAddDrawing = (drawing: DrawingObject) => {
    setDrawings((prev) => [...prev, drawing]);
  };

  const handleClearDrawings = () => {
    setDrawings([]);
  };

  const timeframes = ["1m", "5m", "15m", "1h", "4h", "1d"];

  const drawingTools = [
    { id: "cursor", label: "Select (Cursor)", icon: MousePointer },
    { id: "crosshair", label: "Crosshair", icon: Crosshair },
    { id: "trendline", label: "Trendline (Alt+T)", icon: TrendingUp },
    { id: "horizontal_line", label: "Horizontal Line (Alt+H)", icon: Minus },
    { id: "vertical_line", label: "Vertical Line (Alt+V)", icon: MoveVertical },
    { id: "fibonacci", label: "Fibonacci Retracement (Alt+F)", icon: Layers },
    { id: "rectangle", label: "Zone Box (Rectangle)", icon: Square },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] min-h-[680px] bg-[#0B0F17] rounded-2xl border border-[#1E293B] overflow-hidden shadow-2xl">
      {/* 1. Terminal Top Control Bar */}
      <div className="px-4 py-2 bg-[#0E1524] border-b border-[#1A2333] flex flex-wrap items-center justify-between gap-3 select-none">
        {/* Left: Active Symbol & Timeframe Selectors */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#121927] border border-[#1E293B] rounded-lg">
            <Activity className="h-4 w-4 text-cyan-400" />
            <span className="text-xs font-bold text-white tracking-wide">{activeSymbol}</span>
          </div>

          {/* Timeframe Buttons */}
          <div className="flex items-center gap-1 bg-[#121927] p-0.5 rounded-lg border border-[#1E293B]">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => setActiveTimeframe(tf)}
                className={`px-2 py-1 rounded text-xs font-semibold uppercase transition-all ${
                  activeTimeframe === tf
                    ? "bg-cyan-500 text-slate-950 font-bold shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-[#1A253A]"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Chart Type Selector */}
          <div className="hidden sm:flex items-center gap-1 bg-[#121927] p-0.5 rounded-lg border border-[#1E293B]">
            {(["candles", "ohlc", "line", "area"] as const).map((ct) => (
              <button
                key={ct}
                onClick={() => setChartType(ct)}
                className={`px-2 py-1 rounded text-xs font-medium capitalize transition-all ${
                  chartType === ct
                    ? "bg-slate-700 text-white font-bold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {ct}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Technical Overlays & Right Panel View Buttons */}
        <div className="flex items-center gap-2">
          {/* Indicators Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIndicatorDropdownOpen(!indicatorDropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#121927] border border-[#1E293B] hover:border-slate-600 text-xs font-medium text-slate-200 transition-colors"
            >
              <Sliders className="h-3.5 w-3.5 text-cyan-400" />
              <span>Indicators</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>

            {indicatorDropdownOpen && (
              <div className="absolute right-0 mt-1 w-52 bg-[#0E1524] border border-[#1E293B] rounded-xl shadow-2xl p-2 z-50 space-y-1 text-xs">
                <div className="text-[10px] font-bold text-slate-400 uppercase px-2 py-1 border-b border-[#1A2333]">
                  Technical Overlays
                </div>
                {[
                  { key: "ema9", label: "EMA 9 (Fast)" },
                  { key: "ema21", label: "EMA 21 (Medium)" },
                  { key: "ema50", label: "EMA 50 (Trend)" },
                  { key: "bb", label: "Bollinger Bands (20,2)" },
                  { key: "rsi", label: "RSI Sub-Panel (14)" },
                  { key: "macd", label: "MACD Sub-Panel" },
                ].map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#162032] cursor-pointer text-slate-200"
                  >
                    <span>{item.label}</span>
                    <input
                      type="checkbox"
                      checked={(showIndicators as any)[item.key]}
                      onChange={(e) =>
                        setShowIndicators({
                          ...showIndicators,
                          [item.key]: e.target.checked,
                        })
                      }
                      className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Right Panel View Switchers */}
          <div className="flex items-center gap-1 bg-[#121927] p-0.5 rounded-lg border border-[#1E293B]">
            <button
              onClick={() => setRightPanelTab("order")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                rightPanelTab === "order"
                  ? "bg-cyan-600 text-white font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Send className="h-3 w-3" />
              <span>Order</span>
            </button>

            <button
              onClick={() => setRightPanelTab("watchlist")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                rightPanelTab === "watchlist"
                  ? "bg-cyan-600 text-white font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <ListFilter className="h-3 w-3" />
              <span>Watchlist</span>
            </button>

            <button
              onClick={() => setRightPanelTab("scanner")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                rightPanelTab === "scanner"
                  ? "bg-cyan-600 text-white font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Radar className="h-3 w-3" />
              <span>Scanner</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Main Center Workspace: Left Toolbar + Chart Canvas + Right Dock */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Drawing Tools Sidebar */}
        <div className="w-10 bg-[#0E1524] border-r border-[#1A2333] flex flex-col items-center py-2 gap-1.5 select-none z-10">
          {drawingTools.map((tool) => {
            const Icon = tool.icon;
            const isSelected = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
                className={`p-2 rounded-lg transition-colors ${
                  isSelected
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                    : "text-slate-400 hover:text-slate-200 hover:bg-[#162032]"
                }`}
                title={tool.label}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}

          <div className="w-6 h-px bg-[#1E293B] my-1" />

          {/* Clear drawings button */}
          <button
            onClick={handleClearDrawings}
            className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/30 transition-colors"
            title="Clear All Drawings"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {/* Center Main Interactive Chart Canvas */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          <TerminalChart
            symbol={activeSymbol}
            timeframe={activeTimeframe}
            chartType={chartType}
            activeTool={activeTool}
            drawings={drawings}
            onAddDrawing={handleAddDrawing}
            showIndicators={showIndicators}
          />
        </div>

        {/* Right Dock Panel (Watchlist / Scanner / Order Form) */}
        <div className="w-80 flex-shrink-0 flex flex-col bg-[#0E1524] border-l border-[#1A2333] overflow-hidden">
          {rightPanelTab === "watchlist" && <TerminalWatchlist />}
          {rightPanelTab === "scanner" && <TerminalScanner />}
          {rightPanelTab === "order" && <TerminalOrderPanel />}
        </div>
      </div>

      {/* 3. Bottom Collapsible Dock: Positions / Orders / Trade Ledger / Logs */}
      <div
        className={`transition-all duration-200 flex flex-col ${
          bottomDockCollapsed ? "h-8" : "h-56"
        }`}
      >
        <div className="bg-[#0A0E17] border-t border-[#1A2333] px-3 py-1 flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span className="font-bold text-slate-300">EXECUTION & POSITION DOCK</span>
          <button
            onClick={() => setBottomDockCollapsed(!bottomDockCollapsed)}
            className="flex items-center gap-1 hover:text-white"
          >
            {bottomDockCollapsed ? (
              <>
                <span>Expand Dock</span>
                <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                <span>Collapse Dock</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
        {!bottomDockCollapsed && <TerminalPositionsPanel />}
      </div>
    </div>
  );
}
