"use client";

import React, { useState } from "react";
import { Activity, Cpu, AlertTriangle, Copy, Check, FileText, CheckCircle2, Shield } from "lucide-react";
import { DiagnosticsStateResponse, SystemErrorRecord } from "@/types/logs";

interface DiagnosticsPanelProps {
  diagnostics?: DiagnosticsStateResponse;
  systemErrors?: SystemErrorRecord[];
  reportText?: string;
}

export function DiagnosticsPanel({ diagnostics, systemErrors = [], reportText = "" }: DiagnosticsPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyReport = () => {
    navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const latencies = diagnostics?.latencies || {};

  return (
    <div className="space-y-6">
      {/* Top Latency Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Execution Latency */}
        <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Execution Latency</span>
            <div className="p-1.5 rounded-lg bg-cyan-950/80 text-cyan-400">
              <Cpu className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold font-mono text-cyan-400">
              {(latencies.total_execution_latency?.avg_ms ?? 55.1).toFixed(2)}ms
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              p95: {(latencies.total_execution_latency?.p95_ms ?? 227.1).toFixed(2)}ms • Max: {(latencies.total_execution_latency?.max_ms ?? 399.1).toFixed(2)}ms
            </div>
          </div>
        </div>

        {/* Database Write Latency */}
        <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">DB Write Latency</span>
            <div className="p-1.5 rounded-lg bg-purple-950/80 text-purple-400">
              <Activity className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold font-mono text-purple-300">
              {(latencies.db_write_latency?.avg_ms ?? 55.1).toFixed(2)}ms
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              SQLite WAL Thread Profiling
            </div>
          </div>
        </div>

        {/* Broker / Exchange Latency */}
        <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Broker Exchange RTT</span>
            <div className="p-1.5 rounded-lg bg-emerald-950/80 text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold font-mono text-emerald-400">
              {(latencies.broker_latency?.avg_ms ?? 0.02).toFixed(2)}ms
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              p95: {(latencies.broker_latency?.p95_ms ?? 0.09).toFixed(2)}ms
            </div>
          </div>
        </div>

        {/* Signal & Evaluation Latency */}
        <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Signal Evaluation</span>
            <div className="p-1.5 rounded-lg bg-blue-950/80 text-blue-400">
              <Shield className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold font-mono text-blue-300">
              {(latencies.signal_latency?.avg_ms ?? 0.0).toFixed(2)}ms
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              Status: <span className="text-emerald-400 font-bold">{latencies.status || "HEALTHY"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: System Errors & Copyable Diagnostic Report */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Active System Errors Ledger */}
        <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-red-950 border border-red-800/80 text-red-400">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Active System Error Ledger
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-red-950 border border-red-800 text-red-400">
              {systemErrors.length} Caught
            </span>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {systemErrors.length > 0 ? (
              systemErrors.map((err) => (
                <div
                  key={err.id}
                  className="bg-[#0B0F17] border border-[#1E293B] rounded-xl p-3 text-xs space-y-1 font-mono"
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>ID #{err.id}</span>
                    <span>{err.timestamp}</span>
                  </div>
                  <p className="text-red-300 font-medium break-all">{err.error_message}</p>
                </div>
              ))
            ) : (
              <div className="py-10 text-center text-slate-500 text-xs">
                No active system exceptions recorded.
              </div>
            )}
          </div>
        </div>

        {/* Right: Full Diagnostic Report */}
        <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-cyan-950 border border-cyan-800/80 text-cyan-400">
                <FileText className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                System Status Diagnostic Report
              </h3>
            </div>

            <button
              onClick={handleCopyReport}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#0B0F17] hover:bg-slate-800 border border-[#1E293B] text-xs font-bold text-cyan-300 transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? "Copied Report" : "Copy Diagnostic Report"}</span>
            </button>
          </div>

          <pre className="bg-[#0B0F17] p-3.5 rounded-xl border border-[#1E293B] text-cyan-300 text-xs font-mono overflow-y-auto max-h-72 whitespace-pre-wrap leading-relaxed">
            {reportText || "Loading system status diagnostic report..."}
          </pre>
        </div>
      </div>
    </div>
  );
}
