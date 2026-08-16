"use client";

import React from "react";
import { Search, Filter, X } from "lucide-react";
import { AlertSeverity } from "@/types/alerts";

interface AlertFiltersProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  severityFilter: AlertSeverity;
  setSeverityFilter: (s: AlertSeverity) => void;
  categoryFilter: string;
  setCategoryFilter: (c: string) => void;
  categories: string[];
  counts: {
    all: number;
    info: number;
    warning: number;
    error: number;
    critical: number;
  };
}

export function AlertFilters({
  searchQuery,
  setSearchQuery,
  severityFilter,
  setSeverityFilter,
  categoryFilter,
  setCategoryFilter,
  categories,
  counts
}: AlertFiltersProps) {
  const isFiltered = searchQuery !== "" || severityFilter !== "ALL" || categoryFilter !== "ALL";

  return (
    <div className="space-y-3 bg-[#121824] p-4 rounded-xl border border-[#1E293B]">
      {/* Top Row: Search & Category Select */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Box */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search alerts (e.g. stall, bot-1, restart, PID)..."
            className="w-full pl-9 pr-8 py-2 bg-[#0B0F17] border border-[#1E293B] focus:border-cyan-500/60 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Select */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0 font-medium">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            Source:
          </span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-[#0B0F17] border border-[#1E293B] text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/60 transition-colors"
          >
            <option value="ALL">All Sources ({categories.length})</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Reset Filters */}
          {isFiltered && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSeverityFilter("ALL");
                setCategoryFilter("ALL");
              }}
              className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors flex items-center gap-1 shrink-0"
              title="Reset all filters"
            >
              <X className="w-3.5 h-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Severity Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#1E293B]/60">
        <button
          onClick={() => setSeverityFilter("ALL")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            severityFilter === "ALL"
              ? "bg-slate-700 text-white shadow-sm"
              : "bg-[#0B0F17]/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
          }`}
        >
          All ({counts.all})
        </button>

        <button
          onClick={() => setSeverityFilter("INFO")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
            severityFilter === "INFO"
              ? "bg-cyan-950 text-cyan-300 border border-cyan-700 shadow-sm"
              : "bg-[#0B0F17]/80 text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/40"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          Info ({counts.info})
        </button>

        <button
          onClick={() => setSeverityFilter("WARNING")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
            severityFilter === "WARNING"
              ? "bg-amber-950 text-amber-300 border border-amber-700 shadow-sm"
              : "bg-[#0B0F17]/80 text-slate-400 hover:text-amber-300 hover:bg-amber-950/40"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          Warning ({counts.warning})
        </button>

        <button
          onClick={() => setSeverityFilter("ERROR")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
            severityFilter === "ERROR"
              ? "bg-red-950 text-red-300 border border-red-700 shadow-sm"
              : "bg-[#0B0F17]/80 text-slate-400 hover:text-red-300 hover:bg-red-950/40"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          Error ({counts.error})
        </button>

        {counts.critical > 0 && (
          <button
            onClick={() => setSeverityFilter("CRITICAL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              severityFilter === "CRITICAL"
                ? "bg-rose-950 text-rose-300 border border-rose-700 shadow-sm"
                : "bg-[#0B0F17]/80 text-slate-400 hover:text-rose-300 hover:bg-rose-950/40"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
            Critical ({counts.critical})
          </button>
        )}
      </div>
    </div>
  );
}
