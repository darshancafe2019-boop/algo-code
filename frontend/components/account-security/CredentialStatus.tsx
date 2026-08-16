"use client";

import React, { useState } from "react";
import { Key, Lock, Eye, EyeOff, ShieldCheck, ShieldAlert, Edit3, CheckCircle2, AlertCircle } from "lucide-react";
import { ApiKeysResponse } from "@/types/account-security";

interface CredentialStatusProps {
  apiKeys?: ApiKeysResponse;
  onUpdateCredentials: (apiKey: string, secretKey: string) => Promise<void>;
  isUpdating: boolean;
}

export function CredentialStatus({ apiKeys, onUpdateCredentials, isUpdating }: CredentialStatusProps) {
  const [showModal, setShowModal] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  const [newSecretKey, setNewSecretKey] = useState("");
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const maskedKey = apiKeys?.api_key_masked || "cktG************z3hJ";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmUpdate) return;
    try {
      await onUpdateCredentials(newApiKey, newSecretKey);
      setFeedbackMsg("API credentials updated successfully.");
      setNewApiKey("");
      setNewSecretKey("");
      setShowModal(false);
      setConfirmUpdate(false);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      setFeedbackMsg(err.message || "Failed to update credentials.");
    }
  };

  return (
    <div className="p-6 rounded-2xl bg-[#121824] border border-[#1E293B] shadow-xl flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">API Credentials & Vault</h3>
              <p className="text-xs text-slate-400">Masked exchange credentials and permission scopes</p>
            </div>
          </div>

          <button
            id="btn-open-update-credentials"
            onClick={() => setShowModal(true)}
            className="px-3 py-1.5 bg-[#0B0F17] hover:bg-cyan-950/40 border border-[#1E293B] hover:border-cyan-500/40 rounded-xl text-xs font-semibold text-cyan-300 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Update Key</span>
          </button>
        </div>

        {feedbackMsg && (
          <div className="mb-4 p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/40 text-cyan-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
        )}

        {/* Masked Credentials Display */}
        <div className="space-y-3.5 mb-6">
          <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-[#1E293B]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Exchange API Key</span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                Active & Masked
              </span>
            </div>
            <div className="font-mono text-sm text-slate-200 tracking-wider">
              {maskedKey}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-[#1E293B]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Exchange API Secret</span>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-md">
                Encrypted in Server Config
              </span>
            </div>
            <div className="font-mono text-sm text-slate-400 tracking-widest">
              ••••••••••••••••••••••••••••••••
            </div>
          </div>
        </div>

        {/* API Permissions Audit */}
        <div className="p-4 rounded-xl bg-[#0B0F17]/60 border border-[#1E293B] space-y-2.5">
          <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Credential Permission Scopes
          </div>

          <div className="flex items-center justify-between text-xs py-1 border-b border-[#1E293B]/60">
            <span className="text-slate-400">Read & Market Data</span>
            <span className="text-emerald-400 font-mono font-semibold">ENABLED</span>
          </div>

          <div className="flex items-center justify-between text-xs py-1 border-b border-[#1E293B]/60">
            <span className="text-slate-400">Order Execution & Spot Trading</span>
            <span className="text-emerald-400 font-mono font-semibold">ENABLED (Gate Protected)</span>
          </div>

          <div className="flex items-center justify-between text-xs py-1">
            <span className="text-slate-400">Asset Withdrawals</span>
            <span className="text-red-400 font-mono font-semibold">NOT SUPPORTED / BLOCKED</span>
          </div>
        </div>
      </div>

      {/* Modal for updating credentials */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#121824] border border-cyan-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm uppercase tracking-wider">
                <Lock className="w-4 h-4" />
                <span>Update Exchange Credentials</span>
              </div>
              <button
                id="btn-close-credentials-modal"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Updating API keys will re-initialize the CCXT exchange client. Credentials are transmitted securely to the server configuration and are never logged or stored in browser storage.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                  New API Key
                </label>
                <input
                  id="input-api-key"
                  type="text"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="Enter exchange API key..."
                  className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1E293B] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                  New API Secret
                </label>
                <input
                  id="input-secret-key"
                  type="password"
                  value={newSecretKey}
                  onChange={(e) => setNewSecretKey(e.target.value)}
                  placeholder="Enter exchange API secret..."
                  className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1E293B] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="confirm-update-checkbox"
                  checked={confirmUpdate}
                  onChange={(e) => setConfirmUpdate(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="confirm-update-checkbox" className="text-xs text-slate-300 cursor-pointer">
                  I confirm these credentials are valid testnet/exchange keys.
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1E293B]">
                <button
                  type="button"
                  id="btn-cancel-update-credentials"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-submit-update-credentials"
                  disabled={!confirmUpdate || isUpdating || !newApiKey || !newSecretKey}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  {isUpdating ? "Updating..." : "Save Credentials"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
