"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Terminal, Shield, AlertCircle, RefreshCw } from "lucide-react";
import { AuditEventsResponse, LogsResponse, DiagnosticsStateResponse, DiagnosticReportResponse, AuditEventRecord } from "@/types/logs";
import { LogsToolbar, LogSourceType } from "./LogsToolbar";
import { LogRow } from "./LogRow";
import { LogDetailsModal } from "./LogDetailsModal";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { LogsSkeleton } from "./LogsSkeleton";
import { LogsError } from "./LogsError";

export function LogsDebugging() {
  const [source, setSource] = useState<LogSourceType>("AUDIT_EVENTS");
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("ALL");
  const [isPaused, setIsPaused] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditEventRecord | string | null>(null);

  // 1. Fetch Structured Audit Events
  const {
    data: auditData,
    isLoading: isLoadingAudit,
    isError: isErrorAudit,
    refetch: refetchAudit,
    isFetching: isFetchingAudit,
  } = useQuery<AuditEventsResponse>({
    queryKey: ["auditEvents", severity],
    queryFn: async () => {
      const severityParam = severity !== "ALL" ? `&severity=${severity}` : "";
      const res = await fetch(`/api/audit/events?limit=200${severityParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch audit events`);
      return res.json();
    },
    refetchInterval: isPaused ? false : 3000,
  });

  // 2. Fetch System & Runner Logs
  const {
    data: logsData,
    isLoading: isLoadingLogs,
    isError: isErrorLogs,
    refetch: refetchLogs,
    isFetching: isFetchingLogs,
  } = useQuery<LogsResponse>({
    queryKey: ["systemLogs", severity],
    queryFn: async () => {
      const levelParam = severity !== "ALL" ? `&level=${severity}` : "";
      const res = await fetch(`/api/logs?limit=200${levelParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch system logs`);
      return res.json();
    },
    refetchInterval: isPaused ? false : 3000,
  });

  // 3. Fetch Diagnostics State
  const {
    data: diagData,
    isLoading: isLoadingDiag,
    isError: isErrorDiag,
    refetch: refetchDiag,
  } = useQuery<DiagnosticsStateResponse>({
    queryKey: ["diagnosticsState"],
    queryFn: async () => {
      const res = await fetch("/api/diagnostics/state");
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch diagnostics state`);
      return res.json();
    },
    refetchInterval: isPaused ? false : 3000,
  });

  // 4. Fetch Diagnostic Text Report
  const { data: reportData } = useQuery<DiagnosticReportResponse>({
    queryKey: ["diagnosticReport"],
    queryFn: async () => {
      const res = await fetch("/api/logs/diagnostic_report");
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch diagnostic report`);
      return res.json();
    },
    refetchInterval: isPaused ? false : 10000,
  });

  const handleRefresh = () => {
    refetchAudit();
    refetchLogs();
    refetchDiag();
  };

  // Filtered Audit Events
  const filteredAuditEvents = useMemo(() => {
    const events = auditData?.events || [];
    if (!search.trim()) return events;
    const q = search.toLowerCase();
    return events.filter(
      (e) =>
        e.message?.toLowerCase().includes(q) ||
        e.event_type?.toLowerCase().includes(q) ||
        e.bot_instance_name?.toLowerCase().includes(q) ||
        e.symbol?.toLowerCase().includes(q) ||
        e.severity?.toLowerCase().includes(q)
    );
  }, [auditData, search]);

  // Filtered Raw Logs
  const filteredRawLogs = useMemo(() => {
    const lines = logsData?.logs || [];
    if (!search.trim()) return lines;
    const q = search.toLowerCase();
    return lines.filter((l) => l.toLowerCase().includes(q));
  }, [logsData, search]);

  const isLoading = (source === "AUDIT_EVENTS" && isLoadingAudit) ||
                    (source === "SYSTEM_LOGS" && isLoadingLogs) ||
                    (source === "DIAGNOSTICS" && isLoadingDiag);

  const isError = (source === "AUDIT_EVENTS" && isErrorAudit) ||
                  (source === "SYSTEM_LOGS" && isErrorLogs) ||
                  (source === "DIAGNOSTICS" && isErrorDiag);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider bg-cyan-950 border border-cyan-800 text-cyan-400">
              AUDIT & TELEMETRY STREAM
            </span>
            <span className="text-xs font-mono text-slate-500">LIVE SYSTEM LOG ENGINE</span>
          </div>
          <h1 className="text-xl font-bold text-white uppercase tracking-wider mt-1">
            Logs & System Debugging Center
          </h1>
          <p className="text-xs text-slate-400 max-w-2xl mt-0.5">
            Real-time multi-source audit trail, execution telemetry, thread profiling, and exception tracing.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-[10px] font-mono text-slate-500 block">AUDIT EVENTS LOADED</span>
            <span id="stat-audit-events-count" className="text-lg font-bold font-mono text-cyan-400">
              {auditData?.count ?? 0}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-800" />
          <div className="text-right">
            <span className="text-[10px] font-mono text-slate-500 block">ACTIVE EXCEPTIONS</span>
            <span id="stat-system-errors-count" className="text-lg font-bold font-mono text-purple-300">
              {logsData?.system_errors?.length ?? 0}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-800" />
          <div className="text-right">
            <span className="text-[10px] font-mono text-slate-500 block">RAW LOG LINES</span>
            <span id="stat-raw-logs-count" className="text-lg font-bold font-mono text-emerald-400">
              {logsData?.log_count ?? 0}
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <LogsToolbar
        source={source}
        onSourceChange={setSource}
        search={search}
        onSearchChange={setSearch}
        severity={severity}
        onSeverityChange={setSeverity}
        isPaused={isPaused}
        onTogglePause={() => setIsPaused(!isPaused)}
        onRefresh={handleRefresh}
        isFetching={isFetchingAudit || isFetchingLogs}
        totalCount={source === "AUDIT_EVENTS" ? filteredAuditEvents.length : filteredRawLogs.length}
      />

      {/* Loading Skeleton */}
      {isLoading && <LogsSkeleton />}

      {/* Error Fallback */}
      {isError && (
        <LogsError
          message="Failed to connect to the backend logging or telemetry stream."
          onRetry={handleRefresh}
        />
      )}

      {/* Main Content Area */}
      {!isLoading && !isError && (
        <>
          {source === "AUDIT_EVENTS" && (
            <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between px-2 pb-2 text-[11px] font-bold font-mono text-slate-500 border-b border-[#1E293B]">
                <span>STRUCTURED AUDIT EVENTS FEED</span>
                <span>CLICK ANY ROW FOR FULL PAYLOAD INSPECTION</span>
              </div>

              {filteredAuditEvents.length > 0 ? (
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                  {filteredAuditEvents.map((evt) => (
                    <LogRow
                      key={evt.id || evt.event_id || Math.random()}
                      log={evt}
                      isStructured={true}
                      onOpenDetails={(item) => setSelectedLog(item)}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500 text-xs font-mono">
                  No structured audit events matched your search filter.
                </div>
              )}
            </div>
          )}

          {source === "SYSTEM_LOGS" && (
            <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between px-2 pb-2 text-[11px] font-bold font-mono text-slate-500 border-b border-[#1E293B]">
                <span>RAW SYSTEM & RUNNER LOGS</span>
                <span>APPEND-ONLY CONSOLE OUTPUT</span>
              </div>

              {filteredRawLogs.length > 0 ? (
                <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1 font-mono">
                  {filteredRawLogs.map((line, idx) => (
                    <LogRow
                      key={idx}
                      log={line}
                      isStructured={false}
                      onOpenDetails={(item) => setSelectedLog(item)}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500 text-xs font-mono">
                  No raw system log lines matched your search filter.
                </div>
              )}
            </div>
          )}

          {source === "DIAGNOSTICS" && (
            <DiagnosticsPanel
              diagnostics={diagData}
              systemErrors={logsData?.system_errors || []}
              reportText={reportData?.report || ""}
            />
          )}
        </>
      )}

      {/* Details Modal */}
      {selectedLog && (
        <LogDetailsModal
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
        />
      )}
    </div>
  );
}
