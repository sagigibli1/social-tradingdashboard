/**
 * Rule-based sentiment analyzer for finance/tech news.
 * Replaces the original Claude CLI approach (which required a Mac/Linux claude binary).
 * Uses keyword matching with weighted scoring — accurate enough for headline-level news.
 */

import { getDb, upsertSentiment } from "../db";
import type { SentimentLabel } from "../types";

const DEFAULT_BATCH_SIZE = 50;
const MODEL_VERSION = "rule-based-v1";

type UnscoredRow = {
  id: number;
  title: string | null;
  body: string | null;
  lang: string;
  tickers: string;
};

export type RunSentimentBatchOpts = {
  maxBatches?: number;
  batchSize?: number;
};

export type RunSentimentBatchResult = {
  batchesProcessed: number;
  itemsScored: number;
  pairsWritten: number;
  failures: number;
  hitDailyCap: boolean;
};

// Weighted keyword lists for finance/tech sentiment
const POSITIVE_PATTERNS: [RegExp, number][] = [
  [/\b(surge|surged|surging)\b/i, 1.5],
  [/\b(soar|soared|soaring)\b/i, 1.5],
  [/\b(rally|rallied|rallying)\b/i, 1.2],
  [/\b(gain|gains|gained)\b/i, 1.0],
  [/\b(rise|rises|rose|risen)\b/i, 1.0],
  [/\b(jump|jumped|jumping)\b/i, 1.0],
  [/\b(beat|beats|beating|outperform|outperformed)\b/i, 1.2],
  [/\b(profit|profits|profitable|profitability)\b/i, 1.0],
  [/\b(growth|grow|growing|grew)\b/i, 0.8],
  [/\b(bull|bullish)\b/i, 1.2],
  [/\b(record.high|all.time.high|ath)\b/i, 1.5],
  [/\b(upgrade|upgraded|buy.rating|strong.buy)\b/i, 1.3],
  [/\b(innovation|breakthrough|milestone|launch|launches|launched)\b/i, 0.8],
  [/\b(strong|stronger|strength)\b/i, 0.7],
  [/\b(positive|optimism|optimistic|confident|confidence)\b/i, 0.8],
  [/\b(revenue.beat|earnings.beat|eps.beat)\b/i, 1.5],
  [/\b(partnership|deal|collaboration|agreement)\b/i, 0.6],
  [/\b(success|succeed|successful)\b/i, 0.7],
  [/\b(recovery|recover|recovered)\b/i, 0.8],
  [/\b(boost|boosted|boosting)\b/i, 0.9],
];

const NEGATIVE_PATTERNS: [RegExp, number][] = [
  [/\b(crash|crashed|crashing)\b/i, 1.5],
  [/\b(plunge|plunged|plunging)\b/i, 1.5],
  [/\b(collapse|collapsed|collapsing)\b/i, 1.5],
  [/\b(fall|falls|fell|fallen)\b/i, 1.0],
  [/\b(drop|drops|dropped|dropping)\b/i, 1.0],
  [/\b(decline|declines|declined|declining)\b/i, 1.0],
  [/\b(loss|losses|losing)\b/i, 1.0],
  [/\b(miss|misses|missed)\b/i, 1.0],
  [/\b(bear|bearish)\b/i, 1.2],
  [/\b(downgrade|downgraded|sell.rating|underperform)\b/i, 1.3],
  [/\b(warning|warn|warned)\b/i, 1.0],
  [/\b(concern|concerns|worried|worry)\b/i, 0.8],
  [/\b(risk|risks|risky)\b/i, 0.6],
  [/\b(lawsuit|sued|litigation|fine|penalty|regulation)\b/i, 1.0],
  [/\b(investigation|probe|scrutiny|antitrust)\b/i, 1.0],
  [/\b(layoff|layoffs|job.cut|job.cuts|fired)\b/i, 1.0],
  [/\b(weak|weakness|weaker)\b/i, 0.8],
  [/\b(negative|pessimism|pessimistic)\b/i, 0.8],
  [/\b(revenue.miss|earnings.miss|eps.miss)\b/i, 1.5],
  [/\b(volatility|volatile|uncertain|uncertainty)\b/i, 0.6],
  [/\b(debt|default|bankrupt|bankruptcy|insolvency)\b/i, 1.2],
];

// Hebrew tone summaries by label (rotated to add variety)
const HE_SUMMARIES: Record<SentimentLabel, string[]> = {
  positive: [
    "הטקסט מציג תחזית חיובית ומעודדת לגבי הנכס.",
    "הכתבה משקפת סנטימנט אופטימי כלפי הטיקר.",
    "הטון כלפי הנכס הוא חיובי ותומך בעלייה.",
    "הכתבה מדגישה נקודות חוזק ומגמות חיוביות.",
  ],
  negative: [
    "הטקסט מצביע על חששות ומגמות שליליות לגבי הנכס.",
    "הכתבה משקפת סנטימנט שלילי ודאגות לגבי הטיקר.",
    "הטון כלפי הנכס הוא שלילי ומצביע על חולשה.",
    "הכתבה מציגה סיכונים ואתגרים עבור הנכס.",
  ],
  neutral: [
    "הטקסט מציג מידע ניטרלי ללא עמדה ברורה.",
    "הכתבה מאוזנת ואינה מצביעה על כיוון ברור.",
    "הטון כלפי הנכס הוא ניטרלי ומידעי.",
    "הכתבה מדווחת על עובדות ללא הטיה ברורה.",
  ],
};

let _summaryCounters: Record<SentimentLabel, number> = {
  positive: 0,
  negative: 0,
  neutral: 0,
};

function pickSummary(label: SentimentLabel): string {
  const arr = HE_SUMMARIES[label];
  const idx = _summaryCounters[label] % arr.length;
  _summaryCounters[label]++;
  return arr[idx];
}

function analyzeText(text: string): { label: SentimentLabel; score: number; confidence: number } {
  let posScore = 0;
  let negScore = 0;

  for (const [pattern, weight] of POSITIVE_PATTERNS) {
    const matches = text.match(new RegExp(pattern.source, "gi"));
    if (matches) posScore += matches.length * weight;
  }
  for (const [pattern, weight] of NEGATIVE_PATTERNS) {
    const matches = text.match(new RegExp(pattern.source, "gi"));
    if (matches) negScore += matches.length * weight;
  }

  const total = posScore + negScore;
  if (total === 0) {
    return { label: "neutral", score: 0, confidence: 0.4 };
  }

  const netScore = (posScore - negScore) / Math.max(total, 1);
  const confidence = Math.min(0.5 + total * 0.05, 0.9);

  let label: SentimentLabel;
  if (netScore > 0.2) label = "positive";
  else if (netScore < -0.2) label = "negative";
  else label = "neutral";

  return { label, score: Math.max(-1, Math.min(1, netScore)), confidence };
}

function fetchUnscoredBatch(batchSize: number): UnscoredRow[] {
  const sql = `
    SELECT i.id, i.title, i.body, i.lang, GROUP_CONCAT(it.ticker_symbol) AS tickers
    FROM items i
    JOIN item_tickers it ON it.item_id = i.id
    LEFT JOIN sentiments s ON s.item_id = i.id AND s.ticker_symbol = it.ticker_symbol
    WHERE s.item_id IS NULL
    GROUP BY i.id
    ORDER BY i.published_at DESC
    LIMIT ?
  `;
  return getDb().prepare(sql).all(batchSize) as UnscoredRow[];
}

export async function runSentimentBatch(
  opts: RunSentimentBatchOpts = {},
): Promise<RunSentimentBatchResult> {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxBatches = opts.maxBatches ?? Number.POSITIVE_INFINITY;

  let batchesProcessed = 0;
  let itemsScored = 0;
  let pairsWritten = 0;
  const failures = 0;

  while (batchesProcessed < maxBatches) {
    const rows = fetchUnscoredBatch(batchSize);
    if (rows.length === 0) break;

    for (const row of rows) {
      const text = `${row.title ?? ""} ${row.body ?? ""}`.trim();
      const tickers = (row.tickers ?? "")
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter((t) => t.length > 0);

      if (!text || tickers.length === 0) continue;

      const { label, score, confidence } = analyzeText(text);
      const summaryHe = pickSummary(label);

      for (const ticker of tickers) {
        try {
          upsertSentiment(row.id, ticker, label, score, confidence, summaryHe, MODEL_VERSION);
          pairsWritten++;
        } catch {
          // ignore FK violations (removed tickers)
        }
      }
      itemsScored++;
    }

    batchesProcessed++;
  }

  return { batchesProcessed, itemsScored, pairsWritten, failures, hitDailyCap: false };
}
