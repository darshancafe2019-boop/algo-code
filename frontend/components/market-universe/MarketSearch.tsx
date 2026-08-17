"use client";

import React from "react";
import { Search, X, Filter, SlidersHorizontal } from "lucide-react";

interface MarketSearchProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  assetClass: string;
  setAssetClass: (assetClass: string) => void;
  volatilityFilter?: string;
  setVolatilityFilter?: (vol: string) => void;
  exchangeFilter?: string;
  setExchangeFilter?: (exch: string) => void;
}

const ASSET_CLASSES = [
  { label: "All Markets", value: "ALL" },
  { label: "Indian Equities", value: "INDIAN_STOCKS" },
  { label: "Indian Indices", value: "INDIAN_INDICES" },
  { label: "Global Stocks", value: "GLOBAL_STOCKS" },
  { label: "Crypto Pairs", value: "CRYPTO" },
  { label: "Forex Currencies", value: "FOREX" },
  { label: "Commodities", value: "COMMODITIES" },
  { label: "Futures Contracts", value: "FUTURES" },
  { label: "Option Chain", value: "OPTIONS" },
];

export function MarketSearch({
  searchQuery,
  setSearchQuery,
  assetClass,
  setAssetClass,
  volatilityFilter = "ALL",
  setVolatilityFilter,
  exchangeFilter = "ALL",
  setExchangeFilter,
}: MarketSearchProps) {
  return (
    <div className="p-4 rounded-xl bg-[#121824] border border-[#1E293B] space-y-3">
      {/* Top Search & Filter Dropdowns Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Symbol (RELIANCE, BTC, AAPL, NIFTY50), ISIN, or Company..."
            className="w-full pl-10 pr-9 py-2 bg-[#0B0E14] border border-[#1E293B] focus:border-cyan-500 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Volatility Filter */}
        {setVolatilityFilter && (
          <div className="flex items-center gap-1.5 bg-[#0B0E14] px-3 py-1.5 rounded-xl border border-[#1E293B]">
            <span className="text-[11px] text-slate-400 font-semibold">Volatility:</span>
            <select
              value={volatilityFilter}
              onChange={(e) => setVolatilityFilter(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none font-semibold cursor-pointer"
            >
              <option value="ALL" className="bg-[#0B0E14]">All Volatility</option>
              <option value="Extreme" className="bg-[#0B0E14]">Extreme (&gt;75)</option>
              <option value="High" className="bg-[#0B0E14]">High (&gt;55)</option>
              <option value="Medium" className="bg-[#0B0E14]">Medium (35-55)</option>
              <option value="Low" className="bg-[#0B0E14]">Low (&lt;35)</option>
            </select>
          </div>
        )}

        {/* Exchange Filter */}
        {setExchangeFilter && (
          <div className="flex items-center gap-1.5 bg-[#0B0E14] px-3 py-1.5 rounded-xl border border-[#1E293B]">
            <span className="text-[11px] text-slate-400 font-semibold">Exchange:</span>
            <select
              value={exchangeFilter}
              onChange={(e) => setExchangeFilter(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none font-semibold cursor-pointer"
            >
              <option value="ALL" className="bg-[#0B0E14]">All Exchanges</option>
              <option value="NSE" className="bg-[#0B0E14]">NSE (India)</option>
              <option value="BSE" className="bg-[#0B0E14]">BSE (India)</option>
              <option value="BINANCE" className="bg-[#0B0E14]">Binance (Crypto)</option>
              <option value="NASDAQ" className="bg-[#0B0E14]">NASDAQ (US)</option>
              <option value="NYSE" className="bg-[#0B0E14]">NYSE (US)</option>
              <option value="OANDA" className="bg-[#0B0E14]">OANDA (Forex)</option>
              <option value="MCX" className="bg-[#0B0E14]">MCX (Commodities)</option>
            </select>
          </div>
        )}
      </div>

      {/* Asset Class Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {ASSET_CLASSES.map((ac) => {
          const isActive = assetClass === ac.value;
          return (
            <button
              key={ac.value}
              onClick={() => setAssetClass(ac.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isActive
                  ? "bg-cyan-500 text-black font-bold shadow-lg shadow-cyan-500/20"
                  : "bg-[#0B0E14] hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-[#1E293B]"
              }`}
            >
              {ac.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
