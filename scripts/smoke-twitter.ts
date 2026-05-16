// Wave 1 smoke test for the Twitter ingestor.
// Run: cd /Users/peleg/Peleg/tradingdashboard && npx tsx scripts/smoke-twitter.ts
// Loads .env.local manually because tsx does not auto-load Next.js env files.

import fs from "fs";
import path from "path";

function loadDotenvLocal(): void {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadDotenvLocal();

import twitter from "../lib/sources/twitter";

async function main(): Promise<void> {
  const result = await twitter.run();
  console.log("result:", JSON.stringify(result, null, 2));

  const { getDb } = await import("../lib/db");
  const rows = getDb()
    .prepare(
      `SELECT id, external_id, url, author, published_at, lang
       FROM items
       WHERE source_type = 'twitter'
       ORDER BY published_at DESC
       LIMIT 5`,
    )
    .all();
  console.log("5 latest twitter items:");
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
