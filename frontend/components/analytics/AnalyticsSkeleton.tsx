"use client";

import React from "react";

export function MetricSkeleton() {
  return (
    <div className="p-4 rounded-xl bg-[#121824] border border-[#1E293B] animate-pulse">
      <div className="h-3 w-24 bg-slate-800 rounded mb-2" />
      <div className="h-6 w-32 bg-slate-700 rounded mb-1" />
      <div className="h-2.5 w-16 bg-slate-800 rounded" />
    </div>
  );
}

export function ChartSkeleton({ title }: { title?: string }) {
  return (
    <div className="p-5 rounded-xl bg-[#121824] border border-[#1E293B] animate-pulse flex flex-col justify-between min-h-[300px]">
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-36 bg-slate-800 rounded" />
        <div className="h-3 w-16 bg-slate-800 rounded" />
      </div>
      <div className="flex-1 flex items-end gap-2 px-4 py-2">
        <div className="h-3/4 flex-1 bg-slate-800/60 rounded-t" />
        <div className="h-1/2 flex-1 bg-slate-800/40 rounded-t" />
        <div className="h-5/6 flex-1 bg-slate-800/70 rounded-t" />
        <div className="h-2/3 flex-1 bg-slate-800/50 rounded-t" />
        <div className="h-full flex-1 bg-slate-800/80 rounded-t" />
      </div>
    </div>
  );
}

export function LeaderboardSkeleton() {
  return (
    <div className="p-5 rounded-xl bg-[#121824] border border-[#1E293B] animate-pulse space-y-3">
      <div className="h-5 w-48 bg-slate-800 rounded mb-4" />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-12 w-full bg-slate-800/50 rounded-lg" />
      ))}
    </div>
  );
}
