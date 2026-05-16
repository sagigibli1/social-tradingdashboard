/* eslint-disable no-console */
/**
 * Smoke test for the Wave 2 sentiment analyzer (Agent E).
 *
 * Runs a small bounded pass so we can verify:
 *   - Claude bridge plumbing works
 *   - Returned rows pass validation
 *   - Hebrew summaries actually contain Hebrew characters
 *   - DB rows land correctly (label, score, confidence, summary_he)
 *
 * Usage: npx tsx scripts/smoke-sentiment.ts
 */

import { runSentimentBatch } from "../lib/analysis/sentiment";

type SampleRow = {
  item_id: number;
  ticker_symbol: string;
  label: string;
  score: number;
  confidence: number;
  summary_he: string | null;
  url: string;
};

async function main() {
  console.log("=== Sentiment smoke test ===\n");
  const result = await runSentimentBatch({ maxBatches: 3, batchSize: 5 });
  console.log("\nresult:", result);

  const { getDb } = await import("../lib/db");
  const rows = getDb()
    .prepare(
      `SELECT s.item_id, s.ticker_symbol, s.label, s.score, s.confidence,
              substr(s.summary_he, 1, 120) AS summary_he, i.url
       FROM sentiments s
       JOIN items i ON i.id = s.item_id
       ORDER BY s.analyzed_at DESC
       LIMIT 5`,
    )
    .all() as SampleRow[];

  console.log("\n5 latest sentiments:");
  for (const r of rows) {
    console.log(
      `  - item=${r.item_id} ticker=${r.ticker_symbol} label=${r.label} score=${r.score.toFixed(2)} conf=${r.confidence.toFixed(2)}\n    summary_he: ${r.summary_he ?? "(null)"}\n    url: ${r.url}`,
    );
  }

  // Hebrew unicode range U+0590..U+05FF.
  const hebrewRegex = /[֐-׿]/;
  const heRows = rows.filter((r) => hebrewRegex.test(r.summary_he ?? ""));
  console.log(
    `\nHebrew summaries: ${heRows.length}/${rows.length} sample rows contain Hebrew characters.`,
  );

  if (rows.length === 0) {
    console.error("FAIL: no sentiment rows in DB after smoke run.");
    process.exit(1);
  }
  if (heRows.length === 0) {
    console.error("FAIL: no Hebrew summaries written.");
    process.exit(1);
  }

  console.log("\nsmoke-sentiment OK.");
}

main().catch((err) => {
  console.error("smoke-sentiment crashed:", err);
  process.exit(1);
});
