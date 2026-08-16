"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, RefreshCw, Bot } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateBotModal({ isOpen, onClose }: Props) {
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [strategy, setStrategy] = useState("EMA_MACD_VP");
  const [timeframe, setTimeframe] = useState("5m");
  const [assetClass, setAssetClass] = useState("CRYPTO");
  const [executionMode, setExecutionMode] = useState("PAPER");
  const [capital, setCapital] = useState("10000");
  const [errorMessage, setErrorMessage] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/bots/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          symbol,
          strategy,
          timeframe,
          asset_class: assetClass,
          execution_mode: executionMode,
          allocated_capital: parseFloat(capital),
          required_confidence: 75.0,
          indicators: ["ema_cross", "macd", "rsi", "volume_profile"],
        }),
      });
      const data = await res.json();
      if (!res.ok || data.status === "error") {
        throw new Error(data.message || "Failed to create bot instance");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["botsList"] });
      queryClient.invalidateQueries({ queryKey: ["botsSummary"] });
      onClose();
      resetForm();
    },
    onError: (err: any) => {
      setErrorMessage(err.message);
    },
  });

  const resetForm = () => {
    setName("");
    setSymbol("BTC/USDT");
    setStrategy("EMA_MACD_VP");
    setTimeframe("5m");
    setAssetClass("CRYPTO");
    setExecutionMode("PAPER");
    setCapital("10000");
    setErrorMessage("");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[#121824] border border-[#1E293B] rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1E293B] pb-4 mb-4">
          <div className="flex items-center gap-2 text-cyan-400">
            <Bot className="h-5 w-5" />
            <h2 className="text-base font-bold text-white">Create New Bot Instance</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-800 text-xs text-red-300">
            {errorMessage}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="space-y-4 text-xs"
        >
          <div>
            <label className="block text-slate-300 font-medium mb-1">Bot Instance Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alpha BTC Scalper #2"
              className="w-full bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Symbol</label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="BTC/USDT">BTC/USDT</option>
                <option value="ETH/USDT">ETH/USDT</option>
                <option value="SOL/USDT">SOL/USDT</option>
                <option value="RELIANCE">RELIANCE (Indian Stocks)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Strategy</label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                className="w-full bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="EMA_MACD_VP">EMA + MACD + Volume Profile</option>
                <option value="RSI_MEAN_REVERSION">RSI Mean Reversion</option>
                <option value="TREND_BREAKOUT">Trend Breakout Pro</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Timeframe</label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="w-full bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="1m">1m</option>
                <option value="5m">5m</option>
                <option value="15m">15m</option>
                <option value="1h">1h</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Execution Mode</label>
              <select
                value={executionMode}
                onChange={(e) => setExecutionMode(e.target.value)}
                className="w-full bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="PAPER">PAPER (Simulation)</option>
                <option value="LIVE">LIVE (Real Funds)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Allocated Capital ($)</label>
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(e.target.value)}
                className="w-full bg-[#0B0F17] border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1E293B]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-colors"
            >
              {createMutation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              Create Bot Instance
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
