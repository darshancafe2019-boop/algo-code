"use client";

import React, { useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { TradeJournalRecord } from "@/types/trade-journal";

interface Props {
  statusFilter: string;
  directionFilter: string;
  strategyFilter: string;
  searchQuery: string;
  showTestTrades: boolean;
  trades?: TradeJournalRecord[];
}

export function CsvExportButton({
  statusFilter,
  directionFilter,
  strategyFilter,
  searchQuery,
  showTestTrades,
  trades,
}: Props) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Build export URL with filters
      const params = new URLSearchParams({
        status: statusFilter,
        direction: directionFilter,
        strategy: strategyFilter,
        query: searchQuery,
        show_test_trades: String(showTestTrades),
      });

      const res = await fetch(`/api/trades/export-csv?${params.toString()}`);
      if (!res.ok) {
        // Fallback to client-side CSV generation if endpoint isn't returning file stream
        generateClientCsv(trades || []);
        setIsExporting(false);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Trade_Journal_Export_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.warn("CSV export server fetch failed, generating client-side CSV", e);
      generateClientCsv(trades || []);
    } finally {
      setIsExporting(false);
    }
  };

  const generateClientCsv = (data: TradeJournalRecord[]) => {
    const headers = [
      "ID",
      "Entry Time",
      "Exit Time",
      "Bot",
      "Symbol",
      "Direction",
      "Entry Price",
      "Exit Price",
      "Position Size",
      "Result PnL",
      "Fees",
      "Strategy",
      "Status",
      "Mode",
      "Emotion Tag",
      "Remarks",
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = data.map((t) => [
      t.id,
      escapeCsv(t.timestamp),
      escapeCsv(t.exit_timestamp || ""),
      escapeCsv(t.bot_instance_name || t.bot_id || "bot-1"),
      escapeCsv(t.symbol),
      escapeCsv(t.direction),
      t.entry_price,
      t.exit_price || 0,
      t.position_size,
      t.result_pnl || 0,
      t.fees || 0,
      escapeCsv(t.strategy || t.config_version || "EMA_MACD_VP"),
      escapeCsv(t.status),
      escapeCsv(t.execution_mode || "PAPER"),
      escapeCsv(t.emotion_tag || "N/A"),
      escapeCsv(t.remarks || ""),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Trade_Journal_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 text-xs font-semibold transition-colors disabled:opacity-50"
    >
      {isExporting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      <span>Export CSV</span>
    </button>
  );
}
