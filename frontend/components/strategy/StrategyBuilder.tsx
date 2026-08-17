"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Code,
  Play,
  Save,
  Plus,
  Trash2,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Bot,
  Layers,
  ArrowRight,
} from "lucide-react";
import { useActiveBot } from "@/context/ActiveBotContext";

interface VisualRule {
  left: string;
  op: string;
  right: string;
}

interface VisualStrategy {
  strategy_id?: string;
  id?: string;
  name: string;
  description?: string;
  target_signal: "BUY" | "SELL";
  conjunction: "AND" | "OR";
  rules: VisualRule[];
  compiled_expression?: string;
  is_template?: boolean;
}

export function StrategyBuilder() {
  const queryClient = useQueryClient();
  const { activeBot, activeSymbol } = useActiveBot();

  // Builder Form State
  const [strategyName, setStrategyName] = useState("Custom Trend Breakout Strategy");
  const [description, setDescription] = useState("Buy when RSI is oversold and Close crosses above EMA 200");
  const [targetSignal, setTargetSignal] = useState<"BUY" | "SELL">("BUY");
  const [conjunction, setConjunction] = useState<"AND" | "OR">("AND");
  const [rules, setRules] = useState<VisualRule[]>([
    { left: "rsi_14", op: "<", right: "30" },
    { left: "close", op: ">", right: "ema_200" },
  ]);

  const [compiledExpression, setCompiledExpression] = useState<string>("");
  const [testResult, setTestResult] = useState<{
    triggered: boolean;
    signal: string;
    conditions: Array<{ rule: string; passed: boolean }>;
  } | null>(null);

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  // Fetch Visual Strategies Catalog
  const { data: catalog, isLoading, refetch } = useQuery<VisualStrategy[]>({
    queryKey: ["visualStrategiesCatalog"],
    queryFn: async () => {
      const res = await fetch("/api/strategies/visual");
      if (!res.ok) throw new Error("Failed to fetch strategies catalog");
      const json = await res.json();
      return (json.strategies || json.data || []) as VisualStrategy[];
    },
  });

  // Compile Strategy Mutation
  const compileMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: strategyName,
        target_signal: targetSignal,
        conjunction,
        rules,
      };
      const res = await fetch("/api/strategies/visual/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Compilation failed");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      setCompiledExpression(data.compiled_expression || "");
    },
  });

  // Test Strategy on Current Live Market Indicators Mutation
  const testMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        strategy: {
          name: strategyName,
          target_signal: targetSignal,
          conjunction,
          rules,
        },
        symbol: activeSymbol,
        indicators: {
          rsi_14: 26.5,
          close: 65420.0,
          ema_200: 62000.0,
          macd_line: 15.2,
          macd_signal: 10.1,
          volume: 1250.0,
        },
      };

      const res = await fetch("/api/strategies/visual/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Test execution failed");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      setTestResult(data);
    },
  });

  // Save Strategy to Catalog Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: strategyName,
        description,
        target_signal: targetSignal,
        conjunction,
        rules,
      };
      const res = await fetch("/api/strategies/visual/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Save failed");
      }
      return await res.json();
    },
    onSuccess: () => {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["visualStrategiesCatalog"] });
    },
  });

  // Assign Strategy to Active Bot
  const handleAssignToBot = async (stratName: string) => {
    if (!activeBot) return;
    try {
      await fetch(`/api/bots/${activeBot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: stratName }),
      });
      setAssignSuccess(stratName);
      setTimeout(() => setAssignSuccess(null), 3000);
      queryClient.invalidateQueries({ queryKey: ["botsList"] });
    } catch (err) {
      console.error("Assign strategy error:", err);
    }
  };

  const handleAddRule = () => {
    setRules([...rules, { left: "rsi_14", op: "<", right: "30" }]);
  };

  const handleRemoveRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const handleUpdateRule = (index: number, field: keyof VisualRule, value: string) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], [field]: value };
    setRules(updated);
  };

  const indicatorOptions = [
    { value: "rsi_14", label: "RSI (14)" },
    { value: "close", label: "Candle Close Price" },
    { value: "open", label: "Candle Open Price" },
    { value: "high", label: "Candle High" },
    { value: "low", label: "Candle Low" },
    { value: "volume", label: "Volume" },
    { value: "ema_9", label: "EMA 9" },
    { value: "ema_21", label: "EMA 21" },
    { value: "ema_50", label: "EMA 50" },
    { value: "ema_200", label: "EMA 200" },
    { value: "macd_line", label: "MACD Line" },
    { value: "macd_signal", label: "MACD Signal" },
    { value: "vah", label: "Volume Profile VAH" },
    { value: "val", label: "Volume Profile VAL" },
    { value: "poc", label: "Volume Profile POC" },
    { value: "adx_14", label: "ADX (14)" },
  ];

  const operatorOptions = [
    { value: ">", label: "Greater Than (>)" },
    { value: "<", label: "Less Than (<)" },
    { value: ">=", label: "Greater or Equal (>=)" },
    { value: "<=", label: "Less or Equal (<=)" },
    { value: "==", label: "Equals (==)" },
    { value: "!=", label: "Not Equals (!=)" },
    { value: "crosses_above", label: "Crosses Above" },
    { value: "crosses_below", label: "Crosses Below" },
  ];

  const strategiesList = catalog || [];

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-[#0E1524] border border-[#1E293B] rounded-2xl p-4 sm:p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-600/30">
            <Code className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
              Visual Strategy Builder
              <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono">
                IF / AND / OR / THEN
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Build, compile, test, and deploy custom visual trading rules directly to the execution engine.
            </p>
          </div>
        </div>
      </div>

      {/* Main 2-Column Layout: Visual Builder Form + Strategy Catalog */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form: Condition Builder */}
        <div className="lg:col-span-7 bg-[#0E1524] border border-[#1E293B] rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1A2333] pb-3">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              Strategy Rule Builder
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Target Signal:</span>
              <button
                onClick={() => setTargetSignal(targetSignal === "BUY" ? "SELL" : "BUY")}
                className={`px-3 py-1 rounded-lg text-xs font-bold font-mono transition-all ${
                  targetSignal === "BUY"
                    ? "bg-emerald-600 text-white shadow-emerald-600/20"
                    : "bg-red-600 text-white shadow-red-600/20"
                }`}
              >
                THEN {targetSignal}
              </button>
            </div>
          </div>

          {/* Strategy Name & Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">Strategy Name</label>
              <input
                type="text"
                value={strategyName}
                onChange={(e) => setStrategyName(e.target.value)}
                className="w-full bg-[#121927] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#121927] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Conjunction Logic */}
          <div className="flex items-center gap-3 text-xs bg-[#121927] p-2.5 rounded-xl border border-[#1E293B]">
            <span className="text-slate-400 font-medium">Condition Logic Conjunction:</span>
            <div className="flex items-center gap-1">
              {(["AND", "OR"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setConjunction(c)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold font-mono transition-colors ${
                    conjunction === c
                      ? "bg-cyan-500 text-slate-950"
                      : "bg-[#162032] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Rule Rows */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Rule Conditions (IF / {conjunction})
            </label>

            {rules.map((rule, idx) => (
              <div
                key={idx}
                className="bg-[#121927] border border-[#1E293B] rounded-xl p-3 flex flex-wrap items-center gap-2"
              >
                <span className="text-xs font-bold font-mono text-cyan-400 w-8">
                  {idx === 0 ? "IF" : conjunction}
                </span>

                {/* Left Operand */}
                <select
                  value={rule.left}
                  onChange={(e) => handleUpdateRule(idx, "left", e.target.value)}
                  className="bg-[#0A0E17] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  {indicatorOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {/* Operator */}
                <select
                  value={rule.op}
                  onChange={(e) => handleUpdateRule(idx, "op", e.target.value)}
                  className="bg-[#0A0E17] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-cyan-300 font-mono font-bold focus:outline-none focus:border-cyan-500"
                >
                  {operatorOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {/* Right Operand */}
                <input
                  type="text"
                  value={rule.right}
                  onChange={(e) => handleUpdateRule(idx, "right", e.target.value)}
                  placeholder="e.g. 30 or ema_200"
                  className="flex-1 min-w-[120px] bg-[#0A0E17] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />

                {/* Remove Condition */}
                {rules.length > 1 && (
                  <button
                    onClick={() => handleRemoveRule(idx)}
                    className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                    title="Remove Rule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}

            <button
              onClick={handleAddRule}
              className="w-full py-2 rounded-xl bg-[#121927] hover:bg-[#162032] border border-dashed border-slate-700 text-cyan-400 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Condition Rule
            </button>
          </div>

          {/* Action Buttons: Compile, Test on Live Indicators, Save */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-3 border-t border-[#1A2333]">
            <button
              onClick={() => compileMutation.mutate()}
              disabled={compileMutation.isPending}
              className="py-2 rounded-xl bg-[#162032] hover:bg-[#1E2D44] border border-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Code className="h-3.5 w-3.5 text-cyan-400" />
              <span>Compile Rules</span>
            </button>

            <button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              className="py-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/40 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Test on Live Data</span>
            </button>

            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/20 transition-all"
            >
              {saveSuccess ? <CheckCircle className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              <span>{saveSuccess ? "SAVED!" : "Save Strategy"}</span>
            </button>
          </div>

          {/* Compiled Expression Output */}
          {compiledExpression && (
            <div className="p-3 bg-[#0A0E17] border border-[#1E293B] rounded-xl text-xs font-mono space-y-1">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Compiled Engine Expression:</span>
              <p className="text-cyan-400 font-bold">{compiledExpression}</p>
            </div>
          )}

          {/* Live Test Result */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs space-y-2 ${
                testResult.triggered
                  ? "bg-emerald-950/30 border-emerald-800 text-emerald-300"
                  : "bg-amber-950/30 border-amber-800 text-amber-300"
              }`}
            >
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5">
                  {testResult.triggered ? (
                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                  )}
                  Signal Output: {testResult.signal} ({testResult.triggered ? "TRIGGERED" : "HOLD / NOT MET"})
                </span>
              </div>
              <div className="space-y-1 font-mono text-[11px]">
                {testResult.conditions?.map((cond, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className={cond.passed ? "text-emerald-400" : "text-red-400 font-bold"}>
                      {cond.passed ? "✓ PASSED:" : "✗ FAILED:"}
                    </span>
                    <span className="text-slate-300">{cond.rule}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Visual Strategy Catalog */}
        <div className="lg:col-span-5 bg-[#0E1524] border border-[#1E293B] rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1A2333] pb-3">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Layers className="h-4 w-4 text-cyan-400" />
              Strategy Catalog
            </h2>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
              {strategiesList.length} Strategies
            </span>
          </div>

          <div className="space-y-3 overflow-y-auto max-h-[580px]">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-cyan-400" />
                Loading Catalog...
              </div>
            ) : strategiesList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No visual strategies found in catalog.
              </div>
            ) : (
              strategiesList.map((strat, idx) => {
                const sName = strat.name;
                const isAssigned = activeBot?.strategy === sName;
                const isJustAssigned = assignSuccess === sName;

                return (
                  <div
                    key={strat.strategy_id || strat.id || idx}
                    className="bg-[#121927] border border-[#1E293B] rounded-xl p-3.5 hover:border-cyan-500/40 transition-all space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-bold text-white">{strat.name}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{strat.description}</p>
                      </div>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold font-mono ${
                          strat.target_signal === "BUY"
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                            : "bg-red-950 text-red-400 border border-red-800"
                        }`}
                      >
                        {strat.target_signal || "BUY"}
                      </span>
                    </div>

                    {strat.compiled_expression && (
                      <div className="bg-[#0A0E17] p-2 rounded-lg text-[10px] font-mono text-cyan-400 break-words">
                        {strat.compiled_expression}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => {
                          setStrategyName(strat.name);
                          setDescription(strat.description || "");
                          setTargetSignal(strat.target_signal || "BUY");
                          setConjunction(strat.conjunction || "AND");
                          if (strat.rules && strat.rules.length > 0) {
                            setRules(strat.rules);
                          }
                        }}
                        className="flex-1 py-1 rounded-lg bg-[#162032] hover:bg-[#1E2D44] text-slate-200 text-xs font-semibold transition-colors"
                      >
                        Load to Editor
                      </button>

                      <button
                        onClick={() => handleAssignToBot(strat.name)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                          isJustAssigned
                            ? "bg-emerald-600 text-white"
                            : isAssigned
                            ? "bg-cyan-950 text-cyan-400 border border-cyan-800"
                            : "bg-cyan-600 hover:bg-cyan-500 text-white"
                        }`}
                      >
                        <Bot className="h-3 w-3" />
                        <span>{isJustAssigned ? "Assigned!" : isAssigned ? "Active on Bot" : "Assign to Bot"}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
