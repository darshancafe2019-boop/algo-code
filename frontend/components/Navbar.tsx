"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  Activity,
  Bot,
  LineChart,
  BookOpen,
  Globe,
  Bell,
  Shield,
  FlaskConical,
  Terminal,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  RefreshCw,
  CheckCircle,
  HelpCircle,
  Search,
  Code,
  ShieldAlert,
  Sliders,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { executeCommand } from "@/lib/commandClient";
import { useActiveBot } from "@/context/ActiveBotContext";

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
  onOpenTutorial?: () => void;
  onOpenCommandPalette?: () => void;
}

export function Navbar({
  activeTab,
  setActiveTab,
  onOpenTutorial,
  onOpenCommandPalette,
}: NavbarProps) {
  const queryClient = useQueryClient();
  const { activeSymbol } = useActiveBot();
  const [activateSuccess, setActivateSuccess] = useState(false);
  const [killSwitchActive, setKillSwitchActive] = useState(false);

  const [ticker, setTicker] = useState<TickerData>({
    symbol: activeSymbol || "BTC/USDT",
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
      return await executeCommand("START_ALL_BOTS", null, {}, queryClient);
    },
    onSuccess: () => {
      setActivateSuccess(true);
      setTimeout(() => setActivateSuccess(false), 4000);
    },
  });

  // Emergency Kill Switch Mutation
  const killSwitchMutation = useMutation({
    mutationFn: async () => {
      if (killSwitchActive) {
        const res = await executeCommand("DEACTIVATE_KILL_SWITCH", null, {}, queryClient);
        setKillSwitchActive(false);
        return res;
      } else {
        if (confirm("EMERGENCY KILL SWITCH: Are you sure? All running bots will be immediately stopped.")) {
          const res = await executeCommand("ACTIVATE_KILL_SWITCH", null, {}, queryClient);
          setKillSwitchActive(true);
          return res;
        }
      }
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
        symbol: data.symbol || activeSymbol || "BTC/USDT",
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
              const res = await fetch(`/api/ticker?symbol=${encodeURIComponent(activeSymbol || "BTC/USDT")}`);
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
  }, [activeSymbol]);

  const navItems = [
    { id: "terminal", label: "🖥️ Trading Terminal", icon: Activity },
    { id: "bot-control", label: "🤖 Bot Control & Instances", icon: Bot },
    { id: "strategy-builder", label: "🛠️ Strategy Builder", icon: Code },
    { id: "indicators", label: "📊 Indicator Center", icon: Sliders },
    { id: "risk-management", label: "🛡️ Risk Management", icon: Shield },
    { id: "market-universe", label: "🌐 Market Universe", icon: Globe },
    { id: "backtesting", label: "🧪 Backtesting Lab", icon: FlaskConical },
    { id: "performance", label: "📈 Performance Analytics", icon: LineChart },
    { id: "trade-journal", label: "📘 Trade Journal", icon: BookOpen },
    { id: "alerts", label: "🔔 Alerts & Monitoring", icon: Bell },
    { id: "logs", label: "📜 Audit Logs & Debug", icon: Terminal },
    { id: "account-security", label: "🔒 Account & Security", icon: Shield },
  ];

  const isPositive = ticker.change_pct >= 0;

  return (
    <header className="w-full bg-[#0B0F17] border-b border-[#1E293B] sticky top-0 z-40 shadow-xl">
      {/* Top Header Strip */}
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-[#1A2333]">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-white tracking-wide flex items-center gap-2">
              ALPHA ALGO TERMINAL
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono">
                PRO 2.0
              </span>
            </h1>
          </div>
        </div>

        {/* Center Real-Time Market Ticker */}
        <div className="flex items-center gap-3 bg-[#121824] px-3.5 py-1 rounded-xl border border-[#1E293B]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-300">{ticker.symbol}</span>
            <span
              className={`text-xs sm:text-sm font-mono font-bold transition-colors duration-300 ${
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
              {ticker.change_pct.toFixed(2)}%
            </span>
          </div>

          <div className="hidden xl:flex items-center gap-3 text-[11px] text-slate-400 border-l border-slate-800 pl-3">
            <span>24h H: <strong className="text-slate-200">${ticker.high.toLocaleString()}</strong></span>
            <span>24h L: <strong className="text-slate-200">${ticker.low.toLocaleString()}</strong></span>
          </div>
        </div>

        {/* Right Top Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Quick Command Palette Button */}
          <button
            onClick={() => onOpenCommandPalette?.()}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#121824] hover:bg-[#1E293B] border border-[#1E293B] text-slate-300 hover:text-white text-xs font-medium transition-colors"
            title="Open Quick Command Palette (Ctrl+K)"
          >
            <Search className="h-3.5 w-3.5 text-cyan-400" />
            <span>Command</span>
            <kbd className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
              Ctrl+K
            </kbd>
          </button>

          {/* Guided Tutorial Button */}
          <button
            onClick={() => onOpenTutorial?.()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#121824] hover:bg-[#1E293B] border border-[#1E293B] text-cyan-300 hover:text-cyan-200 text-xs font-bold transition-colors"
            title="17-Step In-App Tutorial Walkthrough"
          >
            <HelpCircle className="h-3.5 w-3.5 text-cyan-400" />
            <span className="hidden md:inline">How to Use</span>
          </button>

          {/* Activate All Bots Button */}
          <button
            onClick={() => activateAllMutation.mutate()}
            disabled={activateAllMutation.isPending}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs shadow-lg transition-all ${
              activateSuccess
                ? "bg-emerald-600 text-white shadow-emerald-600/30"
                : "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-emerald-500/25 active:scale-95"
            } disabled:opacity-50`}
          >
            {activateAllMutation.isPending ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-white" />
            ) : activateSuccess ? (
              <CheckCircle className="h-3.5 w-3.5 text-white" />
            ) : (
              <Zap className="h-3.5 w-3.5 text-amber-300 fill-amber-300" />
            )}
            <span className="hidden sm:inline">
              {activateAllMutation.isPending
                ? "ACTIVATING..."
                : activateSuccess
                ? "ALL ACTIVATED!"
                : "ACTIVATE ALL"}
            </span>
          </button>

          {/* Emergency Kill Switch Button */}
          <button
            onClick={() => killSwitchMutation.mutate()}
            disabled={killSwitchMutation.isPending}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold shadow-lg flex items-center gap-1.5 transition-all ${
              killSwitchActive
                ? "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30"
                : "bg-red-600/90 hover:bg-red-600 text-white shadow-red-600/30 active:scale-95"
            }`}
            title="Emergency Kill Switch - Stops all bots and locks execution"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            <span className="hidden md:inline">
              {killSwitchActive ? "UNLOCK KILL SWITCH" : "KILL SWITCH"}
            </span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <nav className="px-4 flex items-center gap-1 overflow-x-auto scrollbar-none py-1 bg-[#0A0E17]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`nav-tab-${item.id}`}
              data-tab={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                isActive
                  ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/40 shadow-sm font-bold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
}
