"use client";

import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  title: string;
  message?: string;
  onRetry?: () => void;
}

export function AnalyticsError({ title, message, onRetry }: Props) {
  return (
    <div className="p-6 rounded-xl bg-red-950/20 border border-red-500/30 text-red-200 flex flex-col items-center justify-center text-center min-h-[260px]">
      <AlertCircle className="h-8 w-8 text-red-400 mb-2" />
      <h4 className="text-sm font-bold text-white mb-1">{title}</h4>
      <p className="text-xs text-red-300/80 mb-4 max-w-xs font-mono">
        {message || "Unable to load chart data from server."}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-800/60 text-red-200 text-xs font-semibold border border-red-700/50 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Retry Chart</span>
        </button>
      )}
    </div>
  );
}
