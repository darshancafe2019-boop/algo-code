"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Play, RefreshCw, Bot, AlertTriangle } from "lucide-react";
import { BotSummaryCards } from "./BotSummaryCards";
import { BotControlCard, BotInstance } from "./BotControlCard";
import { CreateBotModal } from "./CreateBotModal";
import { StartAllModal } from "./StartAllModal";
import { IndicatorLibraryDrawer } from "./IndicatorLibraryDrawer";
import { DecisionLogFeed } from "./DecisionLogFeed";
import { StrategyDiagnosisBanner } from "./StrategyDiagnosisBanner";
import { ErrorBoundary } from "../ErrorBoundary";

export function BotControlTab() {
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isStartAllOpen, setIsStartAllOpen] = useState(false);
  const [startAllReport, setStartAllReport] = useState<any>(null);
  const [selectedBotForIndicators, setSelectedBotForIndicators] = useState<BotInstance | null>(null);

  // Fetch Bots List (`GET /api/bots`)
  const { data: botsData, isLoading, error } = useQuery({
    queryKey: ["botsList"],
    queryFn: async () => {
      const res = await fetch("/api/bots");
      if (!res.ok) throw new Error("Failed to fetch bot instances");
      return res.json();
    },
    refetchInterval: 3000,
  });

  // Fetch Summary (`GET /api/bots/summary`)
  const { data: summaryData } = useQuery({
    queryKey: ["botsSummary"],
    queryFn: async () => {
      const res = await fetch("/api/bots/summary");
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
    refetchInterval: 3000,
  });

  // Start All Mutation (`POST /api/bots/start-all`)
  const startAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/bots/start-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Start all failed");
      return data;
    },
    onSuccess: (data) => {
      setStartAllReport(data);
      setIsStartAllOpen(true);
      queryClient.invalidateQueries({ queryKey: ["botsList"] });
      queryClient.invalidateQueries({ queryKey: ["botsSummary"] });
    },
  });

  const bots: BotInstance[] = botsData?.bots || [];
  const metrics = summaryData?.metrics || {
    total_bots: bots.length,
    running: bots.filter((b) => b.status === "RUNNING").length,
    paused: bots.filter((b) => b.status === "PAUSED").length,
    stopped: bots.filter((b) => b.status === "STOPPED" || b.status === "CREATED").length,
    paper: bots.filter((b) => (b.execution_mode || "").toUpperCase() === "PAPER").length,
    live: bots.filter((b) => (b.execution_mode || "").toUpperCase() === "LIVE").length,
    open_trades: 0,
    today_pnl: 0,
    total_pnl: 0,
  };

  return (
    <div className="space-y-6">
      {/* Top Section Summary Cards */}
      <ErrorBoundary title="Bot Metrics Summary Failed">
        <BotSummaryCards metrics={metrics} />
      </ErrorBoundary>

      {/* Strategy Diagnosis Banner */}
      <ErrorBoundary title="Strategy Confluence Banner Failed">
        <StrategyDiagnosisBanner />
      </ErrorBoundary>

      {/* Main Controls & Bot Cards Section */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Bot className="h-5 w-5 text-cyan-400" />
            Bot Control & Instances
          </h2>
          <p className="text-xs text-slate-400">
            Manage active trading bot processes, runtime status, and per-bot parameters.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            disabled={startAllMutation.isPending}
            onClick={() => startAllMutation.mutate()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-bold text-xs transition-all shadow-lg shadow-emerald-950/40 disabled:opacity-50"
          >
            {startAllMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4 fill-current" />
            )}
            <span>Start All Bots</span>
          </button>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-all shadow-lg shadow-cyan-950/40"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span>Create Bot Instance</span>
          </button>
        </div>
      </div>

      {/* Bot Cards Grid with Fault Isolation */}
      <ErrorBoundary title="Bot Instances Grid Failed">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-56 bg-[#121824] border border-[#1E293B] rounded-xl animate-pulse p-4"
              />
            ))}
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-xs">
            Failed to load bot instances from server. Please check backend connection.
          </div>
        ) : bots.length === 0 ? (
          <div className="p-8 text-center bg-[#121824] border border-[#1E293B] rounded-xl">
            <Bot className="h-10 w-10 text-slate-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-300">No bot instances configured</p>
            <p className="text-xs text-slate-400 mt-1">Click "Create Bot Instance" to spawn your first trading bot.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bots.map((bot) => (
              <BotControlCard
                key={bot.id}
                bot={bot}
                onOpenIndicators={(b) => setSelectedBotForIndicators(b)}
              />
            ))}
          </div>
        )}
      </ErrorBoundary>

      {/* Live Decision Log Feed */}
      <ErrorBoundary title="Decision Log Feed Failed">
        <DecisionLogFeed />
      </ErrorBoundary>

      {/* Modals & Drawers */}
      <CreateBotModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
      <StartAllModal
        isOpen={isStartAllOpen}
        onClose={() => setIsStartAllOpen(false)}
        report={startAllReport}
      />
      <IndicatorLibraryDrawer
        isOpen={!!selectedBotForIndicators}
        bot={selectedBotForIndicators}
        onClose={() => setSelectedBotForIndicators(null)}
      />
    </div>
  );
}
