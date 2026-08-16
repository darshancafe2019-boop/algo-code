"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  page: number;
  totalPages: number;
  totalCount: number;
  perPage: number;
  onPageChange: (p: number) => void;
}

export function TradePagination({
  page,
  totalPages,
  totalCount,
  perPage,
  onPageChange,
}: Props) {
  const start = totalCount === 0 ? 0 : (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, totalCount);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[#1E293B] text-xs font-mono text-slate-400">
      <div>
        Showing <strong className="text-white">{start}</strong> to <strong className="text-white">{end}</strong> of{" "}
        <strong className="text-white">{totalCount}</strong> trades
      </div>

      <div className="flex items-center gap-2">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-700 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none text-white transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Previous</span>
        </button>

        <span className="px-3 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-800 text-slate-300">
          Page <strong className="text-cyan-400">{page}</strong> of <strong className="text-white">{totalPages}</strong>
        </span>

        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-700 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none text-white transition-colors"
        >
          <span>Next</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
