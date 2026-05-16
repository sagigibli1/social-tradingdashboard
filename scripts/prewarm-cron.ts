/* eslint-disable no-console */
/**
 * Background pre-sync loop for the workshop demo.
 *
 * Why this exists: when Peleg clicks "Sync" on stage we want the visible
 * latency to be 1-3 seconds, not the 30-60s Apify cold-start. This script
 * runs in a Terminal tab BEFORE/DURING the workshop and pulls fresh items
 * every 5 minutes so the dashboard has warm data the moment students see it.
 *
 * Reddit is intentionally excluded: Apify reddit-scraper-lite has a 60s+
 * cold-start that defeats the purpose of pre-warming during a live demo
 * (reviewer 5's call in the plan).
 *
 * Usage:
 *   npx tsx scripts/prewarm-cron.ts
 *   Ctrl+C to stop. Graceful shutdown waits for the current tick to finish.
 */

import twitter from "../lib/sources/twitter";
import rss from "../lib/sources/rss";
import hn from "../lib/sources/hackernews";
import { recomputeTrends } from "../lib/analysis/trends";
import { runSentimentBatch } from "../lib/analysis/sentiment";
import type { IngestResult } from "../lib/types";

const TICK_MS = 5 * 60 * 1000;

const SOURCES = [
  { key: "twitter", run: () => twitter.run() },
  { key: "rss", run: () => rss.run() },
  { key: "hn", run: () => hn.run() },
] as const;

let stopping = false;
let tickInFlight = false;

function nowHms(): string {
  return new Date().toTimeString().slice(0, 8);
}

function summarize(key: string, r: PromiseSettledResult<IngestResult>): string {
  if (r.status === "rejected") return `${key} ERR`;
  return `${key} +${r.value.inserted}`;
}

async function tick(): Promise<void> {
  tickInFlight = true;
  try {
    const results = await Promise.allSettled(SOURCES.map((s) => s.run()));
    const parts = SOURCES.map((s, i) => summarize(s.key, results[i]));

    // Trends are non-fatal: a bad SQL aggregation should not kill the prewarm
    // loop, since fresh items already landed in this tick.
    try {
      await recomputeTrends();
    } catch (err) {
      console.warn(`[prewarm] recomputeTrends failed (continuing)`, err);
    }

    // Sentiment batch runs non-blocking with a small cap (3 batches = 60 items)
    // so it always finishes well within the 5-min tick window without an
    // explicit abort. The internal daily cap in claude-bridge enforces the
    // upper bound across all callers.
    void runSentimentBatch({ maxBatches: 3 }).catch((err) =>
      console.warn(`[prewarm] sentiment batch failed (continuing)`, err),
    );

    console.log(
      `[prewarm] tick at ${nowHms()} - ${parts.join(", ")}, trends recomputed, sentiment in flight`,
    );
  } finally {
    tickInFlight = false;
  }
}

const SHUTDOWN_GRACE_MS = 30_000;

async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`\n[prewarm] shutdown requested, waiting for current tick...`);
  const deadline = Date.now() + SHUTDOWN_GRACE_MS;
  while (tickInFlight && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (tickInFlight) {
    console.warn(
      `[prewarm] tick still running after ${SHUTDOWN_GRACE_MS}ms, forcing exit.`,
    );
  } else {
    console.log(`[prewarm] stopped cleanly.`);
  }
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

console.log(
  `[prewarm] tradingdashboard pre-sync, refreshing every 5min (twitter+rss+hn, no reddit). Press Ctrl+C to stop.`,
);

// Fire one tick immediately so the dashboard is warm within seconds of launch.
void tick();
setInterval(() => {
  // Skip if a SIGINT arrived between ticks but process.exit hasn't fired yet.
  if (stopping) return;
  void tick();
}, TICK_MS);
