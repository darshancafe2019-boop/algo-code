"use client";

import React from "react";
import { Search, Filter, Download, Pause, Play, RefreshCw, Terminal, Activity, ShieldAlert, Cpu } from "lucide-react";

export type LogSourceType = "AUDIT_EVENTS" | "SYSTEM_LOGS" | "DIAGNOSTICS";

interface LogsToolbarProps {
  source: LogSourceType;
  onSourceChange: (source: LogSourceType) => void;
  search: string;
  onSearchChange: (search: string) => void;
  severity: string;
  onSeverityChange: (severity: string) => void;
  isPaused: boolean;
  onTogglePause: () => void;
  onRefresh: () => void;
  isFetching: boolean;
  totalCount: number;
}

export function LogsToolbar({
  source,
  onSourceChange,
  search,
  onSearchChange,
  severity,
  onSeverityChange,
  isPaused,
  onTogglePause,
  onRefresh,
  isFetching,
  totalCount,
}: LogsToolbarProps) {
  const handleExportCsv = () => {
    window.open("/api/audit/export-csv", "_blank");
  };

  return (
    <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-4 space-y-4">
      {/* Top Source Tabs & Status Pill */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E293B] pb-3">
        {/* Source Sub-Tabs */}
        <div className="flex items-center gap-1.5 bg-[#0B0F17] p-1 rounded-xl border border-[#1E293B]">
          <button
            onClick={() => onSourceChange("AUDIT_EVENTS")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              source === "AUDIT_EVENTS"
                ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Terminal className="h-3.5 w-3.5" />
            <span>Structured Audit Events</span>
          </button>

          <button
            onClick={() => onSourceChange("SYSTEM_LOGS")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              source === "SYSTEM_LOGS"
                ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>System & Runner Logs</span>
          </button>

          <button
            onClick={() => onSourceChange("DIAGNOSTICS")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              source === "DIAGNOSTICS"
                ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            <span>Diagnostics & Latency</span>
          </button>
        </div>

        {/* Live Stream Status & Actions */}
        <div className="flex items-center gap-2">
          <div
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold font-mono border flex items-center gap-1.5 ${
              isPaused
                ? "bg-amber-950/80 border-amber-800 text-amber-300"
                : "bg-emerald-950/80 border-emerald-800 text-emerald-300 animate-pulse"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isPaused ? "bg-amber-400" : "bg-emerald-400"}`} />
            <span>{isPaused ? "STREAM PAUSED" : "LIVE POLLING (3s)"}</span>
          </div>

          <button
            onClick={onTogglePause}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors flex items-center gap-1.5 ${
              isPaused
                ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-600/20"
                : "bg-[#0B0F17] hover:bg-slate-800 text-slate-300 border-[#1E293B]"
            }`}
          >
            {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            <span>{isPaused ? "Resume Stream" : "Pause Stream"}</span>
          </button>

          <button
            onClick={onRefresh}
            disabled={isFetching}
            className="p-1.5 rounded-xl bg-[#0B0F17] hover:bg-slate-800 border border-[#1E293B] text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh Logs"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin text-cyan-400" : ""}`} />
          </button>

          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B0F17] hover:bg-slate-800 border border-[#1E293B] text-xs font-bold text-slate-300 hover:text-white transition-colors"
          >
            <Download className="h-3.5 w-3.5 text-cyan-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filter Row: Search & Severity Dropdown */}
      {source !== "DIAGNOSTICS" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by message, bot, event type, or keyword..."
              className="w-full pl-9 pr-4 py-2 bg-[#0B0F17] border border-[#1E293B] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* Severity Filter */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Filter className="h-3.5 w-3.5 text-cyan-400" /> Level:
            </span>
            <select
              value={severity}
              onChange={(e) => onSeverityChange(e.target.value)}
              className="px-3 py-2 bg-[#0B0F17] border border-[#1E293B] rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors font-mono"
            >
              <option value="ALL">ALL LEVELS</option>
              <option value="INFO">INFO ONLY</option>
              <option value="WARNING">WARNING ONLY</option>
              <option value="ERROR">ERROR / CRITICAL ONLY</option>
              <option value="DEBUG">DEBUG ONLY</option>
            </select>
          </div>

          {/* Records Counter */}
          <div className="text-xs font-mono text-slate-400">
            Showing <span className="text-cyan-400 font-bold">{totalCount}</span> entries
          </div>
        </div>
      )}
    </div>
  );
}
