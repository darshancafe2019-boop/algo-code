"use client";

import React from "react";
import { AlertItem } from "@/types/alerts";
import { AlertCard } from "./AlertCard";
import { ShieldCheck, Inbox } from "lucide-react";

interface AlertsFeedProps {
  alerts: AlertItem[];
  onDismiss: (id: number) => void;
  dismissingId: number | null;
  isFiltered: boolean;
}

export function AlertsFeed({ alerts, onDismiss, dismissingId, isFiltered }: AlertsFeedProps) {
  if (alerts.length === 0) {
    if (isFiltered) {
      return (
        <div className="p-12 text-center bg-[#121824]/60 border border-[#1E293B] rounded-2xl flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center mb-3">
            <Inbox className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-1">
            No Matching Alerts
          </h3>
          <p className="text-xs text-slate-400 max-w-sm">
            No active alerts matched your search query or severity filters.
          </p>
        </div>
      );
    }

    return (
      <div className="p-12 text-center bg-[#121824]/60 border border-[#1E293B] rounded-2xl flex flex-col items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center mb-3">
          <ShieldCheck className="w-6 h-6 text-emerald-400" />
        </div>
        <h3 className="text-sm font-semibold text-emerald-300 uppercase tracking-wider mb-1">
          No Active Alerts
        </h3>
        <p className="text-xs text-slate-400 max-w-sm">
          System monitoring is clear. All trading engines, watchdog processes, and safety checks are operating nominally.
        </p>
      </div>
    );
  }

  return (
    <div id="alerts-feed-container" className="space-y-2.5">
      {alerts.map((alert) => (
        <AlertCard
          key={`${alert.id}-${alert.timestamp}-${alert.level}`}
          alert={alert}
          onDismiss={onDismiss}
          isDismissing={dismissingId === alert.id}
        />
      ))}
    </div>
  );
}
