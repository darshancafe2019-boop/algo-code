"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { OptionChainData, OptionStrike } from "@/types/market-universe";
import { X, Layers, Activity, TrendingUp, TrendingDown, RefreshCw, ShieldAlert, Zap } from "lucide-react";

interface OptionChainModalProps {
  underlying: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectContract?: (symbol: string, type: "CE" | "PE", strike: number, price: number) => void;
}

export function OptionChainModal({ underlying, isOpen, onClose, onSelectContract }: OptionChainModalProps) {
  const [selectedUnderlying, setSelectedUnderlying] = useState(underlying || "NIFTY50");
  const [selectedExpiry, setSelectedExpiry] = useState<string>("");

  const { data, isLoading, refetch, isFetching } = useQuery<{ status: string; data: OptionChainData }>({
    queryKey: ["optionChain", selectedUnderlying, selectedExpiry],
    queryFn: async () => {
      const p = new URLSearchParams({ underlying: selectedUnderlying });
      if (selectedExpiry) p.append("expiry", selectedExpiry);
      const res = await fetch(`/api/universe/option-chain?${p.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch option chain");
      return res.json();
    },
    enabled: isOpen,
    refetchInterval: 5000,
  });

  if (!isOpen) return null;

  const chain = data?.data;
  const spotPrice = chain?.spot_price || 0.0;
  const strikes = chain?.strikes || [];
  const expiries = chain?.available_expiries || [];
  const activeExpiry = selectedExpiry || chain?.selected_expiry || expiries[0] || "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      <div className="bg-[#0B0E14] border border-[#1E293B] rounded-2xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Bar */}
        <div className="p-4 bg-[#121824] border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  Real-Time Option Chain & Greeks Ladder
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[11px] font-bold border border-cyan-500/30">
                  {selectedUnderlying}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-mono font-bold">
                  Spot: ₹{spotPrice > 0 ? spotPrice.toLocaleString() : "..."}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Authoritative strike matrix with Open Interest, Implied Volatility, and Black-Scholes Greeks.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Underlying Switcher */}
            <select
              value={selectedUnderlying}
              onChange={(e) => setSelectedUnderlying(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-[#0F141F] border border-[#1E293B] text-xs font-semibold text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="NIFTY50">NIFTY 50</option>
              <option value="BANKNIFTY">BANK NIFTY</option>
              <option value="RELIANCE">RELIANCE</option>
              <option value="TCS">TCS</option>
              <option value="HDFCBANK">HDFC BANK</option>
            </select>

            {/* Expiry Selector */}
            {expiries.length > 0 && (
              <select
                value={activeExpiry}
                onChange={(e) => setSelectedExpiry(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-[#0F141F] border border-[#1E293B] text-xs font-semibold text-cyan-300 focus:outline-none focus:border-cyan-500"
              >
                {expiries.map((exp) => (
                  <option key={exp} value={exp}>
                    Expiry: {exp}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={() => refetch()}
              className="p-2 rounded-lg bg-[#0F141F] hover:bg-slate-800 border border-[#1E293B] text-slate-300 hover:text-white"
              title="Refresh Option Chain"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin text-cyan-400" : ""}`} />
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-[#0F141F] hover:bg-red-500/20 border border-[#1E293B] hover:border-red-500/40 text-slate-400 hover:text-red-400 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Chain Table View */}
        <div className="flex-1 overflow-x-auto overflow-y-auto p-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-3">
              <RefreshCw className="h-7 w-7 animate-spin text-cyan-400" />
              <p className="text-xs">Assembling strike ladder and Greek surfaces...</p>
            </div>
          ) : strikes.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <ShieldAlert className="h-8 w-8 mx-auto mb-2 text-amber-400" />
              <p className="text-sm font-semibold text-white">No active strikes discovered for {selectedUnderlying}</p>
              <p className="text-xs text-slate-400 mt-1">Please sync the derivatives engine or select another expiry.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="bg-[#121824] border-b border-[#1E293B] text-[11px] text-slate-400">
                  <th colSpan={7} className="text-center py-2 bg-emerald-950/20 text-emerald-300 font-bold border-r border-[#1E293B]">
                    CALL OPTIONS (CE)
                  </th>
                  <th className="text-center py-2 px-3 bg-[#0B0E14] text-white font-bold tracking-wider">
                    STRIKE
                  </th>
                  <th colSpan={7} className="text-center py-2 bg-rose-950/20 text-rose-300 font-bold border-l border-[#1E293B]">
                    PUT OPTIONS (PE)
                  </th>
                </tr>
                <tr className="bg-[#0D121C] border-b border-[#1E293B] text-[10px] text-slate-400">
                  {/* Call Columns */}
                  <th className="py-2 px-2 text-right">OI (Lots)</th>
                  <th className="py-2 px-2 text-right">OI Chg</th>
                  <th className="py-2 px-2 text-right">IV%</th>
                  <th className="py-2 px-2 text-right">Delta</th>
                  <th className="py-2 px-2 text-right">LTP (₹)</th>
                  <th className="py-2 px-2 text-right">Chg%</th>
                  <th className="py-2 px-2 text-center border-r border-[#1E293B]">Action</th>

                  {/* Strike Column */}
                  <th className="py-2 px-3 text-center bg-[#121824] text-white font-bold">Strike</th>

                  {/* Put Columns */}
                  <th className="py-2 px-2 text-center border-l border-[#1E293B]">Action</th>
                  <th className="py-2 px-2 text-left">Chg%</th>
                  <th className="py-2 px-2 text-left">LTP (₹)</th>
                  <th className="py-2 px-2 text-left">Delta</th>
                  <th className="py-2 px-2 text-left">IV%</th>
                  <th className="py-2 px-2 text-left">OI Chg</th>
                  <th className="py-2 px-2 text-left">OI (Lots)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#161F30]">
                {strikes.map((s) => {
                  const isAtm = Math.abs(s.strike - spotPrice) < 60;
                  const isCallItm = s.strike < spotPrice;
                  const isPutItm = s.strike > spotPrice;

                  return (
                    <tr
                      key={s.strike}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isAtm ? "bg-cyan-500/10 font-bold ring-1 ring-cyan-500/30" : ""
                      }`}
                    >
                      {/* Call OI */}
                      <td className={`py-2 px-2 text-right ${isCallItm ? "bg-emerald-950/10 text-slate-300" : "text-slate-400"}`}>
                        {s.call?.open_interest ? (s.call.open_interest / 1000).toFixed(0) + "k" : "—"}
                      </td>
                      {/* Call OI Chg */}
                      <td className="py-2 px-2 text-right text-[10px]">
                        {s.call?.oi_change !== undefined ? (
                          <span className={s.call.oi_change >= 0 ? "text-emerald-400" : "text-rose-400"}>
                            {s.call.oi_change > 0 ? "+" : ""}
                            {(s.call.oi_change / 1000).toFixed(1)}k
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      {/* Call IV */}
                      <td className="py-2 px-2 text-right text-slate-400 text-[10px]">
                        {s.call?.implied_volatility ? `${s.call.implied_volatility}%` : "—"}
                      </td>
                      {/* Call Delta */}
                      <td className="py-2 px-2 text-right text-cyan-300 text-[10px]">
                        {s.call?.delta !== undefined ? s.call.delta.toFixed(2) : "—"}
                      </td>
                      {/* Call LTP */}
                      <td className={`py-2 px-2 text-right font-bold ${isCallItm ? "text-emerald-300" : "text-white"}`}>
                        {s.call?.last_price ? `₹${s.call.last_price.toFixed(2)}` : "—"}
                      </td>
                      {/* Call Chg% */}
                      <td className="py-2 px-2 text-right text-[10px]">
                        {s.call?.change_24h !== undefined ? (
                          <span className={s.call.change_24h >= 0 ? "text-emerald-400" : "text-rose-400"}>
                            {s.call.change_24h > 0 ? "+" : ""}
                            {s.call.change_24h.toFixed(1)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      {/* Call Quick Buy */}
                      <td className="py-1 px-2 text-center border-r border-[#1E293B]">
                        {s.call && (
                          <button
                            onClick={() =>
                              onSelectContract?.(
                                s.call!.canonical_symbol,
                                "CE",
                                s.strike,
                                s.call!.last_price
                              )
                            }
                            className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 text-[10px] font-bold border border-emerald-500/30 transition-colors"
                          >
                            Buy CE
                          </button>
                        )}
                      </td>

                      {/* Strike Price (Center) */}
                      <td className={`py-2 px-3 text-center bg-[#0F141F] font-bold ${isAtm ? "text-cyan-300 ring-1 ring-cyan-500/40" : "text-white"}`}>
                        {s.strike.toLocaleString()}
                        {isAtm && <span className="ml-1 text-[9px] text-cyan-400 uppercase tracking-tighter">(ATM)</span>}
                      </td>

                      {/* Put Quick Buy */}
                      <td className="py-1 px-2 text-center border-l border-[#1E293B]">
                        {s.put && (
                          <button
                            onClick={() =>
                              onSelectContract?.(
                                s.put!.canonical_symbol,
                                "PE",
                                s.strike,
                                s.put!.last_price
                              )
                            }
                            className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 text-[10px] font-bold border border-rose-500/30 transition-colors"
                          >
                            Buy PE
                          </button>
                        )}
                      </td>
                      {/* Put Chg% */}
                      <td className="py-2 px-2 text-left text-[10px]">
                        {s.put?.change_24h !== undefined ? (
                          <span className={s.put.change_24h >= 0 ? "text-emerald-400" : "text-rose-400"}>
                            {s.put.change_24h > 0 ? "+" : ""}
                            {s.put.change_24h.toFixed(1)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      {/* Put LTP */}
                      <td className={`py-2 px-2 text-left font-bold ${isPutItm ? "text-rose-300" : "text-white"}`}>
                        {s.put?.last_price ? `₹${s.put.last_price.toFixed(2)}` : "—"}
                      </td>
                      {/* Put Delta */}
                      <td className="py-2 px-2 text-left text-cyan-300 text-[10px]">
                        {s.put?.delta !== undefined ? s.put.delta.toFixed(2) : "—"}
                      </td>
                      {/* Put IV */}
                      <td className="py-2 px-2 text-left text-slate-400 text-[10px]">
                        {s.put?.implied_volatility ? `${s.put.implied_volatility}%` : "—"}
                      </td>
                      {/* Put OI Chg */}
                      <td className="py-2 px-2 text-left text-[10px]">
                        {s.put?.oi_change !== undefined ? (
                          <span className={s.put.oi_change >= 0 ? "text-emerald-400" : "text-rose-400"}>
                            {s.put.oi_change > 0 ? "+" : ""}
                            {(s.put.oi_change / 1000).toFixed(1)}k
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      {/* Put OI */}
                      <td className={`py-2 px-2 text-left ${isPutItm ? "bg-rose-950/10 text-slate-300" : "text-slate-400"}`}>
                        {s.put?.open_interest ? (s.put.open_interest / 1000).toFixed(0) + "k" : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-[#0D121C] border-t border-[#1E293B] flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" /> ITM Calls (Green Shading)
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-rose-400 inline-block" /> ITM Puts (Rose Shading)
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-cyan-400 inline-block" /> At-The-Money (ATM)
            </span>
          </div>
          <span className="text-slate-500 font-mono">Realtime Greeks (Delta, IV, Theta, Vega) dynamically computed</span>
        </div>
      </div>
    </div>
  );
}
