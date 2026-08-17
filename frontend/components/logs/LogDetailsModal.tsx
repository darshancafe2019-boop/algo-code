"use client";

import React, { useState } from "react";
import { X, Copy, Check, Terminal, Clock, ShieldAlert, Cpu, Bot, Code } from "lucide-react";
import { AuditEventRecord } from "@/types/logs";
import { sanitizeLogString } from "./LogRow";

interface LogDetailsModalProps {
  log: AuditEventRecord | string | null;
  onClose: () => void;
}

export function LogDetailsModal({ log, onClose }: LogDetailsModalProps) {
  const [copied, setCopied] = useState(false);

  if (!log) return null;

  const isString = typeof log === "string";
  const rawData = isString
    ? { raw_log: sanitizeLogString(log) }
    : {
        ...log,
        message: sanitizeLogString(log.message),
        metadata_json: log.metadata_json ? JSON.parse(log.metadata_json || "{}") : undefined,
      };

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(rawData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[#1E293B] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-950 border border-cyan-800 text-cyan-400">
              <Terminal className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Log & Audit Trace Inspector</h3>
              <p className="text-[10px] text-slate-500">Immutable server runtime execution record</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-[#1E293B] text-slate-400 hover:text-white transition-colors"
              title="Copy JSON"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-[#1E293B] text-slate-400 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs font-mono">
          {!isString && (
            <div className="grid grid-cols-2 gap-3 bg-[#0B0F17] p-3.5 rounded-xl border border-[#1E293B]">
              <div>
                <span className="text-[10px] font-sans font-bold text-slate-500 uppercase">Event Type</span>
                <p className="text-purple-300 font-bold mt-0.5">{log.event_type || "SYSTEM_EVENT"}</p>
              </div>
              <div>
                <span className="text-[10px] font-sans font-bold text-slate-500 uppercase">Severity Tier</span>
                <p className="text-cyan-400 font-bold mt-0.5">{log.severity || "INFO"}</p>
              </div>
              <div>
                <span className="text-[10px] font-sans font-bold text-slate-500 uppercase">Timestamp (UTC)</span>
                <p className="text-slate-300 mt-0.5">{log.timestamp_utc || "N/A"}</p>
              </div>
              <div>
                <span className="text-[10px] font-sans font-bold text-slate-500 uppercase">Bot Instance</span>
                <p className="text-blue-300 mt-0.5">{log.bot_instance_name || log.bot_instance_id || "System Core"}</p>
              </div>
            </div>
          )}

          {/* Message */}
          <div>
            <span className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Formatted Message Payload
            </span>
            <div className="bg-[#0B0F17] p-3 rounded-xl border border-[#1E293B] text-slate-200 break-all leading-relaxed">
              {isString ? sanitizeLogString(log) : sanitizeLogString(log.message)}
            </div>
          </div>

          {/* Metadata JSON */}
          <div>
            <span className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
              <Code className="h-3 w-3 text-cyan-400" /> Full Structured JSON Payload
            </span>
            <pre className="bg-[#0B0F17] p-3 rounded-xl border border-[#1E293B] text-cyan-300 text-[11px] overflow-x-auto leading-relaxed scrollbar-thin">
              {JSON.stringify(rawData, null, 2)}
            </pre>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-[#1E293B] flex items-center justify-between text-[10px] text-slate-500 font-sans">
          <span>Protected Sandbox Log Record</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
