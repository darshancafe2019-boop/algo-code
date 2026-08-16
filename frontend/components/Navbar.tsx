"use client";

import React, { useEffect, useState, useRef } from "react";
import { Activity, Bot, LineChart, BookOpen, Globe, Bell, Shield, FlaskConical, Terminal, ArrowUpRight, ArrowDownRight, Zap, RefreshCw, CheckCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface TickerData {
  symbol: string;
  last: number;
  change_pct: number;
  change_val: number;
  high: number;
  low: number;
  volume: number;
}

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function Navbar({ activeTab, setActiveTab }: NavbarProps) {
  const queryClient = useQueryClient();
  const [activateSuccess, setActivateSuccess] = useState(false);

  const [ticker, setTicker] = useState<TickerData>({
    symbol: "BTC/USDT",
    last: 65420.0,
    change_pct: 0.55,
    change_val: 350.0,
    high: 66000.0,
    low: 64500.0,
    volume: 1250.0,
  });

  const [priceFlash, setPriceFlash] = useState<"up" | "down" | null>(null);
  const prevPriceRef = useRef<number>(65420.0);

  // Activate All Bots Mutation
  const activateAllMutation = useMutation({
    mutationFn: async () => {
      // 1. Deactivate Kill Switch if locked
      await fetch("/api/bot/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DEACTIVATE_KILL_SWITCH" }),
      });

      // 2. Start Main Bot Instance
      const res1 = await fetch("/api/bot/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "START" }),
      });

      // 3. Start All Configured Instances
      await fetch("/api/bots/start-all", { method: "POST" });

      return res1.json();
    },
    onSuccess: () => {
      setActivateSuccess(true);
      queryClient.invalidateQueries({ queryKey: ["botsList"] });
      queryClient.invalidateQueries({ queryKey: ["botsSummary"] });
      queryClient.invalidateQueries({ queryKey: ["systemHealth"] });
      setTimeout(() => setActivateSuccess(false), 4000);
    },
  });

  // SSE + Polling Fallback Effect
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let fallbackInterval: NodeJS.Timeout | null = null;

    const handleNewPrice = (newPrice: number, data: any) => {
      if (prevPriceRef.current !== newPrice) {
        if (newPrice > prevPriceRef.current) {
          setPriceFlash("up");
        } else if (newPrice < prevPriceRef.current) {
          setPriceFlash("down");
        }
        prevPriceRef.current = newPrice;
        setTimeout(() => setPriceFlash(null), 1000);
      }

      setTicker({
        symbol: data.symbol || "BTC/USDT",
        last: newPrice,
        change_pct: data.change_pct || 0,
        change_val: data.change_val || 0,
        high: data.high || newPrice * 1.02,
        low: data.low || newPrice * 0.98,
        volume: data.volume || 1000,
      });
    };

    try {
      eventSource = new EventSource("/api/stream/ticker");

      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          const price = parseFloat(data.price || data.last);
          if (!isNaN(price) && price > 0) {
            handleNewPrice(price, data);
          }
        } catch (err) {
          console.warn("SSE JSON Parse Error:", err);
        }
      };

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }

        if (!fallbackInterval) {
          fallbackInterval = setInterval(async () => {
            try {
              const res = await fetch("/api/ticker?symbol=BTC/USDT");
              if (res.ok) {
                const data = await res.json();
                const price = parseFloat(data.price || data.last || 65420.0);
                handleNewPrice(price, data);
              }
            } catch (err) {
              console.warn("Ticker polling fallback error:", err);
            }
          }, 3000);
        }
      };
    } catch (e) {
      console.warn("SSE connection error:", e);
    }

    return () => {
      if (eventSource) eventSource.close();
      if (fallbackInterval) clearInterval(fallbackInterval);
    };
  }, []);

  const navItems = [
    { id: "bot-control", label: "🤖 Bot Control & Instances", icon: Bot },
    { id: "performance", label: "📈 Performance Analytics", icon: LineChart },
    { id: "trade-journal", label: "📘 Trade Journal", icon: BookOpen },
    { id: "market-universe", label: "🌐 Market Universe", icon: Globe },
    { id: "account-security", label: "🔒 Account & Security", icon: Shield },
    { id: "indicators", label: "📊 Indicators", icon: Activity },
    { id: "risk-management", label: "🛡️ Risk Management", icon: Shield },
    { id: "backtesting", label: "🧪 Backtesting Lab", icon: FlaskConical },
    { id: "alerts", label: "🔔 Alerts & Monitoring", icon: Bell },
    { id: "logs", label: "📜 Audit Logs & Debug", icon: Terminal },
  ];

  const isPositive = ticker.change_pct >= 0;

  return (
    <header className="w-full bg-[#0B0F17] border-b border-[#1E293B]">
      {/* Top Header Row */}
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-4 border-b border-[#1A2333]">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
              ALPHA ALGO TERMINAL
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                PRO 2.0
              </span>
            </h1>
          </div>
        </div>

        {/* Center Live Ticker Bar */}
        <div className="flex items-center gap-4 bg-[#121824] px-4 py-1.5 rounded-xl border border-[#1E293B]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-300">{ticker.symbol}</span>
            <span
              className={`text-sm font-mono font-bold transition-colors duration-300 ${
                priceFlash === "up"
                  ? "text-emerald-400 bg-emerald-950/80 px-1.5 rounded"
                  : priceFlash === "down"
                  ? "text-red-400 bg-red-950/80 px-1.5 rounded"
                  : "text-white"
              }`}
            >
              ${ticker.last.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div
            className={`flex items-center gap-0.5 text-xs font-semibold ${
              isPositive ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {isPositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            <span>
              {isPositive ? "+" : ""}
              {ticker.change_pct.toFixed(2)}% (${ticker.change_val.toFixed(2)})
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-3 text-[11px] text-slate-400 border-l border-slate-800 pl-3">
            <span>24h High: <strong className="text-slate-200">${ticker.high.toLocaleString()}</strong></span>
            <span>24h Low: <strong className="text-slate-200">${ticker.low.toLocaleString()}</strong></span>
          </div>
        </div>

        {/* Right Action: Activate All Command Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => activateAllMutation.mutate()}
            disabled={activateAllMutation.isPending}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-lg transition-all ${
              activateSuccess
                ? "bg-emerald-600 text-white shadow-emerald-600/30"
                : "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-emerald-500/25 active:scale-95"
            } disabled:opacity-50`}
          >
            {activateAllMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin text-white" />
            ) : activateSuccess ? (
              <CheckCircle className="h-4 w-4 text-white" />
            ) : (
              <Zap className="h-4 w-4 text-amber-300 fill-amber-300" />
            )}
            <span>
              {activateAllMutation.isPending
                ? "ACTIVATING BOTS..."
                : activateSuccess
                ? "ALL BOTS ACTIVATED!"
                : "⚡ ACTIVATE ALL BOTS"}
            </span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <nav className="px-4 flex items-center gap-1 overflow-x-auto scrollbar-none py-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`nav-tab-${item.id}`}
              data-tab={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                isActive
                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
}
