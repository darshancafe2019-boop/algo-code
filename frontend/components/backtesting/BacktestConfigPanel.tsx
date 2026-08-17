"use client";

import React, { useState } from "react";
import { FlaskConical, Play, Calendar, DollarSign, Cpu, Clock, Shield, AlertCircle } from "lucide-react";
import { BacktestRequest } from "@/types/backtest";

interface BacktestConfigPanelProps {
  initialConfig: BacktestRequest;
  onRunBacktest: (config: BacktestRequest) => void;
  isLoading: boolean;
}

export function BacktestConfigPanel({ initialConfig, onRunBacktest, isLoading }: BacktestConfigPanelProps) {
  const [form, setForm] = useState<BacktestRequest>(initialConfig);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Validation
    if (!form.start_date || !form.end_date) {
      setValidationError("Please select both a start date and an end date.");
      return;
    }
    if (new Date(form.start_date) >= new Date(form.end_date)) {
      setValidationError("Start date must be strictly earlier than end date.");
      return;
    }
    if (form.initial_cash <= 0 || isNaN(form.initial_cash)) {
      setValidationError("Initial capital must be greater than $0.");
      return;
    }

    onRunBacktest(form);
  };

  return (
    <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-[#1E293B] pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-950 border border-cyan-800/80 text-cyan-400">
              <FlaskConical className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Simulation Parameters</h2>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 border border-emerald-800 text-emerald-400">
            OFFLINE SIMULATION ONLY
          </span>
        </div>

        {validationError && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/80 border border-red-800 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-400" />
            <span>{validationError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Symbol & Timeframe */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Instrument
              </label>
              <select
                value={form.symbol || "BTC/USDT"}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                disabled={isLoading}
                className="w-full bg-[#0B0F17] border border-[#1E293B] rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              >
                <option value="BTC/USDT">BTC/USDT (Spot)</option>
                <option value="ETH/USDT">ETH/USDT (Spot)</option>
                <option value="SOL/USDT">SOL/USDT (Spot)</option>
                <option value="BNB/USDT">BNB/USDT (Spot)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Timeframe
              </label>
              <select
                value={form.timeframe || "5m"}
                onChange={(e) => setForm({ ...form, timeframe: e.target.value })}
                disabled={isLoading}
                className="w-full bg-[#0B0F17] border border-[#1E293B] rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              >
                <option value="1m">1m (High Frequency)</option>
                <option value="5m">5m (Standard Scalping)</option>
                <option value="15m">15m (Intraday Trend)</option>
                <option value="1h">1h (Swing Framework)</option>
                <option value="4h">4h (Macro Cycle)</option>
                <option value="1d">1d (Daily Bias)</option>
              </select>
            </div>
          </div>

          {/* Strategy Preset */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Strategy Algorithm
            </label>
            <select
              value={form.strategy_name}
              onChange={(e) => setForm({ ...form, strategy_name: e.target.value })}
              disabled={isLoading}
              className="w-full bg-[#0B0F17] border border-[#1E293B] rounded-xl px-3 py-2 text-xs font-semibold text-cyan-300 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            >
              <option value="EMA_MACD_VP">EMA Cross + MACD + Volume Profile (Default)</option>
              <option value="EMA9_RSI">9EMA / RSI / Daily Bias Momentum</option>
              <option value="BTC_15M_TREND">BTC 15m Institutional Trend Follower</option>
              <option value="MEAN_REVERSION">Bollinger / VWAP Mean Reversion</option>
              <option value="CONSERVATIVE_TREND">Conservative Multi-Timeframe Trend</option>
            </select>
          </div>

          {/* Date Window */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Calendar className="h-3 w-3 text-slate-500" /> Start Date
              </label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                disabled={isLoading}
                className="w-full bg-[#0B0F17] border border-[#1E293B] rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Calendar className="h-3 w-3 text-slate-500" /> End Date
              </label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                disabled={isLoading}
                className="w-full bg-[#0B0F17] border border-[#1E293B] rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Initial Capital & Shorts Toggle */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <DollarSign className="h-3 w-3 text-slate-500" /> Initial Cash ($)
              </label>
              <input
                type="number"
                step="500"
                min="100"
                value={form.initial_cash}
                onChange={(e) => setForm({ ...form, initial_cash: parseFloat(e.target.value) || 0 })}
                disabled={isLoading}
                className="w-full bg-[#0B0F17] border border-[#1E293B] rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              />
            </div>

            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 px-3 py-2 bg-[#0B0F17] border border-[#1E293B] rounded-xl cursor-pointer hover:border-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={form.allow_shorts ?? true}
                  onChange={(e) => setForm({ ...form, allow_shorts: e.target.checked })}
                  disabled={isLoading}
                  className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 h-4 w-4"
                />
                <span className="text-xs font-semibold text-slate-300">Allow Shorting</span>
              </label>
            </div>
          </div>

          {/* Run Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              id="btn-run-backtest"
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-600/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>RUNNING SIMULATION ENGINE...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-white" />
                  <span>RUN BACKTEST SIMULATION</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <div className="mt-4 pt-3 border-t border-[#1E293B] flex items-center justify-between text-[10px] text-slate-500">
        <span>Cerebro Multi-Candle Engine</span>
        <span>Isolated Sandbox Mode</span>
      </div>
    </div>
  );
}
