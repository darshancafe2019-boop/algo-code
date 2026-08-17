"use client";

import React from "react";
import { ShieldCheck, ShieldAlert, AlertOctagon, TrendingDown, DollarSign, PieChart, Lock, Zap } from "lucide-react";
import { RiskOverviewState } from "@/types/risk";

interface RiskOverviewProps {
  data: RiskOverviewState;
}

export function RiskOverview({ data }: RiskOverviewProps) {
  const isBlocked = data.risk_status?.includes("BLOCKED") || data.kill_switch_active;
  const isCritical = data.risk_score === "CRITICAL" || data.risk_status?.includes("CRITICAL");
  const isHigh = data.risk_score === "HIGH" || data.risk_status?.includes("HIGH");

  const getStatusBadge = () => {
    if (isBlocked) {
      return {
        bg: "bg-red-950/80 border-red-800 text-red-400",
        icon: AlertOctagon,
        text: data.risk_status || "TRADING BLOCKED",
      };
    }
    if (isCritical) {
      return {
        bg: "bg-orange-950/80 border-orange-800 text-orange-400",
        icon: ShieldAlert,
        text: data.risk_status || "CRITICAL RISK",
      };
    }
    if (isHigh) {
      return {
        bg: "bg-amber-950/80 border-amber-800 text-amber-400",
        icon: ShieldAlert,
        text: data.risk_status || "HIGH RISK WARNING",
      };
    }
    return {
      bg: "bg-emerald-950/80 border-emerald-800 text-emerald-400",
      icon: ShieldCheck,
      text: data.risk_status || "OPTIMAL",
    };
  };

  const statusStyle = getStatusBadge();
  const StatusIcon = statusStyle.icon;

  return (
    <div className="space-y-4">
      {/* Top Banner KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Risk Engine Health & Score */}
        <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Risk Score & State</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusStyle.bg}`}>
              {data.risk_score || "LOW"}
            </span>
          </div>
          <div className="flex items-center gap-2.5 mt-2">
            <div className={`p-2 rounded-xl border ${statusStyle.bg}`}>
              <StatusIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-bold text-white tracking-tight">{statusStyle.text}</div>
              <div className="text-[11px] text-slate-400 font-mono">
                {data.score_factors?.[0] || "Operating within parameters"}
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Daily Drawdown & Loss Limit */}
        <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Daily Drawdown</span>
            <TrendingDown className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-2">
              <span className={`text-xl font-bold font-mono ${data.daily_pnl < 0 ? "text-red-400" : "text-emerald-400"}`}>
                {data.daily_pnl < 0 ? "-" : "+"}${Math.abs(data.daily_pnl).toFixed(2)}
              </span>
              <span className="text-xs font-mono text-slate-400">
                ({data.daily_drawdown_pct.toFixed(2)}% DD)
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Max Daily Loss Cap: <span className="text-slate-200 font-mono">${data.active_limits?.max_daily_loss || 500}</span>
            </div>
          </div>
        </div>

        {/* Card 3: Margin Utilization & Available Capital */}
        <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Margin Utilization</span>
            <PieChart className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono text-cyan-400">
                {data.margin_usage_pct.toFixed(1)}%
              </span>
              <span className="text-xs font-mono text-slate-400">
                (${data.margin_used.toFixed(2)} used)
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Available Cash: <span className="text-emerald-400 font-mono">${data.available_capital.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Card 4: Portfolio Risk Dollars & Kill Switch Gate */}
        <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Portfolio Risk ($)</span>
            <Lock className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono text-amber-400">
                ${data.portfolio_risk_dollars.toFixed(2)}
              </span>
              <span className="text-xs font-mono text-slate-400">
                ({data.portfolio_risk_pct.toFixed(2)}% Eq)
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
              Kill Switch:
              <span
                className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                  data.kill_switch_active
                    ? "bg-red-950 text-red-400 border border-red-800"
                    : "bg-emerald-950 text-emerald-400 border border-emerald-800"
                }`}
              >
                {data.kill_switch_active ? "HALTED (LOCKED)" : "DISARMED (ACTIVE)"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
