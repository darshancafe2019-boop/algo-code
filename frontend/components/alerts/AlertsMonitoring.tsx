"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertItem, AlertsResponse, AlertSeverity, TestAlertResponse } from "@/types/alerts";
import { AlertFilters } from "./AlertFilters";
import { AlertsFeed } from "./AlertsFeed";
import { AlertSkeleton } from "./AlertSkeleton";
import { AlertError } from "./AlertError";
import { 
  Bell, 
  Send, 
  Trash2, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  Radio,
  SendHorizontal
} from "lucide-react";

export function AlertsMonitoring() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity>("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [dismissingId, setDismissingId] = useState<number | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // 1. Fetch Alerts with Polling (5s)
  const { data, isLoading, error, refetch, isFetching } = useQuery<AlertsResponse>({
    queryKey: ["alertsFeed"],
    queryFn: async () => {
      const res = await fetch("/api/alerts");
      if (!res.ok) {
        throw new Error(`Failed to fetch alerts feed (HTTP ${res.status})`);
      }
      return res.json();
    },
    refetchInterval: 5000,
    staleTime: 3000,
    retry: false,
  });

  // 2. Trigger In-App or Telegram Test Alert Mutation
  const testAlertMutation = useMutation<TestAlertResponse, Error, "system" | "telegram">({
    mutationFn: async (channel) => {
      const res = await fetch("/api/alerts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || `Failed to trigger ${channel} test alert`);
      }
      return json;
    },
    onSuccess: (resData, channel) => {
      queryClient.invalidateQueries({ queryKey: ["alertsFeed"] });
      setActionFeedback(channel === "telegram" ? "Telegram test alert sent!" : "In-app test alert triggered!");
      setTimeout(() => setActionFeedback(null), 4000);
    },
    onError: (err) => {
      setActionFeedback(`Test alert failed: ${err.message}`);
      setTimeout(() => setActionFeedback(null), 5000);
    }
  });

  // 3. Dismiss Single Alert Mutation
  const dismissMutation = useMutation({
    mutationFn: async (alertId: number) => {
      setDismissingId(alertId);
      const res = await fetch(`/api/alerts/${alertId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(`Failed to dismiss alert ${alertId}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alertsFeed"] });
    },
    onSettled: () => {
      setDismissingId(null);
    }
  });

  // 4. Clear All Alerts Mutation
  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/alerts/clear", {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to clear alerts");
      }
      return res.json();
    },
    onSuccess: () => {
      setShowClearConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["alertsFeed"] });
      setActionFeedback("All alerts cleared successfully.");
      setTimeout(() => setActionFeedback(null), 4000);
    }
  });

  // 5. Frontend Deduplication (Guarantee unique keys)
  const rawNotifications = data?.notifications || [];
  const dedupedAlerts: AlertItem[] = useMemo(() => {
    const seen = new Set<string>();
    const result: AlertItem[] = [];

    for (const item of rawNotifications) {
      const uniqueKey = item.id ? `id-${item.id}` : `${item.level}:${item.category}:${item.message}:${item.timestamp}`;
      if (!seen.has(uniqueKey)) {
        seen.add(uniqueKey);
        result.push(item);
      }
    }
    return result;
  }, [rawNotifications]);

  // 6. Categories & Stats Calculation
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const alert of dedupedAlerts) {
      if (alert.category) set.add(alert.category);
    }
    return Array.from(set).sort();
  }, [dedupedAlerts]);

  const counts = useMemo(() => {
    let info = 0;
    let warning = 0;
    let error = 0;
    let critical = 0;

    for (const a of dedupedAlerts) {
      const lvl = (a.level || "INFO").toUpperCase();
      if (lvl === "INFO") info++;
      else if (lvl === "WARNING") warning++;
      else if (lvl === "ERROR") error++;
      else if (lvl === "CRITICAL") critical++;
    }

    return {
      all: dedupedAlerts.length,
      info,
      warning,
      error,
      critical
    };
  }, [dedupedAlerts]);

  // 7. Filtering & Search Processing
  const filteredAlerts = useMemo(() => {
    return dedupedAlerts.filter((alert) => {
      // Severity Filter
      if (severityFilter !== "ALL") {
        const lvl = (alert.level || "INFO").toUpperCase();
        if (lvl !== severityFilter) return false;
      }

      // Category Filter
      if (categoryFilter !== "ALL") {
        if (alert.category !== categoryFilter) return false;
      }

      // Search Query Filter
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const msgMatch = (alert.message || "").toLowerCase().includes(q);
        const catMatch = (alert.category || "").toLowerCase().includes(q);
        const lvlMatch = (alert.level || "").toLowerCase().includes(q);
        const idMatch = alert.id ? alert.id.toString().includes(q) : false;
        return msgMatch || catMatch || lvlMatch || idMatch;
      }

      return true;
    });
  }, [dedupedAlerts, severityFilter, categoryFilter, searchQuery]);

  const isFiltered = searchQuery !== "" || severityFilter !== "ALL" || categoryFilter !== "ALL";

  return (
    <div className="space-y-6">
      {/* Top Banner & Action Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#121824] p-5 rounded-2xl border border-[#1E293B]">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-950 to-blue-900 border border-cyan-800/40 text-cyan-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
                Alerts & Real-Time Monitoring
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Monitored
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                System errors, bot execution warnings, and audit notifications feed.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Test In-App Alert Button */}
          <button
            id="btn-test-alert"
            onClick={() => testAlertMutation.mutate("system")}
            disabled={testAlertMutation.isPending}
            className="px-3 py-2 bg-[#0B0F17] hover:bg-cyan-950/50 border border-[#1E293B] hover:border-cyan-500/50 rounded-xl text-xs font-semibold text-cyan-300 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Trigger a test in-app notification"
          >
            <Send className="w-3.5 h-3.5 text-cyan-400" />
            <span>Test Alert</span>
          </button>

          {/* Test Telegram Alert Button */}
          <button
            id="btn-test-telegram"
            onClick={() => testAlertMutation.mutate("telegram")}
            disabled={testAlertMutation.isPending}
            className="px-3 py-2 bg-[#0B0F17] hover:bg-blue-950/50 border border-[#1E293B] hover:border-blue-500/50 rounded-xl text-xs font-semibold text-blue-300 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Send test message to configured Telegram channel"
          >
            <SendHorizontal className="w-3.5 h-3.5 text-blue-400" />
            <span>Test Telegram</span>
          </button>

          {/* Clear All Button */}
          {!showClearConfirm ? (
            <button
              id="btn-clear-alerts"
              onClick={() => setShowClearConfirm(true)}
              disabled={dedupedAlerts.length === 0}
              className="px-3 py-2 bg-[#0B0F17] hover:bg-red-950/50 border border-[#1E293B] hover:border-red-500/50 rounded-xl text-xs font-semibold text-red-400 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              title="Clear all alerts from database"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 bg-red-950/40 border border-red-500/40 p-1 rounded-xl">
              <span className="text-[11px] text-red-300 px-2 font-medium">Clear all?</span>
              <button
                id="btn-confirm-clear"
                onClick={() => clearAllMutation.mutate()}
                disabled={clearAllMutation.isPending}
                className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[11px] font-bold cursor-pointer"
              >
                Confirm
              </button>
              <button
                id="btn-cancel-clear"
                onClick={() => setShowClearConfirm(false)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Manual Refresh */}
          <button
            id="btn-refresh-alerts"
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 bg-[#0B0F17] hover:bg-slate-800 border border-[#1E293B] rounded-xl text-slate-300 transition-colors cursor-pointer"
            title="Refresh feed"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin text-cyan-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Action Feedback Toast */}
      {actionFeedback && (
        <div className="p-3 bg-cyan-950/80 border border-cyan-500/40 rounded-xl text-xs text-cyan-200 font-medium flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* Quick Severity Counters Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-[#121824] rounded-xl border border-[#1E293B] flex items-center justify-between">
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider font-semibold">Total Alerts</div>
            <div className="text-xl font-bold font-mono text-white mt-0.5">{counts.all}</div>
          </div>
          <Radio className="w-5 h-5 text-slate-500" />
        </div>

        <div className="p-3.5 bg-[#121824] rounded-xl border border-[#1E293B] flex items-center justify-between">
          <div>
            <div className="text-[10px] text-amber-400/90 uppercase font-mono tracking-wider font-semibold">Warnings</div>
            <div className="text-xl font-bold font-mono text-amber-300 mt-0.5">{counts.warning}</div>
          </div>
          <AlertTriangle className="w-5 h-5 text-amber-500/80" />
        </div>

        <div className="p-3.5 bg-[#121824] rounded-xl border border-[#1E293B] flex items-center justify-between">
          <div>
            <div className="text-[10px] text-red-400/90 uppercase font-mono tracking-wider font-semibold">Errors</div>
            <div className="text-xl font-bold font-mono text-red-400 mt-0.5">{counts.error}</div>
          </div>
          <span className="text-lg">🚨</span>
        </div>

        <div className="p-3.5 bg-[#121824] rounded-xl border border-[#1E293B] flex items-center justify-between">
          <div>
            <div className="text-[10px] text-cyan-400/90 uppercase font-mono tracking-wider font-semibold">Info & System</div>
            <div className="text-xl font-bold font-mono text-cyan-400 mt-0.5">{counts.info}</div>
          </div>
          <span className="text-lg">ℹ️</span>
        </div>
      </div>

      {/* Filters Bar */}
      <AlertFilters
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        severityFilter={severityFilter}
        setSeverityFilter={setSeverityFilter}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        categories={categories}
        counts={counts}
      />

      {/* Main Alert Feed Content */}
      {isLoading ? (
        <AlertSkeleton />
      ) : error ? (
        <AlertError
          message={error instanceof Error ? error.message : "Failed to load alerts."}
          onRetry={() => refetch()}
        />
      ) : (
        <AlertsFeed
          alerts={filteredAlerts}
          onDismiss={(id) => dismissMutation.mutate(id)}
          dismissingId={dismissingId}
          isFiltered={isFiltered}
        />
      )}
    </div>
  );
}
