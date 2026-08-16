"use client";

import React, { useState } from "react";
import { History, Shield, Search, User, Globe, Clock, Terminal } from "lucide-react";
import { SecurityAuditLog } from "@/types/account-security";

interface SecurityAuditTableProps {
  logs: SecurityAuditLog[];
}

export function SecurityAuditTable({ logs }: SecurityAuditTableProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredLogs = logs.filter((log) => {
    const q = searchQuery.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.user.toLowerCase().includes(q) ||
      log.ip_address.toLowerCase().includes(q) ||
      log.details.toLowerCase().includes(q) ||
      String(log.id).includes(q)
    );
  });

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return ts;
    }
  };

  const getActionBadge = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes("ARM") || act.includes("KILL") || act.includes("STOP")) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
          {action}
        </span>
      );
    }
    if (act.includes("KEY") || act.includes("AUTH") || act.includes("SECURITY")) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
          {action}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 font-mono">
        {action}
      </span>
    );
  };

  return (
    <div className="p-6 rounded-2xl bg-[#121824] border border-[#1E293B] shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-[#1E293B]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100">Security & Session Audit Ledger</h3>
            <p className="text-xs text-slate-400">Immutable trace of authentication, arming events, and operator commands</p>
          </div>
        </div>

        {/* Search Audit Logs */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="input-search-audit-logs"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search audit events..."
            className="w-full pl-9 pr-4 py-1.5 bg-[#0B0F17] border border-[#1E293B] focus:border-purple-500/50 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      {filteredLogs.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-xs bg-[#0B0F17]/60 rounded-xl border border-[#1E293B]">
          No matching security audit events found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#1E293B]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B0F17] text-[11px] text-slate-400 uppercase tracking-wider font-semibold border-b border-[#1E293B]">
              <tr>
                <th className="py-3 px-4">Event ID</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">IP Address</th>
                <th className="py-3 px-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]/60 font-sans">
              {filteredLogs.slice(0, 20).map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4 font-mono text-slate-400 font-medium">#{log.id}</td>
                  <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                    {formatTimestamp(log.timestamp)}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">{getActionBadge(log.action)}</td>
                  <td className="py-3 px-4 text-slate-300 font-medium">{log.user}</td>
                  <td className="py-3 px-4 font-mono text-slate-400">{log.ip_address}</td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-400 max-w-xs truncate">
                    {log.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
