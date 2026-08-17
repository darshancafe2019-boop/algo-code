"use client";

import React, { useState } from "react";
import { AlertTriangle, Bell, Info, ShieldAlert, Shield, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { RiskEvent } from "@/types/risk";

export function RiskAlerts() {
  const [filterSeverity, setFilterSeverity] = useState<string>("ALL");

  const { data, isLoading, refetch, isFetching } = useQuery<{ status: string; events: RiskEvent[] }>({
    queryKey: ["riskHistory", filterSeverity],
    queryFn: async () => {
      const url = filterSeverity === "ALL" ? "/api/risk/history?limit=50" : `/api/risk/history?limit=50&event_type=${filterSeverity}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch risk history");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const events = data?.events || [];

  const getSeverityBadge = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case "EMERGENCY":
      case "CRITICAL":
        return "bg-red-950/80 border-red-800 text-red-400";
      case "WARNING":
        return "bg-amber-950/80 border-amber-800 text-amber-400";
      default:
        return "bg-cyan-950/80 border-cyan-800 text-cyan-400";
    }
  };

  return (
    <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Risk & Pre-Trade Audit Event Stream
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="bg-[#0E1524] border border-[#1E293B] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
          >
            <option value="ALL">All Severity Tiers</option>
            <option value="ORDER_BLOCKED">Order Blocked Events</option>
            <option value="WARNING">Warnings</option>
            <option value="CRITICAL">Critical Alerts</option>
          </select>
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-lg bg-[#1A2333] hover:bg-[#2A374A] text-slate-300 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {events.length > 0 ? (
          events.map((evt) => (
            <div
              key={evt.id}
              className="p-3 bg-[#0E1524] border border-[#1E293B] rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs font-mono"
            >
              <div className="flex items-start gap-2.5">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getSeverityBadge(evt.severity)}`}>
                  {evt.severity || "INFO"}
                </span>
                <div>
                  <div className="text-slate-100 font-semibold">{evt.message}</div>
                  <div className="text-[10px] text-slate-500 flex gap-3 mt-0.5">
                    <span>Bot: {evt.bot_id || "System"}</span>
                    {evt.symbol && <span>Symbol: {evt.symbol}</span>}
                    <span>Type: {evt.event_type}</span>
                  </div>
                </div>
              </div>
              <span className="text-[10px] text-slate-500 whitespace-nowrap">
                {new Date(evt.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))
        ) : (
          <div className="text-center py-10 text-xs text-slate-500 font-mono">
            No risk security events or blocked trade violations recorded. System operating securely.
          </div>
        )}
      </div>
    </div>
  );
}
