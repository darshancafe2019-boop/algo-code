"use client";

import React, { useState } from "react";
import { MarketInstrument } from "@/types/market-universe";
import { MarketAnalysisModal } from "./MarketAnalysisModal";
import { OptionChainModal } from "./OptionChainModal";
import { FuturesChainModal } from "./FuturesChainModal";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  BarChart2,
  Star,
  ShieldCheck,
  ShieldAlert,
  Zap,
  CheckCircle2,
  Sliders
} from "lucide-react";

interface MarketTableProps {
  instruments: MarketInstrument[];
  lastUpdatedTimestamp?: string;
  onRefreshRequested?: () => void;
}

export function MarketTable({ instruments, lastUpdatedTimestamp, onRefreshRequested }: MarketTableProps) {
  const [selectedForAnalysis, setSelectedForAnalysis] = useState<MarketInstrument | null>(null);
  const [selectedForOptions, setSelectedForOptions] = useState<string | null>(null);
  const [selectedForFutures, setSelectedForFutures] = useState<string | null>(null);
  const [watchlistToast, setWatchlistToast] = useState<string | null>(null);

  const handleToggleControl = async (inst: MarketInstrument, field: "paper" | "strategy" | "live", currentVal: boolean) => {
    try {
      const id = inst.canonical_symbol || inst.instrument_id || inst.symbol;
      const res = await fetch(`/api/universe/instruments/${encodeURIComponent(id)}/controls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: !currentVal }),
      });
      if (res.ok) {
        onRefreshRequested?.();
      }
    } catch (err) {
      console.error(`Failed to update ${field} control:`, err);
    }
  };

  const handleAddToWatchlist = async (inst: MarketInstrument) => {
    try {
      const id = inst.instrument_id || inst.canonical_symbol || inst.symbol;
      const res = await fetch("/api/universe/watchlists/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchlist_id: "wl_main", instrument_id: id, notes: "Added from Universe Hub" }),
      });
      if (res.ok) {
        setWatchlistToast(`Added ${inst.canonical_symbol || inst.symbol} to Watchlist`);
        setTimeout(() => setWatchlistToast(null), 2500);
      }
    } catch (err) {
      console.error("Failed to add to watchlist:", err);
    }
  };

  if (!instruments || instruments.length === 0) {
    return (
      <div className="p-12 text-center rounded-xl bg-[#121824] border border-[#1E293B] text-slate-400">
        <Activity className="h-8 w-8 mx-auto mb-2 text-cyan-400 opacity-60" />
        <h4 className="text-sm font-bold text-white mb-1">No Instruments Discovered</h4>
        <p className="text-xs text-slate-400">
          Try clearing search filters or click &quot;🔄 SYNC ALL MARKETS&quot; to initiate multi-market provider discovery.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {watchlistToast && (
        <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-between animate-fadeIn">
          <span>✓ {watchlistToast}</span>
          <button onClick={() => setWatchlistToast(null)} className="text-emerald-400 font-bold ml-2">✕</button>
        </div>
      )}

      <div className="rounded-xl border border-[#1E293B] overflow-hidden bg-[#0F141F] shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#121824] text-slate-400 text-[11px] border-b border-[#1E293B]">
              <tr>
                <th className="py-3 px-3">Instrument & Company</th>
                <th className="py-3 px-3">Asset Class / Type</th>
                <th className="py-3 px-3 text-right">LTP (Quote)</th>
                <th className="py-3 px-3 text-right">24h Change</th>
                <th className="py-3 px-3 text-right">24h Volume / OI</th>
                <th className="py-3 px-3 text-center">Volatility / Momentum</th>
                <th className="py-3 px-3 text-center">Directional Bias</th>
                <th className="py-3 px-3 text-center">Activation Controls</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#161F30]">
              {instruments.map((inst, idx) => {
                const sym = inst.canonical_symbol || inst.symbol || inst.instrument_id;
                const dispName = inst.company_name || inst.display_symbol || inst.display_name || sym;
                const isBullish = inst.directional_bias === "BULLISH" || inst.change_24h > 0;
                const isBearish = inst.directional_bias === "BEARISH" || inst.change_24h < 0;

                const hasOptions =
                  inst.asset_class === "OPTIONS" ||
                  ["NIFTY50", "BANKNIFTY", "RELIANCE", "TCS", "HDFCBANK"].includes(sym);
                const hasFutures =
                  inst.asset_class === "FUTURES" ||
                  ["NIFTY50", "BANKNIFTY", "RELIANCE", "TCS", "BTC", "ETH", "GOLD", "CRUDEOIL"].includes(sym) ||
                  sym.includes("USDT");

                const paperActive = Boolean(inst.paper_enabled);
                const strategyActive = Boolean(inst.strategy_enabled);
                const liveActive = Boolean(inst.live_enabled);

                return (
                  <tr
                    key={inst.instrument_id || sym || idx}
                    className="hover:bg-slate-800/40 transition-colors group"
                  >
                    {/* Symbol & Info */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAddToWatchlist(inst)}
                          className="text-slate-600 hover:text-amber-400 transition-colors"
                          title="Add to Watchlist"
                        >
                          <Star className="h-3.5 w-3.5" />
                        </button>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white font-mono group-hover:text-cyan-300 transition-colors">
                              {sym}
                            </span>
                            <span className="px-1.5 py-0.2 rounded bg-[#1A2234] text-slate-400 text-[10px] font-bold">
                              {inst.exchange || "GLOBAL"}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 truncate max-w-[180px] block font-sans">
                            {dispName}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Asset Class & Type */}
                    <td className="py-3 px-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-bold border border-cyan-500/20 text-[10px] w-fit">
                          {inst.asset_class}
                        </span>
                        <span className="text-[10px] text-slate-500">{inst.instrument_type || "EQUITY"}</span>
                      </div>
                    </td>

                    {/* LTP */}
                    <td className="py-3 px-3 text-right">
                      <span className="font-bold text-white text-xs">
                        {inst.currency === "INR" ? "₹" : "$"}
                        {inst.last_price !== undefined ? inst.last_price.toLocaleString() : "—"}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        {inst.currency || "USD"}
                      </span>
                    </td>

                    {/* 24h Change */}
                    <td className="py-3 px-3 text-right">
                      <span
                        className={`font-bold flex items-center justify-end gap-0.5 ${
                          inst.change_24h >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {inst.change_24h >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                        {inst.change_24h >= 0 ? "+" : ""}
                        {inst.change_24h?.toFixed(2)}%
                      </span>
                    </td>

                    {/* Volume & OI */}
                    <td className="py-3 px-3 text-right">
                      <span className="text-slate-300 font-semibold block">
                        {inst.volume_24h ? (inst.volume_24h > 1000000 ? (inst.volume_24h / 1000000).toFixed(1) + "M" : (inst.volume_24h / 1000).toFixed(0) + "k") : "—"}
                      </span>
                      {inst.open_interest ? (
                        <span className="text-[10px] text-purple-400">
                          OI: {(inst.open_interest / 1000).toFixed(0)}k
                        </span>
                      ) : null}
                    </td>

                    {/* Volatility & Momentum */}
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            inst.volatility_category === "Extreme"
                              ? "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                              : inst.volatility_category === "High"
                              ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                              : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                          }`}
                        >
                          Vol: {inst.volatility_score || 45}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 text-[10px] font-bold border border-cyan-500/20">
                          Mom: {inst.momentum_score || 50}
                        </span>
                      </div>
                    </td>

                    {/* Directional Bias */}
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          isBullish
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                            : isBearish
                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                            : "bg-slate-500/10 text-slate-400 border border-slate-500/30"
                        }`}
                      >
                        {inst.directional_bias || "NEUTRAL"}
                      </span>
                    </td>

                    {/* Activation Controls */}
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {/* Paper */}
                        <button
                          onClick={() => handleToggleControl(inst, "paper", paperActive)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            paperActive
                              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                              : "bg-[#1E293B] text-slate-500 border border-transparent"
                          }`}
                          title="Toggle Paper Trading"
                        >
                          Paper
                        </button>

                        {/* Strategy */}
                        <button
                          onClick={() => handleToggleControl(inst, "strategy", strategyActive)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            strategyActive
                              ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                              : "bg-[#1E293B] text-slate-500 border border-transparent"
                          }`}
                          title="Toggle Strategy Scan"
                        >
                          Strategy
                        </button>

                        {/* Live */}
                        <button
                          onClick={() => handleToggleControl(inst, "live", liveActive)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            liveActive
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                              : "bg-[#1E293B] text-slate-500 border border-transparent"
                          }`}
                          title="Toggle Live Trading"
                        >
                          Live
                        </button>
                      </div>
                    </td>

                    {/* 1-Click Actions */}
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedForAnalysis(inst)}
                          className="px-2 py-1 rounded bg-[#1A2234] hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 text-[10px] font-bold transition-colors"
                          title="1-Click Deep Analysis"
                        >
                          Analyze
                        </button>

                        {hasOptions && (
                          <button
                            onClick={() => setSelectedForOptions(sym)}
                            className="px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30 transition-colors"
                            title="Open Real-time Option Chain"
                          >
                            Options
                          </button>
                        )}

                        {hasFutures && (
                          <button
                            onClick={() => setSelectedForFutures(sym)}
                            className="px-2 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-[10px] font-bold border border-purple-500/30 transition-colors"
                            title="Open Futures Term Structure"
                          >
                            Futures
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {selectedForAnalysis && (
        <MarketAnalysisModal
          instrument={selectedForAnalysis}
          isOpen={Boolean(selectedForAnalysis)}
          onClose={() => setSelectedForAnalysis(null)}
          onControlsUpdated={() => onRefreshRequested?.()}
        />
      )}

      {selectedForOptions && (
        <OptionChainModal
          underlying={selectedForOptions}
          isOpen={Boolean(selectedForOptions)}
          onClose={() => setSelectedForOptions(null)}
        />
      )}

      {selectedForFutures && (
        <FuturesChainModal
          underlying={selectedForFutures}
          isOpen={Boolean(selectedForFutures)}
          onClose={() => setSelectedForFutures(null)}
        />
      )}
    </div>
  );
}
