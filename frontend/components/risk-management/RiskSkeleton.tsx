"use client";

import React from "react";

export function RiskSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Top Header Skeleton */}
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-slate-800/60 rounded"></div>
          <div className="h-3.5 w-72 bg-slate-800/40 rounded"></div>
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-slate-800/60 rounded-xl"></div>
          <div className="h-9 w-32 bg-slate-800/60 rounded-xl"></div>
        </div>
      </div>

      {/* KPI Cards Grid Skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-[#121824] border border-[#1E293B] rounded-xl p-4 space-y-2">
            <div className="h-3 w-20 bg-slate-800/50 rounded"></div>
            <div className="h-6 w-24 bg-slate-800/80 rounded"></div>
            <div className="h-2.5 w-16 bg-slate-800/30 rounded"></div>
          </div>
        ))}
      </div>

      {/* Main Content Panels Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-4">
          <div className="h-5 w-40 bg-slate-800/60 rounded"></div>
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 w-full bg-slate-800/30 rounded-lg"></div>
            ))}
          </div>
        </div>
        <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-4">
          <div className="h-5 w-32 bg-slate-800/60 rounded"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 w-full bg-slate-800/30 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
