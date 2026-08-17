"use client";

import React, { useState } from "react";
import { Shield, Check, Lock, AlertCircle, RefreshCw } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RiskProfile, ActiveRiskLimits } from "@/types/risk";

interface RiskLimitsProps {
  profiles: RiskProfile[];
  activeLimits?: ActiveRiskLimits;
}

export function RiskLimits({ profiles, activeLimits }: RiskLimitsProps) {
  const queryClient = useQueryClient();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [targetProfile, setTargetProfile] = useState<RiskProfile | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const setDefaultMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const res = await fetch("/api/risk/profiles/default", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profileId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to set default profile.");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setFeedbackMsg({ type: "success", text: data.message || "Default risk profile activated." });
      queryClient.invalidateQueries({ queryKey: ["riskOverview"] });
      queryClient.invalidateQueries({ queryKey: ["riskProfiles"] });
      setConfirmModalOpen(false);
      setTimeout(() => setFeedbackMsg(null), 4000);
    },
    onError: (err: any) => {
      setFeedbackMsg({ type: "error", text: err.message || "Mutation failed." });
      setConfirmModalOpen(false);
    },
  });

  const handleActivateClick = (p: RiskProfile) => {
    setTargetProfile(p);
    setConfirmModalOpen(true);
  };

  const handleConfirmActivation = () => {
    if (targetProfile) {
      setDefaultMutation.mutate(targetProfile.profile_id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Feedback Banner */}
      {feedbackMsg && (
        <div
          className={`p-3 rounded-xl border text-xs font-mono flex items-center gap-2 ${
            feedbackMsg.type === "success"
              ? "bg-emerald-950/80 border-emerald-800 text-emerald-300"
              : "bg-red-950/80 border-red-800 text-red-300"
          }`}
        >
          {feedbackMsg.type === "success" ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Section 1: Pre-Configured Risk Profiles */}
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Quant Risk Profiles & Confluence Thresholds
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {profiles.length} Profiles Available
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map((p) => {
            const isDefault = p.is_default;
            return (
              <div
                key={p.profile_id}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                  isDefault
                    ? "bg-gradient-to-b from-[#162032] to-[#121824] border-cyan-500/50 shadow-lg shadow-cyan-950/20"
                    : "bg-[#0E1524] border-[#1E293B] hover:border-slate-700"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-bold text-white tracking-wide">{p.name}</h4>
                    {isDefault ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800 flex items-center gap-1">
                        <Check className="h-3 w-3" /> ACTIVE
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500 font-mono">ID: {p.profile_id}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mb-3">{p.description || "Quantitative multi-asset risk tier."}</p>

                  <div className="space-y-1.5 text-[11px] font-mono text-slate-300 border-t border-[#1E293B] pt-2.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Max Trade Risk:</span>
                      <span className="text-slate-200">{p.max_single_trade_risk_pct}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Max Daily Loss:</span>
                      <span className="text-slate-200">{p.max_daily_loss_pct}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Max Leverage:</span>
                      <span className="text-slate-200">{p.max_leverage}x</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Drawdown Halt:</span>
                      <span className="text-red-400 font-bold">{p.drawdown_halt_threshold_pct}%</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#1E293B]">
                  {isDefault ? (
                    <button
                      disabled
                      className="w-full py-1.5 px-3 rounded-lg bg-cyan-950/60 text-cyan-400 border border-cyan-800/60 text-xs font-semibold cursor-default"
                    >
                      Active Default
                    </button>
                  ) : (
                    <button
                      onClick={() => handleActivateClick(p)}
                      disabled={setDefaultMutation.isPending}
                      className="w-full py-1.5 px-3 rounded-lg bg-[#1A2333] hover:bg-cyan-900/30 border border-[#2A374A] hover:border-cyan-700 text-slate-200 hover:text-cyan-300 text-xs font-semibold transition-all"
                    >
                      Activate Profile
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: Global Hardcoded Safety Caps (Read-Only) */}
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Authoritative Global Safety Limits & Gates
            </h3>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
            READ ONLY: Controlled by backend configuration
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-mono">
          <div className="p-3 bg-[#0E1524] rounded-xl border border-[#1E293B] space-y-1">
            <span className="text-slate-500 text-[10px] block">Max Daily Loss Cap</span>
            <span className="text-base font-bold text-white">${activeLimits?.max_daily_loss || 500}</span>
          </div>

          <div className="p-3 bg-[#0E1524] rounded-xl border border-[#1E293B] space-y-1">
            <span className="text-slate-500 text-[10px] block">Max Position Size</span>
            <span className="text-base font-bold text-white">{activeLimits?.max_position_size || 1.0} BTC</span>
          </div>

          <div className="p-3 bg-[#0E1524] rounded-xl border border-[#1E293B] space-y-1">
            <span className="text-slate-500 text-[10px] block">Max Order Value</span>
            <span className="text-base font-bold text-white">${activeLimits?.max_order_value || 10000}</span>
          </div>

          <div className="p-3 bg-[#0E1524] rounded-xl border border-[#1E293B] space-y-1">
            <span className="text-slate-500 text-[10px] block">Max Open Positions</span>
            <span className="text-base font-bold text-white">{activeLimits?.max_open_positions || 3} Slots</span>
          </div>

          <div className="p-3 bg-[#0E1524] rounded-xl border border-[#1E293B] space-y-1">
            <span className="text-slate-500 text-[10px] block">Confluence Gate</span>
            <span className="text-base font-bold text-cyan-400">{((activeLimits?.confluence_threshold || 0.75) * 100).toFixed(0)}%</span>
          </div>

          <div className="p-3 bg-[#0E1524] rounded-xl border border-[#1E293B] space-y-1">
            <span className="text-slate-500 text-[10px] block">Max Data Age</span>
            <span className="text-base font-bold text-slate-200">{activeLimits?.max_market_data_age_seconds || 60}s</span>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModalOpen && targetProfile && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121824] border border-[#1E293B] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-950 border border-cyan-800 text-cyan-400">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Activate Risk Profile?</h3>
                <p className="text-xs text-slate-400">Set active default quant risk rules</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 font-mono bg-[#0E1524] p-3 rounded-xl border border-[#1E293B]">
              Switching default profile to <b>{targetProfile.name}</b> will immediately update single-trade risk caps ({targetProfile.max_single_trade_risk_pct}%) and daily loss halts ({targetProfile.max_daily_loss_pct}%) across all bots.
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setConfirmModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmActivation}
                disabled={setDefaultMutation.isPending}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                {setDefaultMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                Confirm & Activate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
