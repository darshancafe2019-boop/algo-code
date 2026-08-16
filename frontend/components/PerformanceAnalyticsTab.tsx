"use client";

import React from "react";
import { LineChart } from "lucide-react";

export function PerformanceAnalyticsTab() {
  return (
    <div className="p-8 text-center bg-[#121824] border border-[#1E293B] rounded-2xl">
      <LineChart className="h-10 w-10 text-cyan-400 mx-auto mb-3" />
      <h3 className="text-base font-bold text-white">Performance Analytics Dashboard</h3>
      <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
        Phase 2 implementation: 7 Recharts visualizers (Realized P/L, Win/Loss donut, Strategy Win Rate, Equity Curve) & Multi-Bot Leaderboard.
      </p>
    </div>
  );
}
