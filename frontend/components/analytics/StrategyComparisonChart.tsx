"use client";

import React, { useState } from "react";
import { StrategyWinRate, StrategyCombo } from "@/types/analytics";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { BarChart3 } from "lucide-react";

interface Props {
  winRates: StrategyWinRate[];
  combos: StrategyCombo[];
}

export function StrategyComparisonChart({ winRates, combos }: Props) {
  const [metric, setMetric] = useState<"win_rate" | "pnl">("win_rate");

  // Merge datasets
  const merged = winRates.map((wr) => {
    const cb = combos.find((c) => c.strategy === wr.strategy);
    return {
      strategy: wr.strategy,
      win_rate: Number(wr.win_rate) || 0,
      pnl: cb ? Number(cb.pnl) || 0 : 0,
      total_trades: wr.total_trades || 0,
    };
  });

  // Sort numerically based on selected metric
  const sorted = [...merged].sort((a, b) => b[metric] - a[metric]);

  return (
    <div className="p-5 rounded-xl bg-[#121824] border border-[#1E293B] shadow-xl flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4 border-b border-[#1E293B] pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white">Chart 5 — Horizontal Strategy Comparison</h3>
        </div>

        <div className="flex items-center gap-1 bg-[#0B0F17] p-1 rounded-lg border border-[#1E293B]">
          <button
            onClick={() => setMetric("win_rate")}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
              metric === "win_rate" ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" : "text-slate-400"
            }`}
          >
            Win Rate %
          </button>
          <button
            onClick={() => setMetric("pnl")}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
              metric === "pnl" ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" : "text-slate-400"
            }`}
          >
            Net P&L ($)
          </button>
        </div>
      </div>

      <div className="h-[250px] w-full">
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-slate-400">
            No strategy comparison metrics available.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={sorted} margin={{ top: 10, right: 30, left: 40, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" horizontal={false} />
              <XAxis type="number" stroke="#64748B" fontSize={11} tickLine={false} />
              <YAxis type="category" dataKey="strategy" stroke="#64748B" fontSize={11} tickLine={false} width={100} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0B0F17", borderColor: "#1E293B", borderRadius: "8px", fontSize: "12px" }}
                formatter={(value: any) => [
                  metric === "win_rate" ? `${Number(value).toFixed(1)}%` : `$${Number(value).toFixed(2)}`,
                  metric === "win_rate" ? "Win Rate" : "Net P&L",
                ]}
              />
              <Bar dataKey={metric} radius={[0, 4, 4, 0]}>
                {sorted.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      metric === "win_rate"
                        ? "#00F0FF"
                        : entry.pnl >= 0
                        ? "#00E676"
                        : "#FF1744"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
