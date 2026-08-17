"use client";

import React from "react";

export function BacktestSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Top Banner Skeleton */}
      <div className="h-28 bg-[#121824] border border-[#1E293B] rounded-2xl p-6 flex flex-col justify-between">
        <div className="h-6 w-1/3 bg-slate-800 rounded"></div>
        <div className="h-4 w-2/3 bg-slate-800/60 rounded"></div>
      </div>

      {/* Grid: Config & Metrics Skeletons */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="h-96 bg-[#121824] border border-[#1E293B] rounded-2xl p-6 space-y-4">
          <div className="h-6 w-1/2 bg-slate-800 rounded"></div>
          <div className="space-y-3 pt-4">
            <div className="h-10 bg-slate-800/70 rounded-xl"></div>
            <div className="h-10 bg-slate-800/70 rounded-xl"></div>
            <div className="h-10 bg-slate-800/70 rounded-xl"></div>
            <div className="h-10 bg-slate-800/70 rounded-xl"></div>
            <div className="h-12 bg-slate-800 rounded-xl"></div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-28 bg-[#121824] border border-[#1E293B] rounded-2xl p-4 flex flex-col justify-between">
                <div className="h-4 w-1/2 bg-slate-800 rounded"></div>
                <div className="h-7 w-3/4 bg-slate-800 rounded"></div>
              </div>
            ))}
          </div>

          <div className="h-64 bg-[#121824] border border-[#1E293B] rounded-2xl p-6 flex flex-col justify-between">
            <div className="h-6 w-1/3 bg-slate-800 rounded"></div>
            <div className="h-44 bg-slate-800/40 rounded-xl"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
