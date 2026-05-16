/* eslint-disable no-console */
/**
 * Smoke test for the Hacker News ingestor (Wave 1 Agent D).
 *
 * Runs the ingestor twice in a row to prove idempotency:
 *   - First run: fetches from HN Algolia, normalizes, inserts.
 *   - Second run: should report 0 inserted and equal-to-fetched skipped_duplicates.
 *
 * Also prints 5 sample rows from the items table for visual inspection.
 *
 * Usage: npx tsx scripts/smoke-hn.ts
 */

import { getDb } from "../lib/db";
import hackernewsIngestor from "../lib/sources/hackernews";
import type { IngestResult } from "../lib/types";

type SampleRow = {
  external_id: string;
  title: string | null;
  url: string;
  author: string | null;
  published_at: number;
  engagement_raw: number;
};

async function runIngestor(label: string): Promise<IngestResult> {
  console.log(`${label}...`);
  const result = await hackernewsIngestor.run();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function printSamples(): void {
  // Surface latest 5 HN rows so a human can eyeball normalization correctness.
  const samples = getDb()
    .prepare(
      `SELECT external_id, title, url, author, published_at, engagement_raw
       FROM items
       WHERE source_type = 'hn'
       ORDER BY published_at DESC
       LIMIT 5`,
    )
    .all() as SampleRow[];

  console.log("\n5 sample rows:");
  for (const row of samples) {
    const ts = new Date(row.published_at * 1000).toISOString();
    console.log(
      `  - [${row.external_id}] ${ts} | pts+comments=${row.engagement_raw} | ${row.author ?? "(no author)"}\n    ${row.title ?? "(no title)"}\n    ${row.url}`,
    );
  }
}

function verifyIdempotency(secondRun: IngestResult): void {
  if (secondRun.inserted !== 0) {
    console.error(
      `\nFAIL: second run inserted ${secondRun.inserted} new items (expected 0). Ingestor is not idempotent.`,
    );
    process.exit(1);
  }
  console.log("\nIdempotency OK: second run inserted 0 new items.");

  const total = (
    getDb()
      .prepare(`SELECT COUNT(*) AS c FROM items WHERE source_type = 'hn'`)
      .get() as { c: number }
  ).c;
  console.log(`Total HN items in DB: ${total}`);
}

async function main() {
  console.log("=== Hacker News smoke test ===\n");
  await runIngestor("Run 1");
  printSamples();
  const r2 = await runIngestor("\nRun 2 (idempotency check)");
  verifyIdempotency(r2);
}

main().catch((err) => {
  console.error("smoke-hn crashed:", err);
  process.exit(1);
});
