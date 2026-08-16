"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TradeListResponse } from "@/types/trade-journal";
import { TradeJournalTable } from "./TradeJournalTable";
import { TradeFilters } from "./TradeFilters";
import { TradePagination } from "./TradePagination";
import { CsvExportButton } from "./CsvExportButton";
import { TradeJournalSkeleton } from "./TradeJournalSkeleton";
import { ErrorBoundary } from "../ErrorBoundary";
import { BookOpen, RefreshCw, AlertCircle } from "lucide-react";

export function TradeJournal() {
  const [searchQuery, setSearchQuery] = useState("");

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [directionFilter, setDirectionFilter] = useState("ALL");
  const [strategyFilter, setStrategyFilter] = useState("ALL");
  const [showTestTrades, setShowTestTrades] = useState(false); // Default MUST be OFF (false)
  const [page, setPage] = useState(1);
  const perPage = 15;

  const { data, isLoading, error, refetch, isFetching } = useQuery<TradeListResponse>({
    queryKey: [
      "tradeJournal",
      page,
      perPage,
      statusFilter,
      directionFilter,
      strategyFilter,
      searchQuery,
      showTestTrades,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
        status: statusFilter,
        direction: directionFilter,
        strategy: strategyFilter,
        query: searchQuery,
        show_test_trades: String(showTestTrades),
      });

      const res = await fetch(`/api/trades?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load trade journal (Status ${res.status})`);
      }
      const json = await res.json();
      if (json.status === "error") {
        throw new Error(json.message || "Failed to load trades");
      }
      return json;
    },
    refetchInterval: 5000,
  });

  const trades = data?.trades || [];
  const totalCount = data?.total_count || 0;
  const totalPages = data?.total_pages || 1;

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-cyan-400" />
            Trade Journal & Audit Ledger
          </h2>
          <p className="text-xs text-slate-400">
            Institutional grouped order ledger with entry, safety, exit, balance, and emotion confluences.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <CsvExportButton
            statusFilter={statusFilter}
            directionFilter={directionFilter}
            strategyFilter={strategyFilter}
            searchQuery={searchQuery}
            showTestTrades={showTestTrades}
            trades={trades}
          />

          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl bg-[#121824] hover:bg-slate-800 border border-[#1E293B] text-slate-300 hover:text-white transition-colors"
            title="Refresh Journal"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin text-cyan-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <ErrorBoundary title="Trade Journal Filters Failed">
        <TradeFilters
          searchQuery={searchQuery}
          setSearchQuery={(q) => {
            setSearchQuery(q);
            setPage(1);
          }}
          statusFilter={statusFilter}
          setStatusFilter={(s) => {
            setStatusFilter(s);
            setPage(1);
          }}
          directionFilter={directionFilter}
          setDirectionFilter={(d) => {
            setDirectionFilter(d);
            setPage(1);
          }}
          strategyFilter={strategyFilter}
          setStrategyFilter={(st) => {
            setStrategyFilter(st);
            setPage(1);
          }}
          showTestTrades={showTestTrades}
          setShowTestTrades={(st) => {
            setShowTestTrades(st);
            setPage(1);
          }}
        />
      </ErrorBoundary>

      {/* Table Body & Pagination */}
      <ErrorBoundary title="Trade Journal Table Failed">
        {isLoading ? (
          <TradeJournalSkeleton />
        ) : error ? (
          <div className="p-6 rounded-xl bg-red-950/20 border border-red-500/30 text-red-200 text-center">
            <AlertCircle className="h-6 w-6 text-red-400 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-white mb-1">Failed to Load Trade Journal</h4>
            <p className="text-xs text-red-300/80 mb-3">{error instanceof Error ? error.message : "Error"}</p>
            <button
              onClick={() => refetch()}
              className="px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-800/60 text-red-200 text-xs font-semibold"
            >
              Retry Load
            </button>
          </div>
        ) : (
          <>
            <TradeJournalTable trades={trades} />
            <TradePagination
              page={page}
              totalPages={totalPages}
              totalCount={totalCount}
              perPage={perPage}
              onPageChange={(p) => setPage(p)}
            />
          </>
        )}
      </ErrorBoundary>
    </div>
  );
}
