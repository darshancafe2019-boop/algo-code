"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BotLeaderboardRow } from "@/types/analytics";
import { Trophy, ArrowUpDown, ArrowUp, ArrowDown, Play, Pause, Square, RefreshCw, AlertCircle } from "lucide-react";

interface Props {
  bots: BotLeaderboardRow[];
}

type SortField = "name" | "net_pnl" | "roi_pct" | "win_rate_pct" | "total_trades" | "status";
type SortOrder = "asc" | "desc";

export function MultiBotLeaderboard({ bots }: Props) {
  const queryClient = useQueryClient();

  const [sortField, setSortField] = useState<SortField>("net_pnl");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const controlMutation = useMutation({
    mutationFn: async ({ botId, action }: { botId: string; action: string }) => {
      const res = await fetch(`/api/bots/${botId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || data.status === "error") {
        throw new Error(data.message || `Action ${action} failed`);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analyticsData"] });
      queryClient.invalidateQueries({ queryKey: ["botsList"] });
      setErrorMessage(null);
    },
    onError: (err: any) => {
      setErrorMessage(err.message);
    },
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const sortedBots = [...bots].sort((a, b) => {
    let valA: any = a[sortField] ?? 0;
    let valB: any = b[sortField] ?? 0;

    if (typeof valA === "string") {
      valA = valA.toLowerCase();
      valB = (valB as string).toLowerCase();
    }

    if (valA < valB) return sortOrder === "asc" ? -1 : 1;
    if (valA > valB) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <div className="p-5 rounded-xl bg-[#121824] border border-[#1E293B] shadow-xl">
      <div className="flex items-center justify-between mb-4 border-b border-[#1E293B] pb-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-400" />
          <h3 className="text-sm font-bold text-white">Multi-Bot Performance Leaderboard</h3>
        </div>
        <span className="text-xs text-slate-400 font-mono">{bots.length} Active Instances</span>
      </div>

      {errorMessage && (
        <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-800 text-xs text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-slate-400 hover:text-white text-xs">
            Dismiss
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#0B0F17] text-slate-400 border-b border-[#1E293B] font-mono">
              <th className="p-3">Rank</th>

              <th className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort("name")}>
                <div className="flex items-center gap-1">
                  <span>Bot Instance</span>
                  <ArrowUpDown className="h-3 w-3 text-slate-500" />
                </div>
              </th>

              <th className="p-3">Asset & Strategy</th>

              <th className="p-3 cursor-pointer hover:text-white text-right" onClick={() => handleSort("net_pnl")}>
                <div className="flex items-center justify-end gap-1">
                  <span>Net P&L ($)</span>
                  <ArrowUpDown className="h-3 w-3 text-slate-500" />
                </div>
              </th>

              <th className="p-3 cursor-pointer hover:text-white text-right" onClick={() => handleSort("roi_pct")}>
                <div className="flex items-center justify-end gap-1">
                  <span>ROI %</span>
                  <ArrowUpDown className="h-3 w-3 text-slate-500" />
                </div>
              </th>

              <th className="p-3 cursor-pointer hover:text-white text-right" onClick={() => handleSort("win_rate_pct")}>
                <div className="flex items-center justify-end gap-1">
                  <span>Win Rate %</span>
                  <ArrowUpDown className="h-3 w-3 text-slate-500" />
                </div>
              </th>

              <th className="p-3 cursor-pointer hover:text-white text-right" onClick={() => handleSort("total_trades")}>
                <div className="flex items-center justify-end gap-1">
                  <span>Trades</span>
                  <ArrowUpDown className="h-3 w-3 text-slate-500" />
                </div>
              </th>

              <th className="p-3 cursor-pointer hover:text-white text-center" onClick={() => handleSort("status")}>
                <div className="flex items-center justify-center gap-1">
                  <span>Status</span>
                  <ArrowUpDown className="h-3 w-3 text-slate-500" />
                </div>
              </th>

              <th className="p-3 text-right">Controls</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#1A2333]">
            {sortedBots.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-6 text-center text-slate-400 font-mono">
                  No bot instances registered in leaderboard.
                </td>
              </tr>
            ) : (
              sortedBots.map((bot, index) => {
                const status = (bot.status || "STOPPED").toUpperCase();
                const isRunning = status === "RUNNING";
                const isPaused = status === "PAUSED";
                const isStopped = status === "STOPPED" || status === "CREATED";
                const isPositive = bot.net_pnl >= 0;

                return (
                  <tr key={bot.bot_id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 font-mono font-bold text-slate-400">#{index + 1}</td>

                    <td className="p-3 font-semibold text-white">
                      <div>{bot.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{bot.bot_id}</div>
                    </td>

                    <td className="p-3 font-mono text-slate-300">
                      <div><strong className="text-cyan-400">{bot.symbol}</strong> • {bot.strategy}</div>
                      <div className="text-[10px] text-slate-400">{bot.timeframe} • Capital: ${bot.allocated_capital.toLocaleString()}</div>
                    </td>

                    <td className="p-3 text-right font-mono font-bold">
                      <span className={isPositive ? "text-emerald-400" : "text-red-400"}>
                        {isPositive ? "+$" : "-$"}{Math.abs(bot.net_pnl).toFixed(2)}
                      </span>
                    </td>

                    <td className="p-3 text-right font-mono font-bold">
                      <span className={bot.roi_pct >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {bot.roi_pct >= 0 ? "+" : ""}{bot.roi_pct.toFixed(2)}%
                      </span>
                    </td>

                    <td className="p-3 text-right font-mono text-slate-200">
                      <strong>{bot.win_rate_pct.toFixed(1)}%</strong>
                    </td>

                    <td className="p-3 text-right font-mono text-slate-300">
                      {bot.total_trades} ({bot.open_trades} open)
                    </td>

                    <td className="p-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          isRunning
                            ? "bg-emerald-950/80 text-emerald-400 border border-emerald-500/40"
                            : isPaused
                            ? "bg-amber-950/80 text-amber-400 border border-amber-500/40"
                            : "bg-slate-800 text-slate-400 border border-slate-700"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? "bg-emerald-400 animate-ping" : isPaused ? "bg-amber-400" : "bg-slate-400"}`} />
                        {status}
                      </span>
                    </td>

                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isStopped && (
                          <button
                            disabled={controlMutation.isPending}
                            onClick={() => controlMutation.mutate({ botId: bot.bot_id, action: "START" })}
                            className="p-1.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40"
                            title="Start Bot"
                          >
                            <Play className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {isRunning && (
                          <button
                            disabled={controlMutation.isPending}
                            onClick={() => controlMutation.mutate({ botId: bot.bot_id, action: "PAUSE" })}
                            className="p-1.5 rounded bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40"
                            title="Pause Bot"
                          >
                            <Pause className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {isPaused && (
                          <button
                            disabled={controlMutation.isPending}
                            onClick={() => controlMutation.mutate({ botId: bot.bot_id, action: "RESUME" })}
                            className="p-1.5 rounded bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40"
                            title="Resume Bot"
                          >
                            <Play className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {(isRunning || isPaused) && (
                          <button
                            disabled={controlMutation.isPending}
                            onClick={() => controlMutation.mutate({ botId: bot.bot_id, action: "STOP" })}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                            title="Stop Bot"
                          >
                            <Square className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
