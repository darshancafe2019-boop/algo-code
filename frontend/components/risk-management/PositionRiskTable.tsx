"use client";

import React from "react";
import { Shield, ArrowUpRight, ArrowDownRight, Database } from "lucide-react";
import { RiskPosition } from "@/types/risk";

interface PositionRiskTableProps {
  positions: RiskPosition[];
}

export function PositionRiskTable({ positions }: PositionRiskTableProps) {
  return (
    <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Active Position Risk & Margin Ledger
          </h3>
        </div>
        <span className="text-xs font-mono text-slate-400">
          {positions.length} Open Position{positions.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="overflow-x-auto">
        {positions.length > 0 ? (
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#0E1524] text-slate-400 uppercase text-[10px] border-b border-[#1E293B]">
              <tr>
                <th className="py-2.5 px-3">Symbol / Asset</th>
                <th className="py-2.5 px-3">Bot Instance</th>
                <th className="py-2.5 px-3">Side</th>
                <th className="py-2.5 px-3">Quantity</th>
                <th className="py-2.5 px-3">Entry Price</th>
                <th className="py-2.5 px-3">Stop Loss</th>
                <th className="py-2.5 px-3">Notional ($)</th>
                <th className="py-2.5 px-3">Margin ($)</th>
                <th className="py-2.5 px-3">Risk ($)</th>
                <th className="py-2.5 px-3">Unrealized P/L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A2333]">
              {positions.map((p) => {
                const isLong = p.direction === "LONG";
                const isPnlPositive = p.unrealized_pnl >= 0;
                return (
                  <tr key={p.id} className="hover:bg-[#1A2333]/40 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-white flex items-center gap-1.5">
                      <span>{p.symbol}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-normal">
                        {p.asset_class}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-cyan-400">{p.bot_id}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          isLong
                            ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800"
                            : "bg-red-950/80 text-red-400 border border-red-800"
                        }`}
                      >
                        {isLong ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {p.direction} {p.leverage > 1 ? `${p.leverage}x` : ""}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-200">{p.quantity}</td>
                    <td className="py-2.5 px-3 text-slate-200">${p.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-amber-400">${p.stop_loss.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 font-bold text-white">${p.position_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-cyan-400">${p.margin_used.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-red-400 font-bold">${p.risk_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3">
                      <span className={`font-bold ${isPnlPositive ? "text-emerald-400" : "text-red-400"}`}>
                        {isPnlPositive ? "+" : ""}${p.unrealized_pnl.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-10 text-xs text-slate-500 font-mono">
            No active open trading positions in portfolio. Zero exposure at risk.
          </div>
        )}
      </div>
    </div>
  );
}
