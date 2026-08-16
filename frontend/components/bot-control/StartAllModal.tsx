"use client";

import React from "react";
import { X, Play, ShieldAlert, CheckCircle, AlertTriangle } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  report: {
    message?: string;
    started_count?: number;
    skipped_count?: number;
    started?: Array<{ bot_id: string; name: string; mode: string; pid?: number }>;
    skipped?: Array<{ bot_id: string; name: string; mode: string; reason: string }>;
  } | null;
}

export function StartAllModal({ isOpen, onClose, report }: Props) {
  if (!isOpen || !report) return null;

  const started = report.started || [];
  const skipped = report.skipped || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-[#121824] border border-[#1E293B] rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1E293B] pb-4 mb-4">
          <div className="flex items-center gap-2 text-cyan-400">
            <Play className="h-5 w-5" />
            <h2 className="text-base font-bold text-white">Start All Bots — Pre-Flight Validation Report</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 p-3 rounded-xl bg-[#0B0F17] border border-cyan-500/20 text-xs text-cyan-300">
          {report.message || "Start All Validation Executed"}
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Started Bots Section */}
          {started.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-emerald-400 mb-2 flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4" />
                <span>Successfully Started ({started.length})</span>
              </h3>
              <div className="space-y-1.5">
                {started.map((b) => (
                  <div
                    key={b.bot_id}
                    className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-semibold text-white">{b.name}</span>
                      <span className="text-[10px] text-slate-400 ml-2 font-mono">({b.bot_id})</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span className="px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-300">
                        PID: {b.pid || "Active"}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400">{b.mode}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skipped Bots Section */}
          {skipped.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-amber-400 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                <span>Retained / Skipped ({skipped.length})</span>
              </h3>
              <div className="space-y-1.5">
                {skipped.map((b) => (
                  <div
                    key={b.bot_id}
                    className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-semibold text-white">{b.name}</span>
                      <span className="text-[10px] text-slate-400 ml-2 font-mono">({b.bot_id})</span>
                    </div>
                    <div className="text-[11px] text-amber-300 font-mono">
                      Reason: <strong className="text-amber-200">{b.reason}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end pt-4 border-t border-[#1E293B] mt-4">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
}
