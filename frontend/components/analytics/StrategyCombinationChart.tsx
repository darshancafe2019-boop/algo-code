"use client";

import React from "react";
import { StrategyCombo } from "@/types/analytics";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import { Layers } from "lucide-react";

interface Props {
  data: StrategyCombo[];
}

export function StrategyCombinationChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="p-5 rounded-xl bg-[#121824] border border-[#1E293B] flex flex-col items-center justify-center min-h-[300px] text-xs text-slate-400">
        No strategy combination metrics available.
      </div>
    );
  }

  return (
    <div className="p-5 rounded-xl bg-[#121824] border border-[#1E293B] shadow-xl flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4 border-b border-[#1E293B] pb-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-purple-400" />
          <h3 className="text-sm font-bold text-white">Chart 6 — Strategy Combination Analysis</h3>
        </div>
        <span className="text-[11px] font-mono text-slate-400">Wins, Losses & Net P&L</span>
      </div>

      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
            <XAxis dataKey="strategy" stroke="#64748B" fontSize={11} tickLine={false} />
            <YAxis yAxisId="left" stroke="#64748B" fontSize={11} tickLine={false} />
            <YAxis yAxisId="right" orientation="right" stroke="#64748B" fontSize={11} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "#0B0F17", borderColor: "#1E293B", borderRadius: "8px", fontSize: "12px" }}
            />
            <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
            <Bar yAxisId="left" dataKey="wins" name="Winning Trades" fill="#00E676" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="left" dataKey="losses" name="Losing Trades" fill="#FF1744" radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="pnl" name="Net P&L ($)" stroke="#00F0FF" strokeWidth={2.5} dot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
