"use client";

import React, { useState } from "react";
import { GlobalHealthBar } from "@/components/GlobalHealthBar";
import { Navbar } from "@/components/Navbar";
import { BotControlTab } from "@/components/bot-control/BotControlTab";
import { PerformanceAnalytics } from "@/components/analytics/PerformanceAnalytics";
import { TradeJournal } from "@/components/trade-journal/TradeJournal";
import { MarketUniverse } from "@/components/market-universe/MarketUniverse";
import { AlertsMonitoring } from "@/components/alerts/AlertsMonitoring";
import { AccountSecurity } from "@/components/account-security/AccountSecurity";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function Home() {
  const [activeTab, setActiveTab] = useState("bot-control");

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col font-sans">
      {/* Global Health Bar */}
      <ErrorBoundary title="Global System Health Bar Failed">
        <GlobalHealthBar />
      </ErrorBoundary>

      {/* Main Header & Navigation Bar */}
      <ErrorBoundary title="Navigation Bar Failed">
        <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      </ErrorBoundary>

      {/* Active Tab View Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {activeTab === "bot-control" && (
          <ErrorBoundary title="Bot Control & Instances Tab Failed">
            <BotControlTab />
          </ErrorBoundary>
        )}

        {activeTab === "performance" && (
          <ErrorBoundary title="Performance Analytics Tab Failed">
            <PerformanceAnalytics />
          </ErrorBoundary>
        )}

        {activeTab === "trade-journal" && (
          <ErrorBoundary title="Trade Journal Tab Failed">
            <TradeJournal />
          </ErrorBoundary>
        )}

        {activeTab === "market-universe" && (
          <ErrorBoundary title="Market Universe Tab Failed">
            <MarketUniverse />
          </ErrorBoundary>
        )}

        {activeTab === "account-security" && (
          <ErrorBoundary title="Account & Security Tab Failed">
            <AccountSecurity />
          </ErrorBoundary>
        )}

        {activeTab === "alerts" && (
          <ErrorBoundary title="Alerts & Monitoring Tab Failed">
            <AlertsMonitoring />
          </ErrorBoundary>
        )}

        {activeTab !== "bot-control" &&
          activeTab !== "performance" &&
          activeTab !== "trade-journal" &&
          activeTab !== "market-universe" &&
          activeTab !== "account-security" &&
          activeTab !== "alerts" && (
            <div className="p-8 text-center bg-[#121824] border border-[#1E293B] rounded-2xl my-6">
              <h3 className="text-base font-bold text-white uppercase tracking-wider mb-1">
                Tab Phase Placeholder: {activeTab.replace("-", " ")}
              </h3>
              <p className="text-xs text-slate-400">
                This module is scheduled for implementation in Phase 4 of the frontend rewrite.
              </p>
            </div>
          )}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-[#1E293B] bg-[#0E1524] py-3 text-center text-xs text-slate-500 font-mono">
        Alpha Algo Terminal Pro v2.0 • Real-Time Fault-Isolated React Frontend
      </footer>
    </div>
  );
}
