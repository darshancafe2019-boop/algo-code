"use client";

import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface AccountSecurityErrorProps {
  message?: string;
  onRetry: () => void;
}

export function AccountSecurityError({
  message = "Failed to load account & security data from backend.",
  onRetry,
}: AccountSecurityErrorProps) {
  return (
    <div className="p-8 rounded-2xl border border-red-500/30 bg-red-950/20 backdrop-blur-md text-center flex flex-col items-center justify-center my-6">
      <div className="w-12 h-12 rounded-full bg-red-900/40 border border-red-500/40 flex items-center justify-center mb-3">
        <AlertCircle className="w-6 h-6 text-red-400" />
      </div>
      <h3 className="text-sm font-semibold text-red-300 uppercase tracking-wider mb-1">
        Account & Security Service Offline
      </h3>
      <p className="text-xs text-red-200/80 max-w-md mb-4 font-mono">
        {message}
      </p>
      <button
        id="btn-retry-account-security"
        onClick={onRetry}
        className="px-4 py-2 bg-red-600/30 hover:bg-red-600/40 border border-red-500/50 rounded-lg text-xs font-semibold text-white flex items-center gap-2 transition-all cursor-pointer"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Retry Load
      </button>
    </div>
  );
}
