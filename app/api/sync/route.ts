import { NextResponse, type NextRequest } from "next/server";

import twitter from "@/lib/sources/twitter";
import reddit from "@/lib/sources/reddit";
import rss from "@/lib/sources/rss";
import hn from "@/lib/sources/hackernews";
import { recomputeTrends } from "@/lib/analysis/trends";
import { runSentimentBatch } from "@/lib/analysis/sentiment";
import {
  completeSync,
  getCurrentSync,
  markTrendsDone,
  setSentimentRunning,
  startSync,
  updateSource,
} from "@/lib/sync-store";
import type { IngestResult, Ingestor, SourceType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCES: { type: SourceType; ingestor: Ingestor }[] = [
  { type: "twitter", ingestor: twitter },
  { type: "reddit", ingestor: reddit },
  { type: "rss", ingestor: rss },
  { type: "hn", ingestor: hn },
];

// Rate gate: max 1 sync click per 5 minutes (Apify cost control).
// Tracked at module scope (single Node process, fine for local dev + workshop).
// Bypassable via ?force=1 for Peleg's local testing only (not exposed in UI).
const RATE_GATE_MS = 5 * 60 * 1000;
let lastSyncStartedAt = 0;

function newSyncId() {
  return `sync_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  // Rate gate first (cheap check before touching the sync store).
  if (!force) {
    const elapsed = Date.now() - lastSyncStartedAt;
    if (lastSyncStartedAt > 0 && elapsed < RATE_GATE_MS) {
      const retry_after_seconds = Math.ceil((RATE_GATE_MS - elapsed) / 1000);
      return NextResponse.json(
        { error: "rate_limited", retry_after_seconds },
        {
          status: 429,
          headers: { "Retry-After": String(retry_after_seconds) },
        },
      );
    }
  }

  const existing = getCurrentSync();
  if (
    existing &&
    existing.completed_at === null &&
    Date.now() / 1000 - existing.started_at < 300
  ) {
    return NextResponse.json({
      syncId: existing.syncId,
      alreadyRunning: true,
    });
  }

  const syncId = newSyncId();
  lastSyncStartedAt = Date.now();
  startSync(
    syncId,
    SOURCES.map((s) => s.type),
  );

  // Fire-and-forget; the client polls /api/sync/status for progress.
  void runFullSync(syncId);

  return NextResponse.json({ syncId });
}

async function runFullSync(syncId: string): Promise<void> {
  try {
    const results = await Promise.allSettled(
      SOURCES.map(async ({ type, ingestor }) => {
        updateSource(syncId, type, { status: "running" });
        try {
          const r: IngestResult = await ingestor.run();
          updateSource(syncId, type, {
            status: r.failed.length > 0 && r.fetched === 0 ? "error" : "done",
            fetched: r.fetched,
            inserted: r.inserted,
            error: r.failed[0]?.reason,
          });
          return r;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          updateSource(syncId, type, { status: "error", error: message });
          throw err;
        }
      }),
    );

    // Surface settled rejections to logs - they're already in source.error.
    for (const r of results) {
      if (r.status === "rejected")
        console.error("[sync] ingestor rejected", r.reason);
    }

    try {
      await recomputeTrends();
      markTrendsDone(syncId);
    } catch (err) {
      console.error("[sync] recomputeTrends failed", err);
    }

    // Kick off sentiment batch in the background. Don't await - it can take minutes.
    setSentimentRunning(syncId, true);
    void runSentimentBatch({ maxBatches: 10 })
      .catch((err) => console.error("[sync] sentiment batch failed", err))
      .finally(() => setSentimentRunning(syncId, false));

    completeSync(syncId);
  } catch (err) {
    console.error("[sync] full sync crashed", err);
    completeSync(syncId);
  }
}
