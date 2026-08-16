"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Cpu, ShieldCheck, AlertCircle } from "lucide-react";

export function StrategyDiagnosisBanner() {
  const { data } = useQuery({
    queryKey: ["marketContext"],
    queryFn: async () => {
      const res = await fetch("/api/market");
      if (!res.ok) throw new Error("Failed to fetch market context");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const regime = data?.market_direction || "TRENDING";
  const symbol = data?.symbol || "BTC/USDT";
  const price = data?.price || 65420.0;

  return (
    <div className="bg-gradient-to-r from-[#121824] via-[#0E1729] to-[#121824] border border-cyan-500/20 rounded-xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
          <Cpu className="h-5 w-5" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-white tracking-wide uppercase">
            Strategy Confluence Diagnosis — {symbol}
          </h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Active Confluence Engine evaluating EMA (20/50), MACD, RSI, and Volume Profile against 75.0% threshold.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs font-mono">
        <div className="bg-[#0B0F17] px-3 py-1.5 rounded-lg border border-[#1A2333]">
          <span className="text-slate-400">Regime: </span>
          <span className="font-bold text-cyan-400">{regime}</span>
        </div>

        <div className="bg-[#0B0F17] px-3 py-1.5 rounded-lg border border-[#1A2333]">
          <span className="text-slate-400">Min Score: </span>
          <span className="font-bold text-emerald-400">75.0%</span>
        </div>

        <div className="bg-[#0B0F17] px-3 py-1.5 rounded-lg border border-[#1A2333]">
          <span className="text-slate-400">Market Price: </span>
          <span className="font-bold text-white">${price.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
