"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, RefreshCw } from "lucide-react";
import {
  ApiKeysResponse,
  ExecutionGateResponse,
  LiveOverviewResponse,
  ProvidersResponse,
  SecurityAuditResponse,
} from "@/types/account-security";
import { AccountOverview } from "./AccountOverview";
import { ConnectionStatus } from "./ConnectionStatus";
import { CredentialStatus } from "./CredentialStatus";
import { SecurityActions } from "./SecurityActions";
import { SecurityAuditTable } from "./SecurityAuditTable";
import { AccountSecuritySkeleton } from "./AccountSecuritySkeleton";
import { AccountSecurityError } from "./AccountSecurityError";

export function AccountSecurity() {
  const queryClient = useQueryClient();

  // 1. Fetch API Keys
  const {
    data: apiKeysData,
    isLoading: isKeysLoading,
    error: keysError,
    refetch: refetchKeys,
    isFetching: isKeysFetching,
  } = useQuery<ApiKeysResponse>({
    queryKey: ["securityApiKeys"],
    queryFn: async () => {
      const res = await fetch("/api/security/apikeys");
      if (!res.ok) throw new Error(`Failed to load API keys (HTTP ${res.status})`);
      return res.json();
    },
    refetchInterval: 5000,
    retry: false,
  });

  // 2. Fetch Execution Gate Status
  const {
    data: gateData,
    isLoading: isGateLoading,
    error: gateError,
    refetch: refetchGate,
  } = useQuery<ExecutionGateResponse>({
    queryKey: ["executionGateStatus"],
    queryFn: async () => {
      const res = await fetch("/api/execution-gate/status");
      if (!res.ok) throw new Error(`Failed to load execution gate (HTTP ${res.status})`);
      return res.json();
    },
    refetchInterval: 5000,
    retry: false,
  });

  // 3. Fetch Live Safety Overview
  const {
    data: liveData,
    isLoading: isLiveLoading,
    error: liveError,
    refetch: refetchLive,
  } = useQuery<LiveOverviewResponse>({
    queryKey: ["botsLiveOverview"],
    queryFn: async () => {
      const res = await fetch("/api/bots/live/overview");
      if (!res.ok) throw new Error(`Failed to load live overview (HTTP ${res.status})`);
      return res.json();
    },
    refetchInterval: 5000,
    retry: false,
  });

  // 4. Fetch Providers
  const {
    data: providersData,
    isLoading: isProvidersLoading,
    error: providersError,
    refetch: refetchProviders,
  } = useQuery<ProvidersResponse>({
    queryKey: ["universeProviders"],
    queryFn: async () => {
      const res = await fetch("/api/universe/providers");
      if (!res.ok) throw new Error(`Failed to load universe providers (HTTP ${res.status})`);
      return res.json();
    },
    refetchInterval: 10000,
    retry: false,
  });

  // 5. Fetch Security Audit Logs
  const {
    data: auditData,
    isLoading: isAuditLoading,
    error: auditError,
    refetch: refetchAudit,
  } = useQuery<SecurityAuditResponse>({
    queryKey: ["securityAuditLogs"],
    queryFn: async () => {
      const res = await fetch("/api/security/audit");
      if (!res.ok) throw new Error(`Failed to load security audit (HTTP ${res.status})`);
      return res.json();
    },
    refetchInterval: 5000,
    retry: false,
  });

  // Refresh All Queries
  const handleRefreshAll = () => {
    refetchKeys();
    refetchGate();
    refetchLive();
    refetchProviders();
    refetchAudit();
  };

  // Mutation: Update API Credentials
  const updateKeysMutation = useMutation({
    mutationFn: async ({ apiKey, secretKey }: { apiKey: string; secretKey: string }) => {
      const res = await fetch("/api/security/apikeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, secret_key: secretKey, user: "Trader" }),
      });
      const json = await res.json();
      if (!res.ok || json.status === "error") {
        throw new Error(json.message || "Failed to update API credentials");
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["securityApiKeys"] });
      queryClient.invalidateQueries({ queryKey: ["securityAuditLogs"] });
    },
  });

  // Mutation: Arm Live Trading
  const armLiveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/live-trading/arm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_confirm: true, user_ack_risk: true }),
      });
      const json = await res.json();
      if (!res.ok || json.status === "error") {
        throw new Error(json.message || "Failed to arm live trading");
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["executionGateStatus"] });
      queryClient.invalidateQueries({ queryKey: ["botsLiveOverview"] });
      queryClient.invalidateQueries({ queryKey: ["securityAuditLogs"] });
    },
  });

  // Mutation: Disarm Live Trading
  const disarmLiveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/live-trading/disarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok || json.status === "error") {
        throw new Error(json.message || "Failed to disarm live trading");
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["executionGateStatus"] });
      queryClient.invalidateQueries({ queryKey: ["botsLiveOverview"] });
      queryClient.invalidateQueries({ queryKey: ["securityAuditLogs"] });
    },
  });

  // Mutation: Emergency Kill Switch
  const killSwitchMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok || json.status === "error") {
        throw new Error(json.message || "Failed to activate kill switch");
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["executionGateStatus"] });
      queryClient.invalidateQueries({ queryKey: ["botsLiveOverview"] });
      queryClient.invalidateQueries({ queryKey: ["securityAuditLogs"] });
    },
  });

  // Mutation: Reset Paper Sandbox
  const resetPaperMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/bots/paper/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok || json.status === "error") {
        throw new Error(json.message || "Failed to reset paper sandbox");
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["botsPaperOverview"] });
      queryClient.invalidateQueries({ queryKey: ["securityAuditLogs"] });
    },
  });

  const isLoading = isKeysLoading || isGateLoading || isLiveLoading;
  const anyError = keysError || gateError || liveError;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#121824] via-[#101726] to-[#121824] border border-[#1E293B] shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Shield className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-white">Account & Security Hub</h1>
              <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 uppercase tracking-wide">
                Zero Secret Leakage
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Exchange credential masking, live execution gates, and immutable security audit logs
            </p>
          </div>
        </div>

        {/* Global Manual Refresh Button */}
        <button
          id="btn-refresh-account-security"
          onClick={handleRefreshAll}
          disabled={isKeysFetching}
          className="p-2.5 bg-[#0B0F17] hover:bg-slate-800 border border-[#1E293B] rounded-xl text-slate-300 transition-colors cursor-pointer"
          title="Refresh account & security data"
        >
          <RefreshCw className={`w-4 h-4 ${isKeysFetching ? "animate-spin text-cyan-400" : ""}`} />
        </button>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <AccountSecuritySkeleton />
      ) : anyError ? (
        <AccountSecurityError
          message={anyError instanceof Error ? anyError.message : "Failed to load account security data"}
          onRetry={handleRefreshAll}
        />
      ) : (
        <>
          {/* Top 4 KPI Status Cards */}
          <AccountOverview
            apiKeys={apiKeysData}
            executionGate={gateData}
            liveOverview={liveData}
          />

          {/* Connection Status Grid */}
          <ConnectionStatus
            providers={providersData?.providers || []}
            executionGate={gateData}
            onRefresh={handleRefreshAll}
            isRefreshing={isKeysFetching}
          />

          {/* Credentials & Security Actions Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CredentialStatus
              apiKeys={apiKeysData}
              onUpdateCredentials={async (apiKey, secretKey) => {
                await updateKeysMutation.mutateAsync({ apiKey, secretKey });
              }}
              isUpdating={updateKeysMutation.isPending}
            />

            <SecurityActions
              executionGate={gateData}
              onArmLiveTrading={async () => {
                await armLiveMutation.mutateAsync();
              }}
              onDisarmLiveTrading={async () => {
                await disarmLiveMutation.mutateAsync();
              }}
              onKillSwitch={async () => {
                await killSwitchMutation.mutateAsync();
              }}
              onResetPaperSandbox={async () => {
                await resetPaperMutation.mutateAsync();
              }}
              isActionPending={
                armLiveMutation.isPending ||
                disarmLiveMutation.isPending ||
                killSwitchMutation.isPending ||
                resetPaperMutation.isPending
              }
            />
          </div>

          {/* Security Audit Log Table */}
          <SecurityAuditTable logs={auditData?.audit_logs || []} />
        </>
      )}
    </div>
  );
}
