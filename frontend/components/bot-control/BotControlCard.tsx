"use client";

import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Pause, Square, Trash2, Sliders, RefreshCw, Activity, Clock, Layers } from "lucide-react";

export interface BotInstance {
  id: string;
  name: string;
  symbol: string;
  strategy: string;
  timeframe: string;
  asset_class?: string;
  execution_mode: string;
  status: string;
  allocated_capital: number;
  live_pnl?: number;
  open_trades?: number;
  required_confidence?: number;
  last_heartbeat?: string;
  health?: {
    is_process_alive: boolean;
    uptime_formatted?: string;
    last_checked_seconds_ago?: number;
    error_count?: number;
  };
  indicators?: string[];
}

interface Props {
  bot: BotInstance;
  onOpenIndicators: (bot: BotInstance) => void;
}

export function BotControlCard({ bot, onOpenIndicators }: Props) {
  const queryClient = useQueryClient();

  // Ticking countdown state for "Last Checked"
  const [secondsAgo, setSecondsAgo] = useState<number>(
    bot.health?.last_checked_seconds_ago || 0
  );

  useEffect(() => {
    setSecondsAgo(bot.health?.last_checked_seconds_ago || 0);
    const interval = setInterval(() => {
      setSecondsAgo((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [bot.health?.last_checked_seconds_ago]);

  const controlMutation = useMutation({
    mutationFn: async (action: string) => {
      const res = await fetch(`/api/bots/${bot.id}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || data.status === "error") {
        throw new Error(data.message || `Failed to execute ${action}`);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["botsList"] });
      queryClient.invalidateQueries({ queryKey: ["botsSummary"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/bots/${bot.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || data.status === "error") {
        throw new Error(data.message || "Delete failed");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["botsList"] });
      queryClient.invalidateQueries({ queryKey: ["botsSummary"] });
    },
  });

  const status = bot.status.toUpperCase();
  const isRunning = status === "RUNNING";
  const isPaused = status === "PAUSED";
  const isStopped = status === "STOPPED" || status === "CREATED";
  const isError = status === "ERROR";
  const isStalled = status === "STALLED";
  const mode = (bot.execution_mode || "PAPER").toUpperCase();

  const pnl = bot.live_pnl || 0;
  const openTrades = bot.open_trades || 0;
  const isPending = controlMutation.isPending || deleteMutation.isPending;

  return (
    <div className="bg-[#121824] border border-[#1E293B] hover:border-cyan-500/30 rounded-xl p-5 shadow-xl transition-all flex flex-col justify-between">
      {/* Header Row */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-base font-bold text-white tracking-wide">{bot.name}</h3>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 font-mono">
              <span className="text-cyan-400 font-semibold">{bot.symbol}</span>
              <span>•</span>
              <span>{bot.strategy}</span>
              <span>•</span>
              <span>{bot.timeframe}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Mode Badge */}
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                mode === "LIVE"
                  ? "bg-amber-950/80 text-amber-400 border border-amber-800"
                  : "bg-cyan-950/80 text-cyan-400 border border-cyan-800"
              }`}
            >
              {mode}
            </span>

            {/* Status Pill */}
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1.5 ${
                isRunning
                  ? "bg-emerald-950/80 text-emerald-400 border border-emerald-500/40"
                  : isPaused
                  ? "bg-amber-950/80 text-amber-400 border border-amber-500/40"
                  : isStalled
                  ? "bg-purple-950/80 text-purple-400 border border-purple-500/40"
                  : isError
                  ? "bg-red-950/80 text-red-400 border border-red-500/40"
                  : "bg-slate-800 text-slate-400 border border-slate-700"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isRunning
                    ? "bg-emerald-400 animate-ping"
                    : isPaused
                    ? "bg-amber-400"
                    : isError
                    ? "bg-red-400"
                    : "bg-slate-400"
                }`}
              />
              {status}
            </span>
          </div>
        </div>

        {/* Health & Metrics Bar */}
        <div className="grid grid-cols-3 gap-2 my-4 bg-[#0B0F17] p-3 rounded-lg border border-[#1A2333] text-xs">
          <div>
            <span className="text-[10px] text-slate-400 block mb-0.5">Realized P&L</span>
            <span
              className={`font-mono font-bold ${
                pnl >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-slate-400 block mb-0.5">Open Positions</span>
            <span className="font-mono font-bold text-white">{openTrades}</span>
          </div>

          <div>
            <span className="text-[10px] text-slate-400 block mb-0.5">Uptime</span>
            <span className="font-mono text-slate-300">
              {bot.health?.uptime_formatted || "0m 0s"}
            </span>
          </div>
        </div>

        {/* Last Checked Ticking Counter & Indicators */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-4 px-1">
          <div className="flex items-center gap-1 font-mono">
            <Clock className="h-3 w-3 text-slate-500" />
            <span>Last checked: {secondsAgo}s ago</span>
          </div>

          <div className="flex items-center gap-1 font-mono">
            <Layers className="h-3 w-3 text-cyan-400" />
            <span>{bot.indicators?.length || 0}/4 Indicators</span>
          </div>
        </div>
      </div>

      {/* Control Buttons Footer */}
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#1A2333]">
        <div className="flex items-center gap-2">
          {isStopped && (
            <button
              disabled={isPending}
              onClick={() => controlMutation.mutate("START")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {controlMutation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              <Play className="h-3.5 w-3.5" />
              <span>Start</span>
            </button>
          )}

          {isRunning && (
            <button
              disabled={isPending}
              onClick={() => controlMutation.mutate("PAUSE")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {controlMutation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              <Pause className="h-3.5 w-3.5" />
              <span>Pause</span>
            </button>
          )}

          {isPaused && (
            <button
              disabled={isPending}
              onClick={() => controlMutation.mutate("RESUME")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {controlMutation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              <Play className="h-3.5 w-3.5" />
              <span>Resume</span>
            </button>
          )}

          {(isRunning || isPaused) && (
            <button
              disabled={isPending}
              onClick={() => controlMutation.mutate("STOP")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              <Square className="h-3.5 w-3.5" />
              <span>Stop</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onOpenIndicators(bot)}
            title="Configure Indicators"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            <Sliders className="h-4 w-4" />
          </button>

          <button
            disabled={isPending || isRunning}
            onClick={() => {
              if (confirm(`Delete bot '${bot.name}'? Historical trade logs will be preserved.`)) {
                deleteMutation.mutate();
              }
            }}
            title={isRunning ? "Stop bot before deleting" : "Delete Bot"}
            className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-800/60 transition-colors disabled:opacity-30"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
