"use client";

import React from "react";
import { CheckCircle2, ShieldCheck, Zap, Scale, Clock, Award, DollarSign } from "lucide-react";
import { BacktestResult, BacktestRequest } from "@/types/backtest";

interface BacktestSummaryProps {
  metrics: BacktestResult;
  config: BacktestRequest;
}

export function BacktestSummary({ metrics, config }: BacktestSummaryProps) {
  const initial = config.initial_cash || 10000;
  const final = initial + metrics.total_net_profit;
  const isProfit = metrics.total_net_profit >= 0;

  return (
    <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-950 border border-emerald-800/80 text-emerald-400">
            <Award className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Executive Performance Summary</h3>
            <p className="text-[10px] text-slate-500">
              Audit results for {config.strategy_name} ({config.start_date} → {config.end_date})
            </p>
          </div>
        </div>

        <span className="px-2.5 py-1 rounded-xl text-xs font-bold font-mono bg-cyan-950/80 border border-cyan-800 text-cyan-400">
          Sharpe: {metrics.sharpe_ratio.toFixed(2)}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Column: Financial & Yield Audit */}
        <div className="bg-[#0B0F17] border border-[#1E293B] rounded-xl p-4 space-y-2.5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
            Capital Progression
          </span>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Initial Starting Capital:</span>
            <span className="font-mono font-bold text-slate-200">
              ${initial.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Final Simulated Equity:</span>
            <span className="font-mono font-bold text-white">
              ${final.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Net Realized P/L:</span>
            <span className={`font-mono font-bold ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
              {isProfit ? "+" : ""}${metrics.total_net_profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({metrics.return_pct.toFixed(2)}%)
            </span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Execution Frequency:</span>
            <span className="font-mono text-slate-300">
              {metrics.total_trades} trades across window
            </span>
          </div>
        </div>

        {/* Right Column: Risk & Viability Metrics */}
        <div className="bg-[#0B0F17] border border-[#1E293B] rounded-xl p-4 space-y-2.5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
            Risk & Expectancy Audit
          </span>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Historical Accuracy (Win Rate):</span>
            <span className="font-mono font-bold text-purple-400">
              {metrics.win_rate_pct.toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Maximum Peak-to-Trough Drawdown:</span>
            <span className="font-mono font-bold text-orange-400">
              {metrics.max_drawdown_pct.toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Institutional Sharpe Ratio:</span>
            <span className="font-mono font-bold text-cyan-400">
              {metrics.sharpe_ratio.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Strategy Viability Verdict:</span>
            <span className="inline-flex items-center gap-1 font-bold text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {metrics.sharpe_ratio >= 1.5 ? "STATISTICALLY SOUND" : "ACCEPTABLE ALPHA"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
