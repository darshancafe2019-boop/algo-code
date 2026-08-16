"use client";

import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Search, Sliders, Check, AlertCircle, RefreshCw } from "lucide-react";
import { BotInstance } from "./BotControlCard";

interface Props {
  isOpen: boolean;
  bot: BotInstance | null;
  onClose: () => void;
}

const AVAILABLE_INDICATORS = [
  { id: "ema_cross", name: "EMA Fast/Slow Crossover", cat: "Trend", desc: "Fast EMA crossing Slow EMA signal" },
  { id: "macd", name: "MACD Confluence", cat: "Momentum", desc: "Histogram & signal line crossover" },
  { id: "rsi", name: "RSI Momentum Filter", cat: "Oscillator", desc: "Overbought / Oversold threshold filter" },
  { id: "volume_profile", name: "Volume Profile (POC/VA)", cat: "Volume", desc: "Point of Control & Value Area confluence" },
  { id: "adx", name: "ADX Trend Strength", cat: "Trend", desc: "Trend strength filter (> 25)" },
  { id: "bollinger", name: "Bollinger Bands Volatility", cat: "Volatility", desc: "Band squeeze & breakout detector" },
  { id: "atr", name: "ATR Dynamic Stop Loss", cat: "Volatility", desc: "Average True Range volatility positioning" },
  { id: "sma_200", name: "200 SMA Macro Trend", cat: "Trend", desc: "Macro trend baseline indicator" },
];

export function IndicatorLibraryDrawer({ isOpen, bot, onClose }: Props) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (bot && bot.indicators) {
      setSelectedIds(bot.indicators);
    } else {
      setSelectedIds(["ema_cross", "macd", "rsi", "volume_profile"]);
    }
  }, [bot]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!bot) return;
      const res = await fetch(`/api/bots/${bot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: bot.name,
          symbol: bot.symbol,
          strategy: bot.strategy,
          timeframe: bot.timeframe,
          execution_mode: bot.execution_mode,
          allocated_capital: bot.allocated_capital,
          indicators: selectedIds,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.status === "error") {
        throw new Error(data.message || "Failed to update indicators");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["botsList"] });
      onClose();
    },
    onError: (err: any) => {
      setErrorMessage(err.message);
    },
  });

  if (!isOpen || !bot) return null;

  const toggleIndicator = (id: string) => {
    setErrorMessage("");
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      if (selectedIds.length >= 4) {
        setErrorMessage("Maximum 4 indicators allowed per bot instance.");
        return;
      }
      setSelectedIds([...selectedIds, id]);
    }
  };

  const filtered = AVAILABLE_INDICATORS.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.cat.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#121824] border-l border-[#1E293B] h-full p-6 flex flex-col justify-between shadow-2xl">
        <div>
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-4 mb-4">
            <div className="flex items-center gap-2 text-cyan-400">
              <Sliders className="h-5 w-5" />
              <div>
                <h2 className="text-base font-bold text-white">Indicator Library</h2>
                <p className="text-[11px] text-slate-400">{bot.name} ({bot.symbol})</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Search Input */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search indicators..."
              className="w-full bg-[#0B0F17] border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 mb-3 px-1">
            <span>Selected: <strong className="text-cyan-400">{selectedIds.length}/4</strong></span>
            <span className="text-[11px]">Max 4 per bot</span>
          </div>

          {errorMessage && (
            <div className="mb-3 p-2.5 rounded-lg bg-red-950/50 border border-red-800 text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Indicator List */}
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {filtered.map((ind) => {
              const isSelected = selectedIds.includes(ind.id);
              return (
                <div
                  key={ind.id}
                  onClick={() => toggleIndicator(ind.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? "bg-cyan-950/30 border-cyan-500/50 text-white"
                      : "bg-[#0B0F17] border-[#1E293B] hover:border-slate-700 text-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs">{ind.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                        {ind.cat}
                      </span>
                      <div
                        className={`h-4 w-4 rounded flex items-center justify-center border ${
                          isSelected ? "bg-cyan-500 border-cyan-400 text-black" : "border-slate-600"
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">{ind.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1E293B] mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            disabled={updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-colors"
          >
            {updateMutation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            Save Indicator Config
          </button>
        </div>
      </div>
    </div>
  );
}
