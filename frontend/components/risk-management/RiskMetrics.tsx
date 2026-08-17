"use client";

import React from "react";
import { Info, CheckCircle2, AlertTriangle, Layers, Wallet, Scale } from "lucide-react";
import { RiskOverviewState } from "@/types/risk";

interface RiskMetricsProps {
  overview: RiskOverviewState;
}

export function RiskMetrics({ overview }: RiskMetricsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Col 1 & 2: Multi-Factor Risk Score Breakdown */}
      <div className="lg:col-span-2 bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Explainable Risk Score Factors
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Authoritative Server State
          </span>
        </div>

        <div className="space-y-2 pt-1">
          {overview.score_factors && overview.score_factors.length > 0 ? (
            overview.score_factors.map((factor, idx) => {
              const isWarning = factor.includes(">") || factor.includes("High") || factor.includes("Elevated");
              return (
                <div
                  key={idx}
                  className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs ${
                    isWarning
                      ? "bg-amber-950/30 border-amber-800/40 text-amber-200"
                      : "bg-[#0E1524] border-[#1E293B] text-slate-300"
                  }`}
                >
                  {isWarning ? (
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  )}
                  <span className="font-mono">{factor}</span>
                </div>
              );
            })
          ) : (
            <div className="p-3 bg-[#0E1524] rounded-xl border border-[#1E293B] text-xs text-slate-400">
              No risk factor penalties active.
            </div>
          )}
        </div>
      </div>

      {/* Col 3: Exposure & Balance Summary */}
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Exposure & Capital
          </h3>
        </div>

        <div className="space-y-2.5 pt-1 text-xs">
          <div className="flex justify-between items-center p-2 rounded-lg bg-[#0E1524] border border-[#1E293B]">
            <span className="text-slate-400">Gross Notional Exposure:</span>
            <span className="font-mono font-bold text-slate-100">${overview.gross_exposure.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="flex justify-between items-center p-2 rounded-lg bg-[#0E1524] border border-[#1E293B]">
            <span className="text-slate-400">Net Directional Exposure:</span>
            <span className="font-mono font-bold text-cyan-400">${overview.net_exposure.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="flex justify-between items-center p-2 rounded-lg bg-[#0E1524] border border-[#1E293B]">
            <span className="text-slate-400">Total Account Balance:</span>
            <span className="font-mono font-bold text-emerald-400">${overview.account_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="flex justify-between items-center p-2 rounded-lg bg-[#0E1524] border border-[#1E293B]">
            <span className="text-slate-400">Open Position Count:</span>
            <span className="font-mono font-bold text-slate-200">{overview.open_positions_count} active</span>
          </div>
        </div>
      </div>
    </div>
  );
}
