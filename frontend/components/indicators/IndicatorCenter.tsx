"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, Sliders, CheckCircle, RefreshCw, Layers, History, RotateCcw, Save, ShieldCheck, Sparkles } from "lucide-react";
import { useActiveBot } from "@/context/ActiveBotContext";

interface IndicatorSchemaItem {
  id: string;
  indicator_id?: string;
  name: string;
  category: "TREND" | "MOMENTUM" | "VOLATILITY" | "VOLUME";
  description?: string;
  enabled: boolean;
  weight: number;
  parameters: Record<string, any>;
  effective_source?: "BOT OVERRIDE" | "BOT PROFILE" | "GLOBAL DEFAULT";
}

interface IndicatorProfile {
  profile_id: string;
  name: string;
  description: string;
  indicators_count?: number;
}

export function IndicatorCenter() {
  const queryClient = useQueryClient();
  const { activeBot, bots, setActiveBotId } = useActiveBot();

  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [selectedBotId, setSelectedBotId] = useState<string>(activeBot?.id || "bot-1");
  const [editingParams, setEditingParams] = useState<Record<string, Record<string, any>>>({});
  const [saveSuccessMap, setSaveSuccessMap] = useState<Record<string, boolean>>({});

  // Fetch Indicators for selected bot
  const { data: indicators, isLoading, refetch } = useQuery<IndicatorSchemaItem[]>({
    queryKey: ["indicatorsCatalog", selectedBotId],
    queryFn: async () => {
      const res = await fetch(`/api/indicators?bot_id=${selectedBotId}`);
      if (!res.ok) throw new Error("Failed to fetch indicators");
      const json = await res.json();
      return (json.indicators || json.data || []) as IndicatorSchemaItem[];
    },
  });

  // Fetch Profiles
  const { data: profiles } = useQuery<IndicatorProfile[]>({
    queryKey: ["indicatorProfiles"],
    queryFn: async () => {
      const res = await fetch("/api/indicators/profiles");
      if (!res.ok) return [];
      const json = await res.json();
      return (json.profiles || json.data || []) as IndicatorProfile[];
    },
  });

  // Fetch Status
  const { data: indicatorStatus } = useQuery({
    queryKey: ["indicatorStatus", selectedBotId],
    queryFn: async () => {
      const res = await fetch(`/api/indicators/status?bot_id=${selectedBotId}`);
      if (!res.ok) return null;
      return await res.json();
    },
  });

  // Save Indicator Config Mutation
  const saveMutation = useMutation({
    mutationFn: async ({
      indicatorId,
      enabled,
      weight,
      parameters,
    }: {
      indicatorId: string;
      enabled: boolean;
      weight: number;
      parameters: Record<string, any>;
    }) => {
      const res = await fetch(`/api/indicators/${indicatorId}?bot_id=${selectedBotId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          indicator_id: indicatorId,
          bot_id: selectedBotId,
          enabled,
          weight,
          parameters,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Failed to save indicator configuration");
      }
      return await res.json();
    },
    onSuccess: (_, variables) => {
      setSaveSuccessMap((prev) => ({ ...prev, [variables.indicatorId]: true }));
      setTimeout(() => {
        setSaveSuccessMap((prev) => ({ ...prev, [variables.indicatorId]: false }));
      }, 3000);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["indicatorsCatalog"] });
      queryClient.invalidateQueries({ queryKey: ["indicatorStatus"] });
    },
  });

  // Reset Indicator Override Mutation
  const resetMutation = useMutation({
    mutationFn: async (indicatorId: string) => {
      const res = await fetch(`/api/indicators/${indicatorId}/reset?bot_id=${selectedBotId}`, {
        method: "POST",
      });
      return await res.json();
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["indicatorsCatalog"] });
    },
  });

  // Apply Profile Mutation
  const applyProfileMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const res = await fetch(`/api/indicators/profiles/${profileId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_id: selectedBotId }),
      });
      return await res.json();
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["indicatorsCatalog"] });
      queryClient.invalidateQueries({ queryKey: ["indicatorStatus"] });
    },
  });

  const indList = indicators || [];
  const filteredIndicators = indList.filter((ind) => {
    if (categoryFilter === "ALL") return true;
    return ind.category?.toUpperCase() === categoryFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-[#0E1524] border border-[#1E293B] rounded-2xl p-4 sm:p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
                Technical Indicator Center
                <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono">
                  Multi-Bot Isolated Engine
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Configure parameters, tune confluence weights, and assign indicator profiles per bot.
              </p>
            </div>
          </div>
        </div>

        {/* Bot Switcher & Actions */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#121927] px-3 py-1.5 rounded-xl border border-[#1E293B]">
            <span className="text-xs text-slate-400 font-medium">Active Bot:</span>
            <select
              value={selectedBotId}
              onChange={(e) => {
                setSelectedBotId(e.target.value);
                setActiveBotId(e.target.value);
              }}
              className="bg-transparent text-xs font-bold text-cyan-400 focus:outline-none cursor-pointer"
            >
              {bots.map((b) => (
                <option key={b.id} value={b.id} className="bg-[#121927] text-white">
                  {b.name} ({b.symbol})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl bg-[#121927] border border-[#1E293B] text-slate-300 hover:text-white transition-colors"
            title="Refresh Indicators"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Indicator Profiles Presets Banner */}
      {profiles && profiles.length > 0 && (
        <div className="bg-[#0E1524] border border-[#1E293B] rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span>Preset Indicator Profiles (1-Click Apply to {selectedBotId})</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {profiles.map((prof) => (
              <div
                key={prof.profile_id}
                className="bg-[#121927] border border-[#1E293B] rounded-xl p-3 hover:border-cyan-500/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <h3 className="text-xs font-bold text-white">{prof.name}</h3>
                  <p className="text-[11px] text-slate-400 mt-1">{prof.description}</p>
                </div>
                <button
                  onClick={() => applyProfileMutation.mutate(prof.profile_id)}
                  disabled={applyProfileMutation.isPending}
                  className="mt-3 w-full py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/40 text-xs font-bold transition-all disabled:opacity-50"
                >
                  Apply Profile
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {["ALL", "TREND", "MOMENTUM", "VOLATILITY", "VOLUME"].map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              categoryFilter === cat
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm"
                : "bg-[#121927] text-slate-400 hover:text-slate-200 border border-[#1E293B]"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Indicator Cards Grid */}
      {isLoading ? (
        <div className="p-16 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
          <RefreshCw className="h-5 w-5 animate-spin text-cyan-400" />
          <span>Loading Indicator Catalog...</span>
        </div>
      ) : filteredIndicators.length === 0 ? (
        <div className="p-12 text-center text-xs text-slate-500 bg-[#0E1524] rounded-2xl border border-[#1E293B]">
          No indicators found in category {categoryFilter}.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredIndicators.map((ind) => {
            const indId = ind.id || ind.indicator_id || "";
            const currentParams = editingParams[indId] || ind.parameters || {};
            const isSaving = saveMutation.isPending && saveMutation.variables?.indicatorId === indId;
            const isSaved = saveSuccessMap[indId];
            const source = ind.effective_source || "GLOBAL DEFAULT";

            return (
              <div
                key={indId}
                className="bg-[#0E1524] border border-[#1E293B] rounded-2xl p-4 hover:border-cyan-500/30 transition-all flex flex-col justify-between space-y-4"
              >
                {/* Top: Name, Category, Source Badge */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        {ind.name}
                      </h3>
                      <span className="text-[10px] text-slate-400 uppercase font-mono">{ind.category}</span>
                    </div>

                    {/* Source resolution tag */}
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded font-bold font-mono ${
                        source === "BOT OVERRIDE"
                          ? "bg-amber-950 text-amber-400 border border-amber-800"
                          : source === "BOT PROFILE"
                          ? "bg-purple-950 text-purple-400 border border-purple-800"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {source}
                    </span>
                  </div>

                  {ind.description && (
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">{ind.description}</p>
                  )}
                </div>

                {/* Parameters Form */}
                <div className="bg-[#121927] border border-[#1E293B] rounded-xl p-3 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">Status</span>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-[11px] font-bold text-slate-400">
                        {ind.enabled ? "ENABLED" : "DISABLED"}
                      </span>
                      <input
                        type="checkbox"
                        checked={ind.enabled}
                        onChange={(e) => {
                          saveMutation.mutate({
                            indicatorId: indId,
                            enabled: e.target.checked,
                            weight: ind.weight || 20,
                            parameters: currentParams,
                          });
                        }}
                        className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                      />
                    </label>
                  </div>

                  {/* Weight Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Confluence Weight:</span>
                      <strong className="text-cyan-400 font-mono">{ind.weight || 20}%</strong>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={ind.weight || 20}
                      onChange={(e) => {
                        saveMutation.mutate({
                          indicatorId: indId,
                          enabled: ind.enabled,
                          weight: Number(e.target.value),
                          parameters: currentParams,
                        });
                      }}
                      className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Dynamic Parameters Inputs */}
                  {Object.keys(currentParams).length > 0 && (
                    <div className="pt-2 border-t border-[#1E293B] space-y-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Parameters
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(currentParams).map(([paramKey, paramVal]) => (
                          <div key={paramKey} className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-mono capitalize">
                              {paramKey.replace("_", " ")}
                            </label>
                            <input
                              type={typeof paramVal === "number" ? "number" : "text"}
                              value={typeof paramVal === "number" || typeof paramVal === "string" ? paramVal : String(paramVal ?? "")}
                              onChange={(e) => {
                                const newVal =
                                  typeof paramVal === "number"
                                    ? parseFloat(e.target.value) || 0
                                    : e.target.value;
                                setEditingParams({
                                  ...editingParams,
                                  [indId]: {
                                    ...currentParams,
                                    [paramKey]: newVal,
                                  },
                                });
                              }}
                              className="w-full bg-[#0A0E17] border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions: Save Config & Reset */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => {
                      saveMutation.mutate({
                        indicatorId: indId,
                        enabled: ind.enabled,
                        weight: ind.weight || 20,
                        parameters: currentParams,
                      });
                    }}
                    disabled={isSaving}
                    className={`flex-1 py-1.5 rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 ${
                      isSaved
                        ? "bg-emerald-600 text-white"
                        : "bg-cyan-600 hover:bg-cyan-500 text-white"
                    } disabled:opacity-50`}
                  >
                    {isSaving ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : isSaved ? (
                      <CheckCircle className="h-3.5 w-3.5" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    <span>{isSaving ? "SAVING..." : isSaved ? "SAVED!" : "Save Parameters"}</span>
                  </button>

                  <button
                    onClick={() => resetMutation.mutate(indId)}
                    className="p-2 rounded-xl bg-[#121927] hover:bg-slate-800 text-slate-400 hover:text-white border border-[#1E293B] transition-colors"
                    title="Reset to Default / Revert Override"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
