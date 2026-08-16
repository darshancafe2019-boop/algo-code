"use client";

import React, { useState } from "react";
import { TradeJournalRecord } from "@/types/trade-journal";
import { ArrowUpDown, ArrowUp, ArrowDown, FlaskConical, ShieldAlert, ShieldCheck } from "lucide-react";

interface Props {
  trades: TradeJournalRecord[];
}

type SortField = "timestamp" | "exit_timestamp" | "entry_price" | "exit_price" | "result_pnl" | "position_size" | "symbol";
type SortOrder = "asc" | "desc";

export function TradeJournalTable({ trades }: Props) {
  const [sortField, setSortField] = useState<SortField>("timestamp");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const sortedTrades = [...trades].sort((a, b) => {
    let valA: any = a[sortField] ?? "";
    let valB: any = b[sortField] ?? "";

    if (sortField === "timestamp" || sortField === "exit_timestamp") {
      valA = new Date(valA || 0).getTime();
      valB = new Date(valB || 0).getTime();
    } else if (typeof valA === "number") {
      valA = valA || 0;
      valB = valB || 0;
    } else {
      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();
    }

    if (valA < valB) return sortOrder === "asc" ? -1 : 1;
    if (valA > valB) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-[#1E293B] shadow-xl">
      <table className="w-full text-left text-xs border-collapse">
        {/* Category Header Row */}
        <thead>
          <tr className="bg-[#090D14] text-[10px] uppercase font-bold tracking-wider text-slate-400 border-b border-[#1E293B]">
            <th colSpan={5} className="p-2 border-r border-[#1E293B] bg-cyan-950/20 text-cyan-400">
              1. Entry Details
            </th>
            <th colSpan={3} className="p-2 border-r border-[#1E293B] bg-purple-950/20 text-purple-400">
              2. Safety & Risk
            </th>
            <th colSpan={4} className="p-2 border-r border-[#1E293B] bg-emerald-950/20 text-emerald-400">
              3. Exit & Realized P&L
            </th>
            <th colSpan={2} className="p-2 border-r border-[#1E293B] bg-blue-950/20 text-blue-400">
              4. Fees & Balance
            </th>
            <th colSpan={3} className="p-2 bg-amber-950/20 text-amber-400">
              5. Observations & Confluence
            </th>
          </tr>

          {/* Sub Header Row */}
          <tr className="bg-[#0B0F17] text-slate-400 border-b border-[#1E293B] font-mono text-[11px]">
            {/* Entry Group */}
            <th className="p-2.5 cursor-pointer hover:text-white" onClick={() => handleSort("timestamp")}>
              <div className="flex items-center gap-1">Entry Time <ArrowUpDown className="h-3 w-3 text-slate-500" /></div>
            </th>
            <th className="p-2.5">Bot</th>
            <th className="p-2.5 cursor-pointer hover:text-white" onClick={() => handleSort("symbol")}>Symbol</th>
            <th className="p-2.5">Side</th>
            <th className="p-2.5 text-right cursor-pointer hover:text-white" onClick={() => handleSort("entry_price")}>Entry Price</th>

            {/* Safety Group */}
            <th className="p-2.5 border-l border-[#1E293B] text-right">Stop Loss</th>
            <th className="p-2.5 text-right">Take Profit</th>
            <th className="p-2.5 text-center">R/R</th>

            {/* Exit Group */}
            <th className="p-2.5 border-l border-[#1E293B] cursor-pointer hover:text-white" onClick={() => handleSort("exit_timestamp")}>Exit Time</th>
            <th className="p-2.5 text-right cursor-pointer hover:text-white" onClick={() => handleSort("exit_price")}>Exit Price</th>
            <th className="p-2.5 text-center">Status</th>
            <th className="p-2.5 text-right cursor-pointer hover:text-white" onClick={() => handleSort("result_pnl")}>Realized P&L</th>

            {/* Balance Group */}
            <th className="p-2.5 border-l border-[#1E293B] text-right">Fees</th>
            <th className="p-2.5 text-right">Net P&L</th>

            {/* Observations Group */}
            <th className="p-2.5 border-l border-[#1E293B]">Strategy</th>
            <th className="p-2.5">Emotion Tag</th>
            <th className="p-2.5">Remarks / Mode</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-[#1A2333] bg-[#121824]">
          {sortedTrades.length === 0 ? (
            <tr>
              <td colSpan={17} className="p-8 text-center text-slate-400 font-mono">
                No trades match the selected search and filters.
              </td>
            </tr>
          ) : (
            sortedTrades.map((t) => {
              const pnl = t.result_pnl || 0;
              const isProfit = pnl > 0;
              const isLoss = pnl < 0;
              const isClosed = (t.status || "").toUpperCase() === "CLOSED";
              const mode = (t.execution_mode || "PAPER").toUpperCase();
              const isTest = (t.emotion_tag || "").includes("test") || (t.remarks || "").includes("test");

              const sl = t.stop_loss ? `$${t.stop_loss.toLocaleString()}` : "N/A";
              const tp = t.take_profit ? `$${t.take_profit.toLocaleString()}` : "N/A";
              const rrRatio =
                t.entry_price && t.stop_loss && t.take_profit
                  ? (Math.abs(t.take_profit - t.entry_price) / Math.abs(t.entry_price - t.stop_loss)).toFixed(1)
                  : "N/A";

              return (
                <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                  {/* Entry Group */}
                  <td className="p-2.5 font-mono text-slate-300 whitespace-nowrap">
                    {t.timestamp ? t.timestamp.replace("T", " ").slice(0, 19) : "N/A"}
                  </td>
                  <td className="p-2.5 font-semibold text-white whitespace-nowrap">
                    {t.bot_instance_name || t.bot_id || "bot-1"}
                  </td>
                  <td className="p-2.5 font-mono font-bold text-cyan-400 whitespace-nowrap">
                    {t.symbol}
                  </td>
                  <td className="p-2.5 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        (t.direction || "").toUpperCase() === "LONG" || (t.direction || "").toUpperCase() === "BUY"
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                          : "bg-red-950 text-red-400 border border-red-800"
                      }`}
                    >
                      {t.direction}
                    </span>
                  </td>
                  <td className="p-2.5 text-right font-mono text-white whitespace-nowrap">
                    ${t.entry_price ? t.entry_price.toLocaleString() : "0.00"}
                  </td>

                  {/* Safety Group */}
                  <td className="p-2.5 border-l border-[#1E293B] text-right font-mono text-amber-400/90 whitespace-nowrap">
                    {sl}
                  </td>
                  <td className="p-2.5 text-right font-mono text-emerald-400/90 whitespace-nowrap">
                    {tp}
                  </td>
                  <td className="p-2.5 text-center font-mono text-slate-300 whitespace-nowrap">
                    {rrRatio !== "N/A" ? `${rrRatio}:1` : "N/A"}
                  </td>

                  {/* Exit Group */}
                  <td className="p-2.5 border-l border-[#1E293B] font-mono text-slate-400 whitespace-nowrap">
                    {isClosed && t.exit_timestamp ? t.exit_timestamp.replace("T", " ").slice(0, 19) : "—"}
                  </td>
                  <td className="p-2.5 text-right font-mono text-slate-200 whitespace-nowrap">
                    {isClosed && t.exit_price ? `$${t.exit_price.toLocaleString()}` : "—"}
                  </td>
                  <td className="p-2.5 text-center whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        isClosed ? "bg-slate-800 text-slate-300 border border-slate-700" : "bg-purple-950 text-purple-300 border border-purple-800 animate-pulse"
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="p-2.5 text-right font-mono font-bold whitespace-nowrap">
                    {isClosed ? (
                      <span className={isProfit ? "text-emerald-400" : isLoss ? "text-red-400" : "text-slate-400"}>
                        {isProfit ? "+$" : isLoss ? "-$" : "$"}{Math.abs(pnl).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>

                  {/* Balance Group */}
                  <td className="p-2.5 border-l border-[#1E293B] text-right font-mono text-slate-400 whitespace-nowrap">
                    ${(t.fees || 0).toFixed(2)}
                  </td>
                  <td className="p-2.5 text-right font-mono font-bold whitespace-nowrap">
                    <span className={pnl - (t.fees || 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
                      ${(pnl - (t.fees || 0)).toFixed(2)}
                    </span>
                  </td>

                  {/* Observations Group */}
                  <td className="p-2.5 border-l border-[#1E293B] font-mono text-slate-300 whitespace-nowrap">
                    {t.strategy || t.config_version || "EMA_MACD_VP"}
                  </td>
                  <td className="p-2.5 whitespace-nowrap">
                    {t.emotion_tag ? (
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono text-[10px]">
                        {t.emotion_tag}
                      </span>
                    ) : (
                      <span className="text-slate-500 font-mono text-[10px]">N/A</span>
                    )}
                  </td>
                  <td className="p-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                          mode === "LIVE"
                            ? "bg-amber-950 text-amber-400 border border-amber-800"
                            : "bg-cyan-950 text-cyan-400 border border-cyan-800"
                        }`}
                      >
                        {mode}
                      </span>

                      {isTest && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 text-[10px]">
                          <FlaskConical className="h-3 w-3" /> Test
                        </span>
                      )}

                      <span className="text-slate-400 text-[11px] truncate max-w-[150px]" title={t.remarks || ""}>
                        {t.remarks || t.exit_reason || "Standard trade flow"}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
