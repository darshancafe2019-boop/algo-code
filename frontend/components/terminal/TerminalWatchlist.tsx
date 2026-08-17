"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Star, ArrowUpRight, ArrowDownRight, RefreshCw, Filter, Zap } from "lucide-react";
import { useActiveBot } from "@/context/ActiveBotContext";

interface WatchlistInstrument {
  symbol: string;
  name?: string;
  asset_class?: string;
  price?: number;
  change_24h?: number;
  volume?: number;
  signal?: "BUY" | "SELL" | "HOLD";
  confidence?: number;
  is_favorite?: boolean;
}

export function TerminalWatchlist() {
  const { activeSymbol, setActiveSymbol } = useActiveBot();
  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState("ALL");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [customFavorites, setCustomFavorites] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      try {
        return JSON.parse(localStorage.getItem("terminal_favorites") || "{}");
      } catch {
        return {};
      }
    }
    return {};
  });

  const { data: instruments, isLoading, refetch } = useQuery<WatchlistInstrument[]>({
    queryKey: ["universeInstruments", filterClass],
    queryFn: async () => {
      const classParam = filterClass !== "ALL" ? `&asset_class=${filterClass}` : "";
      const res = await fetch(`/api/universe/instruments?limit=50${classParam}`);
      if (!res.ok) throw new Error("Failed to fetch watchlist instruments");
      const json = await res.json();
      return (json.instruments || json.data || []) as WatchlistInstrument[];
    },
    refetchInterval: 10000,
  });

  const toggleFavorite = (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = { ...customFavorites, [symbol]: !customFavorites[symbol] };
    setCustomFavorites(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("terminal_favorites", JSON.stringify(updated));
    }
  };

  const filteredList = useMemo(() => {
    if (!instruments) return [];
    return instruments.filter((inst) => {
      const matchSearch =
        inst.symbol.toLowerCase().includes(search.toLowerCase()) ||
        (inst.name && inst.name.toLowerCase().includes(search.toLowerCase()));
      const isFav = customFavorites[inst.symbol] || inst.is_favorite;
      if (favoritesOnly && !isFav) return false;
      return matchSearch;
    });
  }, [instruments, search, favoritesOnly, customFavorites]);

  return (
    <div className="flex flex-col h-full bg-[#0E1524] border-l border-[#1A2333]">
      {/* Header & Search */}
      <div className="p-3 border-b border-[#1A2333] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-cyan-400" />
            <h2 className="text-xs font-bold text-white tracking-wide uppercase">Watchlist</h2>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
              {filteredList.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFavoritesOnly(!favoritesOnly)}
              className={`p-1 rounded transition-colors ${
                favoritesOnly ? "bg-amber-500/20 text-amber-400" : "text-slate-400 hover:text-slate-200"
              }`}
              title="Show Favorites Only"
            >
              <Star className="h-3.5 w-3.5 fill-current" />
            </button>
            <button
              onClick={() => refetch()}
              className="p-1 rounded text-slate-400 hover:text-slate-200"
              title="Refresh Watchlist"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search symbol (e.g. BTC, ETH)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#121927] border border-[#1E293B] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Asset Class Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pt-0.5">
          {["ALL", "CRYPTO", "EQUITY", "FOREX"].map((ac) => (
            <button
              key={ac}
              onClick={() => setFilterClass(ac)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap transition-colors ${
                filterClass === ac
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                  : "bg-[#162032] text-slate-400 hover:text-slate-200"
              }`}
            >
              {ac}
            </button>
          ))}
        </div>
      </div>

      {/* Watchlist Items */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#162032]">
        {isLoading ? (
          <div className="p-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-cyan-400" />
            Loading Watchlist...
          </div>
        ) : filteredList.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No instruments found matching criteria.
          </div>
        ) : (
          filteredList.map((item) => {
            const isSelected = item.symbol === activeSymbol;
            const isFav = customFavorites[item.symbol] || item.is_favorite;
            const chg = item.change_24h || 0;
            const isPos = chg >= 0;

            return (
              <div
                key={item.symbol}
                onClick={() => setActiveSymbol(item.symbol)}
                className={`px-3 py-2 flex items-center justify-between cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-cyan-950/40 border-l-2 border-cyan-400"
                    : "hover:bg-[#131D2E]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => toggleFavorite(item.symbol, e)}
                    className="text-slate-500 hover:text-amber-400"
                  >
                    <Star
                      className={`h-3.5 w-3.5 ${
                        isFav ? "fill-amber-400 text-amber-400" : "text-slate-600"
                      }`}
                    />
                  </button>
                  <div>
                    <div className="text-xs font-bold text-slate-200 flex items-center gap-1">
                      {item.symbol}
                      {item.signal && (
                        <span
                          className={`text-[9px] px-1 py-0.2 rounded font-bold ${
                            item.signal === "BUY"
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                              : item.signal === "SELL"
                              ? "bg-red-950 text-red-400 border border-red-800"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {item.signal}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {item.asset_class || "CRYPTO"}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-mono font-bold text-slate-200">
                    ${(item.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div
                    className={`text-[10px] font-mono font-semibold flex items-center justify-end gap-0.5 ${
                      isPos ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {isPos ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    <span>{isPos ? "+" : ""}{chg.toFixed(2)}%</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
