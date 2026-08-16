"use client";

import React from "react";
import { Search, Filter, FlaskConical } from "lucide-react";

interface Props {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  directionFilter: string;
  setDirectionFilter: (d: string) => void;
  strategyFilter: string;
  setStrategyFilter: (st: string) => void;
  showTestTrades: boolean;
  setShowTestTrades: (st: boolean) => void;
}

export function TradeFilters({
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  directionFilter,
  setDirectionFilter,
  strategyFilter,
  setStrategyFilter,
  showTestTrades,
  setShowTestTrades,
}: Props) {
  return (
    <div className="bg-[#121824] border border-[#1E293B] rounded-xl p-4 mb-4 flex flex-wrap items-center justify-between gap-4">
      {/* Search Bar */}
      <div className="relative min-w-[240px] flex-1 max-w-xs">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search bot, symbol, remarks..."
          className="w-full bg-[#0B0F17] border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
        />
      </div>

      {/* Filter Dropdowns */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 bg-[#0B0F17] px-3 py-1.5 rounded-lg border border-slate-700">
          <Filter className="h-3.5 w-3.5 text-slate-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent text-white font-mono focus:outline-none cursor-pointer"
          >
            <option value="ALL" className="bg-[#0B0F17]">All Status</option>
            <option value="OPEN" className="bg-[#0B0F17]">Open Only</option>
            <option value="CLOSED" className="bg-[#0B0F17]">Closed Only</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 bg-[#0B0F17] px-3 py-1.5 rounded-lg border border-slate-700">
          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value)}
            className="bg-transparent text-white font-mono focus:outline-none cursor-pointer"
          >
            <option value="ALL" className="bg-[#0B0F17]">All Directions</option>
            <option value="LONG" className="bg-[#0B0F17]">LONG / BUY</option>
            <option value="SHORT" className="bg-[#0B0F17]">SHORT / SELL</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 bg-[#0B0F17] px-3 py-1.5 rounded-lg border border-slate-700">
          <select
            value={strategyFilter}
            onChange={(e) => setStrategyFilter(e.target.value)}
            className="bg-transparent text-white font-mono focus:outline-none cursor-pointer"
          >
            <option value="ALL" className="bg-[#0B0F17]">All Strategies</option>
            <option value="EMA_MACD_VP" className="bg-[#0B0F17]">EMA_MACD_VP</option>
            <option value="RSI_MEAN_REVERSION" className="bg-[#0B0F17]">RSI_MEAN_REVERSION</option>
            <option value="TREND_BREAKOUT" className="bg-[#0B0F17]">TREND_BREAKOUT</option>
          </select>
        </div>

        {/* Test Trades Toggle (Default OFF) */}
        <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showTestTrades}
            onChange={(e) => setShowTestTrades(e.target.checked)}
            className="rounded border-slate-700 text-cyan-500 focus:ring-0 bg-slate-900 cursor-pointer"
          />
          <FlaskConical className={`h-3.5 w-3.5 ${showTestTrades ? "text-cyan-400" : "text-slate-500"}`} />
          <span className={`font-mono text-xs ${showTestTrades ? "text-cyan-300 font-bold" : "text-slate-400"}`}>
            Show Test Trades
          </span>
        </label>
      </div>
    </div>
  );
}
