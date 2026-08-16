"use client";

import React, { useEffect, useState, useRef } from "react";
import { TradeSummary } from "@/types/analytics";
import { DollarSign, TrendingUp, Percent, Hash, ShieldAlert, Award, Activity } from "lucide-react";

export function PerformanceSummary({ summary }: { summary: TradeSummary }) {
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const prevRef = useRef<TradeSummary>(summary);

  useEffect(() => {
    if (prevRef.current.total_pnl !== summary.total_pnl) {
      setFlashKey("pnl");
      setTimeout(() => setFlashKey(null), 1000);
    } else if (prevRef.current.win_rate_pct !== summary.win_rate_pct) {
      setFlashKey("winrate");
      setTimeout(() => setFlashKey(null), 1000);
    }
    prevRef.current = summary;
  }, [summary]);

  const cards = [
    {
      label: "Total Realized P&L",
      value: `$${summary.total_pnl.toFixed(2)}`,
      sub: `Closed: $${summary.closed_pnl.toFixed(2)} | Unr: $${summary.unrealized_pnl.toFixed(2)}`,
      icon: TrendingUp,
      color: summary.total_pnl >= 0 ? "text-emerald-400" : "text-red-400",
      flash: flashKey === "pnl",
    },
    {
      label: "Win Rate",
      value: `${summary.win_rate_pct.toFixed(1)}%`,
      sub: `${summary.winning_count} W / ${summary.losing_count} L`,
      icon: Percent,
      color: "text-cyan-400",
      flash: flashKey === "winrate",
    },
    {
      label: "Total Trades",
      value: summary.total_trades,
      sub: `${summary.open_trades} Open | ${summary.total_trades} Closed`,
      icon: Hash,
      color: "text-purple-400",
      flash: false,
    },
    {
      label: "Profit Factor",
      value: summary.profit_factor.toFixed(2),
      sub: `Avg Win: $${summary.avg_win.toFixed(2)} | Avg Loss: -$${summary.avg_loss.toFixed(2)}`,
      icon: Award,
      color: summary.profit_factor >= 1.5 ? "text-emerald-400" : "text-amber-400",
      flash: false,
    },
    {
      label: "Max Drawdown",
      value: `-${summary.max_drawdown_pct.toFixed(2)}%`,
      sub: `Current Bal: $${summary.current_balance.toLocaleString()}`,
      icon: ShieldAlert,
      color: summary.max_drawdown_pct < 10 ? "text-emerald-400" : "text-red-400",
      flash: false,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
      {cards.map((c, idx) => {
        const Icon = c.icon;
        return (
          <div
            key={idx}
            className={`p-4 rounded-xl bg-[#121824] border border-[#1E293B] flex flex-col justify-between shadow-lg transition-all duration-300 ${
              c.flash ? "border-cyan-400 bg-cyan-950/20 scale-[1.02]" : ""
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">{c.label}</span>
              <div className="p-2 rounded-lg bg-slate-800/60">
                <Icon className={`h-4 w-4 ${c.color}`} />
              </div>
            </div>
            <div>
              <div className={`text-xl font-bold font-mono ${c.color}`}>{c.value}</div>
              <div className="text-[11px] text-slate-400 mt-1 font-mono">{c.sub}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
