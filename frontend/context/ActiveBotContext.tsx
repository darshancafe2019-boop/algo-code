"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface BotInstance {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  strategy: string;
  allocated_capital: number;
  execution_mode: "PAPER" | "LIVE" | "TEST";
  status: "RUNNING" | "PAUSED" | "STOPPED" | "ERROR" | "HALTED";
  risk_profile?: string;
  created_at?: string;
  last_heartbeat?: string;
}

interface ActiveBotContextType {
  activeBot: BotInstance | null;
  bots: BotInstance[];
  isLoadingBots: boolean;
  activeSymbol: string;
  activeTimeframe: string;
  activeStrategy: string;
  setActiveBotId: (id: string) => void;
  setActiveSymbol: (symbol: string) => void;
  setActiveTimeframe: (timeframe: string) => void;
  setActiveStrategy: (strategy: string) => void;
  refreshBots: () => void;
}

const ActiveBotContext = createContext<ActiveBotContextType | undefined>(undefined);

export function ActiveBotProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [activeBotId, setActiveBotIdState] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("active_bot_id") || null;
    }
    return null;
  });

  const [activeSymbol, setActiveSymbolState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("active_symbol") || "BTC/USDT";
    }
    return "BTC/USDT";
  });

  const [activeTimeframe, setActiveTimeframeState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("active_timeframe") || "15m";
    }
    return "15m";
  });

  const [activeStrategy, setActiveStrategyState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("active_strategy") || "EMA_MACD_VP";
    }
    return "EMA_MACD_VP";
  });

  const { data: botsData, isLoading: isLoadingBots, refetch: refreshBots } = useQuery({
    queryKey: ["botsList"],
    queryFn: async () => {
      const res = await fetch("/api/bots");
      if (!res.ok) throw new Error("Failed to fetch bots");
      const json = await res.json();
      return (json.bots || json.data || []) as BotInstance[];
    },
    refetchInterval: 5000,
  });

  const bots: BotInstance[] = botsData || [];

  // Default active bot resolution
  const activeBot = bots.find((b) => b.id === activeBotId) || (bots.length > 0 ? bots[0] : null);

  useEffect(() => {
    if (activeBot) {
      if (!activeBotId || activeBot.id !== activeBotId) {
        setActiveBotIdState(activeBot.id);
        if (typeof window !== "undefined") {
          localStorage.setItem("active_bot_id", activeBot.id);
        }
      }
      if (activeBot.symbol && activeBot.symbol !== activeSymbol) {
        setActiveSymbolState(activeBot.symbol);
      }
      if (activeBot.timeframe && activeBot.timeframe !== activeTimeframe) {
        setActiveTimeframeState(activeBot.timeframe);
      }
      if (activeBot.strategy && activeBot.strategy !== activeStrategy) {
        setActiveStrategyState(activeBot.strategy);
      }
    }
  }, [activeBot, activeBotId, activeSymbol, activeTimeframe, activeStrategy]);

  const setActiveBotId = useCallback((id: string) => {
    setActiveBotIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem("active_bot_id", id);
    }
    const found = bots.find((b) => b.id === id);
    if (found) {
      setActiveSymbolState(found.symbol);
      setActiveTimeframeState(found.timeframe);
      setActiveStrategyState(found.strategy);
      if (typeof window !== "undefined") {
        localStorage.setItem("active_symbol", found.symbol);
        localStorage.setItem("active_timeframe", found.timeframe);
        localStorage.setItem("active_strategy", found.strategy);
      }
    }
  }, [bots]);

  const setActiveSymbol = useCallback((symbol: string) => {
    setActiveSymbolState(symbol);
    if (typeof window !== "undefined") {
      localStorage.setItem("active_symbol", symbol);
    }
  }, []);

  const setActiveTimeframe = useCallback((timeframe: string) => {
    setActiveTimeframeState(timeframe);
    if (typeof window !== "undefined") {
      localStorage.setItem("active_timeframe", timeframe);
    }
  }, []);

  const setActiveStrategy = useCallback((strategy: string) => {
    setActiveStrategyState(strategy);
    if (typeof window !== "undefined") {
      localStorage.setItem("active_strategy", strategy);
    }
  }, []);

  return (
    <ActiveBotContext.Provider
      value={{
        activeBot,
        bots,
        isLoadingBots,
        activeSymbol,
        activeTimeframe,
        activeStrategy,
        setActiveBotId,
        setActiveSymbol,
        setActiveTimeframe,
        setActiveStrategy,
        refreshBots,
      }}
    >
      {children}
    </ActiveBotContext.Provider>
  );
}

export function useActiveBot() {
  const context = useContext(ActiveBotContext);
  if (!context) {
    throw new Error("useActiveBot must be used within an ActiveBotProvider");
  }
  return context;
}
