"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Search,
  Bot,
  Sliders,
  Shield,
  Activity,
  LineChart,
  BookOpen,
  Globe,
  Bell,
  Terminal,
  FlaskConical,
  Zap,
  Play,
  Square,
  RefreshCw,
  HelpCircle,
  Download,
  Code,
  ShieldAlert,
} from "lucide-react";
import { useActiveBot } from "@/context/ActiveBotContext";
import { executeCommand } from "@/lib/commandClient";
import { useQueryClient } from "@tanstack/react-query";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tabId: string) => void;
  onOpenTutorial: () => void;
}

interface CommandItem {
  id: string;
  category: "NAVIGATION" | "BOT ACTION" | "MARKET SWITCH" | "QUICK TOOL";
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  onNavigateTab,
  onOpenTutorial,
}: CommandPaletteProps) {
  const queryClient = useQueryClient();
  const { activeBot, setActiveSymbol } = useActiveBot();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
      setQuery("");
    }
  }, [isOpen]);

  const allCommands: CommandItem[] = useMemo(
    () => [
      // 1. Navigation Pages
      {
        id: "nav-terminal",
        category: "NAVIGATION",
        title: "Open Trading Terminal",
        subtitle: "Main TradingView-inspired chart, watchlist, and order dock",
        icon: Activity,
        action: () => {
          onNavigateTab("terminal");
          onClose();
        },
      },
      {
        id: "nav-bot-control",
        category: "NAVIGATION",
        title: "Open Bot Control & Instances",
        subtitle: "Multi-bot process controllers and lifecycle manager",
        icon: Bot,
        action: () => {
          onNavigateTab("bot-control");
          onClose();
        },
      },
      {
        id: "nav-strategy-builder",
        category: "NAVIGATION",
        title: "Open Visual Strategy Builder",
        subtitle: "Create and compile IF / AND / OR / THEN visual rules",
        icon: Code,
        action: () => {
          onNavigateTab("strategy-builder");
          onClose();
        },
      },
      {
        id: "nav-indicators",
        category: "NAVIGATION",
        title: "Open Indicator Center",
        subtitle: "Per-bot indicator parameter overrides and profiles",
        icon: Sliders,
        action: () => {
          onNavigateTab("indicators");
          onClose();
        },
      },
      {
        id: "nav-risk",
        category: "NAVIGATION",
        title: "Open Risk Management",
        subtitle: "Position size calculator, drawdown limits, exposure controls",
        icon: Shield,
        action: () => {
          onNavigateTab("risk-management");
          onClose();
        },
      },
      {
        id: "nav-market-universe",
        category: "NAVIGATION",
        title: "Open Market Universe",
        subtitle: "628+ instruments across Crypto, Equities, Forex, Indices",
        icon: Globe,
        action: () => {
          onNavigateTab("market-universe");
          onClose();
        },
      },
      {
        id: "nav-backtesting",
        category: "NAVIGATION",
        title: "Open Backtesting Lab",
        subtitle: "Historical strategy simulation and equity curve analysis",
        icon: FlaskConical,
        action: () => {
          onNavigateTab("backtesting");
          onClose();
        },
      },
      {
        id: "nav-performance",
        category: "NAVIGATION",
        title: "Open Performance Analytics",
        subtitle: "Authoritative trade ledger metrics and win-rate charts",
        icon: LineChart,
        action: () => {
          onNavigateTab("performance");
          onClose();
        },
      },
      {
        id: "nav-trade-journal",
        category: "NAVIGATION",
        title: "Open Trade Journal",
        subtitle: "Complete trade history, filtering, and execution timeline",
        icon: BookOpen,
        action: () => {
          onNavigateTab("trade-journal");
          onClose();
        },
      },
      {
        id: "nav-alerts",
        category: "NAVIGATION",
        title: "Open Alerts & Monitoring",
        subtitle: "Price, indicator, breakout, and system threshold alerts",
        icon: Bell,
        action: () => {
          onNavigateTab("alerts");
          onClose();
        },
      },
      {
        id: "nav-logs",
        category: "NAVIGATION",
        title: "Open Audit Logs & Diagnostics",
        subtitle: "32-field immutable audit events and system health checks",
        icon: Terminal,
        action: () => {
          onNavigateTab("logs");
          onClose();
        },
      },

      // 2. Bot Commands
      {
        id: "cmd-start-bot",
        category: "BOT ACTION",
        title: `Start Bot: ${activeBot?.name || "Active Bot"}`,
        subtitle: "Dispatches START_BOT command to process manager",
        icon: Play,
        action: async () => {
          if (activeBot) {
            await executeCommand("START_BOT", activeBot.id, {}, queryClient);
          }
          onClose();
        },
      },
      {
        id: "cmd-stop-bot",
        category: "BOT ACTION",
        title: `Stop Bot: ${activeBot?.name || "Active Bot"}`,
        subtitle: "Dispatches STOP_BOT command",
        icon: Square,
        action: async () => {
          if (activeBot) {
            await executeCommand("STOP_BOT", activeBot.id, {}, queryClient);
          }
          onClose();
        },
      },
      {
        id: "cmd-activate-kill-switch",
        category: "BOT ACTION",
        title: "⛔ ACTIVATE EMERGENCY KILL SWITCH",
        subtitle: "Halts all running bots and locks execution pipeline",
        icon: ShieldAlert,
        action: async () => {
          if (confirm("Are you sure you want to activate the EMERGENCY KILL SWITCH? All bots will be halted.")) {
            await executeCommand("ACTIVATE_KILL_SWITCH", null, {}, queryClient);
          }
          onClose();
        },
      },
      {
        id: "cmd-sync-market",
        category: "BOT ACTION",
        title: "Sync Market Universe",
        subtitle: "Refreshes live prices across 628+ instruments",
        icon: RefreshCw,
        action: async () => {
          await executeCommand("REFRESH_MARKET_DATA", null, {}, queryClient);
          onClose();
        },
      },

      // 3. Market Switch
      {
        id: "sym-btc",
        category: "MARKET SWITCH",
        title: "Switch Symbol to BTC/USDT",
        subtitle: "Load Bitcoin spot market into Chart & Context",
        icon: Zap,
        action: () => {
          setActiveSymbol("BTC/USDT");
          onClose();
        },
      },
      {
        id: "sym-eth",
        category: "MARKET SWITCH",
        title: "Switch Symbol to ETH/USDT",
        subtitle: "Load Ethereum spot market into Chart & Context",
        icon: Zap,
        action: () => {
          setActiveSymbol("ETH/USDT");
          onClose();
        },
      },
      {
        id: "sym-sol",
        category: "MARKET SWITCH",
        title: "Switch Symbol to SOL/USDT",
        subtitle: "Load Solana spot market into Chart & Context",
        icon: Zap,
        action: () => {
          setActiveSymbol("SOL/USDT");
          onClose();
        },
      },

      // 4. Quick Tools
      {
        id: "tool-tutorial",
        category: "QUICK TOOL",
        title: "Open 17-Step In-App Tutorial",
        subtitle: "Interactive guided walkthrough of the entire trading platform",
        icon: HelpCircle,
        action: () => {
          onClose();
          onOpenTutorial();
        },
      },
      {
        id: "tool-export-csv",
        category: "QUICK TOOL",
        title: "Export Trade Journal to CSV",
        subtitle: "Download authoritative CSV trade ledger records",
        icon: Download,
        action: () => {
          window.open("/api/trades/export", "_blank");
          onClose();
        },
      },
    ],
    [activeBot, onNavigateTab, onOpenTutorial, onClose, queryClient, setActiveSymbol]
  );

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return allCommands;
    return allCommands.filter(
      (c) =>
        c.title.toLowerCase().includes(query.toLowerCase()) ||
        (c.subtitle && c.subtitle.toLowerCase().includes(query.toLowerCase())) ||
        c.category.toLowerCase().includes(query.toLowerCase())
    );
  }, [allCommands, query]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = filteredCommands[selectedIndex];
      if (selected) selected.action();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start justify-center pt-20 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0E1524] border border-[#1E293B] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Header */}
        <div className="p-4 border-b border-[#1A2333] flex items-center gap-3">
          <Search className="h-5 w-5 text-cyan-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command, page, symbol, or shortcut (e.g. BTC, Risk, Start, Scan)..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          <kbd className="hidden sm:inline-block px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono border border-slate-700">
            ESC
          </kbd>
        </div>

        {/* Command Results Feed */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-[#141D2E]">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No matching commands or actions found for &quot;{query}&quot;.
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const Icon = cmd.icon;
              const isSelected = idx === selectedIndex;

              return (
                <div
                  key={cmd.id}
                  onClick={cmd.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`p-3 rounded-xl flex items-center justify-between cursor-pointer transition-all ${
                    isSelected
                      ? "bg-cyan-950/50 border border-cyan-500/40 text-white"
                      : "text-slate-300 hover:bg-[#121927]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        isSelected ? "bg-cyan-600 text-white" : "bg-[#162032] text-slate-400"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold flex items-center gap-2">
                        {cmd.title}
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                          {cmd.category}
                        </span>
                      </div>
                      {cmd.subtitle && (
                        <div className="text-[11px] text-slate-400 mt-0.5">{cmd.subtitle}</div>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <kbd className="text-[10px] text-cyan-300 font-mono font-bold bg-cyan-950 px-2 py-1 rounded border border-cyan-800">
                      ENTER ↵
                    </kbd>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-2.5 bg-[#0A0E17] border-t border-[#1A2333] flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span>Alpha Algo Terminal Pro v2.0</span>
        </div>
      </div>
    </div>
  );
}
