"use client";

import React from "react";
import { RealizedPnLSymbol } from "@/types/analytics";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from "recharts";
import { DollarSign } from "lucide-react";

interface Props {
  data: RealizedPnLSymbol[];
}

export function RealizedPLChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="p-5 rounded-xl bg-[#121824] border border-[#1E293B] flex flex-col items-center justify-center min-h-[300px] text-xs text-slate-400">
        No symbol P&L records found in current history.
      </div>
    );
  }

  return (
    <div className="p-5 rounded-xl bg-[#121824] border border-[#1E293B] shadow-xl flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4 border-b border-[#1E293B] pb-3">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">Chart 1 — Realized P&L by Symbol</h3>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">Realized P&L ($)</span>
      </div>

      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
            <XAxis dataKey="symbol" stroke="#64748B" fontSize={11} tickLine={false} />
            <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "#0B0F17", borderColor: "#1E293B", borderRadius: "8px", fontSize: "12px" }}
              formatter={(value: any) => [`$${Number(value).toFixed(2)}`, "Realized P&L"]}
            />
            <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? "#00E676" : "#FF1744"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
