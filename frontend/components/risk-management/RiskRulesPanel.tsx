"use client";

import React, { useState } from "react";
import { Sliders, ToggleLeft, ToggleRight, Check, AlertCircle, RefreshCw, Zap } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RiskRule } from "@/types/risk";

interface RiskRulesPanelProps {
  rules: RiskRule[];
}

export function RiskRulesPanel({ rules }: RiskRulesPanelProps) {
  const queryClient = useQueryClient();
  const [toggleRule, setToggleRule] = useState<{ rule: RiskRule; nextState: boolean } | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const toggleMutation = useMutation({
    mutationFn: async ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) => {
      const res = await fetch(`/api/risk/rules/${ruleId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to toggle risk rule.");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setFeedbackMsg({
        type: "success",
        text: `Rule '${data.rule_id}' is now ${data.is_enabled ? "ENABLED" : "DISABLED"}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["riskRules"] });
      queryClient.invalidateQueries({ queryKey: ["riskOverview"] });
      setConfirmModalOpen(false);
      setTimeout(() => setFeedbackMsg(null), 4000);
    },
    onError: (err: any) => {
      setFeedbackMsg({ type: "error", text: err.message || "Toggle failed." });
      setConfirmModalOpen(false);
    },
  });

  const handleToggleClick = (rule: RiskRule) => {
    setToggleRule({ rule, nextState: !rule.is_enabled });
    setConfirmModalOpen(true);
  };

  const handleConfirmToggle = () => {
    if (toggleRule) {
      toggleMutation.mutate({ ruleId: toggleRule.rule.rule_id, enabled: toggleRule.nextState });
    }
  };

  return (
    <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Active Visual Risk Execution Rules & Circuit Breakers
          </h3>
        </div>
        <span className="text-xs text-slate-400 font-mono">
          {rules.length} Configured Rules
        </span>
      </div>

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rules.map((r) => {
          const isEnabled = r.is_enabled;
          return (
            <div
              key={r.rule_id}
              className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                isEnabled
                  ? "bg-[#0E1524] border-cyan-800/40"
                  : "bg-[#0A0E17] border-[#1A2333] opacity-75"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white tracking-wide">{r.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      isEnabled
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                        : "bg-slate-800 text-slate-400 border border-slate-700"
                    }`}
                  >
                    {isEnabled ? "ENABLED" : "DISABLED"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-3">{r.description || "Pre-trade safety gate condition."}</p>

                <div className="space-y-1 text-[11px] font-mono text-slate-300 border-t border-[#1E293B] pt-2.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Category:</span>
                    <span className="text-cyan-400">{r.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Condition:</span>
                    <span className="text-slate-200">{r.condition_type} &gt; {r.threshold}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Action:</span>
                    <span className="text-amber-400 font-bold">{r.action}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#1E293B] flex justify-end">
                <button
                  onClick={() => handleToggleClick(r)}
                  disabled={toggleMutation.isPending}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isEnabled
                      ? "bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 text-red-300"
                      : "bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/60 text-emerald-300"
                  }`}
                >
                  {isEnabled ? (
                    <>
                      <ToggleRight className="h-4 w-4" /> Disable Rule
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="h-4 w-4" /> Enable Rule
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal */}
      {confirmModalOpen && toggleRule && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121824] border border-[#1E293B] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-950 border border-amber-800 text-amber-400">
                <Sliders className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Confirm Rule Modification</h3>
                <p className="text-xs text-slate-400">Safety Execution State Change</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 font-mono bg-[#0E1524] p-3 rounded-xl border border-[#1E293B]">
              Are you sure you want to <b>{toggleRule.nextState ? "ENABLE" : "DISABLE"}</b> rule <b>{toggleRule.rule.name}</b>? This directly alters backend pre-trade order validation.
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setConfirmModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmToggle}
                disabled={toggleMutation.isPending}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                {toggleMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                Confirm Change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
