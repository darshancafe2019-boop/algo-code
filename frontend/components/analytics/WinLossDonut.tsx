"use client";

import React from "react";
import { WinLossDonutData } from "@/types/analytics";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { PieChart as PieIcon } from "lucide-react";

interface Props {
  data: WinLossDonutData;
}

export function WinLossDonut({ data }: Props) {
  const chartData = [
    { name: "Winning Trades", value: data.winning, color: "#00E676" },
    { name: "Losing Trades", value: data.losing, color: "#FF1744" },
    { name: "Breakeven", value: data.breakeven, color: "#94A3B8" },
  ].filter((item) => item.value > 0);

  const total = data.winning + data.losing + data.breakeven;
  const winPct = total > 0 ? ((data.winning / total) * 100).toFixed(1) : "0.0";

  return (
    <div className="p-5 rounded-xl bg-[#121824] border border-[#1E293B] shadow-xl flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2 border-b border-[#1E293B] pb-3">
        <div className="flex items-center gap-2">
          <PieIcon className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white">Chart 2 — Win / Loss Distribution</h3>
        </div>
        <span className="text-[11px] font-mono text-cyan-400 font-bold">{winPct}% Win Rate</span>
      </div>

      <div className="h-[220px] w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData.length > 0 ? chartData : [{ name: "No Trades", value: 1, color: "#334155" }]}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={4}
              dataKey="value"
            >
              {(chartData.length > 0 ? chartData : [{ name: "No Trades", value: 1, color: "#334155" }]).map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="#0B0F17" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: "#0B0F17", borderColor: "#1E293B", borderRadius: "8px", fontSize: "12px" }}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Center Donut Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-bold font-mono text-white">{total}</span>
          <span className="text-[10px] text-slate-400">Total Trades</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 text-xs pt-2 border-t border-[#1A2333]">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#00E676]" />
          <span className="text-slate-300">Wins ({data.winning})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF1744]" />
          <span className="text-slate-300">Losses ({data.losing})</span>
        </div>
      </div>
    </div>
  );
}
