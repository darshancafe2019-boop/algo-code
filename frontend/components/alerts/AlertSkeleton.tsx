"use client";

import React from "react";

export function AlertSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="p-4 rounded-xl bg-[#121824]/60 border border-[#1E293B]/80 flex items-start justify-between gap-4"
        >
          <div className="flex items-start gap-3.5 flex-1">
            <div className="w-9 h-9 rounded-lg bg-slate-800/70 shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                <div className="h-4 w-20 bg-slate-800 rounded" />
                <div className="h-4 w-24 bg-slate-800/60 rounded" />
                <div className="h-3 w-32 bg-slate-800/40 rounded ml-auto" />
              </div>
              <div className="h-3.5 w-3/4 bg-slate-800/80 rounded" />
            </div>
          </div>
          <div className="h-7 w-16 bg-slate-800/50 rounded-lg shrink-0" />
        </div>
      ))}
    </div>
  );
}
