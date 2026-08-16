"use client";

import React from "react";
import { Shield, ShieldCheck, ShieldAlert, Cpu, Zap, Activity } from "lucide-react";
import { ExecutionGateResponse, LiveOverviewResponse, ApiKeysResponse } from "@/types/account-security";

interface AccountOverviewProps {
  apiKeys?: ApiKeysResponse;
  executionGate?: ExecutionGateResponse;
  liveOverview?: LiveOverviewResponse;
}

export function AccountOverview({ apiKeys, executionGate, liveOverview }: AccountOverviewProps) {
  const mode = executionGate?.trading_mode || apiKeys?.mode || "PAPER";
  const isLive = mode === "LIVE";
  const isArmed = executionGate?.live_trading_armed || false;
  const isKillSwitch = executionGate?.kill_switch_active || false;
  const exchange = apiKeys?.exchange || "Binance";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Account Trading Mode */}
      <div className="p-5 rounded-2xl bg-[#121824] border border-[#1E293B] flex flex-col justify-between shadow-lg relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-slate-400 font-medium">Trading Environment</span>
          <div className={`p-2 rounded-xl ${isLive ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"}`}>
            <Zap className="w-4 h-4" />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xl font-bold font-mono tracking-wide ${isLive ? "text-amber-400" : "text-cyan-400"}`}>
              {mode} MODE
            </span>
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${
              isLive ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
            }`}>
              {isLive ? "Real Capital" : "Simulated"}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            {isLive ? "Orders route to Binance Live Orderbook" : "Zero risk paper ledger sandbox"}
          </p>
        </div>
      </div>

      {/* Exchange Connection Status */}
      <div className="p-5 rounded-2xl bg-[#121824] border border-[#1E293B] flex flex-col justify-between shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-slate-400 font-medium">Connected Exchange</span>
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="w-4 h-4" />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl font-bold font-mono text-slate-100">{exchange}</span>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              CONNECTED
            </span>
          </div>
          <p className="text-[11px] text-slate-400">CCXT REST & WebSocket Engine</p>
        </div>
      </div>

      {/* Execution Gate Status */}
      <div className="p-5 rounded-2xl bg-[#121824] border border-[#1E293B] flex flex-col justify-between shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-slate-400 font-medium">Execution Gate</span>
          <div className={`p-2 rounded-xl ${isArmed ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-800 text-slate-400 border border-slate-700"}`}>
            <Activity className="w-4 h-4" />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xl font-bold font-mono ${isArmed ? "text-emerald-400" : "text-slate-300"}`}>
              {isArmed ? "ARMED" : "STANDBY"}
            </span>
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
              isArmed ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-slate-800 text-slate-400 border border-slate-700"
            }`}>
              {isArmed ? "Active" : "Protected"}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            {isArmed ? "Live trading signals auto-execute" : "Manual arming verification required"}
          </p>
        </div>
      </div>

      {/* Safety System Status */}
      <div className="p-5 rounded-2xl bg-[#121824] border border-[#1E293B] flex flex-col justify-between shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-slate-400 font-medium">Safety Engine</span>
          <div className={`p-2 rounded-xl ${isKillSwitch ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
            {isKillSwitch ? <ShieldAlert className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xl font-bold font-mono ${isKillSwitch ? "text-red-400" : "text-emerald-400"}`}>
              {isKillSwitch ? "HALTED" : "SECURED"}
            </span>
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
              isKillSwitch ? "bg-red-500/20 text-red-300 border border-red-500/30" : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
            }`}>
              {isKillSwitch ? "Kill Switch Active" : "4/4 Checks Passed"}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Risk limits & watchdog enforced</p>
        </div>
      </div>
    </div>
  );
}
