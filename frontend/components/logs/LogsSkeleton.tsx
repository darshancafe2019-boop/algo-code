"use client";

import React from "react";

export function LogsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Top Banner Skeleton */}
      <div className="h-24 bg-[#121824] border border-[#1E293B] rounded-2xl p-5 flex flex-col justify-between">
        <div className="h-6 w-1/3 bg-slate-800 rounded"></div>
        <div className="h-4 w-2/3 bg-slate-800/60 rounded"></div>
      </div>

      {/* Toolbar Skeleton */}
      <div className="h-14 bg-[#121824] border border-[#1E293B] rounded-2xl p-3 flex items-center justify-between gap-4">
        <div className="h-8 w-1/4 bg-slate-800 rounded-xl"></div>
        <div className="h-8 w-1/3 bg-slate-800 rounded-xl"></div>
        <div className="h-8 w-1/4 bg-slate-800 rounded-xl"></div>
      </div>

      {/* Log Rows Skeleton */}
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-4 space-y-3">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="h-10 bg-[#0B0F17] rounded-xl border border-slate-850 p-2.5 flex items-center justify-between gap-4">
            <div className="h-4 w-24 bg-slate-800 rounded"></div>
            <div className="h-4 w-16 bg-slate-800 rounded"></div>
            <div className="h-4 flex-1 bg-slate-800/60 rounded"></div>
          </div>
        ))}
      </div>
    </div>
  );
}
