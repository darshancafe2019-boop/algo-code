"use client";

import React, { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FlaskConical, Play, LineChart, ListFilter, Sparkles, RefreshCw, CheckCircle, ShieldAlert, Cpu } from "lucide-react";
import { BacktestRequest, BacktestResult, BacktestResponse } from "@/types/backtest";
import { BacktestSkeleton } from "./BacktestSkeleton";
import { BacktestError } from "./BacktestError";
import { BacktestConfigPanel } from "./BacktestConfigPanel";
import { BacktestMetrics } from "./BacktestMetrics";
import { BacktestEquityCurve } from "./BacktestEquityCurve";
import { BacktestTradeTable } from "./BacktestTradeTable";
import { BacktestSummary } from "./BacktestSummary";
import { BacktestProfiles } from "./BacktestProfiles";

export function BacktestingLab() {
  const [activeSubTab, setActiveSubTab] = useState<"overview" | "equity" | "trades" | "presets">("overview");

  const [currentConfig, setCurrentConfig] = useState<BacktestRequest>({
    symbol: "BTC/USDT",
    timeframe: "5m",
    start_date: "2024-01-01",
    end_date: "2024-06-01",
    strategy_name: "EMA_MACD_VP",
    initial_cash: 10000.0,
    allow_shorts: true,
  });

  const [backtestResult, setBacktestResult] = useState<BacktestResult>({
    total_net_profit: 1250.50,
    return_pct: 12.51,
    total_trades: 18,
    win_rate_pct: 66.67,
    max_drawdown_pct: 4.12,
    sharpe_ratio: 1.95,
    trades: [],
  });

  // Run Backtest Mutation
  const backtestMutation = useMutation({
    mutationFn: async (req: BacktestRequest): Promise<BacktestResponse> => {
      const res = await fetch("/api/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Server returned HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      if (data.status === "success" && data.backtest) {
        setBacktestResult(data.backtest);
        setCurrentConfig(variables);
      }
    },
  });

  // Execute initial backtest simulation once on mount to establish live state
  useEffect(() => {
    backtestMutation.mutate(currentConfig);
  }, []);

  const handleRun = (newConfig: BacktestRequest) => {
    setCurrentConfig(newConfig);
    backtestMutation.mutate(newConfig);
  };

  const handleSelectPreset = (presetConfig: Partial<BacktestRequest>) => {
    const updated = { ...currentConfig, ...presetConfig };
    setCurrentConfig(updated);
    setActiveSubTab("overview");
    backtestMutation.mutate(updated);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white">
            <FlaskConical className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-wide">
                HISTORICAL BACKTESTING LAB
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
                BACKTRADER ENGINE
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              High-fidelity offline multi-candle strategy verification & walk-forward risk audit
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => backtestMutation.mutate(currentConfig)}
            disabled={backtestMutation.isPending}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#0B0F17] hover:bg-slate-800 border border-[#1E293B] text-xs font-semibold text-slate-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${backtestMutation.isPending ? "animate-spin text-cyan-400" : ""}`} />
            <span>Re-run Simulation</span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-[#1E293B] pb-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveSubTab("overview")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeSubTab === "overview"
              ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/20"
              : "text-slate-400 hover:text-slate-200 hover:bg-[#121824]"
          }`}
        >
          <FlaskConical className="h-3.5 w-3.5" />
          <span>Simulator & Results</span>
        </button>

        <button
          onClick={() => setActiveSubTab("equity")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeSubTab === "equity"
              ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/20"
              : "text-slate-400 hover:text-slate-200 hover:bg-[#121824]"
          }`}
        >
          <LineChart className="h-3.5 w-3.5" />
          <span>Equity Curve & Drawdown</span>
        </button>

        <button
          onClick={() => setActiveSubTab("trades")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeSubTab === "trades"
              ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/20"
              : "text-slate-400 hover:text-slate-200 hover:bg-[#121824]"
          }`}
        >
          <ListFilter className="h-3.5 w-3.5" />
          <span>Simulated Trades Ledger</span>
        </button>

        <button
          onClick={() => setActiveSubTab("presets")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeSubTab === "presets"
              ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/20"
              : "text-slate-400 hover:text-slate-200 hover:bg-[#121824]"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Strategy Presets & Profiles</span>
        </button>
      </div>

      {/* Mutation Error Fallback */}
      {backtestMutation.isError && (
        <BacktestError
          message={backtestMutation.error?.message || "Backtest execution failed"}
          onRetry={() => backtestMutation.mutate(currentConfig)}
        />
      )}

      {/* Tab 1: Simulator & Results View */}
      {activeSubTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Config Panel */}
          <div className="lg:col-span-1">
            <BacktestConfigPanel
              initialConfig={currentConfig}
              onRunBacktest={handleRun}
              isLoading={backtestMutation.isPending}
            />
          </div>

          {/* Right Column: Key Metrics & Executive Summary */}
          <div className="lg:col-span-2 space-y-6">
            <BacktestMetrics
              metrics={backtestResult}
              initialCash={currentConfig.initial_cash || 10000}
            />

            <BacktestSummary
              metrics={backtestResult}
              config={currentConfig}
            />

            <BacktestEquityCurve
              metrics={backtestResult}
              config={currentConfig}
            />
          </div>
        </div>
      )}

      {/* Tab 2: Full Equity Curve & Drawdown View */}
      {activeSubTab === "equity" && (
        <div className="space-y-6">
          <BacktestMetrics
            metrics={backtestResult}
            initialCash={currentConfig.initial_cash || 10000}
          />
          <BacktestEquityCurve
            metrics={backtestResult}
            config={currentConfig}
          />
        </div>
      )}

      {/* Tab 3: Simulated Trades Ledger */}
      {activeSubTab === "trades" && (
        <div className="space-y-6">
          <BacktestTradeTable trades={backtestResult.trades || []} />
        </div>
      )}

      {/* Tab 4: Strategy Presets & Profiles */}
      {activeSubTab === "presets" && (
        <div className="space-y-6">
          <BacktestProfiles
            onSelectPreset={handleSelectPreset}
            isLoading={backtestMutation.isPending}
          />
        </div>
      )}
    </div>
  );
}
