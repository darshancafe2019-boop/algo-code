"use client";

import { QueryClient } from "@tanstack/react-query";

export interface CommandResponse<T = any> {
  command_id: string;
  action: string;
  bot_id?: string;
  status: "ACCEPTED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "REJECTED";
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  timestamp: string;
  latency_ms?: number;
}

export function generateIdempotencyKey(action: string, botId?: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  return `IDEM_${action}_${botId || "SYS"}_${ts}_${rand}`;
}

export async function executeCommand<T = any>(
  action: string,
  botId?: string | null,
  payload: Record<string, any> = {},
  queryClient?: QueryClient,
  customInvalidations?: string[]
): Promise<CommandResponse<T>> {
  const idempotencyKey = generateIdempotencyKey(action, botId || undefined);

  try {
    const res = await fetch("/api/command", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        action,
        bot_id: botId || undefined,
        payload,
        idempotency_key: idempotencyKey,
      }),
    });

    const data: CommandResponse<T> = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.message || data.error || `Command ${action} failed with status ${data.status}`);
    }

    // Automatically trigger cache invalidations on success
    if (queryClient) {
      const defaultKeys = [
        "botsList",
        "botsSummary",
        "systemHealth",
        "openPositions",
        "tradeJournal",
        "riskOverview",
        "auditEvents",
      ];
      const keysToInvalidate = customInvalidations ? [...defaultKeys, ...customInvalidations] : defaultKeys;

      for (const key of keysToInvalidate) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    }

    return data;
  } catch (error: any) {
    console.error(`CommandClient Error executing ${action}:`, error);
    throw error;
  }
}
