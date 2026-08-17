"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers, CheckCircle, RefreshCw, XCircle, ArrowUpRight, ArrowDownRight, Edit3, ShieldAlert, History, Activity } from "lucide-react";
import { executeCommand } from "@/lib/commandClient";

export interface PositionItem {
  trade_id: number;
  bot_id: string;
  symbol: string;
  side: "BUY" | "SELL" | "LONG" | "SHORT";
  entry_price: number;
  current_price: number;
  quantity: number;
  stop_loss: number;
  take_profit: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  strategy?: string;
  entry_time?: string;
}

export function TerminalPositionsPanel() {
  const queryClient = useQueryClient();
  const [activeBottomTab, setActiveBottomTab] = useState<"positions" | "orders" | "history" | "logs">("positions");
  const [squaringOffId, setSquaringOffId] = useState<number | null>(null);

  // Fetch Open Positions
  const { data: positions, isLoading: isLoadingPositions, refetch: refetchPositions } = useQuery<PositionItem[]>({
    queryKey: ["openPositions"],
    queryFn: async () => {
      const res = await fetch("/api/trades?status=OPEN&limit=50");
      if (!res.ok) throw new Error("Failed to fetch open positions");
      const json = await res.json();
      const trades = (json.trades || json.data || []) as any[];

      return trades.map((t) => {
        const side = (t.trade_type || t.side || "BUY").toUpperCase();
        const entry = parseFloat(t.entry_price || t.average_entry_price || 64000);
        const current = parseFloat(t.current_price || t.close_price || entry * 1.01);
        const qty = parseFloat(t.quantity || t.requested_quantity || 0.1);
        const pnl = side.includes("BUY") || side.includes("LONG")
          ? (current - entry) * qty
          : (entry - current) * qty;
        const pnlPct = entry > 0 ? (pnl / (entry * qty)) * 100 : 0;

        return {
          trade_id: t.trade_id || t.id,
          bot_id: t.bot_instance_id || t.bot_id || "bot-1",
          symbol: t.symbol || "BTC/USDT",
          side: side as any,
          entry_price: entry,
          current_price: current,
          quantity: qty,
          stop_loss: parseFloat(t.stop_loss || entry * 0.98),
          take_profit: parseFloat(t.take_profit || entry * 1.04),
          unrealized_pnl: pnl,
          unrealized_pnl_pct: pnlPct,
          strategy: t.strategy_name || t.strategy || "EMA_MACD_VP",
          entry_time: t.entry_time || t.created_at,
        };
      });
    },
    refetchInterval: 5000,
  });

  // Fetch Active Orders
  const { data: activeOrders } = useQuery({
    queryKey: ["activeOrders"],
    queryFn: async () => {
      const res = await fetch("/api/trades?status=OPEN&limit=20");
      if (!res.ok) return [];
      const json = await res.json();
      return (json.trades || json.data || []) as any[];
    },
    refetchInterval: 5000,
  });

  // Fetch Closed Trades History
  const { data: closedTrades } = useQuery({
    queryKey: ["closedTrades"],
    queryFn: async () => {
      const res = await fetch("/api/trades?status=CLOSED&limit=20");
      if (!res.ok) return [];
      const json = await res.json();
      return (json.trades || json.data || []) as any[];
    },
    refetchInterval: 10000,
  });

  // Fetch Decision Logs
  const { data: decisionLogs } = useQuery({
    queryKey: ["decisionLogsFeed"],
    queryFn: async () => {
      const res = await fetch("/api/bots/events?limit=25");
      if (!res.ok) return [];
      const json = await res.json();
      return (json.events || json.data || []) as any[];
    },
    refetchInterval: 4000,
  });

  // Square Off Mutation
  const squareOffMutation = useMutation({
    mutationFn: async (tradeId: number) => {
      setSquaringOffId(tradeId);
      return await executeCommand(
        "SQUARE_OFF_POSITION",
        null,
        { trade_id: tradeId, reason: "MANUAL_SQUARE_OFF" },
        queryClient,
        ["openPositions", "closedTrades", "tradeJournal"]
      );
    },
    onSettled: () => {
      setSquaringOffId(null);
    },
  });

  const posList = positions || [];

  return (
    <div className="flex flex-col h-full bg-[#0E1524] border-t border-[#1A2333]">
      {/* Dock Tabs Header */}
      <div className="flex items-center justify-between px-3 border-b border-[#1A2333] bg-[#0A0E17]">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveBottomTab("positions")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all ${
              activeBottomTab === "positions"
                ? "border-cyan-400 text-cyan-400 bg-cyan-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Open Positions ({posList.length})</span>
          </button>

          <button
            onClick={() => setActiveBottomTab("orders")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all ${
              activeBottomTab === "orders"
                ? "border-cyan-400 text-cyan-400 bg-cyan-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Active Orders ({activeOrders?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveBottomTab("history")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all ${
              activeBottomTab === "history"
                ? "border-cyan-400 text-cyan-400 bg-cyan-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            <span>Trade Ledger ({closedTrades?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveBottomTab("logs")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all ${
              activeBottomTab === "logs"
                ? "border-cyan-400 text-cyan-400 bg-cyan-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Bot Signals & Logs</span>
          </button>
        </div>

        <button
          onClick={() => {
            refetchPositions();
            queryClient.invalidateQueries({ queryKey: ["activeOrders"] });
            queryClient.invalidateQueries({ queryKey: ["closedTrades"] });
          }}
          className="p-1 rounded text-slate-400 hover:text-slate-200"
          title="Refresh All Docks"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Dock Content Body */}
      <div className="flex-1 overflow-auto p-2">
        {/* 1. Open Positions Tab */}
        {activeBottomTab === "positions" && (
          <div className="w-full overflow-x-auto">
            {isLoadingPositions ? (
              <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-cyan-400" />
                Loading Positions...
              </div>
            ) : posList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No open positions currently active. Ready for new signal executions.
              </div>
            ) : (
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#1A2333] text-slate-400 text-[11px]">
                    <th className="pb-2 font-medium">Symbol</th>
                    <th className="pb-2 font-medium">Side</th>
                    <th className="pb-2 font-medium">Quantity</th>
                    <th className="pb-2 font-medium">Entry Price</th>
                    <th className="pb-2 font-medium">Current Price</th>
                    <th className="pb-2 font-medium">Stop Loss</th>
                    <th className="pb-2 font-medium">Take Profit</th>
                    <th className="pb-2 font-medium">Unrealized P&L</th>
                    <th className="pb-2 font-medium">Strategy</th>
                    <th className="pb-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#162032]">
                  {posList.map((pos) => {
                    const isLong = pos.side.includes("BUY") || pos.side.includes("LONG");
                    const isPos = pos.unrealized_pnl >= 0;

                    return (
                      <tr key={pos.trade_id} className="hover:bg-[#131D2E] transition-colors">
                        <td className="py-2.5 font-bold text-white">{pos.symbol}</td>
                        <td className="py-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isLong
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                : "bg-red-950 text-red-400 border border-red-800"
                            }`}
                          >
                            {isLong ? "LONG" : "SHORT"}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-200">{pos.quantity}</td>
                        <td className="py-2.5 text-slate-300">${pos.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 text-slate-300">${pos.current_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 text-red-400">${pos.stop_loss.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 text-emerald-400">${pos.take_profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5">
                          <div className={`flex items-center gap-1 font-bold ${isPos ? "text-emerald-400" : "text-red-400"}`}>
                            {isPos ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                            <span>${pos.unrealized_pnl.toFixed(2)} ({isPos ? "+" : ""}{pos.unrealized_pnl_pct.toFixed(2)}%)</span>
                          </div>
                        </td>
                        <td className="py-2.5 text-slate-400 text-[11px]">{pos.strategy}</td>
                        <td className="py-2.5 text-right">
                          <button
                            onClick={() => squareOffMutation.mutate(pos.trade_id)}
                            disabled={squaringOffId === pos.trade_id}
                            className="px-2.5 py-1 rounded bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 text-[10px] font-bold transition-all disabled:opacity-50"
                          >
                            {squaringOffId === pos.trade_id ? "CLOSING..." : "SQUARE OFF"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* 2. Active Orders Tab */}
        {activeBottomTab === "orders" && (
          <div className="w-full overflow-x-auto">
            {(!activeOrders || activeOrders.length === 0) ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No active pending orders in broker queue.
              </div>
            ) : (
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#1A2333] text-slate-400 text-[11px]">
                    <th className="pb-2 font-medium">Order ID</th>
                    <th className="pb-2 font-medium">Symbol</th>
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium">Side</th>
                    <th className="pb-2 font-medium">Quantity</th>
                    <th className="pb-2 font-medium">Price</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#162032]">
                  {activeOrders.map((ord: any) => (
                    <tr key={ord.id || ord.order_id} className="hover:bg-[#131D2E]">
                      <td className="py-2 text-cyan-400">{ord.order_id || ord.id}</td>
                      <td className="py-2 font-bold text-white">{ord.symbol}</td>
                      <td className="py-2 text-slate-300">{ord.order_type || "LIMIT"}</td>
                      <td className="py-2">
                        <span className="text-emerald-400 font-bold">{ord.side || "BUY"}</span>
                      </td>
                      <td className="py-2 text-slate-200">{ord.quantity}</td>
                      <td className="py-2 text-slate-300">${ord.entry_price || ord.price}</td>
                      <td className="py-2">
                        <span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 text-[10px]">
                          {ord.status || "PENDING"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* 3. Trade Ledger History Tab */}
        {activeBottomTab === "history" && (
          <div className="w-full overflow-x-auto">
            {(!closedTrades || closedTrades.length === 0) ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No closed trades recorded in ledger.
              </div>
            ) : (
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#1A2333] text-slate-400 text-[11px]">
                    <th className="pb-2 font-medium">Trade ID</th>
                    <th className="pb-2 font-medium">Symbol</th>
                    <th className="pb-2 font-medium">Side</th>
                    <th className="pb-2 font-medium">Entry</th>
                    <th className="pb-2 font-medium">Exit</th>
                    <th className="pb-2 font-medium">Net P&L</th>
                    <th className="pb-2 font-medium">Exit Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#162032]">
                  {closedTrades.map((tr: any) => {
                    const pnl = parseFloat(tr.net_pnl || tr.pnl || 0);
                    const isWin = pnl >= 0;

                    return (
                      <tr key={tr.id || tr.trade_id} className="hover:bg-[#131D2E]">
                        <td className="py-2 text-slate-400">{tr.trade_id || tr.id}</td>
                        <td className="py-2 font-bold text-white">{tr.symbol}</td>
                        <td className="py-2">{tr.side || tr.trade_type}</td>
                        <td className="py-2 text-slate-300">${tr.entry_price}</td>
                        <td className="py-2 text-slate-300">${tr.exit_price}</td>
                        <td className={`py-2 font-bold ${isWin ? "text-emerald-400" : "text-red-400"}`}>
                          ${pnl.toFixed(2)}
                        </td>
                        <td className="py-2 text-slate-400 text-[11px]">{tr.exit_reason || "TAKE_PROFIT"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* 4. Real-Time Signals & Logs Tab */}
        {activeBottomTab === "logs" && (
          <div className="space-y-1 font-mono text-[11px]">
            {(!decisionLogs || decisionLogs.length === 0) ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No recent bot decision logs.
              </div>
            ) : (
              decisionLogs.map((log: any, idx: number) => (
                <div
                  key={idx}
                  className="px-2.5 py-1.5 rounded bg-[#121927] border border-[#1E293B] flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-[10px]">{log.timestamp_utc?.slice(11, 19) || "NOW"}</span>
                    <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 text-[10px] font-bold">
                      {log.event_type}
                    </span>
                    <span className="text-slate-200">{log.message}</span>
                  </div>
                  <span className="text-slate-500 text-[10px]">{log.bot_instance_id}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
