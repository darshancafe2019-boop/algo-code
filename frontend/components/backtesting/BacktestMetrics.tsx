"use client";

import React from "react";
import { TrendingUp, TrendingDown, DollarSign, Percent, BarChart2, ShieldAlert, Award } from "lucide-react";
import { BacktestResult } from "@/types/backtest";

interface BacktestMetricsProps {
  metrics: BacktestResult;
  initialCash: number;
}

export function BacktestMetrics({ metrics, initialCash }: BacktestMetricsProps) {
  const isProfit = metrics.total_net_profit >= 0;
  const finalEquity = initialCash + metrics.total_net_profit;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
      {/* 1. Total Net Profit */}
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Net Profit</span>
          <div className={`p-1.5 rounded-lg ${isProfit ? "bg-emerald-950/80 text-emerald-400" : "bg-red-950/80 text-red-400"}`}>
            <DollarSign className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="mt-2">
          <div className={`text-xl font-bold font-mono ${isProfit ? "text-emerald-400" : "text-red-400"}`} id="bt-metric-profit">
            {isProfit ? "+" : ""}${metrics.total_net_profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Final Equity: ${finalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* 2. Total Return % */}
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Return %</span>
          <div className={`p-1.5 rounded-lg ${isProfit ? "bg-emerald-950/80 text-emerald-400" : "bg-red-950/80 text-red-400"}`}>
            {isProfit ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          </div>
        </div>
        <div className="mt-2">
          <div className={`text-xl font-bold font-mono ${isProfit ? "text-emerald-400" : "text-red-400"}`} id="bt-metric-return">
            {isProfit ? "+" : ""}{metrics.return_pct.toFixed(2)}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Capital Yield
          </div>
        </div>
      </div>

      {/* 3. Total Simulated Trades */}
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Trades</span>
          <div className="p-1.5 rounded-lg bg-blue-950/80 text-blue-400">
            <BarChart2 className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="mt-2">
          <div className="text-xl font-bold font-mono text-white" id="bt-metric-trades">
            {metrics.total_trades}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Simulated Executions
          </div>
        </div>
      </div>

      {/* 4. Win Rate % */}
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Win Rate</span>
          <div className="p-1.5 rounded-lg bg-purple-950/80 text-purple-400">
            <Percent className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="mt-2">
          <div className="text-xl font-bold font-mono text-purple-300" id="bt-metric-winrate">
            {metrics.win_rate_pct.toFixed(2)}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Historical Accuracy
          </div>
        </div>
      </div>

      {/* 5. Max Drawdown % */}
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Max Drawdown</span>
          <div className="p-1.5 rounded-lg bg-orange-950/80 text-orange-400">
            <ShieldAlert className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="mt-2">
          <div className="text-xl font-bold font-mono text-orange-400" id="bt-metric-maxdd">
            {metrics.max_drawdown_pct.toFixed(2)}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Peak-to-Trough Risk
          </div>
        </div>
      </div>

      {/* 6. Sharpe Ratio */}
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Sharpe Ratio</span>
          <div className="p-1.5 rounded-lg bg-cyan-950/80 text-cyan-400">
            <Award className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="mt-2">
          <div className="text-xl font-bold font-mono text-cyan-400" id="bt-metric-sharpe">
            {metrics.sharpe_ratio.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {metrics.sharpe_ratio >= 2.0 ? "Institutional Grade" : metrics.sharpe_ratio >= 1.0 ? "Viable Expectancy" : "Cautionary Alpha"}
          </div>
        </div>
      </div>
    </div>
  );
}
