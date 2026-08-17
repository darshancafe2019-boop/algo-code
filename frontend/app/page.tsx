"use client";

import React, { useState } from "react";
import { ActiveBotProvider } from "@/context/ActiveBotContext";
import { GlobalHealthBar } from "@/components/GlobalHealthBar";
import { Navbar } from "@/components/Navbar";
import { TradingTerminal } from "@/components/terminal/TradingTerminal";
import { BotControlTab } from "@/components/bot-control/BotControlTab";
import { StrategyBuilder } from "@/components/strategy/StrategyBuilder";
import { IndicatorCenter } from "@/components/indicators/IndicatorCenter";
import { PerformanceAnalytics } from "@/components/analytics/PerformanceAnalytics";
import { TradeJournal } from "@/components/trade-journal/TradeJournal";
import { MarketUniverse } from "@/components/market-universe/MarketUniverse";
import { AlertsMonitoring } from "@/components/alerts/AlertsMonitoring";
import { AccountSecurity } from "@/components/account-security/AccountSecurity";
import { RiskManagement } from "@/components/risk-management/RiskManagement";
import { BacktestingLab } from "@/components/backtesting/BacktestingLab";
import { LogsDebugging } from "@/components/logs/LogsDebugging";
import { CommandPalette } from "@/components/common/CommandPalette";
import { TutorialModal } from "@/components/common/TutorialModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

function MainApp() {
  const [activeTab, setActiveTab] = useState<string>("terminal");
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);

  // Global Keyboard Shortcuts
  useKeyboardShortcuts({
    onOpenCommandPalette: () => setIsCommandPaletteOpen(true),
    onOpenAlertModal: () => setActiveTab("alerts"),
  });

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col font-sans">
      {/* Global Health Bar */}
      <ErrorBoundary title="Global System Health Bar Failed">
        <GlobalHealthBar />
      </ErrorBoundary>

      {/* Main Header & Navigation Bar */}
      <ErrorBoundary title="Navigation Bar Failed">
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenTutorial={() => setIsTutorialOpen(true)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        />
      </ErrorBoundary>

      {/* Active Tab View Body */}
      <main className="flex-1 w-full max-w-[1700px] mx-auto p-3 sm:p-5">
        {/* 1. Flagship Trading Terminal */}
        {activeTab === "terminal" && (
          <ErrorBoundary title="Trading Terminal Failed">
            <TradingTerminal />
          </ErrorBoundary>
        )}

        {/* 2. Bot Control & Instances */}
        {activeTab === "bot-control" && (
          <ErrorBoundary title="Bot Control & Instances Tab Failed">
            <BotControlTab />
          </ErrorBoundary>
        )}

        {/* 3. Visual Strategy Builder */}
        {activeTab === "strategy-builder" && (
          <ErrorBoundary title="Visual Strategy Builder Failed">
            <StrategyBuilder />
          </ErrorBoundary>
        )}

        {/* 4. Indicator Center */}
        {activeTab === "indicators" && (
          <ErrorBoundary title="Indicator Center Failed">
            <IndicatorCenter />
          </ErrorBoundary>
        )}

        {/* 5. Risk Management */}
        {activeTab === "risk-management" && (
          <ErrorBoundary title="Risk Management Tab Failed">
            <RiskManagement />
          </ErrorBoundary>
        )}

        {/* 6. Market Universe */}
        {activeTab === "market-universe" && (
          <ErrorBoundary title="Market Universe Tab Failed">
            <MarketUniverse />
          </ErrorBoundary>
        )}

        {/* 7. Backtesting Lab */}
        {activeTab === "backtesting" && (
          <ErrorBoundary title="Backtesting Lab Tab Failed">
            <BacktestingLab />
          </ErrorBoundary>
        )}

        {/* 8. Performance Analytics */}
        {activeTab === "performance" && (
          <ErrorBoundary title="Performance Analytics Tab Failed">
            <PerformanceAnalytics />
          </ErrorBoundary>
        )}

        {/* 9. Trade Journal */}
        {activeTab === "trade-journal" && (
          <ErrorBoundary title="Trade Journal Tab Failed">
            <TradeJournal />
          </ErrorBoundary>
        )}

        {/* 10. Alerts & Monitoring */}
        {activeTab === "alerts" && (
          <ErrorBoundary title="Alerts & Monitoring Tab Failed">
            <AlertsMonitoring />
          </ErrorBoundary>
        )}

        {/* 11. Logs & Debugging */}
        {activeTab === "logs" && (
          <ErrorBoundary title="Logs & Debugging Tab Failed">
            <LogsDebugging />
          </ErrorBoundary>
        )}

        {/* 12. Account & Security */}
        {activeTab === "account-security" && (
          <ErrorBoundary title="Account & Security Tab Failed">
            <AccountSecurity />
          </ErrorBoundary>
        )}
      </main>

      {/* Quick Command Palette Modal (Ctrl + K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigateTab={(tab) => setActiveTab(tab)}
        onOpenTutorial={() => setIsTutorialOpen(true)}
      />

      {/* 17-Step Guided Tutorial Walkthrough Modal */}
      <TutorialModal
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
        onNavigateTab={(tab) => setActiveTab(tab)}
      />

      {/* Footer */}
      <footer className="w-full border-t border-[#1E293B] bg-[#0E1524] py-2.5 px-4 text-center text-xs text-slate-500 font-mono flex items-center justify-between">
        <span>Alpha Algo Terminal Pro v2.0 • Ultra-Low Latency Trading Engine</span>
        <span className="hidden sm:inline">Ctrl+K for Commands • Alt+A for Alerts • Alt+T for Trendline</span>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <ActiveBotProvider>
      <MainApp />
    </ActiveBotProvider>
  );
}
