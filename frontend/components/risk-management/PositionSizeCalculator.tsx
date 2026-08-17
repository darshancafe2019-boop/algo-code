"use client";

import React, { useState } from "react";
import { Calculator, Play, ArrowRight, ShieldCheck, AlertCircle, RefreshCw } from "lucide-react";
import { PositionSizeResult, WhatIfResult } from "@/types/risk";

interface PositionSizeCalculatorProps {
  accountBalance: number;
}

export function PositionSizeCalculator({ accountBalance }: PositionSizeCalculatorProps) {
  const [balance, setBalance] = useState<number>(accountBalance || 10000);
  const [entryPrice, setEntryPrice] = useState<number>(65000);
  const [stopLossPrice, setStopLossPrice] = useState<number>(63700);
  const [method, setMethod] = useState<string>("percent_equity");
  const [riskPct, setRiskPct] = useState<number>(2.0);
  const [leverage, setLeverage] = useState<number>(1.0);
  const [atr, setAtr] = useState<number>(1200);
  const [winRate, setWinRate] = useState<number>(0.55);
  const [profitFactor, setProfitFactor] = useState<number>(1.8);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PositionSizeResult | null>(null);
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Query Server Authoritative Position Size Engine
      const res = await fetch("/api/risk/position-size", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_balance: Number(balance),
          entry_price: Number(entryPrice),
          stop_loss_price: Number(stopLossPrice),
          method,
          risk_pct: Number(riskPct),
          leverage: Number(leverage),
          atr: Number(atr),
          win_rate: Number(winRate),
          profit_factor: Number(profitFactor),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to calculate position size from backend.");
      }
      const data: PositionSizeResult = await res.json();
      setResult(data);

      // 2. Query Server What-If Simulation Engine
      const whatIfRes = await fetch("/api/risk/what-if", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          balance: Number(balance),
          trade: {
            entry_price: Number(entryPrice),
            stop_loss: Number(stopLossPrice),
            quantity: Number(data.position_quantity),
            leverage: Number(leverage),
          },
          positions: [],
        }),
      });

      if (whatIfRes.ok) {
        const whatIfData: WhatIfResult = await whatIfRes.json();
        setWhatIfResult(whatIfData);
      }
    } catch (err: any) {
      setError(err.message || "Error running risk calculation.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Form Panel */}
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Quant Multi-Model Position Sizer
          </h3>
        </div>
        <p className="text-xs text-slate-400">
          Evaluated strictly on the server using 8 institutional risk management formulas.
        </p>

        <form onSubmit={handleCalculate} className="space-y-3 text-xs font-mono">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Account Balance ($)</label>
              <input
                type="number"
                value={balance}
                onChange={(e) => setBalance(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#0E1524] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Quant Sizing Model</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full bg-[#0E1524] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="percent_equity">Percent Equity (Standard)</option>
                <option value="fixed_fractional">Fixed Fractional Risk</option>
                <option value="volatility_adjusted">Volatility (ATR) Adjusted</option>
                <option value="kelly_criterion">Kelly Criterion Model</option>
                <option value="risk_parity">Risk Parity Equal Risk</option>
                <option value="atr_channel">ATR Channel Bounds</option>
                <option value="fixed_ratio">Fixed Ratio Growth</option>
                <option value="optimal_f">Optimal f Fraction</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Entry Price ($)</label>
              <input
                type="number"
                value={entryPrice}
                onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#0E1524] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Stop Loss Price ($)</label>
              <input
                type="number"
                value={stopLossPrice}
                onChange={(e) => setStopLossPrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#0E1524] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Risk % of Eq</label>
              <input
                type="number"
                step="0.1"
                value={riskPct}
                onChange={(e) => setRiskPct(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#0E1524] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Leverage (x)</label>
              <input
                type="number"
                step="1"
                value={leverage}
                onChange={(e) => setLeverage(parseFloat(e.target.value) || 1)}
                className="w-full bg-[#0E1524] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">ATR ($)</label>
              <input
                type="number"
                value={atr}
                onChange={(e) => setAtr(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#0E1524] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {method === "kelly_criterion" && (
            <div className="grid grid-cols-2 gap-3 p-2 bg-[#0E1524] rounded-xl border border-[#1E293B]">
              <div>
                <label className="text-slate-400 block mb-1">Win Rate (0.0-1.0)</label>
                <input
                  type="number"
                  step="0.01"
                  value={winRate}
                  onChange={(e) => setWinRate(parseFloat(e.target.value) || 0.5)}
                  className="w-full bg-[#121824] border border-[#1E293B] rounded-lg px-2 py-1 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Profit Factor</label>
                <input
                  type="number"
                  step="0.1"
                  value={profitFactor}
                  onChange={(e) => setProfitFactor(parseFloat(e.target.value) || 1.5)}
                  className="w-full bg-[#121824] border border-[#1E293B] rounded-lg px-2 py-1 text-white"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-all flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Calculate Optimal Sizing & Simulate What-If
          </button>
        </form>
      </div>

      {/* Results & What-If Panel */}
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-950/80 border border-red-800 rounded-xl text-xs font-mono text-red-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {result ? (
          <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Authoritative Sizing Output
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                {result.method}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 bg-[#0E1524] rounded-xl border border-[#1E293B]">
                <span className="text-slate-400 text-[10px] block">Recommended Quantity</span>
                <span className="text-xl font-bold text-emerald-400">
                  {result.position_quantity} Units
                </span>
              </div>

              <div className="p-3 bg-[#0E1524] rounded-xl border border-[#1E293B]">
                <span className="text-slate-400 text-[10px] block">Total Risk ($)</span>
                <span className="text-xl font-bold text-red-400">
                  ${result.risk_amount?.toFixed(2)}
                </span>
              </div>

              <div className="p-3 bg-[#0E1524] rounded-xl border border-[#1E293B]">
                <span className="text-slate-400 text-[10px] block">Notional Value ($)</span>
                <span className="text-base font-bold text-white">
                  ${result.notional_value?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-3 bg-[#0E1524] rounded-xl border border-[#1E293B]">
                <span className="text-slate-400 text-[10px] block">Margin Required ($)</span>
                <span className="text-base font-bold text-cyan-400">
                  ${result.margin_required?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {result.is_capital_capped && (
              <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-xl text-xs font-mono text-amber-300">
                ⚠️ Position capped by backend safety limit: {result.cap_reason || "Capital limit reached"}
              </div>
            )}


            {/* What-If Side-by-Side Projection */}
            {whatIfResult && (
              <div className="border-t border-[#1E293B] pt-4 space-y-2">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wide block">
                  What-If Portfolio Impact Projection
                </span>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="p-2.5 rounded-lg bg-[#0E1524] border border-[#1E293B] space-y-1">
                    <span className="text-slate-500 block">Current Portfolio Risk:</span>
                    <span className="text-slate-200">${whatIfResult.current.portfolio_risk.toFixed(2)} ({whatIfResult.current.portfolio_risk_pct}%)</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0E1524] border border-cyan-900/50 space-y-1">
                    <span className="text-cyan-400 block">Post-Trade Projected Risk:</span>
                    <span className="text-cyan-200 font-bold">${whatIfResult.after_trade.portfolio_risk.toFixed(2)} ({whatIfResult.after_trade.portfolio_risk_pct}%)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-8 text-center text-xs text-slate-500 font-mono">
            Enter trade parameters and click calculate to execute institutional quant risk modeling.
          </div>
        )}
      </div>
    </div>
  );
}
