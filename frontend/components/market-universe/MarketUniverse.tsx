"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MarketUniverseResponse, MarketInstrument } from "@/types/market-universe";
import { MarketTable } from "./MarketTable";
import { MarketSearch } from "./MarketSearch";
import { MarketSkeleton } from "./MarketSkeleton";
import { ErrorBoundary } from "../ErrorBoundary";
import { Globe, RefreshCw, AlertCircle } from "lucide-react";

export function MarketUniverse() {
  const [searchQuery, setSearchQuery] = useState("");

  const [assetClass, setAssetClass] = useState("ALL");
  const [lastUpdatedTime, setLastUpdatedTime] = useState("");

  const { data, isLoading, error, refetch, isFetching } = useQuery<MarketUniverseResponse>({
    queryKey: ["marketUniverse", assetClass, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        asset_class: assetClass,
        search: searchQuery,
        limit: "100",
      });

      const res = await fetch(`/api/universe/instruments?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch market universe (Status ${res.status})`);
      }
      const json = await res.json();
      setLastUpdatedTime(new Date().toLocaleTimeString());
      return json;
    },
    refetchInterval: 5000,
  });

  const instruments: MarketInstrument[] = data?.instruments || data?.data || [];

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Globe className="h-5 w-5 text-cyan-400" />
            Market Universe & Instrument Scanner
          </h2>
          <p className="text-xs text-slate-400">
            Real-time multi-asset market coverage across Crypto, Indian Equities, Global Stocks, Forex, and Indices.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl bg-[#121824] hover:bg-slate-800 border border-[#1E293B] text-slate-300 hover:text-white transition-colors"
            title="Refresh Market Universe"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin text-cyan-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Market Search & Asset Class Filters */}
      <ErrorBoundary title="Market Search & Filters Failed">
        <MarketSearch
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          assetClass={assetClass}
          setAssetClass={setAssetClass}
        />
      </ErrorBoundary>

      {/* Market Table */}
      <ErrorBoundary title="Market Universe Table Failed">
        {isLoading ? (
          <MarketSkeleton />
        ) : error ? (
          <div className="p-6 rounded-xl bg-red-950/20 border border-red-500/30 text-red-200 text-center">
            <AlertCircle className="h-6 w-6 text-red-400 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-white mb-1">Market Universe Unavailable</h4>
            <p className="text-xs text-red-300/80 mb-3">{error instanceof Error ? error.message : "Error"}</p>
            <button
              onClick={() => refetch()}
              className="px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-800/60 text-red-200 text-xs font-semibold"
            >
              Retry Market Fetch
            </button>
          </div>
        ) : (
          <MarketTable instruments={instruments} lastUpdatedTimestamp={lastUpdatedTime} />
        )}
      </ErrorBoundary>
    </div>
  );
}
