"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface BacktestErrorProps {
  message?: string;
  onRetry?: () => void;
}

export function BacktestError({ message = "Failed to run backtest simulation", onRetry }: BacktestErrorProps) {
  return (
    <div className="bg-[#181214] border border-red-900/60 rounded-2xl p-6 text-center space-y-4 my-4">
      <div className="inline-flex p-3 rounded-full bg-red-950/80 border border-red-800 text-red-400">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div>
        <h3 className="text-base font-bold text-white uppercase tracking-wider">Backtest Execution Error</h3>
        <p className="text-xs text-red-300/80 max-w-md mx-auto mt-1">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors shadow-lg shadow-red-600/20"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Retry Simulation</span>
        </button>
      )}
    </div>
  );
}
