"use client";

import React, { useState } from "react";
import { Shield, RefreshCw, Layers, Sliders, Calculator, Bell, Database } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RiskOverviewResponse, ActiveRiskLimits, RiskProfile, RiskRule } from "@/types/risk";
import { RiskOverview } from "./RiskOverview";
import { RiskMetrics } from "./RiskMetrics";
import { ExposurePanel } from "./ExposurePanel";
import { PositionRiskTable } from "./PositionRiskTable";
import { RiskLimits } from "./RiskLimits";
import { RiskRulesPanel } from "./RiskRulesPanel";
import { PositionSizeCalculator } from "./PositionSizeCalculator";
import { RiskAlerts } from "./RiskAlerts";
import { RiskSkeleton } from "./RiskSkeleton";
import { RiskError } from "./RiskError";

export function RiskManagement() {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<"overview" | "limits" | "rules" | "calculator" | "audit">("overview");

  // Query 1: Risk Overview & Portfolio Metrics
  const {
    data: overviewData,
    isLoading: isOverviewLoading,
    isError: isOverviewError,
    error: overviewError,
    refetch: refetchOverview,
    isFetching: isOverviewFetching,
  } = useQuery<RiskOverviewResponse>({
    queryKey: ["riskOverview"],
    queryFn: async () => {
      const res = await fetch("/api/risk/overview");
      if (!res.ok) throw new Error("Failed to fetch risk overview from server.");
      return res.json();
    },
    refetchInterval: 4000,
  });

  // Query 2: Risk Limits & Config
  const { data: limitsData } = useQuery<ActiveRiskLimits>({
    queryKey: ["riskLimits"],
    queryFn: async () => {
      const res = await fetch("/api/risk-limits");
      if (!res.ok) throw new Error("Failed to fetch risk limits.");
      return res.json();
    },
    refetchInterval: 10000,
  });

  // Query 3: Risk Profiles
  const { data: profilesData } = useQuery<{ status: string; profiles: RiskProfile[] }>({
    queryKey: ["riskProfiles"],
    queryFn: async () => {
      const res = await fetch("/api/risk/profiles");
      if (!res.ok) throw new Error("Failed to fetch risk profiles.");
      return res.json();
    },
    refetchInterval: 10000,
  });

  // Query 4: Risk Rules
  const { data: rulesData } = useQuery<{ status: string; rules: RiskRule[] }>({
    queryKey: ["riskRules"],
    queryFn: async () => {
      const res = await fetch("/api/risk/rules");
      if (!res.ok) throw new Error("Failed to fetch risk rules.");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const handleRefreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["riskOverview"] });
    queryClient.invalidateQueries({ queryKey: ["riskLimits"] });
    queryClient.invalidateQueries({ queryKey: ["riskProfiles"] });
    queryClient.invalidateQueries({ queryKey: ["riskRules"] });
  };

  if (isOverviewLoading) {
    return <RiskSkeleton />;
  }

  if (isOverviewError || !overviewData?.overview) {
    return (
      <RiskError
        message={overviewError instanceof Error ? overviewError.message : "Unable to reach risk subsystem API."}
        onRetry={refetchOverview}
      />
    );
  }

  const { overview, positions, symbol_exposure, asset_class_exposure, heatmap } = overviewData;
  const mergedLimits = { ...limitsData, ...overview.active_limits };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-emerald-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
              QUANTITATIVE RISK MANAGEMENT
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono">
                ENGINE V2
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Authoritative server-side risk gates, multi-asset margin ledger, and position limits.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
          <span className="text-xs font-mono px-3 py-1.5 rounded-xl bg-[#0E1524] border border-[#1E293B] text-slate-300">
            Status: <b className="text-emerald-400">{overview.risk_status}</b>
          </span>
          <button
            onClick={handleRefreshAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1A2333] hover:bg-[#2A374A] border border-[#2A374A] text-slate-200 text-xs font-semibold transition-all"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isOverviewFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[#1E293B] pb-2">
        <button
          onClick={() => setSubTab("overview")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            subTab === "overview"
              ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/20"
              : "bg-[#121824] text-slate-400 hover:text-white border border-[#1E293B]"
          }`}
        >
          <Database className="h-3.5 w-3.5" />
          Overview & Positions
        </button>

        <button
          onClick={() => setSubTab("limits")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            subTab === "limits"
              ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/20"
              : "bg-[#121824] text-slate-400 hover:text-white border border-[#1E293B]"
          }`}
        >
          <Shield className="h-3.5 w-3.5" />
          Profiles & Limits
        </button>

        <button
          onClick={() => setSubTab("rules")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            subTab === "rules"
              ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/20"
              : "bg-[#121824] text-slate-400 hover:text-white border border-[#1E293B]"
          }`}
        >
          <Sliders className="h-3.5 w-3.5" />
          Rules & Safety Gates
        </button>

        <button
          onClick={() => setSubTab("calculator")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            subTab === "calculator"
              ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/20"
              : "bg-[#121824] text-slate-400 hover:text-white border border-[#1E293B]"
          }`}
        >
          <Calculator className="h-3.5 w-3.5" />
          Quant Sizing & What-If
        </button>

        <button
          onClick={() => setSubTab("audit")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            subTab === "audit"
              ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/20"
              : "bg-[#121824] text-slate-400 hover:text-white border border-[#1E293B]"
          }`}
        >
          <Bell className="h-3.5 w-3.5" />
          Risk Event Audit
        </button>
      </div>

      {/* Sub-Tab Content Views */}
      {subTab === "overview" && (
        <div className="space-y-6">
          <RiskOverview data={{ ...overview, active_limits: mergedLimits }} />
          <RiskMetrics overview={overview} />
          <ExposurePanel
            symbolExposure={symbol_exposure || {}}
            assetClassExposure={asset_class_exposure || {}}
            heatmap={heatmap || []}
            totalEquity={overview.account_balance || 10000}
          />
          <PositionRiskTable positions={positions || []} />
        </div>
      )}

      {subTab === "limits" && (
        <RiskLimits
          profiles={profilesData?.profiles || []}
          activeLimits={mergedLimits}
        />
      )}

      {subTab === "rules" && (
        <RiskRulesPanel rules={rulesData?.rules || []} />
      )}

      {subTab === "calculator" && (
        <PositionSizeCalculator accountBalance={overview.account_balance || 10000} />
      )}

      {subTab === "audit" && (
        <RiskAlerts />
      )}
    </div>
  );
}
