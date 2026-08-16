"use client";

import React from "react";
import { OpenClosedDonutData } from "@/types/analytics";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { Layers } from "lucide-react";

interface Props {
  data: OpenClosedDonutData;
}

export function OpenClosedDonut({ data }: Props) {
  const chartData = [
    { name: "Open Positions", value: data.open, color: "#A855F7" },
    { name: "Closed Trades", value: data.closed, color: "#00F0FF" },
  ].filter((item) => item.value > 0);

  const total = data.open + data.closed;

  return (
    <div className="p-5 rounded-xl bg-[#121824] border border-[#1E293B] shadow-xl flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2 border-b border-[#1E293B] pb-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-purple-400" />
          <h3 className="text-sm font-bold text-white">Chart 3 — Open vs Closed Trades</h3>
        </div>
        <span className="text-[11px] font-mono text-purple-400 font-bold">{data.open} Active</span>
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

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-bold font-mono text-white">{total}</span>
          <span className="text-[10px] text-slate-400">Total Recorded</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 text-xs pt-2 border-t border-[#1A2333]">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#A855F7]" />
          <span className="text-slate-300">Open ({data.open})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#00F0FF]" />
          <span className="text-slate-300">Closed ({data.closed})</span>
        </div>
      </div>
    </div>
  );
}
