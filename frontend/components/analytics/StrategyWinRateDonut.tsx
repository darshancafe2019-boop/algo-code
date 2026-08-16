"use client";

import React from "react";
import { StrategyWinRate } from "@/types/analytics";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { Cpu } from "lucide-react";

interface Props {
  data: StrategyWinRate[];
}

const COLORS = ["#00F0FF", "#00E676", "#A855F7", "#FFD600", "#FF1744"];

export function StrategyWinRateDonut({ data }: Props) {
  if (!data || data.length === 0) {

    return (
      <div className="p-5 rounded-xl bg-[#121824] border border-[#1E293B] flex flex-col items-center justify-center min-h-[300px] text-xs text-slate-400">
        No strategy win rate data available.
      </div>
    );
  }

  return (
    <div className="p-5 rounded-xl bg-[#121824] border border-[#1E293B] shadow-xl flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2 border-b border-[#1E293B] pb-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white">Chart 4 — Strategy Win Rate %</h3>
        </div>
        <span className="text-[11px] font-mono text-slate-400">{data.length} Strategies</span>
      </div>

      <div className="h-[220px] w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={4}
              dataKey="win_rate"
              nameKey="strategy"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="#0B0F17" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: "#0B0F17", borderColor: "#1E293B", borderRadius: "8px", fontSize: "12px" }}
              formatter={(value: any, name: any, props: any) => [
                `${Number(value).toFixed(1)}% (${props.payload.total_trades} trades)`,
                props.payload.strategy,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-sm font-bold font-mono text-white">Win Rate</span>
          <span className="text-[10px] text-slate-400">Per Strategy</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 text-xs pt-2 border-t border-[#1A2333]">
        {data.map((item, idx) => (
          <div key={item.strategy} className="flex items-center gap-1.5 text-[11px]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
            <span className="text-slate-300 font-mono">{item.strategy}: <strong>{item.win_rate}%</strong></span>
          </div>
        ))}
      </div>
    </div>
  );
}
