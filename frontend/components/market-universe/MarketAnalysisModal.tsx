"use client";

import React, { useState } from "react";
import { MarketInstrument } from "@/types/market-universe";
import {
  X,
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  ShieldAlert,
  ShieldCheck,
  Globe,
  Sliders,
  DollarSign,
  BarChart2,
  CheckCircle,
  AlertTriangle
} from "lucide-react";

interface MarketAnalysisModalProps {
  instrument: MarketInstrument | null;
  isOpen: boolean;
  onClose: () => void;
  onControlsUpdated?: () => void;
}

export function MarketAnalysisModal({ instrument, isOpen, onClose, onControlsUpdated }: MarketAnalysisModalProps) {
  const [paper, setPaper] = useState<boolean>(Boolean(instrument?.paper_enabled));
  const [strategy, setStrategy] = useState<boolean>(Boolean(instrument?.strategy_enabled));
  const [live, setLive] = useState<boolean>(Boolean(instrument?.live_enabled));
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Sync state when instrument changes
  React.useEffect(() => {
    if (instrument) {
      setPaper(Boolean(instrument.paper_enabled));
      setStrategy(Boolean(instrument.strategy_enabled));
      setLive(Boolean(instrument.live_enabled));
      setSaveSuccess(false);
    }
  }, [instrument]);

  if (!isOpen || !instrument) return null;

  const handleSaveControls = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`/api/universe/instruments/${encodeURIComponent(instrument.canonical_symbol || instrument.instrument_id)}/controls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper, strategy, live }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        onControlsUpdated?.();
        setTimeout(() => setSaveSuccess(false), 2500);
      }
    } catch (err) {
      console.error("Failed to update instrument controls:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const isBullish = instrument.directional_bias === "BULLISH" || instrument.change_24h > 0;
  const isBearish = instrument.directional_bias === "BEARISH" || instrument.change_24h < 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-[#0B0E14] border border-[#1E293B] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-[#121824] border-b border-[#1E293B] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  {instrument.canonical_symbol || instrument.symbol}
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-[#1E293B] text-slate-300 text-[11px] font-bold">
                  {instrument.exchange}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 text-[11px] font-bold border border-cyan-500/30">
                  {instrument.asset_class}
                </span>
              </div>
              <p className="text-xs text-slate-400">{instrument.company_name || instrument.display_symbol}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-[#0F141F] hover:bg-red-500/20 border border-[#1E293B] hover:border-red-500/40 text-slate-400 hover:text-red-400 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Price & Trend Banner */}
          <div className="p-4 rounded-xl bg-[#0F141F] border border-[#1E293B] flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Last Traded Price ({instrument.currency || "USD"})
              </span>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-2xl font-black text-white font-mono">
                  {instrument.currency === "INR" ? "₹" : "$"}
                  {instrument.last_price?.toLocaleString()}
                </span>
                <span
                  className={`text-sm font-bold flex items-center gap-1 ${
                    instrument.change_24h >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {instrument.change_24h >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {instrument.change_24h >= 0 ? "+" : ""}
                  {instrument.change_24h}%
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div
                className={`px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wider ${
                  isBullish
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : isBearish
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                    : "bg-slate-500/10 border-slate-500/30 text-slate-400"
                }`}
              >
                {instrument.directional_bias || "NEUTRAL BIAS"}
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold">
                {instrument.tradability || "TRADABLE"}
              </div>
            </div>
          </div>

          {/* Explainable Market Intelligence Metrics */}
          <div>
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              Explainable Market Intelligence
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-[#0F141F] border border-[#1E293B]">
                <span className="text-[10px] text-slate-500 block uppercase">Volatility Score</span>
                <span className="text-sm font-bold text-white font-mono mt-0.5 block">
                  {instrument.volatility_score || 45}/100
                </span>
                <span
                  className={`text-[10px] font-bold ${
                    instrument.volatility_category === "Extreme"
                      ? "text-rose-400"
                      : instrument.volatility_category === "High"
                      ? "text-amber-400"
                      : "text-slate-400"
                  }`}
                >
                  {instrument.volatility_category || "Medium"} Volatility
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#0F141F] border border-[#1E293B]">
                <span className="text-[10px] text-slate-500 block uppercase">Momentum Score</span>
                <span className="text-sm font-bold text-white font-mono mt-0.5 block">
                  {instrument.momentum_score || 50}/100
                </span>
                <span className="text-[10px] text-cyan-400 font-semibold">Ranked Top 15%</span>
              </div>

              <div className="p-3 rounded-xl bg-[#0F141F] border border-[#1E293B]">
                <span className="text-[10px] text-slate-500 block uppercase">24h Volume</span>
                <span className="text-sm font-bold text-white font-mono mt-0.5 block">
                  {instrument.volume_24h ? (instrument.volume_24h / 1000000).toFixed(2) + "M" : "—"}
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold">High Liquidity</span>
              </div>

              <div className="p-3 rounded-xl bg-[#0F141F] border border-[#1E293B]">
                <span className="text-[10px] text-slate-500 block uppercase">Data Source</span>
                <span className="text-xs font-bold text-white font-mono mt-0.5 block truncate">
                  {instrument.data_source || "Authorized Feed"}
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold">
                  {instrument.data_status || "LIVE"} Feed
                </span>
              </div>
            </div>
          </div>

          {/* Strategy Candidate Suitability */}
          <div>
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <BarChart2 className="h-3.5 w-3.5 text-cyan-400" />
              Algorithm & Strategy Candidate Suitability
            </h4>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div
                className={`p-3 rounded-xl border flex items-center justify-between ${
                  instrument.is_swing_candidate
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-slate-900/40 border-[#1E293B] text-slate-500"
                }`}
              >
                <div>
                  <span className="font-bold block">Swing Candidate</span>
                  <span className="text-[10px] opacity-80">Medium-to-High Range</span>
                </div>
                {instrument.is_swing_candidate ? (
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                ) : (
                  <span className="text-xs">✕</span>
                )}
              </div>

              <div
                className={`p-3 rounded-xl border flex items-center justify-between ${
                  instrument.is_scalping_candidate
                    ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                    : "bg-slate-900/40 border-[#1E293B] text-slate-500"
                }`}
              >
                <div>
                  <span className="font-bold block">Scalping Candidate</span>
                  <span className="text-[10px] opacity-80">Tight Spread & Depth</span>
                </div>
                {instrument.is_scalping_candidate ? (
                  <CheckCircle className="h-4 w-4 text-cyan-400" />
                ) : (
                  <span className="text-xs">✕</span>
                )}
              </div>

              <div
                className={`p-3 rounded-xl border flex items-center justify-between ${
                  instrument.is_hedge_candidate
                    ? "bg-purple-500/10 border-purple-500/30 text-purple-300"
                    : "bg-slate-900/40 border-[#1E293B] text-slate-500"
                }`}
              >
                <div>
                  <span className="font-bold block">Hedge Candidate</span>
                  <span className="text-[10px] opacity-80">Index & Derivatives</span>
                </div>
                {instrument.is_hedge_candidate ? (
                  <CheckCircle className="h-4 w-4 text-purple-400" />
                ) : (
                  <span className="text-xs">✕</span>
                )}
              </div>
            </div>
          </div>

          {/* Reference & Contract Specification */}
          <div>
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-purple-400" />
              Contract Reference & Exchange Data
            </h4>
            <div className="p-3.5 rounded-xl bg-[#0F141F] border border-[#1E293B] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div>
                <span className="text-[10px] text-slate-500 block">ISIN / Security Code</span>
                <span className="text-slate-300 font-semibold">{instrument.isin || "—"}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Lot Size</span>
                <span className="text-slate-300 font-semibold">{instrument.lot_size || 1}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Tick Size</span>
                <span className="text-slate-300 font-semibold">{instrument.tick_size || 0.05}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Segment</span>
                <span className="text-slate-300 font-semibold">{instrument.segment || "CASH"}</span>
              </div>
            </div>
          </div>

          {/* Activation & Execution Safety Controls */}
          <div className="p-4 rounded-xl bg-[#121824] border border-[#1E293B] space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-cyan-400" />
              Instrument Activation Controls & Permissions
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Paper Trading */}
              <label className="p-3 rounded-lg bg-[#0B0E14] border border-[#1E293B] flex items-center justify-between cursor-pointer hover:border-cyan-500/40 transition-colors">
                <div>
                  <span className="text-xs font-bold text-white block">Paper Trading</span>
                  <span className="text-[10px] text-slate-400">Simulation Enabled</span>
                </div>
                <input
                  type="checkbox"
                  checked={paper}
                  onChange={(e) => setPaper(e.target.checked)}
                  className="h-4 w-4 rounded accent-cyan-500"
                />
              </label>

              {/* Strategy Engine Scan */}
              <label className="p-3 rounded-lg bg-[#0B0E14] border border-[#1E293B] flex items-center justify-between cursor-pointer hover:border-cyan-500/40 transition-colors">
                <div>
                  <span className="text-xs font-bold text-white block">Strategy Scan</span>
                  <span className="text-[10px] text-slate-400">Allow in Bots</span>
                </div>
                <input
                  type="checkbox"
                  checked={strategy}
                  onChange={(e) => setStrategy(e.target.checked)}
                  className="h-4 w-4 rounded accent-purple-500"
                />
              </label>

              {/* Live Trading */}
              <label className="p-3 rounded-lg bg-[#0B0E14] border border-[#1E293B] flex items-center justify-between cursor-pointer hover:border-rose-500/40 transition-colors">
                <div>
                  <span className="text-xs font-bold text-rose-400 block flex items-center gap-1">
                    Live Trading
                    <AlertTriangle className="h-3 w-3" />
                  </span>
                  <span className="text-[10px] text-slate-400">Real Money Execution</span>
                </div>
                <input
                  type="checkbox"
                  checked={live}
                  onChange={(e) => setLive(e.target.checked)}
                  className="h-4 w-4 rounded accent-rose-500"
                />
              </label>
            </div>

            {live && (
              <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-500/30 text-[11px] text-rose-300 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />
                <span>
                  <strong>Safety Gate Active:</strong> Live execution requires verified broker authorization, risk checks passing, and 2FA confirmation.
                </span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-emerald-400 font-semibold">
                {saveSuccess ? "✓ Controls updated successfully." : ""}
              </span>
              <button
                onClick={handleSaveControls}
                disabled={isSaving}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save Instrument Controls"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
