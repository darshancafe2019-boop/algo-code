"use client";

import React from "react";
import { EquityPoint } from "@/types/analytics";
import { ResponsiveContainer, AreaChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { TrendingUp } from "lucide-react";

interface Props {
  data: EquityPoint[];
}

export function EquityDrawdownChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="p-5 rounded-xl bg-[#121824] border border-[#1E293B] flex flex-col items-center justify-center min-h-[300px] text-xs text-slate-400">
        No equity curve records available.
      </div>
    );
  }

  // Format timestamps for chart ticks
  const formattedData = data.map((d) => ({
    ...d,
    timeLabel: d.time ? (d.time.includes("T") ? d.time.split("T")[1]?.slice(0, 5) : d.time.slice(-8)) : "Start",
  }));

  const currentEquity = data[data.length - 1]?.equity || 10000;
  const maxDD = Math.min(...data.map((d) => d.drawdown || 0));

  return (
    <div className="p-5 rounded-xl bg-[#121824] border border-[#1E293B] shadow-xl flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4 border-b border-[#1E293B] pb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">Chart 7 — Equity Curve & Drawdown History</h3>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <span>Current Equity: <strong className="text-emerald-400">${currentEquity.toLocaleString()}</strong></span>
          <span>Max DD: <strong className="text-red-400">{maxDD.toFixed(2)}%</strong></span>
        </div>
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formattedData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00E676" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#00E676" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="ddGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FF1744" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#FF1744" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
            <XAxis dataKey="timeLabel" stroke="#64748B" fontSize={11} tickLine={false} />
            <YAxis yAxisId="equity" stroke="#00E676" fontSize={11} tickLine={false} domain={["auto", "auto"]} />
            <YAxis yAxisId="dd" orientation="right" stroke="#FF1744" fontSize={11} tickLine={false} domain={["auto", 0]} />
            
            <Tooltip
              contentStyle={{ backgroundColor: "#0B0F17", borderColor: "#1E293B", borderRadius: "8px", fontSize: "12px" }}
              formatter={(value: any, name: any) => [
                name === "equity" ? `$${Number(value).toFixed(2)}` : `${Number(value).toFixed(2)}%`,
                name === "equity" ? "Account Equity" : "Drawdown",
              ]}
            />

            <Area
              yAxisId="equity"
              type="monotone"
              dataKey="equity"
              name="equity"
              stroke="#00E676"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#equityGradient)"
            />

            <Area
              yAxisId="dd"
              type="monotone"
              dataKey="drawdown"
              name="drawdown"
              stroke="#FF1744"
              strokeWidth={1.5}
              fillOpacity={1}
              fill="url(#ddGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
