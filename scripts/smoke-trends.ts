import { recomputeTrends } from "../lib/analysis/trends";

async function main() {
  const result = await recomputeTrends();
  console.log("result:", result);
  const { getDb } = await import("../lib/db");
  const rows = getDb()
    .prepare(
      `SELECT ticker_symbol, window, window_start, mention_count, sentiment_avg, velocity
       FROM trend_snapshots
       ORDER BY mention_count DESC
       LIMIT 10`,
    )
    .all();
  console.log("top 10 by mention_count:", rows);
  console.log(`spikes detected: ${result.spikes.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
