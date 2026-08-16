"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnalyticsPayload } from "@/types/analytics";
import { PerformanceSummary } from "./PerformanceSummary";
import { RealizedPLChart } from "./RealizedPLChart";
import { WinLossDonut } from "./WinLossDonut";
import { OpenClosedDonut } from "./OpenClosedDonut";
import { StrategyWinRateDonut } from "./StrategyWinRateDonut";
import { StrategyComparisonChart } from "./StrategyComparisonChart";
import { StrategyCombinationChart } from "./StrategyCombinationChart";
import { EquityDrawdownChart } from "./EquityDrawdownChart";
import { MultiBotLeaderboard } from "./MultiBotLeaderboard";
import { MetricSkeleton, ChartSkeleton, LeaderboardSkeleton } from "./AnalyticsSkeleton";
import { AnalyticsError } from "./AnalyticsError";
import { ErrorBoundary } from "../ErrorBoundary";
import { LineChart, RefreshCw, Filter } from "lucide-react";

export function PerformanceAnalytics() {
  const [botFilter, setBotFilter] = useState("ALL");
  const [strategyFilter, setStrategyFilter] = useState("ALL");
  const [symbolFilter, setSymbolFilter] = useState("ALL");

  const { data, isLoading, error, refetch, isFetching } = useQuery<AnalyticsPayload>({
    queryKey: ["analyticsData", botFilter, strategyFilter, symbolFilter],
    queryFn: async () => {
      const url = `/api/analytics?bot_id=${botFilter}&strategy=${strategyFilter}&symbol=${symbolFilter}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Analytics API returned status ${res.status}`);
      }
      const json = await res.json();
      if (json.status === "error" || json.success === false) {
        throw new Error(json.error || json.message || "Failed to load analytics");
      }
      return json;
    },
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <MetricSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChartSkeleton title="Realized P&L" />
          <ChartSkeleton title="Equity Curve" />
        </div>
        <LeaderboardSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <AnalyticsError
        title="Performance Analytics Failed to Load"
        message={error instanceof Error ? error.message : "Server error"}
        onRetry={() => refetch()}
      />
    );
  }

  const summary = data.trade_summary;
  const charts = data.charts || {
    realized_pnl_by_symbol: [],
    win_loss_donut: { winning: 0, losing: 0, breakeven: 0, ratio_str: "0:0" },
    open_closed_donut: { open: 0, closed: 0 },
    strategy_winrate_donut: [],
    direction_donut: { long_count: 0, short_count: 0, long_pct: 0, short_pct: 0 },
    horizontal_bar_stats: [],
    strategy_combo: [],
    equity_curve: [],
  };

  const leaderboardBots = data.bot_comparison || [];

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <LineChart className="h-5 w-5 text-cyan-400" />
            Performance Analytics Terminal
          </h2>
          <p className="text-xs text-slate-400">
            Real-time trade stats, equity curve history, strategy confluences, and multi-bot leaderboard.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#121824] px-3 py-1.5 rounded-xl border border-[#1E293B] text-xs">
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            <select
              value={botFilter}
              onChange={(e) => setBotFilter(e.target.value)}
              className="bg-transparent text-white font-mono focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-[#0B0F17]">All Bots</option>
              <option value="bot-1" className="bg-[#0B0F17]">Alpha BTC Scalper #1</option>
              <option value="bot-2" className="bg-[#0B0F17]">Trend Breakout Pro #2</option>
            </select>
          </div>

          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl bg-[#121824] hover:bg-slate-800 border border-[#1E293B] text-slate-300 hover:text-white transition-colors"
            title="Refresh Analytics"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin text-cyan-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Top Performance Summary Cards */}
      <ErrorBoundary title="Performance Summary Section Failed">
        <PerformanceSummary summary={summary} />
      </ErrorBoundary>

      {/* Charts Grid Row 1: Realized P&L & Equity Curve */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ErrorBoundary title="Realized P&L Chart Failed">
          <RealizedPLChart data={charts.realized_pnl_by_symbol} />
        </ErrorBoundary>

        <ErrorBoundary title="Equity Drawdown Chart Failed">
          <EquityDrawdownChart data={data.equity_curve || charts.equity_curve} />
        </ErrorBoundary>
      </div>

      {/* Charts Grid Row 2: Win/Loss, Open/Closed, Strategy Win Rates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ErrorBoundary title="Win / Loss Distribution Donut Failed">
          <WinLossDonut data={charts.win_loss_donut} />
        </ErrorBoundary>

        <ErrorBoundary title="Open vs Closed Donut Failed">
          <OpenClosedDonut data={charts.open_closed_donut} />
        </ErrorBoundary>

        <ErrorBoundary title="Strategy Win Rate Donut Failed">
          <StrategyWinRateDonut data={charts.strategy_winrate_donut} />
        </ErrorBoundary>
      </div>

      {/* Charts Grid Row 3: Strategy Comparison & Combination Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ErrorBoundary title="Strategy Comparison Chart Failed">
          <StrategyComparisonChart
            winRates={charts.strategy_winrate_donut}
            combos={charts.strategy_combo}
          />
        </ErrorBoundary>

        <ErrorBoundary title="Strategy Combination Analysis Failed">
          <StrategyCombinationChart data={charts.strategy_combo} />
        </ErrorBoundary>
      </div>

      {/* Multi-Bot Leaderboard */}
      <ErrorBoundary title="Multi-Bot Leaderboard Failed">
        <MultiBotLeaderboard bots={leaderboardBots} />
      </ErrorBoundary>
    </div>
  );
}
