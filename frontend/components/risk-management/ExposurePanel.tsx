"use client";

import React from "react";
import { Layers, Globe, Activity } from "lucide-react";
import { RiskHeatmapItem } from "@/types/risk";

interface ExposurePanelProps {
  symbolExposure: Record<string, number>;
  assetClassExposure: Record<string, number>;
  heatmap: RiskHeatmapItem[];
  totalEquity: number;
}

export function ExposurePanel({
  symbolExposure,
  assetClassExposure,
  heatmap,
  totalEquity,
}: ExposurePanelProps) {
  const getRiskBadge = (level: string) => {
    if (level === "HIGH") {
      return "bg-red-950/80 border-red-800 text-red-400";
    }
    if (level === "MODERATE") {
      return "bg-amber-950/80 border-amber-800 text-amber-400";
    }
    return "bg-emerald-950/80 border-emerald-800 text-emerald-400";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Panel 1: Asset Class Allocation */}
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Multi-Asset Class Exposure
          </h3>
        </div>

        <div className="space-y-3">
          {Object.entries(assetClassExposure).map(([assetClass, val]) => {
            const pct = totalEquity > 0 ? (val / totalEquity) * 100 : 0;
            return (
              <div key={assetClass} className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-300 font-semibold">{assetClass}</span>
                  <span className="text-slate-400">
                    ${val.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({pct.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 w-full bg-[#0E1524] rounded-full overflow-hidden border border-[#1E293B]">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Panel 2: Exposure Concentration Heatmap */}
      <div className="bg-[#121824] border border-[#1E293B] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Concentration Heatmap Matrix
            </h3>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {heatmap?.length || 0} Entities
          </span>
        </div>

        <div className="overflow-x-auto max-h-60 overflow-y-auto">
          {heatmap && heatmap.length > 0 ? (
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#0E1524] text-slate-400 uppercase text-[10px] sticky top-0 border-b border-[#1E293B]">
                <tr>
                  <th className="py-2 px-3">Entity</th>
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3">Exposure ($)</th>
                  <th className="py-2 px-3">Weight (%)</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A2333]">
                {heatmap.map((item, idx) => (
                  <tr key={idx} className="hover:bg-[#1A2333]/40 transition-colors">
                    <td className="py-2 px-3 font-bold text-white">{item.entity}</td>
                    <td className="py-2 px-3 text-slate-400">{item.type}</td>
                    <td className="py-2 px-3 text-slate-200">
                      ${item.exposure.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-3 text-cyan-400">{item.exposure_pct.toFixed(1)}%</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getRiskBadge(item.risk_level)}`}>
                        {item.risk_level}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-8 text-xs text-slate-500">
              No active exposure concentration detected.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
