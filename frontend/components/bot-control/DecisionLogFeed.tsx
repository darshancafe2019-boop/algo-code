"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ShieldCheck, AlertCircle, RefreshCw } from "lucide-react";

export function DecisionLogFeed() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["decisionLogs"],
    queryFn: async () => {
      const res = await fetch("/api/decision-logs?limit=15");
      if (!res.ok) throw new Error("Failed to fetch decision logs");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const logs = data?.decision_logs || data?.logs || [];

  return (
    <div className="bg-[#121824] border border-[#1E293B] rounded-xl p-5 shadow-xl">
      <div className="flex items-center justify-between border-b border-[#1E293B] pb-3 mb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white">Live Decision Log Feed</h3>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          title="Refresh Decision Logs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {logs.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400 font-mono">
            No decision logs recorded yet. Waiting for market scan cycle...
          </div>
        ) : (
          logs.map((log: any, index: number) => {
            const decision = (log.decision || log.direction || "HOLD").toUpperCase();
            const confidence = (log.confidence_score || log.bull_score || 0).toFixed(1);
            const isApproved = decision === "BUY" || decision === "LONG" || decision === "SELL" || decision === "SHORT";

            return (
              <div
                key={log.id || index}
                className="p-2.5 rounded-lg bg-[#0B0F17] border border-[#1A2333] flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-[10px] text-slate-500">
                    {log.timestamp ? log.timestamp.split("T")[1]?.slice(0, 8) : "Live"}
                  </span>
                  <span className="font-semibold text-slate-200">{log.bot_id || "bot-1"}</span>
                  <span className="text-slate-400">[{log.regime || "TRENDING"}]</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-400 font-mono">
                    Score: <strong className="text-cyan-400">{confidence}%</strong>
                  </span>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      isApproved
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {decision}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
