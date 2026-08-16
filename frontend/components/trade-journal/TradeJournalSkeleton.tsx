"use client";

import React from "react";

export function TradeJournalSkeleton() {
  return (
    <div className="p-5 rounded-xl bg-[#121824] border border-[#1E293B] animate-pulse space-y-4">
      <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
        <div className="h-5 w-48 bg-slate-800 rounded" />
        <div className="h-8 w-32 bg-slate-800 rounded" />
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-12 w-full bg-slate-800/50 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
