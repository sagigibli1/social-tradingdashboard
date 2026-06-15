import { runSentimentBatch } from "../lib/analysis/sentiment";

async function main() {
  const result = await runSentimentBatch({ batchSize: 200, maxBatches: 20 });
  console.log("Sentiment backfill complete:", result);
}

main().catch(console.error);
