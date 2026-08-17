"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FuturesContract } from "@/types/market-universe";
import { X, TrendingUp, TrendingDown, Clock, Activity, Calendar, ShieldCheck, RefreshCw, BarChart2 } from "lucide-react";

interface FuturesChainModalProps {
  underlying: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectContract?: (contract: FuturesContract) => void;
}

export function FuturesChainModal({ underlying, isOpen, onClose, onSelectContract }: FuturesChainModalProps) {
  const [selectedUnderlying, setSelectedUnderlying] = useState(underlying || "NIFTY50");

  const { data, isLoading, refetch, isFetching } = useQuery<{ status: string; contracts: FuturesContract[]; underlying: string }>({
    queryKey: ["futuresChain", selectedUnderlying],
    queryFn: async () => {
      const p = new URLSearchParams({ underlying: selectedUnderlying });
      const res = await fetch(`/api/universe/futures-chain?${p.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch futures chain");
      return res.json();
    },
    enabled: isOpen,
    refetchInterval: 5000,
  });

  if (!isOpen) return null;

  const contracts = data?.contracts || [];
  const spotPrice = contracts.length > 0 ? contracts[0].spot_price : 0.0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-[#0B0E14] border border-[#1E293B] rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Bar */}
        <div className="p-4 bg-[#121824] border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <BarChart2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  Futures Term Structure & Basis Matrix
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[11px] font-bold border border-purple-500/30">
                  {selectedUnderlying}
                </span>
                {spotPrice > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-mono font-bold">
                    Spot: ₹{spotPrice.toLocaleString()}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Near, Next, and Far monthly contracts with basis spread, Contango/Backwardation analysis, and Days to Expiry.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedUnderlying}
              onChange={(e) => setSelectedUnderlying(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-[#0F141F] border border-[#1E293B] text-xs font-semibold text-white focus:outline-none focus:border-purple-500"
            >
              <option value="NIFTY50">NIFTY 50</option>
              <option value="BANKNIFTY">BANK NIFTY</option>
              <option value="RELIANCE">RELIANCE</option>
              <option value="TCS">TCS</option>
              <option value="BTC">BTC (Crypto Perp)</option>
              <option value="ETH">ETH (Crypto Perp)</option>
              <option value="GOLD">GOLD (MCX Futures)</option>
              <option value="CRUDEOIL">CRUDE OIL (MCX Futures)</option>
            </select>

            <button
              onClick={() => refetch()}
              className="p-2 rounded-lg bg-[#0F141F] hover:bg-slate-800 border border-[#1E293B] text-slate-300 hover:text-white"
              title="Refresh Futures Chain"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin text-purple-400" : ""}`} />
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-[#0F141F] hover:bg-red-500/20 border border-[#1E293B] hover:border-red-500/40 text-slate-400 hover:text-red-400 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-3">
              <RefreshCw className="h-7 w-7 animate-spin text-purple-400" />
              <p className="text-xs">Loading futures contracts and term structure...</p>
            </div>
          ) : contracts.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <p className="text-sm font-semibold text-white">No active futures contracts found for {selectedUnderlying}</p>
              <p className="text-xs text-slate-400 mt-1">Please select another underlying or run multi-market discovery sync.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Term Structure Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {contracts.map((c, idx) => {
                  const isContango = c.basis >= 0;
                  const cycleName = idx === 0 ? "Near Month Contract" : (idx === 1 ? "Next Month Contract" : "Far Month Contract");

                  return (
                    <div
                      key={c.instrument_id || idx}
                      className="p-4 rounded-xl bg-[#0F141F] border border-[#1E293B] hover:border-purple-500/40 transition-all flex flex-col justify-between space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                          {cycleName}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            isContango
                              ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                          }`}
                        >
                          {isContango ? "CONTANGO (Premium)" : "BACKWARDATION (Discount)"}
                        </span>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-white font-mono">{c.display_symbol}</h4>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-xl font-black text-white font-mono">
                            ₹{c.last_price?.toLocaleString()}
                          </span>
                          <span
                            className={`text-xs font-bold ${
                              c.change_24h >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {c.change_24h >= 0 ? "+" : ""}{c.change_24h}%
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-[#1E293B]">
                        <div>
                          <span className="text-[10px] text-slate-500 block">Basis Spread</span>
                          <span className={c.basis >= 0 ? "text-amber-400 font-bold" : "text-emerald-400 font-bold"}>
                            {c.basis >= 0 ? "+" : ""}₹{c.basis}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Days to Expiry</span>
                          <span className="text-cyan-400 font-bold flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {c.days_to_expiry > 0 ? `${c.days_to_expiry} Days` : "Perpetual / Today"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Open Interest</span>
                          <span className="text-slate-300">
                            {c.open_interest ? (c.open_interest / 1000).toFixed(1) + "k" : "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">24h Volume</span>
                          <span className="text-slate-300">
                            {c.volume_24h ? (c.volume_24h / 1000).toFixed(0) + "k" : "—"}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => onSelectContract?.(c)}
                        className="w-full py-2 rounded-lg bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 text-xs font-bold border border-purple-500/30 transition-colors flex items-center justify-center gap-2"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Select For Strategy / Trade
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Technical Basis Curve Notice */}
              <div className="p-3.5 rounded-xl bg-[#0D121C] border border-[#1E293B] text-[11px] text-slate-400 space-y-1">
                <span className="font-bold text-slate-300">Futures Pricing & Cost of Carry Model:</span>
                <p>
                  Futures basis reflects the interest rate cost of carry minus expected dividend yields. Positive basis indicates normal Contango, while negative basis indicates Backwardation signaling strong near-term spot demand.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
