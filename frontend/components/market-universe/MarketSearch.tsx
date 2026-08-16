"use client";

import React from "react";
import { Search, Globe } from "lucide-react";

interface Props {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  assetClass: string;
  setAssetClass: (ac: string) => void;
}

const ASSET_CLASSES = ["ALL", "Crypto", "Indian Equities", "Global Equities", "Forex", "Indices"];

export function MarketSearch({ searchQuery, setSearchQuery, assetClass, setAssetClass }: Props) {
  return (
    <div className="bg-[#121824] border border-[#1E293B] rounded-xl p-4 mb-4 flex flex-wrap items-center justify-between gap-4">
      {/* Search Input */}
      <div className="relative min-w-[240px] flex-1 max-w-xs">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search markets (BTC, RELIANCE, AAPL)..."
          className="w-full bg-[#0B0F17] border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
        />
      </div>

      {/* Asset Class Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {ASSET_CLASSES.map((ac) => {
          const isActive = assetClass === ac;
          return (
            <button
              key={ac}
              onClick={() => setAssetClass(ac)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm"
                  : "text-slate-400 hover:text-white bg-[#0B0F17] border border-slate-800"
              }`}
            >
              {ac === "ALL" ? "All Asset Classes" : ac}
            </button>
          );
        })}
      </div>
    </div>
  );
}
