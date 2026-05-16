// Wave 2 - Agent F: Trends aggregator.
// Pure SQL. No LLM calls. Idempotent UPSERT into trend_snapshots.
//
// Window convention:
//   window_start = unix-seconds timestamp of the START of the CURRENT bucket
//   that the call falls into.
//     - "1h":  Math.floor(now / 3600) * 3600           (top of current hour)
//     - "24h": Math.floor(now / 3600) * 3600           (rolling 24h ending at top of current hour)
//     - "7d":  Math.floor(now / 86400) * 86400         (start of current UTC day)
//   The "current window" spans [window_start, window_start + bucket_size).
//   The "prior window" spans  [window_start - bucket_size, window_start).
//
// Velocity = current_mention_count / max(1, prior_mention_count).
// Spike    = velocity > 2.0 AND mention_count >= 3 (mention floor avoids 0->1 inf-noise).

import { getDb, upsertTrendSnapshot } from "../db";
import type { TrendWindow } from "../types";

const HOUR_SEC = 3600;
const DAY_SEC = 86400;
const WEEK_SEC = 7 * DAY_SEC;

const WINDOWS: TrendWindow[] = ["1h", "24h", "7d"];

export type ComputedSnapshot = {
  ticker_symbol: string;
  window: TrendWindow;
  window_start: number;
  mention_count: number;
  sentiment_avg: number | null;
  velocity: number;
};

export type Spike = ComputedSnapshot & { kind: "spike" };

export type RecomputeResult = {
  snapshotsWritten: number;
  tickersCovered: number;
  spikes: Spike[];
  windows: TrendWindow[];
};

type WindowSpec = {
  window: TrendWindow;
  windowStart: number; // start of current bucket
  curStart: number;
  curEnd: number;
  prevStart: number;
  prevEnd: number;
};

type AggRow = {
  ticker_symbol: string;
  cur_count: number;
  prev_count: number;
  sentiment_avg: number | null;
};

function bucketStart(window: TrendWindow, now: number): number {
  switch (window) {
    case "1h":
    case "24h":
      return Math.floor(now / HOUR_SEC) * HOUR_SEC;
    case "7d":
      return Math.floor(now / DAY_SEC) * DAY_SEC;
    default:
      throw new Error(`unknown window: ${window as string}`);
  }
}

function windowSize(window: TrendWindow): number {
  switch (window) {
    case "1h":
      return HOUR_SEC;
    case "24h":
      return DAY_SEC;
    case "7d":
      return WEEK_SEC;
    default:
      throw new Error(`unknown window: ${window as string}`);
  }
}

function buildSpec(window: TrendWindow, now: number): WindowSpec {
  const size = windowSize(window);
  const windowStart = bucketStart(window, now);
  // 24h is special: we want a rolling-24h view (matches how users read "last day")
  // so the current window LOOKS BACK from windowStart, while 1h/7d look FORWARD
  // from windowStart to keep calendar-aligned buckets stable across reruns.
  const lookBack = window === "24h";
  const curStart = lookBack ? windowStart - size : windowStart;
  const curEnd = lookBack ? windowStart : windowStart + size;
  const prevEnd = curStart;
  const prevStart = curStart - size;
  return { window, windowStart, curStart, curEnd, prevStart, prevEnd };
}

const AGG_SQL = `
  SELECT
    it.ticker_symbol AS ticker_symbol,
    SUM(CASE WHEN i.published_at >= @cur_start  AND i.published_at < @cur_end  THEN 1 ELSE 0 END) AS cur_count,
    SUM(CASE WHEN i.published_at >= @prev_start AND i.published_at < @prev_end THEN 1 ELSE 0 END) AS prev_count,
    AVG(CASE WHEN i.published_at >= @cur_start  AND i.published_at < @cur_end  THEN s.score END) AS sentiment_avg
  FROM item_tickers it
  JOIN items i ON i.id = it.item_id
  LEFT JOIN sentiments s
    ON s.item_id = it.item_id
   AND s.ticker_symbol = it.ticker_symbol
  WHERE i.published_at >= @prev_start
    AND i.published_at < @cur_end
  GROUP BY it.ticker_symbol
`;

function aggregateForWindow(spec: WindowSpec): AggRow[] {
  const db = getDb();
  const rows = db.prepare(AGG_SQL).all({
    cur_start: spec.curStart,
    cur_end: spec.curEnd,
    prev_start: spec.prevStart,
    prev_end: spec.prevEnd,
  }) as AggRow[];
  return rows;
}

function allTickerSymbols(): string[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT symbol FROM tickers ORDER BY symbol`)
    .all() as { symbol: string }[];
  return rows.map((r) => r.symbol);
}

export async function recomputeTrends(opts?: {
  now?: number;
}): Promise<RecomputeResult> {
  const now = opts?.now ?? Math.floor(Date.now() / 1000);

  const allTickers = allTickerSymbols();
  const coveredTickerSet = new Set<string>();
  const spikes: Spike[] = [];
  let snapshotsWritten = 0;

  for (const window of WINDOWS) {
    const spec = buildSpec(window, now);
    const rows = aggregateForWindow(spec);
    const byTicker = new Map<string, AggRow>();
    for (const r of rows) byTicker.set(r.ticker_symbol, r);

    // UPSERT one row per (ticker, window, windowStart). For tickers with no
    // mentions in either window, still write a zeroed row so the UI can
    // distinguish "no mentions" from "ticker doesn't exist".
    for (const ticker of allTickers) {
      const agg = byTicker.get(ticker);
      const cur = Number(agg?.cur_count ?? 0);
      const prev = Number(agg?.prev_count ?? 0);
      const rawAvg = agg?.sentiment_avg ?? null;
      const sentimentAvg = rawAvg === null ? null : Number(rawAvg);
      const velocity = cur / Math.max(1, prev);

      upsertTrendSnapshot(
        ticker,
        window,
        spec.windowStart,
        cur,
        sentimentAvg,
        velocity,
      );
      snapshotsWritten += 1;
      if (cur > 0) coveredTickerSet.add(ticker);

      if (velocity > 2.0 && cur >= 3) {
        spikes.push({
          kind: "spike",
          ticker_symbol: ticker,
          window,
          window_start: spec.windowStart,
          mention_count: cur,
          sentiment_avg: sentimentAvg,
          velocity,
        });
      }
    }
  }

  return {
    snapshotsWritten,
    tickersCovered: coveredTickerSet.size,
    spikes,
    windows: WINDOWS,
  };
}
