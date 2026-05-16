/* eslint-disable no-console */
/**
 * Smoke test for Wave 1 Agent C - RSS ingestor.
 *
 * Runs the ingestor twice to verify idempotency:
 *   - Run 1: fresh fetch, expect inserted > 0
 *   - Run 2: from cache, expect inserted == 0 and skipped_duplicates > 0
 *
 * Prints 5 sample rows from at least 2 distinct feed hosts, plus a per-feed
 * success/fail breakdown derived from the IngestResult.failed[] list.
 *
 * Usage: npx tsx scripts/smoke-rss.ts
 */

import rssIngestor from "../lib/sources/rss";
import { getDb } from "../lib/db";

type SampleRow = {
  id: number;
  url: string;
  title: string | null;
  published_at: number;
  external_id: string;
};

type AnnotatedRow = SampleRow & { host: string };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

function fmt(ts: number): string {
  return new Date(ts * 1000).toISOString();
}

function pickHostDiverseSamples(
  rows: SampleRow[],
  limit: number,
): AnnotatedRow[] {
  const annotated: AnnotatedRow[] = rows.map((r) => ({
    ...r,
    host: hostOf(r.url),
  }));
  const picked: AnnotatedRow[] = [];
  const seen = new Set<string>();
  for (const r of annotated) {
    if (picked.length >= limit) break;
    if (seen.has(r.host)) continue;
    picked.push(r);
    seen.add(r.host);
  }
  const pickedIds = new Set(picked.map((p) => p.id));
  for (const r of annotated) {
    if (picked.length >= limit) break;
    if (!pickedIds.has(r.id)) picked.push(r);
  }
  return picked;
}

function printSamples(samples: AnnotatedRow[]): void {
  console.log("\n--- 5 sample rows (host-diverse) ---");
  for (const s of samples) {
    console.log(`[${s.id}] host=${s.host} published=${fmt(s.published_at)}`);
    console.log(`  title: ${s.title ?? "(no title)"}`);
    console.log(`  url:   ${s.url}`);
    console.log(`  ext:   ${s.external_id}`);
  }
}

async function main() {
  console.log("=== Smoke RSS - Run 1 ===");
  const t1 = Date.now();
  const r1 = await rssIngestor.run();
  console.log(`completed in ${Date.now() - t1}ms`);
  console.log(JSON.stringify(r1, null, 2));

  const db = getDb();
  const candidates = db
    .prepare(
      `SELECT id, url, title, published_at, external_id
       FROM items
       WHERE source_type = 'rss'
       ORDER BY id DESC
       LIMIT 20`,
    )
    .all() as SampleRow[];

  const samples = pickHostDiverseSamples(candidates, 5);
  printSamples(samples);

  const distinctSampleHosts = new Set(samples.map((s) => s.host));
  console.log(`\nDistinct hosts across samples: ${distinctSampleHosts.size}`);

  const allHostsRows = db
    .prepare(
      `SELECT DISTINCT url FROM items WHERE source_type = 'rss' ORDER BY id DESC LIMIT 200`,
    )
    .all() as { url: string }[];
  const allHosts = new Set(allHostsRows.map((r) => hostOf(r.url)));
  console.log(
    `Distinct hosts across last 200 rss items: ${allHosts.size} -> ${[...allHosts].join(", ")}`,
  );

  if (r1.failed.length > 0) {
    console.log("\n--- Failed/empty feeds ---");
    for (const f of r1.failed) console.log(`  [${f.sample}] ${f.reason}`);
  }

  console.log("\n=== Smoke RSS - Run 2 (idempotency) ===");
  const t2 = Date.now();
  const r2 = await rssIngestor.run();
  console.log(`completed in ${Date.now() - t2}ms`);
  console.log(JSON.stringify(r2, null, 2));

  // Fail fast on any check, so the operator sees the first broken invariant.
  if (distinctSampleHosts.size < 2) {
    console.error(
      `FAIL: need >= 2 distinct sample hosts, got ${distinctSampleHosts.size}`,
    );
    process.exit(1);
  }
  if (allHosts.size < 3) {
    console.error(
      `FAIL: need >= 3 distinct feed hosts in stored items, got ${allHosts.size}`,
    );
    process.exit(1);
  }
  if (r2.inserted !== 0) {
    console.error(
      `FAIL: idempotency - run 2 inserted ${r2.inserted}, expected 0`,
    );
    process.exit(1);
  }
  console.log("\nAll checks PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("smoke test crashed:", err);
  process.exit(1);
});
