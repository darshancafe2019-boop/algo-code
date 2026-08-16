"use client";

import React from "react";
import { AlertItem } from "@/types/alerts";
import { 
  AlertOctagon, 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  Trash2,
  Clock,
  Tag
} from "lucide-react";

interface AlertCardProps {
  alert: AlertItem;
  onDismiss: (id: number) => void;
  isDismissing?: boolean;
}

export function AlertCard({ alert, onDismiss, isDismissing = false }: AlertCardProps) {
  const level = (alert.level || "INFO").toUpperCase();

  // Distinct styling & icons based on real severity
  let severityBadge = {
    bg: "bg-cyan-950/60",
    border: "border-cyan-500/40",
    text: "text-cyan-400",
    cardBorder: "border-[#1E293B] hover:border-cyan-500/30",
    cardBg: "bg-[#121824]/80",
    icon: <Info className="w-4 h-4 text-cyan-400 shrink-0" />,
    label: "INFO"
  };

  if (level === "CRITICAL") {
    severityBadge = {
      bg: "bg-rose-950/80",
      border: "border-rose-500/60",
      text: "text-rose-300",
      cardBorder: "border-rose-500/40 hover:border-rose-500/60",
      cardBg: "bg-rose-950/15",
      icon: <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0 animate-pulse" />,
      label: "CRITICAL"
    };
  } else if (level === "ERROR") {
    severityBadge = {
      bg: "bg-red-950/70",
      border: "border-red-500/50",
      text: "text-red-300",
      cardBorder: "border-red-500/30 hover:border-red-500/50",
      cardBg: "bg-red-950/10",
      icon: <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />,
      label: "ERROR"
    };
  } else if (level === "WARNING") {
    severityBadge = {
      bg: "bg-amber-950/70",
      border: "border-amber-500/50",
      text: "text-amber-300",
      cardBorder: "border-amber-500/30 hover:border-amber-500/50",
      cardBg: "bg-amber-950/10",
      icon: <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />,
      label: "WARNING"
    };
  }

  // Format Timestamp
  let formattedTime = alert.timestamp;
  try {
    const d = new Date(alert.timestamp);
    if (!isNaN(d.getTime())) {
      formattedTime = d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
    }
  } catch (e) {}

  return (
    <div
      className={`p-4 rounded-xl border transition-all duration-200 backdrop-blur-sm flex flex-col sm:flex-row items-start justify-between gap-3 ${severityBadge.cardBg} ${severityBadge.cardBorder}`}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {/* Severity Icon Indicator */}
        <div className={`p-2 rounded-lg border shrink-0 mt-0.5 ${severityBadge.bg} ${severityBadge.border}`}>
          {severityBadge.icon}
        </div>

        {/* Content Details */}
        <div className="space-y-1.5 flex-1 min-w-0">
          {/* Header Row: Level + Category + ID + Time */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`px-2 py-0.5 rounded font-mono font-bold border tracking-wider text-[11px] flex items-center gap-1 ${severityBadge.bg} ${severityBadge.border} ${severityBadge.text}`}
            >
              {severityBadge.label}
            </span>

            <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700 text-[11px] font-medium flex items-center gap-1">
              <Tag className="w-2.5 h-2.5 text-slate-400" />
              {alert.category || "General"}
            </span>

            {alert.id ? (
              <span className="text-[10px] font-mono text-slate-500 bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-800">
                #{alert.id}
              </span>
            ) : null}

            <span className="text-[11px] text-slate-400 ml-auto flex items-center gap-1 font-mono">
              <Clock className="w-3 h-3 text-slate-500" />
              {formattedTime}
            </span>
          </div>

          {/* Alert Message */}
          <p className="text-sm text-slate-200 font-sans leading-relaxed break-words">
            {alert.message}
          </p>
        </div>
      </div>

      {/* Dismiss Button */}
      <button
        onClick={() => onDismiss(alert.id)}
        disabled={isDismissing}
        title="Dismiss Alert"
        className="self-end sm:self-start px-2.5 py-1.5 bg-slate-800/60 hover:bg-red-950/40 hover:text-red-300 border border-slate-700/80 hover:border-red-500/40 rounded-lg text-xs font-medium text-slate-400 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span className="text-[11px]">Dismiss</span>
      </button>
    </div>
  );
}
