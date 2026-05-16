/* eslint-disable no-console */
/**
 * Smoke test for the Reddit ingestor.
 *
 * Loads .env.local, runs the ingestor, prints IngestResult + 5 sample rows
 * fetched back out of SQLite. Designed to be safe to run twice in a row -
 * second run should show `inserted: 0` (cache hit + dedup).
 *
 * Usage:
 *   npx tsx scripts/smoke-reddit.ts
 */

import fs from "fs";
import path from "path";

import { getDb } from "../lib/db";
import redditIngestor from "../lib/sources/reddit";

function loadDotEnvLocal(): void {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  const txt = fs.readFileSync(p, "utf-8");
  for (const rawLine of txt.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

async function main() {
  loadDotEnvLocal();

  if (!process.env.APIFY_API_TOKEN) {
    console.error("APIFY_API_TOKEN not set. Add it to .env.local first.");
    process.exit(1);
  }

  const t0 = Date.now();
  const result = await redditIngestor.run();
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);

  console.log("=== IngestResult ===");
  console.log(JSON.stringify(result, null, 2));
  console.log(`elapsed: ${elapsedSec}s`);

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, external_id, url, title, author, published_at, engagement_raw, lang
       FROM items
       WHERE source_type = 'reddit'
       ORDER BY published_at DESC
       LIMIT 5`,
    )
    .all() as Array<{
    id: number;
    external_id: string;
    url: string;
    title: string | null;
    author: string | null;
    published_at: number;
    engagement_raw: number;
    lang: string;
  }>;

  console.log("\n=== Sample rows (latest 5) ===");
  for (const r of rows) {
    const titleTrim = (r.title ?? "").slice(0, 80);
    const ts = new Date(r.published_at * 1000).toISOString();
    console.log(
      `[#${r.id}] ${r.external_id} | ${r.lang} | score=${r.engagement_raw} | ${ts} | u/${r.author ?? "?"} | ${titleTrim}`,
    );
    console.log(`    -> ${r.url}`);
  }

  const total = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM items WHERE source_type = 'reddit'`)
      .get() as { c: number }
  ).c;
  console.log(`\nTotal reddit rows in DB: ${total}`);

  const tagged = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT i.id) AS c
         FROM items i JOIN item_tickers it ON it.item_id = i.id
         WHERE i.source_type = 'reddit'`,
      )
      .get() as { c: number }
  ).c;
  console.log(`Tagged reddit rows: ${tagged}`);
}

main().catch((err) => {
  console.error("smoke crashed:", err);
  process.exit(1);
});
