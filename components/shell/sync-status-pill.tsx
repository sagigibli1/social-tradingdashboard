"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { copy } from "@/lib/copy";
import { formatRelative } from "@/lib/format";

type SyncStatusSource = {
  source_type: string;
  status: "pending" | "running" | "done" | "error";
  fetched?: number;
  inserted?: number;
  error?: string;
};

type SyncStatusPayload = {
  syncId: string | null;
  started_at: number | null;
  completed_at: number | null;
  sources: SyncStatusSource[];
  trends_done: boolean;
  sentiment_running: boolean;
  last_completed_at: number | null;
};

const POLL_MS = 800;

export function SyncStatusPill() {
  const [status, setStatus] = useState<SyncStatusPayload | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [rateLockSeconds, setRateLockSeconds] = useState(0);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const rateLockTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/status", { cache: "no-store" });
      if (!res.ok) {
        console.warn("[sync-status] non-ok response", res.status);
        return;
      }
      const json = (await res.json()) as SyncStatusPayload;
      setStatus(json);
    } catch (err) {
      console.warn("[sync-status] poll failed", err);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const isActive =
    !!status &&
    (status.completed_at === null ||
      status.sentiment_running ||
      !status.trends_done) &&
    status.syncId !== null;

  // Single effect owns the polling timer lifecycle.
  useEffect(() => {
    if (isActive) {
      pollTimer.current = setInterval(() => void fetchStatus(), POLL_MS);
    }
    return () => {
      if (pollTimer.current !== null) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [isActive, fetchStatus]);

  // Countdown tick for the rate-limit lock so the button label updates live.
  useEffect(() => {
    if (rateLockSeconds <= 0) return;
    rateLockTimer.current = setInterval(() => {
      setRateLockSeconds((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => {
      if (rateLockTimer.current !== null) {
        clearInterval(rateLockTimer.current);
        rateLockTimer.current = null;
      }
    };
  }, [rateLockSeconds]);

  const handleSync = useCallback(async () => {
    setIsStarting(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (res.status === 429) {
        // Server-enforced 5min gate. Parse retry_after, lock the button,
        // and show a Hebrew toast with the remaining seconds.
        const body = (await res.json().catch(() => ({}))) as {
          retry_after_seconds?: number;
        };
        const wait = Math.max(1, body.retry_after_seconds ?? 60);
        setRateLockSeconds(wait);
        toast.error(copy.syncRateLimitedSeconds(wait));
        return;
      }
      if (!res.ok) {
        console.error("[sync] start failed", res.status);
        toast.error(copy.errorSyncFailed);
        return;
      }
      void fetchStatus();
    } catch (err) {
      console.error("[sync] request error", err);
      toast.error(copy.errorSyncFailed);
    } finally {
      setIsStarting(false);
    }
  }, [fetchStatus]);

  const lastCompletedRel = status?.last_completed_at
    ? formatRelative(status.last_completed_at)
    : "";

  const insertedDelta = status?.sources
    ? status.sources.reduce((acc, s) => acc + (s.inserted ?? 0), 0)
    : 0;

  return (
    <div className="flex items-center gap-2 h-8 px-2 border-r border-[#2A2E39] min-w-[260px]">
      <div
        className="flex-1 text-[11px] text-[#787B86] text-right truncate"
        aria-live="polite"
      >
        {isActive ? (
          <span className="text-[#F59E0B] font-mono tabular-nums">
            {copy.syncStatusRunning} (+{insertedDelta})
          </span>
        ) : status?.last_completed_at ? (
          <span>{`${copy.syncStatusDoneShort} ${lastCompletedRel}`}</span>
        ) : (
          <span>{copy.syncStatusIdle}</span>
        )}
      </div>
      <button
        type="button"
        onClick={handleSync}
        disabled={isActive || isStarting || rateLockSeconds > 0}
        aria-label={copy.syncButton}
        className="inline-flex items-center gap-1.5 h-6 px-2 bg-[#F59E0B] hover:bg-[#D97706] text-[#131722] text-[11px] font-semibold rounded-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-100"
      >
        {isActive || isStarting ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <RefreshCw className="w-3 h-3" />
        )}
        <span>
          {rateLockSeconds > 0
            ? copy.syncRateLimitedSeconds(rateLockSeconds)
            : isActive
              ? copy.syncButtonLoading
              : copy.syncButton}
        </span>
      </button>
    </div>
  );
}
