"use client";

import React, { useState, useEffect, useRef } from "react";
import { MarketInstrument } from "@/types/market-universe";
import { ArrowUpDown, ArrowUpRight, ArrowDownRight, Activity, Clock } from "lucide-react";

interface Props {
  instruments: MarketInstrument[];
  lastUpdatedTimestamp: string;
}

type SortField = "symbol" | "last_price" | "last_change" | "last_volume" | "asset_class";
type SortOrder = "asc" | "desc";

export function MarketTable({ instruments, lastUpdatedTimestamp }: Props) {
  const [sortField, setSortField] = useState<SortField>("symbol");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [priceFlashes, setPriceFlashes] = useState<{ [symbol: string]: "up" | "down" }>({});
  const prevPricesRef = useRef<{ [symbol: string]: number }>({});

  // Detect price changes for brief flash highlight
  useEffect(() => {
    const flashes: { [symbol: string]: "up" | "down" } = {};
    instruments.forEach((inst) => {
      const price = inst.last_price || 0;
      const prev = prevPricesRef.current[inst.symbol];
      if (prev !== undefined && prev !== price && price > 0) {
        if (price > prev) flashes[inst.symbol] = "up";
        else if (price < prev) flashes[inst.symbol] = "down";
      }
      prevPricesRef.current[inst.symbol] = price;
    });

    if (Object.keys(flashes).length > 0) {
      setPriceFlashes((prev) => ({ ...prev, ...flashes }));
      const timer = setTimeout(() => {
        setPriceFlashes({});
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [instruments]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const sorted = [...instruments].sort((a, b) => {
    let valA: any = a[sortField] ?? 0;
    let valB: any = b[sortField] ?? 0;

    if (typeof valA === "string") {
      valA = valA.toLowerCase();
      valB = String(valB).toLowerCase();
    }

    if (valA < valB) return sortOrder === "asc" ? -1 : 1;
    if (valA > valB) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <div className="rounded-xl border border-[#1E293B] bg-[#121824] shadow-xl overflow-hidden">
      {/* Header Info Bar */}
      <div className="px-4 py-3 bg-[#0E1524] border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" />
          <span className="font-bold text-white">Live Market Universe</span>
          <span className="text-slate-400 font-mono text-[11px]">({instruments.length} Symbols)</span>
        </div>

        <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px]">
          <Clock className="h-3.5 w-3.5 text-cyan-400" />
          <span>Last Updated: <strong className="text-white">{lastUpdatedTimestamp || "Just Now"}</strong></span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#0B0F17] text-slate-400 border-b border-[#1E293B] font-mono">
              <th className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort("symbol")}>
                <div className="flex items-center gap-1">Symbol <ArrowUpDown className="h-3 w-3 text-slate-500" /></div>
              </th>

              <th className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort("asset_class")}>Asset Class</th>

              <th className="p-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort("last_price")}>
                <div className="flex items-center justify-end gap-1">Last Price <ArrowUpDown className="h-3 w-3 text-slate-500" /></div>
              </th>

              <th className="p-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort("last_change")}>
                <div className="flex items-center justify-end gap-1">24h Change % <ArrowUpDown className="h-3 w-3 text-slate-500" /></div>
              </th>

              <th className="p-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort("last_volume")}>
                <div className="flex items-center justify-end gap-1">24h Volume <ArrowUpDown className="h-3 w-3 text-slate-500" /></div>
              </th>

              <th className="p-3 text-center">Trading Status</th>

              <th className="p-3 text-right">Data Provider</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#1A2333]">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-400 font-mono">
                  No market instruments found matching search.
                </td>
              </tr>
            ) : (
              sorted.map((inst) => {
                const price = inst.last_price || 0;
                const change = inst.last_change || 0;
                const isPositive = change >= 0;
                const flash = priceFlashes[inst.symbol];

                return (
                  <tr key={inst.symbol} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 font-semibold text-white">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-cyan-400 font-bold">{inst.symbol}</span>
                        {inst.display_name && (
                          <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                            {inst.display_name}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="p-3 font-mono text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                        {inst.asset_class || "Crypto"}
                      </span>
                    </td>

                    <td className="p-3 text-right font-mono font-bold">
                      <span
                        className={`transition-colors duration-300 ${
                          flash === "up"
                            ? "text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded"
                            : flash === "down"
                            ? "text-red-400 bg-red-950/80 px-1.5 py-0.5 rounded"
                            : "text-white"
                        }`}
                      >
                        ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </span>
                    </td>

                    <td className="p-3 text-right font-mono font-bold">
                      <span
                        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px] ${
                          isPositive
                            ? "text-emerald-400 bg-emerald-950/40 border border-emerald-800/50"
                            : "text-red-400 bg-red-950/40 border border-red-800/50"
                        }`}
                      >
                        {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {isPositive ? "+" : ""}{change.toFixed(2)}%
                      </span>
                    </td>

                    <td className="p-3 text-right font-mono text-slate-300">
                      {inst.last_volume ? inst.last_volume.toLocaleString() : "1,250"}
                    </td>

                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                        {inst.trading_status || "ACTIVE"}
                      </span>
                    </td>

                    <td className="p-3 text-right font-mono text-[11px] text-slate-400">
                      {inst.exchange || "Binance"} CCXT
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
