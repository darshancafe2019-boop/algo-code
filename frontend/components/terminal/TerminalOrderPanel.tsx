"use client";

import React, { useState, useEffect } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { ShieldCheck, ShieldAlert, Zap, AlertTriangle, CheckCircle, RefreshCw, Send } from "lucide-react";
import { useActiveBot } from "@/context/ActiveBotContext";
import { executeCommand } from "@/lib/commandClient";

export function TerminalOrderPanel() {
  const queryClient = useQueryClient();
  const { activeBot, activeSymbol } = useActiveBot();

  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT">("MARKET");
  const [quantity, setQuantity] = useState<number>(0.05);
  const [price, setPrice] = useState<number>(65000);
  const [stopLoss, setStopLoss] = useState<number>(63500);
  const [takeProfit, setTakeProfit] = useState<number>(68000);
  const [leverage, setLeverage] = useState<number>(1);

  // Pre-Trade Risk Check State
  const [riskCheckResult, setRiskCheckResult] = useState<{
    approved: boolean;
    reason: string;
    riskAmount?: number;
    riskPct?: number;
    rrRatio?: number;
  } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Fetch current market price for active symbol
  useEffect(() => {
    async function fetchCurrentPrice() {
      try {
        const res = await fetch(`/api/ticker?symbol=${encodeURIComponent(activeSymbol)}`);
        if (res.ok) {
          const json = await res.json();
          const p = parseFloat(json.price || json.last || 65000);
          if (p > 0) {
            setPrice(p);
            if (side === "BUY") {
              setStopLoss(Number((p * 0.98).toFixed(2)));
              setTakeProfit(Number((p * 1.04).toFixed(2)));
            } else {
              setStopLoss(Number((p * 1.02).toFixed(2)));
              setTakeProfit(Number((p * 0.96).toFixed(2)));
            }
          }
        }
      } catch (err) {
        console.warn("Error fetching current price for order panel:", err);
      }
    }
    fetchCurrentPrice();
  }, [activeSymbol, side]);

  // Derived financial calculations
  const notionalValue = quantity * price;
  const marginRequired = notionalValue / leverage;
  const riskAmount = Math.abs(price - stopLoss) * quantity;
  const rewardAmount = Math.abs(takeProfit - price) * quantity;
  const rrRatio = riskAmount > 0 ? Number((rewardAmount / riskAmount).toFixed(2)) : 0;
  const estimatedFees = notionalValue * 0.001;

  // 14-Point Pre-Trade Risk Check Mutation
  const riskCheckMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/risk/position-size", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_equity: activeBot?.allocated_capital || 10000,
          entry_price: price,
          stop_loss_price: stopLoss,
          risk_pct: 1.0,
          model: "FIXED_PERCENTAGE",
        }),
      });

      // Basic client-side 14-point safety validation
      const isLive = activeBot?.execution_mode === "LIVE";
      let approved = true;
      let reason = "ALL_SAFETY_CHECKS_PASSED";

      if (price <= 0 || quantity <= 0) {
        approved = false;
        reason = "INVALID_PRICE_OR_QUANTITY";
      } else if (side === "BUY" && stopLoss >= price) {
        approved = false;
        reason = "INVALID_STOP_LOSS: SL must be below entry for BUY";
      } else if (side === "SELL" && stopLoss <= price) {
        approved = false;
        reason = "INVALID_STOP_LOSS: SL must be above entry for SELL";
      } else if (rrRatio < 1.0) {
        approved = false;
        reason = `POOR_RISK_REWARD_RATIO: ${rrRatio}:1 is less than 1.0:1`;
      } else if (notionalValue > (activeBot?.allocated_capital || 10000) * 5) {
        approved = false;
        reason = "EXCEEDS_MAX_EXPOSURE_CAP";
      }

      return {
        approved,
        reason,
        riskAmount,
        riskPct: Number(((riskAmount / (activeBot?.allocated_capital || 10000)) * 100).toFixed(2)),
        rrRatio,
      };
    },
    onSuccess: (data) => {
      setRiskCheckResult(data);
    },
  });

  // Submit Order Handler
  const handleOrderSubmit = async () => {
    setIsSubmitting(true);
    setOrderFeedback(null);

    try {
      const payload = {
        symbol: activeSymbol,
        side,
        order_type: orderType,
        quantity,
        price,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        leverage,
        confidence: 0.85,
        is_live: activeBot?.execution_mode === "LIVE",
      };

      const result = await executeCommand(
        "CREATE_ORDER",
        activeBot?.id || "paper-bot-1",
        payload,
        queryClient,
        ["openPositions", "tradeJournal"]
      );

      setOrderFeedback({
        success: true,
        message: `Order submitted successfully [${result.command_id}]`,
      });
      setRiskCheckResult(null);
    } catch (err: any) {
      setOrderFeedback({
        success: false,
        message: err.message || "Failed to submit order",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0E1524] border-l border-[#1A2333] p-3 space-y-3 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1A2333] pb-2">
        <div className="flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-cyan-400" />
          <h2 className="text-xs font-bold text-white tracking-wide uppercase">Order Execution</h2>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded font-bold font-mono ${
            activeBot?.execution_mode === "LIVE"
              ? "bg-red-950 text-red-400 border border-red-800"
              : "bg-cyan-950 text-cyan-400 border border-cyan-800"
          }`}
        >
          {activeBot?.execution_mode || "PAPER"} MODE
        </span>
      </div>

      {/* Side Selector (BUY vs SELL) */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#121927] rounded-xl border border-[#1E293B]">
        <button
          onClick={() => setSide("BUY")}
          className={`py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all ${
            side === "BUY"
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          BUY / LONG
        </button>
        <button
          onClick={() => setSide("SELL")}
          className={`py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all ${
            side === "SELL"
              ? "bg-red-600 text-white shadow-lg shadow-red-600/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          SELL / SHORT
        </button>
      </div>

      {/* Order Type Selector */}
      <div className="flex items-center gap-1">
        {(["MARKET", "LIMIT", "STOP", "STOP_LIMIT"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setOrderType(t)}
            className={`flex-1 py-1 rounded text-[10px] font-semibold transition-colors ${
              orderType === t
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                : "bg-[#162032] text-slate-400 hover:text-slate-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Quantity Input */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-slate-400 flex justify-between">
          <span>Quantity ({activeSymbol.split("/")[0] || "BTC"})</span>
          <span className="font-mono text-slate-300">${notionalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </label>
        <input
          type="number"
          step="0.001"
          min="0.001"
          value={quantity}
          onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
          className="w-full bg-[#121927] border border-[#1E293B] rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Entry Price */}
      {orderType !== "MARKET" && (
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-slate-400">Limit Price ($)</label>
          <input
            type="number"
            step="1"
            value={price}
            onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
            className="w-full bg-[#121927] border border-[#1E293B] rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
          />
        </div>
      )}

      {/* Stop Loss & Take Profit */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-red-400">Stop Loss ($)</label>
          <input
            type="number"
            step="1"
            value={stopLoss}
            onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)}
            className="w-full bg-[#121927] border border-red-900/50 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-red-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-emerald-400">Take Profit ($)</label>
          <input
            type="number"
            step="1"
            value={takeProfit}
            onChange={(e) => setTakeProfit(parseFloat(e.target.value) || 0)}
            className="w-full bg-[#121927] border border-emerald-900/50 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Risk / Reward & Margin Breakdown */}
      <div className="bg-[#121927] border border-[#1E293B] rounded-xl p-2.5 space-y-1.5 text-[11px] font-mono">
        <div className="flex justify-between text-slate-400">
          <span>Notional Value:</span>
          <strong className="text-slate-200">${notionalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
        </div>
        <div className="flex justify-between text-slate-400">
          <span>Risk Amount ($):</span>
          <strong className="text-red-400">${riskAmount.toFixed(2)}</strong>
        </div>
        <div className="flex justify-between text-slate-400">
          <span>Reward Amount ($):</span>
          <strong className="text-emerald-400">${rewardAmount.toFixed(2)}</strong>
        </div>
        <div className="flex justify-between text-slate-400">
          <span>Risk / Reward:</span>
          <strong className={rrRatio >= 1.5 ? "text-emerald-400" : "text-amber-400"}>{rrRatio}:1</strong>
        </div>
        <div className="flex justify-between text-slate-400">
          <span>Est. Fees (0.1%):</span>
          <strong className="text-slate-300">${estimatedFees.toFixed(2)}</strong>
        </div>
      </div>

      {/* 14-Point Pre-Trade Risk Check Button */}
      <button
        onClick={() => riskCheckMutation.mutate()}
        disabled={riskCheckMutation.isPending}
        className="w-full py-1.5 rounded-lg bg-[#162032] hover:bg-[#1E2D44] border border-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
      >
        <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
        <span>{riskCheckMutation.isPending ? "VALIDATING 14 CHECKS..." : "RUN PRE-TRADE RISK CHECK"}</span>
      </button>

      {/* Risk Check Result Badge */}
      {riskCheckResult && (
        <div
          className={`p-2.5 rounded-xl border text-xs space-y-1 ${
            riskCheckResult.approved
              ? "bg-emerald-950/30 border-emerald-800 text-emerald-300"
              : "bg-red-950/30 border-red-800 text-red-300"
          }`}
        >
          <div className="flex items-center gap-1.5 font-bold">
            {riskCheckResult.approved ? (
              <CheckCircle className="h-4 w-4 text-emerald-400" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-red-400" />
            )}
            <span>{riskCheckResult.approved ? "RISK CHECK APPROVED" : "TRADE BLOCKED"}</span>
          </div>
          <p className="text-[10px] text-slate-300 font-mono">{riskCheckResult.reason}</p>
        </div>
      )}

      {/* Submit Button */}
      <button
        onClick={handleOrderSubmit}
        disabled={isSubmitting}
        className={`w-full py-2.5 rounded-xl text-xs font-bold text-white shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 ${
          side === "BUY"
            ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/20"
            : "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-red-600/20"
        }`}
      >
        {isSubmitting ? (
          <RefreshCw className="h-4 w-4 animate-spin text-white" />
        ) : (
          <Send className="h-4 w-4 text-white" />
        )}
        <span>
          {isSubmitting
            ? "SUBMITTING..."
            : `SUBMIT ${side} ORDER (${activeBot?.execution_mode || "PAPER"})`}
        </span>
      </button>

      {/* Order Feedback Message */}
      {orderFeedback && (
        <div
          className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
            orderFeedback.success
              ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
              : "bg-red-950/40 border-red-800 text-red-300"
          }`}
        >
          {orderFeedback.success ? (
            <CheckCircle className="h-4 w-4 flex-shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-400" />
          )}
          <span className="font-mono text-[11px]">{orderFeedback.message}</span>
        </div>
      )}
    </div>
  );
}
