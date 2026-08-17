"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MarketUniverseResponse,
  MarketInstrument,
  UniverseSummaryStats,
  MarketIntelligenceResponse
} from "@/types/market-universe";
import { MarketTable } from "./MarketTable";
import { MarketSearch } from "./MarketSearch";
import { MarketSkeleton } from "./MarketSkeleton";
import { ProviderHealthDashboard } from "./ProviderHealthDashboard";
import { StrategyPermissionsModal } from "./StrategyPermissionsModal";
import { OptionChainModal } from "./OptionChainModal";
import { FuturesChainModal } from "./FuturesChainModal";
import { ErrorBoundary } from "../ErrorBoundary";
import {
  Globe,
  RefreshCw,
  AlertCircle,
  Radio,
  ShieldCheck,
  Zap,
  TrendingUp,
  Layers,
  Star,
  BarChart2,
  DollarSign,
  Activity,
  Flame,
  CheckCircle2
} from "lucide-react";

export function MarketUniverse() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"catalog" | "intelligence" | "providers" | "watchlists">("catalog");
  const [searchQuery, setSearchQuery] = useState("");
  const [assetClass, setAssetClass] = useState("ALL");
  const [volatilityFilter, setVolatilityFilter] = useState("ALL");
  const [exchangeFilter, setExchangeFilter] = useState("ALL");

  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [optionChainUnderlying, setOptionChainUnderlying] = useState<string | null>(null);
  const [futuresChainUnderlying, setFuturesChainUnderlying] = useState<string | null>(null);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  // 1. Fetch Instruments Master
  const { data, isLoading, error, refetch, isFetching } = useQuery<MarketUniverseResponse>({
    queryKey: ["marketUniverse", assetClass, searchQuery, volatilityFilter, exchangeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        asset_class: assetClass,
        search: searchQuery,
        volatility: volatilityFilter,
        exchange: exchangeFilter,
        limit: "150",
      });

      const res = await fetch(`/api/universe/instruments?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch market universe (Status ${res.status})`);
      }
      return res.json();
    },
    refetchInterval: 5000,
  });

  // 2. Fetch Universe Summary Stats
  const { data: summaryData } = useQuery<{ status: string; summary: UniverseSummaryStats }>({
    queryKey: ["universeSummary"],
    queryFn: async () => {
      const res = await fetch("/api/universe/summary");
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
    refetchInterval: 8000,
  });

  // 3. Fetch Market Intelligence
  const { data: intelData, isLoading: isIntelLoading } = useQuery<{ status: string; intelligence: MarketIntelligenceResponse }>({
    queryKey: ["marketIntelligence"],
    queryFn: async () => {
      const res = await fetch("/api/universe/intelligence");
      if (!res.ok) throw new Error("Failed to fetch intelligence");
      return res.json();
    },
    enabled: activeTab === "intelligence",
    refetchInterval: 10000,
  });

  // 4. Sync All Markets Mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/universe/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: "ALL" }),
      });
      if (!res.ok) throw new Error("Sync failed");
      return res.json();
    },
    onSuccess: (resData) => {
      queryClient.invalidateQueries({ queryKey: ["marketUniverse"] });
      queryClient.invalidateQueries({ queryKey: ["universeSummary"] });
      queryClient.invalidateQueries({ queryKey: ["providerHealth"] });
      queryClient.invalidateQueries({ queryKey: ["marketIntelligence"] });
      setSyncToast(`Sync Completed: ${resData.discovered || 0} instruments discovered across all exchanges.`);
      setTimeout(() => setSyncToast(null), 4000);
    },
    onError: (err) => {
      setSyncToast(`Sync Warning: ${err instanceof Error ? err.message : "Sync failed"}`);
      setTimeout(() => setSyncToast(null), 4000);
    }
  });

  const instruments: MarketInstrument[] = data?.instruments || data?.data || [];
  const stats = summaryData?.summary || data?.stats;

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {syncToast && (
        <div className="p-3 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-xs font-semibold flex items-center justify-between shadow-2xl animate-fadeIn">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-cyan-400" />
            {syncToast}
          </span>
          <button onClick={() => setSyncToast(null)} className="text-cyan-400 font-bold ml-2">✕</button>
        </div>
      )}

      {/* Top Header & Global Actions */}
      <div className="p-4 rounded-2xl bg-[#121824] border border-[#1E293B] flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Globe className="h-5 w-5 text-cyan-400" />
              Market Universe 2.0 & Asset Master
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-bold border border-cyan-500/30">
              Authoritative Instrument Master
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            NSE & BSE Equities, Global Stocks, Crypto, Forex, MCX Commodities, Monthly Futures, and Real-Time Option Chains.
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* SYNC ALL MARKETS Button */}
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
            title="Execute Full Multi-Exchange Market Discovery"
          >
            <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "Syncing Universe..." : "🔄 SYNC ALL MARKETS"}
          </button>

          {/* Strategy Permissions Matrix */}
          <button
            onClick={() => setPermissionsModalOpen(true)}
            className="px-3 py-2 rounded-xl bg-[#0F141F] hover:bg-slate-800 border border-[#1E293B] text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <ShieldCheck className="h-4 w-4 text-purple-400" />
            Strategy Governance
          </button>

          {/* Quick Option Chain Shortcut */}
          <button
            onClick={() => setOptionChainUnderlying("NIFTY50")}
            className="px-3 py-2 rounded-xl bg-[#0F141F] hover:bg-slate-800 border border-[#1E293B] text-emerald-400 hover:text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Layers className="h-4 w-4" />
            Option Chain
          </button>

          {/* Refresh Current View */}
          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl bg-[#0F141F] hover:bg-slate-800 border border-[#1E293B] text-slate-300 hover:text-white transition-colors"
            title="Refresh Instrument Master"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin text-cyan-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Multi-Asset Universe Metric Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          <div className="p-3 rounded-xl bg-[#121824] border border-[#1E293B]">
            <span className="text-[10px] text-slate-500 font-bold uppercase block">Total Universe</span>
            <span className="text-base font-black text-white font-mono mt-0.5 block">
              {stats.total_instruments?.toLocaleString()}
            </span>
            <span className="text-[10px] text-cyan-400 font-semibold">{stats.tradable || stats.total_instruments} Tradable</span>
          </div>

          <div className="p-3 rounded-xl bg-[#121824] border border-[#1E293B]">
            <span className="text-[10px] text-slate-500 font-bold uppercase block">Indian Equities</span>
            <span className="text-base font-black text-white font-mono mt-0.5 block">
              {stats.indian_stocks || 50}
            </span>
            <span className="text-[10px] text-emerald-400 font-semibold">NSE & BSE</span>
          </div>

          <div className="p-3 rounded-xl bg-[#121824] border border-[#1E293B]">
            <span className="text-[10px] text-slate-500 font-bold uppercase block">Global Stocks</span>
            <span className="text-base font-black text-white font-mono mt-0.5 block">
              {stats.global_stocks || 25}
            </span>
            <span className="text-[10px] text-blue-400 font-semibold">NASDAQ / NYSE</span>
          </div>

          <div className="p-3 rounded-xl bg-[#121824] border border-[#1E293B]">
            <span className="text-[10px] text-slate-500 font-bold uppercase block">Crypto Pairs</span>
            <span className="text-base font-black text-white font-mono mt-0.5 block">
              {stats.crypto || 17}
            </span>
            <span className="text-[10px] text-amber-400 font-semibold">Spot & Perp</span>
          </div>

          <div className="p-3 rounded-xl bg-[#121824] border border-[#1E293B]">
            <span className="text-[10px] text-slate-500 font-bold uppercase block">Forex Pairs</span>
            <span className="text-base font-black text-white font-mono mt-0.5 block">
              {stats.forex || 12}
            </span>
            <span className="text-[10px] text-indigo-400 font-semibold">Majors & Crosses</span>
          </div>

          <div className="p-3 rounded-xl bg-[#121824] border border-[#1E293B]">
            <span className="text-[10px] text-slate-500 font-bold uppercase block">Commodities</span>
            <span className="text-base font-black text-white font-mono mt-0.5 block">
              {stats.commodities || 6}
            </span>
            <span className="text-[10px] text-yellow-400 font-semibold">Gold/Silver/Crude</span>
          </div>

          <div className="p-3 rounded-xl bg-[#121824] border border-[#1E293B]">
            <span className="text-[10px] text-slate-500 font-bold uppercase block">Derivatives (F&O)</span>
            <span className="text-base font-black text-white font-mono mt-0.5 block">
              {(stats.futures || 27) + (stats.options || 70)}
            </span>
            <span className="text-[10px] text-purple-400 font-semibold">Futures & Strikes</span>
          </div>

          <div className="p-3 rounded-xl bg-[#121824] border border-[#1E293B]">
            <span className="text-[10px] text-slate-500 font-bold uppercase block flex items-center gap-1">
              <Flame className="h-3 w-3 text-rose-400" />
              High Volatility
            </span>
            <span className="text-base font-black text-rose-400 font-mono mt-0.5 block">
              {stats.high_volatility || 98}
            </span>
            <span className="text-[10px] text-rose-300 font-semibold">Score &gt; 55</span>
          </div>
        </div>
      )}

      {/* Main Tab Navigation */}
      <div className="flex border-b border-[#1E293B] gap-4 text-xs font-bold">
        <button
          onClick={() => setActiveTab("catalog")}
          className={`py-2.5 flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "catalog"
              ? "border-cyan-400 text-cyan-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <Globe className="h-4 w-4" />
          Master Instrument Catalog
        </button>

        <button
          onClick={() => setActiveTab("intelligence")}
          className={`py-2.5 flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "intelligence"
              ? "border-amber-400 text-amber-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <Zap className="h-4 w-4 text-amber-400" />
          Explainable Market Intelligence & Opportunities
        </button>

        <button
          onClick={() => setActiveTab("providers")}
          className={`py-2.5 flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "providers"
              ? "border-emerald-400 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <Radio className="h-4 w-4 text-emerald-400" />
          Provider Health & Feeds
        </button>
      </div>

      {/* Tab 1: Catalog */}
      {activeTab === "catalog" && (
        <div className="space-y-4">
          <ErrorBoundary title="Market Search & Filters Failed">
            <MarketSearch
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              assetClass={assetClass}
              setAssetClass={setAssetClass}
              volatilityFilter={volatilityFilter}
              setVolatilityFilter={setVolatilityFilter}
              exchangeFilter={exchangeFilter}
              setExchangeFilter={setExchangeFilter}
            />
          </ErrorBoundary>

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
              <MarketTable
                instruments={instruments}
                onRefreshRequested={() => refetch()}
              />
            )}
          </ErrorBoundary>
        </div>
      )}

      {/* Tab 2: Intelligence */}
      {activeTab === "intelligence" && (
        <div className="space-y-4">
          {isIntelLoading ? (
            <div className="p-12 text-center text-slate-400">
              <RefreshCw className="h-7 w-7 animate-spin mx-auto mb-2 text-amber-400" />
              <p className="text-xs">Computing real-time volatility, momentum, and candidate rankings...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Top Volatility */}
              <div className="p-4 rounded-xl bg-[#121824] border border-[#1E293B] space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-rose-400">
                    <Flame className="h-4 w-4" /> Top High Volatility Instruments
                  </span>
                  <span className="text-[10px] text-slate-500">ATR & Range Scored</span>
                </h4>
                <div className="space-y-2">
                  {intelData?.intelligence?.top_volatility?.slice(0, 6).map((inst) => (
                    <div
                      key={inst.instrument_id}
                      className="p-2.5 rounded-lg bg-[#0F141F] border border-[#1E293B] flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-white">{inst.canonical_symbol}</span>
                        <span className="text-[10px] text-slate-400 block">{inst.company_name}</span>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 font-bold font-mono">
                          Vol: {inst.volatility_score}/100
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {inst.change_24h >= 0 ? "+" : ""}{inst.change_24h}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Momentum */}
              <div className="p-4 rounded-xl bg-[#121824] border border-[#1E293B] space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-cyan-400">
                    <Zap className="h-4 w-4" /> Top Momentum Leaders
                  </span>
                  <span className="text-[10px] text-slate-500">ROC & RSI Velocity</span>
                </h4>
                <div className="space-y-2">
                  {intelData?.intelligence?.top_momentum?.slice(0, 6).map((inst) => (
                    <div
                      key={inst.instrument_id}
                      className="p-2.5 rounded-lg bg-[#0F141F] border border-[#1E293B] flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-white">{inst.canonical_symbol}</span>
                        <span className="text-[10px] text-slate-400 block">{inst.company_name}</span>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-bold font-mono">
                          Mom: {inst.momentum_score}/100
                        </span>
                        <span className="text-[10px] text-emerald-400 block mt-0.5">
                          {inst.directional_bias}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Providers */}
      {activeTab === "providers" && (
        <ProviderHealthDashboard onSyncCompleted={() => refetch()} />
      )}

      {/* Governance & Derivative Modals */}
      {permissionsModalOpen && (
        <StrategyPermissionsModal
          isOpen={permissionsModalOpen}
          onClose={() => setPermissionsModalOpen(false)}
        />
      )}

      {optionChainUnderlying && (
        <OptionChainModal
          underlying={optionChainUnderlying}
          isOpen={Boolean(optionChainUnderlying)}
          onClose={() => setOptionChainUnderlying(null)}
        />
      )}

      {futuresChainUnderlying && (
        <FuturesChainModal
          underlying={futuresChainUnderlying}
          isOpen={Boolean(futuresChainUnderlying)}
          onClose={() => setFuturesChainUnderlying(null)}
        />
      )}
    </div>
  );
}
