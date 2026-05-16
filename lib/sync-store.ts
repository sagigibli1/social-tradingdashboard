// Module-level in-memory sync status store. Single-user local app, so this is fine.
// Lives outside the API routes so both /sync and /sync/status read/write the same Map.

import type { SourceType } from "./types";

export type SourceStatus = {
  source_type: SourceType;
  status: "pending" | "running" | "done" | "error";
  fetched: number;
  inserted: number;
  error?: string;
};

export type SyncRecord = {
  syncId: string;
  started_at: number;
  completed_at: number | null;
  sources: SourceStatus[];
  trends_done: boolean;
  sentiment_running: boolean;
};

const HISTORY_LIMIT = 10;

const history: SyncRecord[] = [];
let current: SyncRecord | null = null;
let lastCompletedAt: number | null = null;

export function startSync(
  syncId: string,
  sourceTypes: SourceType[],
): SyncRecord {
  current = {
    syncId,
    started_at: Math.floor(Date.now() / 1000),
    completed_at: null,
    sources: sourceTypes.map((st) => ({
      source_type: st,
      status: "pending",
      fetched: 0,
      inserted: 0,
    })),
    trends_done: false,
    sentiment_running: false,
  };
  return current;
}

export function updateSource(
  syncId: string,
  source_type: SourceType,
  patch: Partial<SourceStatus>,
): void {
  if (!current || current.syncId !== syncId) return;
  const src = current.sources.find((s) => s.source_type === source_type);
  if (!src) return;
  Object.assign(src, patch);
}

export function markTrendsDone(syncId: string): void {
  if (!current || current.syncId !== syncId) return;
  current.trends_done = true;
}

export function setSentimentRunning(syncId: string, running: boolean): void {
  if (!current || current.syncId !== syncId) return;
  current.sentiment_running = running;
}

export function completeSync(syncId: string): void {
  if (!current || current.syncId !== syncId) return;
  current.completed_at = Math.floor(Date.now() / 1000);
  lastCompletedAt = current.completed_at;
  history.unshift(current);
  if (history.length > HISTORY_LIMIT) history.pop();
}

export function getCurrentSync(): SyncRecord | null {
  return current;
}

export function getHistory(): SyncRecord[] {
  return history;
}

export function getLastCompletedAt(): number | null {
  return lastCompletedAt;
}
