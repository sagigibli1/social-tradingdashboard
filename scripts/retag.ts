// Re-tags all existing items in the DB with the current ticker list.
// Run after changing lib/tickers.ts to pick up new tickers on old data.

import { getDb, tagTickers } from "../lib/db";

function main() {
  const db = getDb();

  const rows = db
    .prepare(`SELECT id, title, body FROM items`)
    .all() as { id: number; title: string | null; body: string | null }[];

  console.log(`Re-tagging ${rows.length} items...`);

  // Clear existing tags so we start fresh
  db.prepare(`DELETE FROM item_tickers`).run();

  let tagged = 0;
  for (const row of rows) {
    const text = `${row.title ?? ""} ${row.body ?? ""}`.trim();
    if (text.length > 0) {
      tagTickers(row.id, text);
      tagged++;
    }
  }

  console.log(`Done. Tagged ${tagged} items.`);

  const counts = db
    .prepare(
      `SELECT ticker_symbol, COUNT(*) as c FROM item_tickers GROUP BY ticker_symbol ORDER BY c DESC`
    )
    .all() as { ticker_symbol: string; c: number }[];

  console.log("\nMentions per ticker:");
  for (const r of counts) {
    console.log(`  ${r.ticker_symbol}: ${r.c}`);
  }
}

main();
