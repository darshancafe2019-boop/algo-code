"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StrategyPermission } from "@/types/market-universe";
import { X, ShieldCheck, ShieldAlert, Sliders, CheckCircle, AlertTriangle, Plus, Trash2 } from "lucide-react";

interface StrategyPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StrategyPermissionsModal({ isOpen, onClose }: StrategyPermissionsModalProps) {
  const queryClient = useQueryClient();
  const [selectedBot, setSelectedBot] = useState<string>("ALL");
  const [newAssetClass, setNewAssetClass] = useState<string>("CRYPTO");
  const [newStrategy, setNewStrategy] = useState<string>("EMA_MACD_VP");
  const [newAllowed, setNewAllowed] = useState<boolean>(true);
  const [newReason, setNewReason] = useState<string>("");

  const { data, isLoading, refetch } = useQuery<{ status: string; permissions: StrategyPermission[] }>({
    queryKey: ["strategyPermissions", selectedBot],
    queryFn: async () => {
      const p = selectedBot !== "ALL" ? `?bot_id=${encodeURIComponent(selectedBot)}` : "";
      const res = await fetch(`/api/universe/strategy-permissions${p}`);
      if (!res.ok) throw new Error("Failed to fetch strategy permissions");
      return res.json();
    },
    enabled: isOpen,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: { bot_id: string; asset_class: string; strategy_name: string; is_allowed: boolean; reason: string }) => {
      const res = await fetch("/api/universe/strategy-permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save permission");
      return res.json();
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["strategyPermissions"] });
      setNewReason("");
    },
  });

  if (!isOpen) return null;

  const permissions = data?.permissions || [];

  const handleToggle = (perm: StrategyPermission) => {
    saveMutation.mutate({
      bot_id: perm.bot_id,
      asset_class: perm.asset_class,
      strategy_name: perm.strategy_name,
      is_allowed: !Boolean(perm.is_allowed),
      reason: perm.restriction_reason || "Toggled by user in Market Universe hub",
    });
  };

  const handleAddNewRule = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      bot_id: selectedBot === "ALL" ? "ALL" : selectedBot,
      asset_class: newAssetClass,
      strategy_name: newStrategy,
      is_allowed: newAllowed,
      reason: newReason || "Permission rule created by operator",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-[#0B0E14] border border-[#1E293B] rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-[#121824] border-b border-[#1E293B] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                Bot Strategy & Asset Class Permissions Matrix
              </h3>
              <p className="text-xs text-slate-400">
                Authoritative governance matrix defining which automated strategies are permitted to trade specific asset classes.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-[#0F141F] hover:bg-red-500/20 border border-[#1E293B] hover:border-red-500/40 text-slate-400 hover:text-red-400 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Filter / Selector */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold">Filter Bot:</span>
              <select
                value={selectedBot}
                onChange={(e) => setSelectedBot(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-[#0F141F] border border-[#1E293B] text-xs font-semibold text-white focus:outline-none focus:border-purple-500"
              >
                <option value="ALL">ALL Active Bots</option>
                <option value="bot-1">Bot 1 (BTC/USDT Primary)</option>
                <option value="bot-2">Bot 2 (ETH/USDT Momentum)</option>
                <option value="bot-3">Bot 3 (NSE Nifty Index Swing)</option>
              </select>
            </div>
          </div>

          {/* Permissions Table */}
          <div className="rounded-xl border border-[#1E293B] overflow-hidden bg-[#0F141F]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#121824] text-slate-400 text-[11px] border-b border-[#1E293B]">
                <tr>
                  <th className="py-2.5 px-3">Bot Scope</th>
                  <th className="py-2.5 px-3">Asset Class</th>
                  <th className="py-2.5 px-3">Strategy Name</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3">Governance Reason</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#161F30]">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Loading governance permissions matrix...
                    </td>
                  </tr>
                ) : permissions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No explicit restrictions configured. All bots default to permitted under global risk gate.
                    </td>
                  </tr>
                ) : (
                  permissions.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-white">{p.bot_id}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-bold border border-cyan-500/20 text-[10px]">
                          {p.asset_class}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-200">{p.strategy_name}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border inline-block ${
                            Boolean(p.is_allowed)
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                          }`}
                        >
                          {Boolean(p.is_allowed) ? "PERMITTED" : "BLOCKED"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px] truncate max-w-[200px]">
                        {p.restriction_reason || "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => handleToggle(p)}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                            Boolean(p.is_allowed)
                              ? "bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30"
                              : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30"
                          }`}
                        >
                          {Boolean(p.is_allowed) ? "Block" : "Allow"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Add New Rule Form */}
          <form onSubmit={handleAddNewRule} className="p-4 rounded-xl bg-[#121824] border border-[#1E293B] space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5 text-purple-400" />
              Configure Custom Strategy Rule
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Asset Class</label>
                <select
                  value={newAssetClass}
                  onChange={(e) => setNewAssetClass(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#0B0E14] border border-[#1E293B] text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="CRYPTO">CRYPTO</option>
                  <option value="INDIAN_STOCKS">INDIAN STOCKS</option>
                  <option value="GLOBAL_STOCKS">GLOBAL STOCKS</option>
                  <option value="FOREX">FOREX</option>
                  <option value="COMMODITIES">COMMODITIES</option>
                  <option value="FUTURES">FUTURES</option>
                  <option value="OPTIONS">OPTIONS</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Strategy</label>
                <select
                  value={newStrategy}
                  onChange={(e) => setNewStrategy(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#0B0E14] border border-[#1E293B] text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="EMA_MACD_VP">EMA MACD Volume Profile</option>
                  <option value="RSI_BB_CONFLUENCE">RSI Bollinger Confluence</option>
                  <option value="SUPER_TREND_BREAKOUT">SuperTrend Breakout</option>
                  <option value="ORDER_FLOW_IMBALANCE">Order Flow Imbalance</option>
                  <option value="OPTIONS_DELTA_NEUTRAL">Options Delta Neutral</option>
                  <option value="ALL">ALL Strategies</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Permission</label>
                <select
                  value={newAllowed ? "ALLOW" : "BLOCK"}
                  onChange={(e) => setNewAllowed(e.target.value === "ALLOW")}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#0B0E14] border border-[#1E293B] text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="ALLOW">PERMITTED (Allow)</option>
                  <option value="BLOCK">BLOCKED (Restrict)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Reason / Note</label>
                <input
                  type="text"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  placeholder="e.g. Volatility filter"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#0B0E14] border border-[#1E293B] text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
              >
                {saveMutation.isPending ? "Saving..." : "Add Permission Rule"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
