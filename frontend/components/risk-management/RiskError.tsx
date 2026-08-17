"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface RiskErrorProps {
  message?: string;
  onRetry?: () => void;
}

export function RiskError({ message = "Failed to load risk management data from backend.", onRetry }: RiskErrorProps) {
  return (
    <div className="bg-[#1A121A] border border-red-900/40 rounded-2xl p-8 text-center space-y-4 my-4">
      <div className="h-12 w-12 rounded-full bg-red-950/80 border border-red-800 flex items-center justify-center mx-auto text-red-400">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div>
        <h3 className="text-base font-bold text-white tracking-wide">Risk Management Subsystem Error</h3>
        <p className="text-xs text-red-300/80 max-w-md mx-auto mt-1 font-mono">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-900/30 hover:bg-red-900/50 border border-red-700/50 text-red-200 text-xs font-semibold transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry Connection
        </button>
      )}
    </div>
  );
}
