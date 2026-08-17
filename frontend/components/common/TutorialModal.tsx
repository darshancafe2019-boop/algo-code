"use client";

import React, { useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  CheckCircle,
  HelpCircle,
  ArrowRight,
  Sparkles,
  Shield,
  Bot,
  Activity,
  Code,
  LineChart,
} from "lucide-react";

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tabId: string) => void;
}

interface TutorialStep {
  stepNumber: number;
  title: string;
  tabTarget: string;
  what: string;
  why: string;
  how: string;
  expectedResult: string;
  nextAction: string;
}

export function TutorialModal({ isOpen, onClose, onNavigateTab }: TutorialModalProps) {
  const [currentStep, setCurrentStep] = useState(1);

  const steps: TutorialStep[] = [
    {
      stepNumber: 1,
      title: "1. Select or Create a Bot Instance",
      tabTarget: "bot-control",
      what: "Each bot instance runs with an isolated strategy, timeframe, capital allocation, and risk parameters.",
      why: "Fault isolation prevents one runaway strategy from compromising your total trading capital.",
      how: "Navigate to 'Bot Control & Instances', select a pre-configured bot or click '+ Create Bot' to provision a new instance.",
      expectedResult: "Bot card displays in active state with allocated capital and assigned parameters.",
      nextAction: "Select the active market universe for your trading instrument.",
    },
    {
      stepNumber: 2,
      title: "2. Select Market Asset Class",
      tabTarget: "market-universe",
      what: "The platform supports Crypto, Indian Equities, Global Equities, Forex, and Market Indices.",
      why: "Different asset classes have distinct volatility profiles, lot sizing rules, and exchange session hours.",
      how: "Go to 'Market Universe' and filter by your target asset class.",
      expectedResult: "Active universe displays synchronized instruments with liquidity scores.",
      nextAction: "Pick a specific symbol for chart analysis.",
    },
    {
      stepNumber: 3,
      title: "3. Select Symbol",
      tabTarget: "terminal",
      what: "The trading pair or stock ticker to analyze and execute orders against (e.g. BTC/USDT, ETH/USDT).",
      why: "Every bot instance binds to an authoritative market symbol to stream candles and indicators.",
      how: "In the Trading Terminal Watchlist or Top Bar, click or search for your desired symbol.",
      expectedResult: "The active symbol header, chart candles, and indicator streams immediately update.",
      nextAction: "Choose the target analysis timeframe.",
    },
    {
      stepNumber: 4,
      title: "4. Select Timeframe",
      tabTarget: "terminal",
      what: "Bar aggregation period: 1m, 5m, 15m, 1h, 4h, 1d.",
      why: "Different timeframes correspond to distinct trading styles (scalping, intraday, swing, trend-following).",
      how: "Click on the timeframe pill (e.g., 15m or 1h) in the top terminal control bar.",
      expectedResult: "OHLCV candlestick chart recalculates bars according to selected interval.",
      nextAction: "Inspect the main chart and technical drawings.",
    },
    {
      stepNumber: 5,
      title: "5. Open Trading Terminal & Chart",
      tabTarget: "terminal",
      what: "Professional TradingView-inspired candlestick and OHLC workspace with volume profiles.",
      why: "Visual pattern recognition and price action confirmation alongside algorithmic signals.",
      how: "Use the left toolbar to draw trendlines (Alt+T), horizontal support/resistance (Alt+H), or Fibonacci levels (Alt+F).",
      expectedResult: "Interactive chart reflects price history, zoom/pan controls, and drawing overlays.",
      nextAction: "Add technical indicators to your workspace.",
    },
    {
      stepNumber: 6,
      title: "6. Add Technical Indicators",
      tabTarget: "indicators",
      what: "Calculated mathematical metrics: EMA, MACD, RSI, Bollinger Bands, ATR, Supertrend, Volume Profile.",
      why: "Algorithmic strategies require quantitative indicator metrics to evaluate confluence.",
      how: "Open 'Indicator Center' and enable the indicators you wish to include in your strategy.",
      expectedResult: "Enabled indicators display in chart overlays and sub-panels.",
      nextAction: "Tune indicator parameters per bot.",
    },
    {
      stepNumber: 7,
      title: "7. Configure Indicator Parameters",
      tabTarget: "indicators",
      what: "Customize periods, thresholds, and weights (e.g., RSI Period 14, Oversold 30, Overbought 70).",
      why: "Different market regimes (trending vs ranging) require tailored sensitivity.",
      how: "Adjust parameter inputs in Indicator Center and click 'Save Parameters'.",
      expectedResult: "The indicator resolves to 'BOT OVERRIDE' with independent parameters.",
      nextAction: "Build or select a visual trading strategy.",
    },
    {
      stepNumber: 8,
      title: "8. Build / Select Visual Strategy",
      tabTarget: "strategy-builder",
      what: "Visual IF / AND / OR / THEN rule builder (e.g. IF RSI < 30 AND Close > EMA200 THEN BUY).",
      why: "Empowers rapid creation of transparent, auditable rule sets without hardcoding.",
      how: "Go to 'Visual Strategy Builder', assemble condition rows, click 'Compile', and click 'Save Strategy'.",
      expectedResult: "Compiled expression is validated and ready for live execution.",
      nextAction: "Validate strategy performance in Backtesting Lab.",
    },
    {
      stepNumber: 9,
      title: "9. Run Backtesting Lab",
      tabTarget: "backtesting",
      what: "Historical simulation of strategy rules against historical market candles with slippage & fees.",
      why: "Verifies mathematical expectancy, profit factor, and maximum drawdown before deploying capital.",
      how: "Navigate to 'Backtesting Lab', configure dates and capital, and click 'Run Backtest'.",
      expectedResult: "Detailed performance summary: Win Rate, Net P&L, Equity Curve, and Trade Table.",
      nextAction: "Configure strict risk limits.",
    },
    {
      stepNumber: 10,
      title: "10. Configure Risk & Position Sizing",
      tabTarget: "risk-management",
      what: "Fixed percentage risk (e.g., 1% per trade), max daily loss cap, and max exposure rules.",
      why: "Capital preservation is the single most important determinant of long-term trading longevity.",
      how: "In 'Risk Management', review Risk Limits and choose a Conservative or Balanced profile.",
      expectedResult: "Position sizing automatically scales based on distance to stop loss.",
      nextAction: "Perform pre-trade risk verification.",
    },
    {
      stepNumber: 11,
      title: "11. 14-Point Pre-Trade Risk Check",
      tabTarget: "terminal",
      what: "Pre-order safety gate evaluating balance, exposure, stop loss, risk/reward (>= 1.0:1), and kill switch.",
      why: "Ensures no rogue or mathematically flawed order ever reaches an exchange broker.",
      how: "In the Terminal Order Panel, click 'Run Pre-Trade Risk Check'.",
      expectedResult: "Display shows green 'APPROVED' or exact 'BLOCKED' reason.",
      nextAction: "Start the Paper Trading sandbox.",
    },
    {
      stepNumber: 12,
      title: "12. Start Paper Trading Sandbox",
      tabTarget: "bot-control",
      what: "Real-time live market execution using virtual capital with authentic slippage and fee simulation.",
      why: "Proves bot logic and signal timing end-to-end under real market conditions with zero financial risk.",
      how: "Click 'Start Bot' on your bot instance card. Status transitions: STARTING... -> RUNNING.",
      expectedResult: "Bot actively monitors market feed and logs decision heartbeats every scan cycle.",
      nextAction: "Monitor live signals.",
    },
    {
      stepNumber: 13,
      title: "13. Monitor Signals & Confluence",
      tabTarget: "terminal",
      what: "Real-time decision logs detailing indicator confluence scores (requires >= 75% for order entry).",
      why: "Complete observability into exactly why the bot entered or skipped a trading opportunity.",
      how: "View 'Bot Signals & Logs' in the bottom dock of the Trading Terminal.",
      expectedResult: "Transparent indicator score breakdown for every evaluated bar.",
      nextAction: "Review open positions.",
    },
    {
      stepNumber: 14,
      title: "14. Review Open Positions & Square Off",
      tabTarget: "terminal",
      what: "Live position tracker showing entry price, unrealized P&L, stop loss, and take profit targets.",
      why: "Allows trader to monitor active exposure or manually square off positions during high-impact news.",
      how: "Check 'Open Positions' tab in the bottom dock. Click 'Square Off' if manual exit is needed.",
      expectedResult: "Position is closed and trade record transitions into the Trade Journal.",
      nextAction: "Inspect completed trades.",
    },
    {
      stepNumber: 15,
      title: "15. Review Trade Journal",
      tabTarget: "trade-journal",
      what: "Authoritative trade ledger recording entry, exit, fees, slippage, MAE, MFE, and net P&L.",
      why: "Full auditability of every historical execution with CSV export capabilities.",
      how: "Open 'Trade Journal', filter by bot or symbol, and click 'Export CSV'.",
      expectedResult: "Complete tabular breakdown of every closed trade.",
      nextAction: "Analyze performance KPIs.",
    },
    {
      stepNumber: 16,
      title: "16. Review Performance Analytics",
      tabTarget: "performance",
      what: "Authoritative analytics: Win Rate, Profit Factor, Expectancy, Recovery Factor, and Multi-Bot Leaderboard.",
      why: "Provides statistical insight into strategy strengths and underperforming market regimes.",
      how: "Open 'Performance Analytics' to inspect win/loss donuts, equity curve, and bot rankings.",
      expectedResult: "Clear graphical representation of cumulative trading performance.",
      nextAction: "Understand the path to Live Trading.",
    },
    {
      stepNumber: 17,
      title: "17. Audit Trail & Protected Live Deployment",
      tabTarget: "account-security",
      what: "Immutable 32-field event audit log, system diagnostics, and protected live broker arming.",
      why: "Live execution requires explicit arming, encrypted credentials, and kill switch readiness.",
      how: "Verify system health in 'Audit Logs & Debug' and 'Account & Security' before considering Live mode.",
      expectedResult: "Production-grade, fully traceable algorithmic trading operation.",
      nextAction: "You are ready to trade! Happy Algorithmic Trading.",
    },
  ];

  const current = steps[currentStep - 1];

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0E1524] border border-[#1E293B] rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#1A2333] flex items-center justify-between bg-[#0A0E17]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Trading Platform Guided Walkthrough
              </h2>
              <p className="text-xs text-slate-400">
                17-Step Systematic Workflow for Professional Algorithmic Trading
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step Progress Pills Bar */}
        <div className="px-4 py-2 bg-[#121927] border-b border-[#1A2333] flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {steps.map((s) => (
            <button
              key={s.stepNumber}
              onClick={() => setCurrentStep(s.stepNumber)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all whitespace-nowrap ${
                s.stepNumber === currentStep
                  ? "bg-cyan-500 text-slate-950 shadow-md"
                  : s.stepNumber < currentStep
                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                  : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              Step {s.stepNumber}
            </button>
          ))}
        </div>

        {/* Step Detail Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white tracking-wide">{current.title}</h3>
            <button
              onClick={() => {
                onNavigateTab(current.tabTarget);
                onClose();
              }}
              className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md flex items-center gap-1.5 transition-all"
            >
              <span>Take Me There</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* What & Why */}
            <div className="space-y-3">
              <div className="bg-[#121927] border border-[#1E293B] rounded-xl p-3.5 space-y-1">
                <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider font-mono">
                  1. What is this?
                </span>
                <p className="text-xs text-slate-200 leading-relaxed">{current.what}</p>
              </div>

              <div className="bg-[#121927] border border-[#1E293B] rounded-xl p-3.5 space-y-1">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider font-mono">
                  2. Why is this important?
                </span>
                <p className="text-xs text-slate-200 leading-relaxed">{current.why}</p>
              </div>
            </div>

            {/* How & Expected Result */}
            <div className="space-y-3">
              <div className="bg-[#121927] border border-[#1E293B] rounded-xl p-3.5 space-y-1">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider font-mono">
                  3. How do I do it?
                </span>
                <p className="text-xs text-slate-200 leading-relaxed">{current.how}</p>
              </div>

              <div className="bg-[#121927] border border-[#1E293B] rounded-xl p-3.5 space-y-1">
                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider font-mono">
                  4. Expected Result & Next Action
                </span>
                <p className="text-xs text-slate-200 leading-relaxed">
                  <strong>Result:</strong> {current.expectedResult}
                </p>
                <p className="text-xs text-cyan-300 font-medium mt-1">
                  <strong>Next:</strong> {current.nextAction}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Navigation Controls */}
        <div className="p-4 bg-[#0A0E17] border-t border-[#1A2333] flex items-center justify-between">
          <button
            onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
            disabled={currentStep === 1}
            className="px-4 py-2 rounded-xl bg-[#162032] hover:bg-[#1E2D44] text-slate-300 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Previous Step</span>
          </button>

          <span className="text-xs font-mono text-slate-400">
            Step {currentStep} of {steps.length}
          </span>

          <button
            onClick={() => {
              if (currentStep === steps.length) {
                onClose();
              } else {
                setCurrentStep((s) => Math.min(steps.length, s + 1));
              }
            }}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-cyan-600/20 transition-all"
          >
            <span>{currentStep === steps.length ? "Finish Walkthrough" : "Next Step"}</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
