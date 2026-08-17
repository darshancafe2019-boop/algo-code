"use client";

import React from "react";
import { Sparkles, Play, Activity, Clock, Shield } from "lucide-react";
import { BacktestRequest } from "@/types/backtest";

interface BacktestProfilesProps {
  onSelectPreset: (config: Partial<BacktestRequest>) => void;
  isLoading: boolean;
}

const STRATEGY_PRESETS = [
  {
    id: "preset-trend",
    name: "EMA Cross + MACD + Volume Profile",
    strategy_name: "EMA_MACD_VP",
    timeframe: "15m",
    symbol: "BTC/USDT",
    description: "Multi-timeframe trend follower combining 9/20 EMA crossovers with MACD histogram confirmation and POC volume area filtering.",
    recommended_cash: 10000,
    badge: "RECOMMENDED",
    badgeColor: "bg-cyan-950 border-cyan-800 text-cyan-400",
  },
  {
    id: "preset-momentum",
    name: "9EMA / RSI / Daily Bias Momentum",
    strategy_name: "EMA9_RSI",
    timeframe: "5m",
    symbol: "BTC/USDT",
    description: "High-frequency scalping setup detecting rapid intraday momentum impulses using 9EMA pullback signals and RSI overbought/oversold boundaries.",
    recommended_cash: 10000,
    badge: "HIGH FREQUENCY",
    badgeColor: "bg-purple-950 border-purple-800 text-purple-400",
  },
  {
    id: "preset-conservative",
    name: "Conservative Multi-Timeframe Trend",
    strategy_name: "CONSERVATIVE_TREND",
    timeframe: "1h",
    symbol: "BTC/USDT",
    description: "Low-drawdown institutional swing strategy enforcing 200 EMA macro filter, 2:1 profit targets, and strict confluence safety gates.",
    recommended_cash: 15000,
    badge: "LOW DRAWDOWN",
    badgeColor: "bg-emerald-950 border-emerald-800 text-emerald-400",
  },
  {
    id: "preset-reversion",
    name: "Bollinger / VWAP Mean Reversion",
    strategy_name: "MEAN_REVERSION",
    timeframe: "15m",
    symbol: "BTC/USDT",
    description: "Statistical mean reversion setup targeting snap-backs to session VWAP when prices stretch 2 standard deviations away from the mean.",
    recommended_cash: 10000,
    badge: "STAT ARB",
    badgeColor: "bg-blue-950 border-blue-800 text-blue-400",
  },
];

export function BacktestProfiles({ onSelectPreset, isLoading }: BacktestProfilesProps) {
  return (
    <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-950 border border-amber-800/80 text-amber-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Strategy & Indicator Profile Presets
            </h3>
            <p className="text-[10px] text-slate-500">
              One-click historical simulation setups pre-tuned to active quantitative regimes
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {STRATEGY_PRESETS.map((p) => (
          <div
            key={p.id}
            className="bg-[#0B0F17] border border-[#1E293B] hover:border-cyan-800/70 rounded-xl p-4 flex flex-col justify-between transition-all"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h4 className="text-xs font-bold text-white tracking-wide">{p.name}</h4>
                <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${p.badgeColor}`}>
                  {p.badge}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-2 mb-3">{p.description}</p>
              <div className="flex items-center gap-3 text-[10px] text-slate-400 mb-3">
                <span className="flex items-center gap-1 font-mono">
                  <Activity className="h-3 w-3 text-cyan-400" /> {p.symbol}
                </span>
                <span className="flex items-center gap-1 font-mono">
                  <Clock className="h-3 w-3 text-purple-400" /> {p.timeframe}
                </span>
                <span className="flex items-center gap-1 font-mono">
                  <Shield className="h-3 w-3 text-emerald-400" /> ${p.recommended_cash.toLocaleString()}
                </span>
              </div>
            </div>

            <button
              onClick={() =>
                onSelectPreset({
                  strategy_name: p.strategy_name,
                  timeframe: p.timeframe,
                  symbol: p.symbol,
                  initial_cash: p.recommended_cash,
                })
              }
              disabled={isLoading}
              className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-[#121824] hover:bg-cyan-950/80 border border-[#1E293B] hover:border-cyan-700 text-cyan-300 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Play className="h-3 w-3 fill-cyan-400" />
              <span>Load Preset into Simulator</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
