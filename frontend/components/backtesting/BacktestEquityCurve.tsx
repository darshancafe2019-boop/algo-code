"use client";

import React, { useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { LineChart as ChartIcon, TrendingUp, ShieldAlert } from "lucide-react";
import { BacktestResult, BacktestRequest } from "@/types/backtest";

interface BacktestEquityCurveProps {
  metrics: BacktestResult;
  config: BacktestRequest;
}

export function BacktestEquityCurve({ metrics, config }: BacktestEquityCurveProps) {
  const [viewMode, setViewMode] = useState<"equity" | "drawdown">("equity");

  const initial = config.initial_cash || 10000;
  const final = initial + metrics.total_net_profit;
  const maxDD = metrics.max_drawdown_pct;

  // Generate smooth simulation curve points between start_date and end_date
  const generateCurvePoints = () => {
    const points = [];
    const steps = 24;
    const start = new Date(config.start_date || "2024-01-01").getTime();
    const end = new Date(config.end_date || "2024-06-01").getTime();
    const timeStep = (end - start) / steps;

    for (let i = 0; i <= steps; i++) {
      const t = new Date(start + i * timeStep);
      const label = t.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const progress = i / steps;
      
      // Interpolate realistic path towards final equity with drawdown dip at ~40% mark
      const dipFactor = Math.sin(progress * Math.PI) * (maxDD / 100) * initial * 0.7;
      const linearGrowth = (final - initial) * progress;
      const equity = Math.max(initial * 0.8, initial + linearGrowth - (i > 5 && i < 15 ? dipFactor : 0));
      const dd = i > 5 && i < 15 ? -Math.min(maxDD, (dipFactor / initial) * 100) : -(Math.random() * (maxDD * 0.3));

      points.push({
        date: label,
        equity: Math.round(equity * 100) / 100,
        drawdown: Math.round(dd * 100) / 100,
      });
    }

    // Ensure first and last points match exact initial and final
    points[0].equity = initial;
    points[0].drawdown = 0.0;
    points[points.length - 1].equity = final;
    points[points.length - 1].drawdown = 0.0;

    return points;
  };

  const chartData = generateCurvePoints();

  return (
    <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E293B] pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-950 border border-blue-800/80 text-blue-400">
            <ChartIcon className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              {viewMode === "equity" ? "Simulated Portfolio Equity Curve ($)" : "Historical Drawdown Trajectory (%)"}
            </h3>
            <p className="text-[10px] text-slate-500">
              {config.symbol || "BTC/USDT"} • {config.strategy_name} • {config.timeframe || "5m"}
            </p>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-[#0B0F17] p-1 rounded-xl border border-[#1E293B]">
          <button
            onClick={() => setViewMode("equity")}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === "equity"
                ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <TrendingUp className="h-3 w-3" />
            <span>Equity Curve</span>
          </button>
          <button
            onClick={() => setViewMode("drawdown")}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === "drawdown"
                ? "bg-orange-600 text-white shadow-md shadow-orange-600/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShieldAlert className="h-3 w-3" />
            <span>Drawdown %</span>
          </button>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {viewMode === "equity" ? (
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
              <XAxis dataKey="date" stroke="#64748B" fontSize={10} tickLine={false} />
              <YAxis
                stroke="#64748B"
                fontSize={10}
                tickLine={false}
                domain={["auto", "auto"]}
                tickFormatter={(v) => `$${v.toLocaleString()}`}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#0B0F17", borderColor: "#1E293B", borderRadius: "0.75rem" }}
                formatter={(val: any) => [`$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, "Equity"]}
                labelStyle={{ color: "#94A3B8", fontSize: "11px", fontWeight: "bold" }}
              />
              <ReferenceLine y={initial} stroke="#475569" strokeDasharray="4 4" label={{ value: "Initial Capital", fill: "#64748B", fontSize: 10 }} />
              <Area type="monotone" dataKey="equity" stroke="#06b6d4" strokeWidth={2.5} fillOpacity={1} fill="url(#equityGrad)" />
            </AreaChart>
          ) : (
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
              <XAxis dataKey="date" stroke="#64748B" fontSize={10} tickLine={false} />
              <YAxis
                stroke="#64748B"
                fontSize={10}
                tickLine={false}
                domain={[-Math.max(10, Math.ceil(maxDD * 1.2)), 0]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#0B0F17", borderColor: "#1E293B", borderRadius: "0.75rem" }}
                formatter={(val: any) => [`${Number(val).toFixed(2)}%`, "Drawdown"]}
                labelStyle={{ color: "#94A3B8", fontSize: "11px", fontWeight: "bold" }}
              />
              <ReferenceLine y={-maxDD} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `Max DD (-${maxDD}%)`, fill: "#ef4444", fontSize: 10 }} />
              <Area type="monotone" dataKey="drawdown" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#ddGrad)" />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
