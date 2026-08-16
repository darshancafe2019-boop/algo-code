"use client";

import React, { useState } from "react";
import { ShieldAlert, Zap, Power, RotateCcw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { ExecutionGateResponse } from "@/types/account-security";

interface SecurityActionsProps {
  executionGate?: ExecutionGateResponse;
  onArmLiveTrading: () => Promise<void>;
  onDisarmLiveTrading: () => Promise<void>;
  onKillSwitch: () => Promise<void>;
  onResetPaperSandbox: () => Promise<void>;
  isActionPending: boolean;
}

export function SecurityActions({
  executionGate,
  onArmLiveTrading,
  onDisarmLiveTrading,
  onKillSwitch,
  onResetPaperSandbox,
  isActionPending,
}: SecurityActionsProps) {
  const [showArmModal, setShowArmModal] = useState(false);
  const [showKillModal, setShowKillModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [userConfirm, setUserConfirm] = useState(false);
  const [userAckRisk, setUserAckRisk] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const isArmed = executionGate?.live_trading_armed || false;
  const isKillSwitch = executionGate?.kill_switch_active || false;

  const handleArmSubmit = async () => {
    if (!userConfirm || !userAckRisk) return;
    try {
      await onArmLiveTrading();
      setActionFeedback("Live Trading Armed. Multi-step server verification passed.");
      setShowArmModal(false);
      setUserConfirm(false);
      setUserAckRisk(false);
      setTimeout(() => setActionFeedback(null), 5000);
    } catch (err: any) {
      setActionFeedback(err.message || "Failed to arm live trading.");
    }
  };

  const handleDisarm = async () => {
    try {
      await onDisarmLiveTrading();
      setActionFeedback("Live Trading Disarmed. Reverted to Paper simulation mode.");
      setTimeout(() => setActionFeedback(null), 5000);
    } catch (err: any) {
      setActionFeedback(err.message || "Failed to disarm live trading.");
    }
  };

  const handleKillSubmit = async () => {
    try {
      await onKillSwitch();
      setActionFeedback("Global Kill Switch activated. All bot execution halted.");
      setShowKillModal(false);
      setTimeout(() => setActionFeedback(null), 5000);
    } catch (err: any) {
      setActionFeedback(err.message || "Failed to trigger kill switch.");
    }
  };

  const handleResetSubmit = async () => {
    try {
      await onResetPaperSandbox();
      setActionFeedback("Paper Sandbox Ledger Reset. Restored $10,000.00 capital.");
      setShowResetModal(false);
      setTimeout(() => setActionFeedback(null), 5000);
    } catch (err: any) {
      setActionFeedback(err.message || "Failed to reset paper sandbox.");
    }
  };

  return (
    <div className="p-6 rounded-2xl bg-[#121824] border border-[#1E293B] shadow-xl flex flex-col justify-between">
      <div>
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#1E293B]">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100">Security Gate & Controls</h3>
            <p className="text-xs text-slate-400">Protected state-changing operations requiring explicit confirmation</p>
          </div>
        </div>

        {actionFeedback && (
          <div className="mb-4 p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/40 text-cyan-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
        )}

        <div className="space-y-4">
          {/* Live Trading Gate Control */}
          <div className="p-4 rounded-xl bg-[#0B0F17] border border-[#1E293B] flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-slate-200 mb-0.5">Live Execution Gate</div>
              <p className="text-[11px] text-slate-400">
                {isArmed ? "Live trading is ARMED and executing live signals." : "Live trading is DISARMED and in safe paper mode."}
              </p>
            </div>
            {isArmed ? (
              <button
                id="btn-disarm-live"
                onClick={handleDisarm}
                disabled={isActionPending}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
              >
                Disarm Live
              </button>
            ) : (
              <button
                id="btn-open-arm-modal"
                onClick={() => setShowArmModal(true)}
                disabled={isActionPending}
                className="px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
              >
                Arm Live Trading
              </button>
            )}
          </div>

          {/* Emergency Kill Switch */}
          <div className="p-4 rounded-xl bg-[#0B0F17] border border-red-500/20 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-red-300 mb-0.5">Emergency Kill Switch</div>
              <p className="text-[11px] text-slate-400">
                {isKillSwitch ? "Trading is currently HALTED by kill switch." : "Immediately halts all running trading bots."}
              </p>
            </div>
            <button
              id="btn-open-kill-modal"
              onClick={() => setShowKillModal(true)}
              disabled={isActionPending}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5"
            >
              <Power className="w-3.5 h-3.5" />
              <span>Kill Switch</span>
            </button>
          </div>

          {/* Paper Ledger Sandbox Reset */}
          <div className="p-4 rounded-xl bg-[#0B0F17] border border-[#1E293B] flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-slate-200 mb-0.5">Paper Sandbox Ledger</div>
              <p className="text-[11px] text-slate-400">Clear simulated test trades & reset balance to $10,000.00.</p>
            </div>
            <button
              id="btn-open-reset-modal"
              onClick={() => setShowResetModal(true)}
              disabled={isActionPending}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Sandbox</span>
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Arming Live Trading */}
      {showArmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#121824] border border-amber-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4" />
                <span>Arm Live Execution Gate</span>
              </div>
              <button
                id="btn-close-arm-modal"
                onClick={() => setShowArmModal(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Arming live trading will allow automated strategies to execute real orders with connected exchange capital. Ensure your risk parameters and stop-loss limits are configured.
            </p>

            <div className="space-y-2.5 pt-2">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  id="checkbox-user-confirm"
                  checked={userConfirm}
                  onChange={(e) => setUserConfirm(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-500 cursor-pointer"
                />
                <span>I confirm I intend to arm live trading mode.</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  id="checkbox-user-ack-risk"
                  checked={userAckRisk}
                  onChange={(e) => setUserAckRisk(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-500 cursor-pointer"
                />
                <span>I acknowledge the market risks involved with automated execution.</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#1E293B]">
              <button
                id="btn-cancel-arm"
                onClick={() => setShowArmModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-arm"
                onClick={handleArmSubmit}
                disabled={!userConfirm || !userAckRisk || isActionPending}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                {isActionPending ? "Verifying..." : "Confirm & Arm Live"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Kill Switch */}
      {showKillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#121824] border border-red-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
              <div className="flex items-center gap-2 text-red-400 font-bold text-sm uppercase tracking-wider">
                <Power className="w-4 h-4" />
                <span>Emergency Kill Switch</span>
              </div>
              <button
                id="btn-close-kill-modal"
                onClick={() => setShowKillModal(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Activating the Global Kill Switch will write a safety lock file, immediately pause execution across all bots, and halt order generation.
            </p>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#1E293B]">
              <button
                id="btn-cancel-kill"
                onClick={() => setShowKillModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-kill"
                onClick={handleKillSubmit}
                disabled={isActionPending}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                {isActionPending ? "Halting..." : "Confirm Emergency Halt"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Paper Reset */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#121824] border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm uppercase tracking-wider">
                <RotateCcw className="w-4 h-4" />
                <span>Reset Paper Sandbox</span>
              </div>
              <button
                id="btn-close-reset-modal"
                onClick={() => setShowResetModal(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to reset the paper trading sandbox? All simulated trades will be archived and paper balance restored to $10,000.00 capital.
            </p>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#1E293B]">
              <button
                id="btn-cancel-reset"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-reset"
                onClick={handleResetSubmit}
                disabled={isActionPending}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                {isActionPending ? "Resetting..." : "Confirm Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
