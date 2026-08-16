"use client";

import React from "react";
import { Bot, Play, Pause, Square, ShieldCheck, DollarSign, TrendingUp } from "lucide-react";

interface Metrics {
  total_bots: number;
  running: number;
  paused: number;
  stopped: number;
  paper: number;
  live: number;
  open_trades: number;
  today_pnl: number;
  total_pnl: number;
}

export function BotSummaryCards({ metrics }: { metrics: Metrics }) {
  const cards = [
    {
      title: "Total Bot Instances",
      value: metrics.total_bots,
      sub: `${metrics.paper} Paper / ${metrics.live} Live`,
      icon: Bot,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
    },
    {
      title: "Active Running",
      value: metrics.running,
      sub: "Processing market signals",
      icon: Play,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    },
    {
      title: "Paused / Stopped",
      value: metrics.stopped + metrics.paused,
      sub: `${metrics.paused} Paused, ${metrics.stopped} Stopped`,
      icon: Pause,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    },
    {
      title: "Open Positions",
      value: metrics.open_trades,
      sub: "Active market exposure",
      icon: ShieldCheck,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      border: "border-purple-500/20",
    },
    {
      title: "Today's Realized P&L",
      value: `$${metrics.today_pnl.toFixed(2)}`,
      sub: `Total: $${metrics.total_pnl.toFixed(2)}`,
      icon: TrendingUp,
      color: metrics.today_pnl >= 0 ? "text-emerald-400" : "text-red-400",
      bg: metrics.today_pnl >= 0 ? "bg-emerald-500/10" : "bg-red-500/10",
      border: metrics.today_pnl >= 0 ? "border-emerald-500/20" : "border-red-500/20",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <div
            key={i}
            className={`p-4 rounded-xl bg-[#121824] border ${c.border} flex flex-col justify-between shadow-lg`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">{c.title}</span>
              <div className={`p-2 rounded-lg ${c.bg}`}>
                <Icon className={`h-4 w-4 ${c.color}`} />
              </div>
            </div>
            <div>
              <div className="text-xl font-bold text-white font-mono">{c.value}</div>
              <div className="text-[11px] text-slate-400 mt-1">{c.sub}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
