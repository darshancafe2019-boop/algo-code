"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, ShieldAlert, ShieldCheck, Power, Zap, RefreshCw } from "lucide-react";

export function GlobalHealthBar() {
  const queryClient = useQueryClient();
  const [showKillSwitchModal, setShowKillSwitchModal] = useState(false);
  const [confirmToken, setConfirmToken] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const { data: summaryData, isLoading: isSummaryLoading } = useQuery({
    queryKey: ["botsSummary"],
    queryFn: async () => {
      const res = await fetch("/api/bots/summary");
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
    refetchInterval: 3000,
  });

  const { data: healthData } = useQuery({
    queryKey: ["systemHealth"],
    queryFn: async () => {
      const res = await fetch("/api/bot/status");
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const killSwitchMutation = useMutation({
    mutationFn: async ({ action, token }: { action: string; token?: string }) => {
      const res = await fetch("/api/bot/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, confirmation_token: token }),
      });
      const data = await res.json();
      if (!res.ok || data.status === "error") {
        throw new Error(data.message || "Kill switch action failed");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["botsSummary"] });
      queryClient.invalidateQueries({ queryKey: ["systemHealth"] });
      queryClient.invalidateQueries({ queryKey: ["botsList"] });
      setShowKillSwitchModal(false);
      setConfirmToken("");
      setErrorMessage("");
    },
    onError: (err: any) => {
      setErrorMessage(err.message);
    },
  });

  const metrics = summaryData?.metrics || {
    running: 0,
    stopped: 0,
    paused: 0,
    paper: 0,
    live: 0,
    total_bots: 0,
  };

  const isKillSwitchActive = healthData?.system_summary?.kill_switch_active || false;
  const isHealthy = !isKillSwitchActive && metrics.error === 0;

  return (
    <>
      <div className="w-full bg-[#0E1524] border-b border-[#1E293B] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left Status Pill */}
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-2 px-3 py-1 rounded-full border font-medium transition-all ${
              isKillSwitchActive
                ? "bg-red-950/60 border-red-500/50 text-red-400 animate-pulse"
                : isHealthy
                ? "bg-emerald-950/50 border-emerald-500/30 text-emerald-400"
                : "bg-amber-950/50 border-amber-500/30 text-amber-400"
            }`}
          >
            {isKillSwitchActive ? (
              <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            )}
            <span>
              {isKillSwitchActive
                ? "🔴 TRADING HALTED — Emergency Kill Switch Active"
                : `System Healthy — ${metrics.running} Running, ${metrics.stopped} Stopped, ${metrics.paper} Paper`}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-4 text-slate-400 text-xs">
            <span>Total Bots: <strong className="text-white">{metrics.total_bots}</strong></span>
            <span>Paper: <strong className="text-cyan-400">{metrics.paper}</strong></span>
            <span>Live: <strong className="text-amber-400">{metrics.live}</strong></span>
          </div>
        </div>

        {/* Right Actions & Kill Switch Button */}
        <div className="flex items-center gap-2">
          {isKillSwitchActive ? (
            <button
              onClick={() => killSwitchMutation.mutate({ action: "DEACTIVATE_KILL_SWITCH" })}
              disabled={killSwitchMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-medium transition-colors"
            >
              <Zap className="h-3.5 w-3.5 text-emerald-400" />
              <span>Deactivate Kill Switch</span>
            </button>
          ) : (
            <button
              onClick={() => setShowKillSwitchModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 font-medium transition-colors"
            >
              <Power className="h-3.5 w-3.5 text-red-400" />
              <span>Emergency Kill Switch</span>
            </button>
          )}
        </div>
      </div>

      {/* Kill Switch Confirmation Modal */}
      {showKillSwitchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#121824] border border-red-500/40 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4 text-red-400">
              <ShieldAlert className="h-6 w-6 shrink-0" />
              <h2 className="text-lg font-bold text-white">Emergency Kill Switch</h2>
            </div>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Activating the Kill Switch will immediately stop all active trading processes, cancel pending orders, close open positions, and lock the execution pipeline.
            </p>

            <div className="mb-4">
              <label className="block text-xs text-slate-400 mb-1">
                Type <code className="text-red-400 font-bold">CONFIRM-KILL-SWITCH</code> to proceed:
              </label>
              <input
                type="text"
                value={confirmToken}
                onChange={(e) => setConfirmToken(e.target.value)}
                placeholder="CONFIRM-KILL-SWITCH"
                className="w-full bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-red-500 focus:outline-none"
              />
            </div>

            {errorMessage && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-800 p-2 rounded mb-4">
                {errorMessage}
              </p>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowKillSwitchModal(false);
                  setErrorMessage("");
                  setConfirmToken("");
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                disabled={confirmToken !== "CONFIRM-KILL-SWITCH" || killSwitchMutation.isPending}
                onClick={() =>
                  killSwitchMutation.mutate({
                    action: "KILL_SWITCH",
                    token: confirmToken,
                  })
                }
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold transition-colors"
              >
                {killSwitchMutation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                Trigger Kill Switch
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
