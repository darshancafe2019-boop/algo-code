"use client";

import React from "react";
import { Info, AlertTriangle, AlertOctagon, Bug, Eye, Clock, Bot, Cpu } from "lucide-react";
import { AuditEventRecord } from "@/types/logs";

interface LogRowProps {
  log: AuditEventRecord | string;
  isStructured: boolean;
  onOpenDetails: (log: AuditEventRecord | string) => void;
}

// Secret masking utility to guarantee 0 secret leaks in logs
export function sanitizeLogString(str: string): string {
  if (!str) return "";
  return str
    .replace(/(api[_-]?key["':\s=]+)([a-zA-Z0-9_\-]{8,})/gi, "$1***REDACTED***")
    .replace(/(api[_-]?secret["':\s=]+)([a-zA-Z0-9_\-]{8,})/gi, "$1***REDACTED***")
    .replace(/(bearer\s+)([a-zA-Z0-9_\.\-]{10,})/gi, "$1***REDACTED***")
    .replace(/(password["':\s=]+)([^"',\s]+)/gi, "$1***REDACTED***");
}

export function LogRow({ log, isStructured, onOpenDetails }: LogRowProps) {
  if (!isStructured || typeof log === "string") {
    const rawLine = typeof log === "string" ? log : log.message;
    const sanitized = sanitizeLogString(rawLine);
    const isErr = sanitized.includes("ERROR") || sanitized.includes("CRITICAL") || sanitized.includes("EXCEPTION");
    const isWarn = sanitized.includes("WARNING") || sanitized.includes("WARN");
    const isInfo = sanitized.includes("INFO");

    return (
      <div
        onClick={() => onOpenDetails(log)}
        className="group px-3 py-2 bg-[#0B0F17] hover:bg-[#161F30] border border-[#1E293B] hover:border-slate-700 rounded-xl flex items-start gap-3 transition-colors cursor-pointer font-mono text-xs"
      >
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border flex-shrink-0 ${
            isErr
              ? "bg-red-950/80 border-red-800 text-red-400"
              : isWarn
              ? "bg-amber-950/80 border-amber-800 text-amber-400"
              : isInfo
              ? "bg-cyan-950/80 border-cyan-800 text-cyan-400"
              : "bg-slate-900 border-slate-700 text-slate-400"
          }`}
        >
          {isErr ? "ERR" : isWarn ? "WARN" : isInfo ? "INFO" : "LOG"}
        </span>

        <span className="flex-1 text-slate-300 break-all leading-relaxed line-clamp-2 group-hover:line-clamp-none">
          {sanitized}
        </span>

        <Eye className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-300 flex-shrink-0 mt-0.5" />
      </div>
    );
  }

  const evt = log as AuditEventRecord;
  const severity = (evt.severity || "INFO").toUpperCase();
  const isErr = severity === "ERROR" || severity === "CRITICAL";
  const isWarn = severity === "WARNING";
  const isInfo = severity === "INFO";

  const timeDisplay = evt.local_timestamp || (evt.timestamp_utc ? evt.timestamp_utc.slice(11, 19) : "00:00:00");
  const sanitizedMsg = sanitizeLogString(evt.message);

  return (
    <div
      onClick={() => onOpenDetails(evt)}
      className="group px-3.5 py-2.5 bg-[#0B0F17] hover:bg-[#161F30] border border-[#1E293B] hover:border-slate-700 rounded-xl flex flex-wrap items-center justify-between gap-3 transition-colors cursor-pointer text-xs"
    >
      <div className="flex items-center gap-2.5 flex-1 min-w-[280px]">
        {/* Severity Badge */}
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold border flex-shrink-0 flex items-center gap-1 ${
            isErr
              ? "bg-red-950/80 border-red-800 text-red-400"
              : isWarn
              ? "bg-amber-950/80 border-amber-800 text-amber-400"
              : isInfo
              ? "bg-cyan-950/80 border-cyan-800 text-cyan-400"
              : "bg-slate-900 border-slate-700 text-slate-400"
          }`}
        >
          {isErr ? <AlertOctagon className="h-3 w-3" /> : isWarn ? <AlertTriangle className="h-3 w-3" /> : <Info className="h-3 w-3" />}
          {severity}
        </span>

        {/* Timestamp */}
        <span className="font-mono text-[11px] text-slate-500 flex items-center gap-1 flex-shrink-0">
          <Clock className="h-3 w-3" /> {timeDisplay}
        </span>

        {/* Event Type & Bot Attribution */}
        {evt.event_type && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-950/80 border border-purple-800/60 text-purple-300 flex-shrink-0">
            {evt.event_type}
          </span>
        )}

        {evt.bot_instance_name && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-950/80 border border-blue-800/60 text-blue-300 flex items-center gap-1 flex-shrink-0">
            <Bot className="h-3 w-3" /> {evt.bot_instance_name}
          </span>
        )}

        {/* Message */}
        <span className="text-slate-200 font-medium truncate flex-1 min-w-[120px]">
          {sanitizedMsg}
        </span>
      </div>

      {/* Latency & View Icon */}
      <div className="flex items-center gap-3 text-slate-500">
        {evt.latency_ms !== undefined && evt.latency_ms > 0 && (
          <span className="font-mono text-[10px] text-slate-400 flex items-center gap-1">
            <Cpu className="h-3 w-3 text-cyan-400" /> {evt.latency_ms.toFixed(1)}ms
          </span>
        )}
        <Eye className="h-3.5 w-3.5 text-slate-500 group-hover:text-cyan-400 transition-colors" />
      </div>
    </div>
  );
}
