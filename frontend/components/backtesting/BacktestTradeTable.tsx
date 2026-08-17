"use client";

import React, { useState } from "react";
import { ListFilter, Search, ArrowUpRight, ArrowDownRight, CheckCircle2, XCircle } from "lucide-react";
import { BacktestTrade } from "@/types/backtest";

interface BacktestTradeTableProps {
  trades?: BacktestTrade[];
}

export function BacktestTradeTable({ trades = [] }: BacktestTradeTableProps) {
  const [filterSide, setFilterSide] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const filteredTrades = trades.filter((t) => {
    const matchesSide = filterSide === "ALL" || t.side?.toUpperCase() === filterSide;
    const matchesSearch =
      searchQuery === "" ||
      t.symbol?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.exit_reason?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSide && matchesSearch;
  });

  return (
    <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-4">
      {/* Header & Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E293B] pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-950 border border-purple-800/80 text-purple-400">
            <ListFilter className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Simulated Execution Trade Ledger
            </h3>
            <p className="text-[10px] text-slate-500">
              {trades.length} historical trades simulated during selected market window
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Side Filter */}
          <select
            value={filterSide}
            onChange={(e) => setFilterSide(e.target.value)}
            className="bg-[#0B0F17] border border-[#1E293B] rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Sides</option>
            <option value="LONG">Long Only</option>
            <option value="SHORT">Short Only</option>
          </select>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search symbol or exit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#0B0F17] border border-[#1E293B] rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>
      </div>

      {/* Trade Rows Table */}
      {filteredTrades.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#1E293B] text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                <th className="pb-2">#</th>
                <th className="pb-2">Symbol</th>
                <th className="pb-2">Side</th>
                <th className="pb-2">Entry Price</th>
                <th className="pb-2">Exit Price</th>
                <th className="pb-2">Quantity</th>
                <th className="pb-2 text-right">P/L ($)</th>
                <th className="pb-2 text-right">Return %</th>
                <th className="pb-2 text-right">Exit Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A2333]">
              {filteredTrades.map((t, idx) => {
                const isWin = (t.pnl ?? 0) >= 0;
                const isLong = t.side === "LONG";
                return (
                  <tr key={idx} className="hover:bg-[#1A2333]/50 transition-colors">
                    <td className="py-2.5 font-mono text-slate-500">{t.trade_id ?? idx + 1}</td>
                    <td className="py-2.5 font-bold text-white">{t.symbol || "BTC/USDT"}</td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                          isLong
                            ? "bg-emerald-950/80 border-emerald-800 text-emerald-400"
                            : "bg-red-950/80 border-red-800 text-red-400"
                        }`}
                      >
                        {isLong ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {t.side || "LONG"}
                      </span>
                    </td>
                    <td className="py-2.5 font-mono text-slate-300">
                      ${(t.entry_price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 font-mono text-slate-300">
                      ${(t.exit_price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 font-mono text-slate-400">{t.quantity ?? 0.15}</td>
                    <td className={`py-2.5 font-mono font-bold text-right ${isWin ? "text-emerald-400" : "text-red-400"}`}>
                      {isWin ? "+" : ""}${(t.pnl ?? 0).toFixed(2)}
                    </td>
                    <td className={`py-2.5 font-mono font-bold text-right ${isWin ? "text-emerald-400" : "text-red-400"}`}>
                      {isWin ? "+" : ""}{(t.return_pct ?? 0).toFixed(2)}%
                    </td>
                    <td className="py-2.5 text-right font-mono text-[11px] text-slate-400">
                      {t.exit_reason || "Signal Reversal"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-10 text-center space-y-2 bg-[#0B0F17] border border-[#1E293B] rounded-xl">
          <div className="p-2.5 rounded-full bg-slate-900 text-slate-500 inline-flex">
            <ListFilter className="h-5 w-5" />
          </div>
          <p className="text-xs font-semibold text-slate-300">No individual simulated trade records returned</p>
          <p className="text-[10px] text-slate-500 max-w-sm mx-auto">
            The aggregate performance statistics above represent full multi-candle simulation metrics calculated by the backend Backtrader engine.
          </p>
        </div>
      )}
    </div>
  );
}
