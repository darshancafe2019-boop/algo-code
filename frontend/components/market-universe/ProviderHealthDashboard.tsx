"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProviderHealth } from "@/types/market-universe";
import {
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Database,
  Radio,
  ExternalLink,
  ShieldCheck,
  Server
} from "lucide-react";

interface ProviderHealthDashboardProps {
  onSyncCompleted?: () => void;
}

export function ProviderHealthDashboard({ onSyncCompleted }: ProviderHealthDashboardProps) {
  const [syncingProviderId, setSyncingProviderId] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<{ status: string; providers: ProviderHealth[] }>({
    queryKey: ["providerHealth"],
    queryFn: async () => {
      const res = await fetch("/api/universe/providers");
      if (!res.ok) throw new Error("Failed to fetch provider health");
      return res.json();
    },
    refetchInterval: 6000,
  });

  const handleSyncProvider = async (providerId: string) => {
    setSyncingProviderId(providerId);
    try {
      const res = await fetch("/api/universe/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: providerId }),
      });
      if (res.ok) {
        refetch();
        onSyncCompleted?.();
      }
    } catch (err) {
      console.error("Provider sync failed:", err);
    } finally {
      setSyncingProviderId(null);
    }
  };

  const providers = data?.providers || [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="p-4 rounded-xl bg-[#121824] border border-[#1E293B] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
              Multi-Market Feed & Data Provider Health Engine
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                {providers.filter((p) => p.status === "CONNECTED").length}/{providers.length} Connected
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Live connection states, round-trip latencies, entitlement tracking, and multi-exchange data discovery audit.
            </p>
          </div>
        </div>

        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 rounded-lg bg-[#0F141F] hover:bg-slate-800 border border-[#1E293B] text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin text-cyan-400" : ""}`} />
          Refresh Health Status
        </button>
      </div>

      {/* Provider Cards Grid */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400">
          <RefreshCw className="h-7 w-7 animate-spin mx-auto mb-2 text-cyan-400" />
          <p className="text-xs">Inspecting market provider connections and heartbeat...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {providers.map((p) => {
            const isConnected = p.status === "CONNECTED";
            const isLimited = p.status === "LIMITED";
            const isDegraded = p.status === "DEGRADED";
            const isSyncing = syncingProviderId === p.provider_id;

            return (
              <div
                key={p.provider_id}
                className="p-4 rounded-xl bg-[#0F141F] border border-[#1E293B] hover:border-cyan-500/30 transition-all flex flex-col justify-between space-y-3"
              >
                <div>
                  {/* Status header */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                      {p.provider_id}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                        isConnected
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : isLimited
                          ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                          : isDegraded
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                          : "bg-slate-500/10 text-slate-400 border-slate-500/30"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                      {p.status}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-white">{p.name}</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{p.coverage || "Real-time quote and historical stream"}</p>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-[#1E293B]">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Latency</span>
                    <span
                      className={`font-bold ${
                        p.latency_ms < 50
                          ? "text-emerald-400"
                          : p.latency_ms < 200
                          ? "text-amber-400"
                          : "text-rose-400"
                      }`}
                    >
                      {p.latency_ms > 0 ? `${p.latency_ms} ms` : "< 1 ms"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 block">Discovered Instruments</span>
                    <span className="text-white font-bold">{p.instrument_count || 0} Assets</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 block">Realtime Stream</span>
                    <span className="text-emerald-400 font-semibold">{p.realtime_capable ? "ENABLED" : "OFF"}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 block">Entitlement</span>
                    <span className="text-cyan-400 font-semibold">{p.entitlement_status || "ACTIVE"}</span>
                  </div>
                </div>

                {/* Footer sync action */}
                <div className="pt-2 border-t border-[#1E293B] flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">
                    {p.last_sync ? `Sync: ${new Date(p.last_sync).toLocaleTimeString()}` : "Sync: OK"}
                  </span>
                  <button
                    onClick={() => handleSyncProvider(p.provider_id)}
                    disabled={isSyncing}
                    className="px-3 py-1 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 text-xs font-bold border border-cyan-500/30 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin text-cyan-400" : ""}`} />
                    {isSyncing ? "Syncing..." : "Sync Provider"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
