import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

import { tagText } from "./ticker-tagger";
import { SEED_TICKERS } from "./tickers";
import type {
  Item,
  NormalizedItem,
  SentimentLabel,
  SourceType,
  TaggedTicker,
  TrendWindow,
} from "./types";

const DB_PATH = path.join(process.cwd(), "db", "tradingdashboard.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  initSchema(_db);
  seedTickers(_db);
  return _db;
}

function initSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL CHECK(source_type IN ('twitter','reddit','rss','hn')),
      handle TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_synced_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(source_type, handle)
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES sources(id),
      source_type TEXT NOT NULL CHECK(source_type IN ('twitter','reddit','rss','hn')),
      external_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT, body TEXT, author TEXT,
      published_at INTEGER NOT NULL,
      lang TEXT NOT NULL DEFAULT 'en' CHECK(lang IN ('en','he','other')),
      engagement_raw INTEGER NOT NULL DEFAULT 0,
      engagement_normalized REAL NOT NULL DEFAULT 0,
      raw_json TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(source_type, external_id)
    );
    CREATE INDEX IF NOT EXISTS idx_items_published ON items(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_items_source_pub ON items(source_type, published_at DESC);

    CREATE TABLE IF NOT EXISTS tickers (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('stock','crypto','ai-keyword'))
    );

    CREATE TABLE IF NOT EXISTS item_tickers (
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      ticker_symbol TEXT NOT NULL REFERENCES tickers(symbol),
      match_type TEXT NOT NULL CHECK(match_type IN ('cashtag','context','keyword')),
      match_confidence REAL NOT NULL DEFAULT 1.0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY(item_id, ticker_symbol)
    );

    CREATE TABLE IF NOT EXISTS sentiments (
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      ticker_symbol TEXT NOT NULL REFERENCES tickers(symbol),
      label TEXT NOT NULL CHECK(label IN ('positive','negative','neutral')),
      score REAL NOT NULL CHECK(score BETWEEN -1 AND 1),
      confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
      summary_he TEXT,
      model_version TEXT NOT NULL,
      analyzed_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY(item_id, ticker_symbol)
    );

    CREATE TABLE IF NOT EXISTS trend_snapshots (
      ticker_symbol TEXT NOT NULL REFERENCES tickers(symbol),
      window TEXT NOT NULL CHECK(window IN ('1h','24h','7d')),
      window_start INTEGER NOT NULL,
      mention_count INTEGER NOT NULL,
      sentiment_avg REAL,
      velocity REAL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY(ticker_symbol, window, window_start)
    );
    CREATE INDEX IF NOT EXISTS idx_trend_recent ON trend_snapshots(ticker_symbol, window, window_start DESC);
  `);
}

function seedTickers(database: Database.Database) {
  const stmt = database.prepare(
    `INSERT INTO tickers (symbol, name, category) VALUES (?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET name=excluded.name, category=excluded.category`,
  );
  database.transaction(() => {
    for (const t of SEED_TICKERS) stmt.run(t.symbol, t.name, t.category);
  })();
}

// Shared prepared statement for ticker tagging - used by both insertItems and tagTickers.
// Lazy because schema must exist first.
let _insertTickerTag: Database.Statement | null = null;
function insertTickerTagStmt(): Database.Statement {
  if (_insertTickerTag) return _insertTickerTag;
  _insertTickerTag = getDb().prepare(`
    INSERT INTO item_tickers (item_id, ticker_symbol, match_type, match_confidence)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(item_id, ticker_symbol) DO NOTHING
  `);
  return _insertTickerTag;
}

function applyTickerTags(itemId: number, tags: TaggedTicker[]): void {
  const stmt = insertTickerTagStmt();
  for (const t of tags)
    stmt.run(itemId, t.ticker_symbol, t.match_type, t.match_confidence);
}

// --- Public API consumed by Wave 1/2 agents -------------------------------

export function getExistingExternalIds(
  source_type: SourceType,
  ids: string[],
): Set<string> {
  if (ids.length === 0) return new Set();
  const db = getDb();
  // Chunk to avoid SQLite's 999-parameter limit on huge ingests.
  const out = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const placeholders = slice.map(() => "?").join(",");
    const sql = `SELECT external_id FROM items WHERE source_type = ? AND external_id IN (${placeholders})`;
    const rows = db.prepare(sql).all(source_type, ...slice) as {
      external_id: string;
    }[];
    for (const r of rows) out.add(r.external_id);
  }
  return out;
}

// Idempotent insert keyed on UNIQUE(source_type, external_id).
// Also tags tickers for each inserted item in the same transaction.
export function insertItems(items: NormalizedItem[]): {
  inserted: number;
  skipped: number;
} {
  if (items.length === 0) return { inserted: 0, skipped: 0 };
  const db = getDb();

  const ensureSource = db.prepare(
    `INSERT INTO sources (source_type, handle) VALUES (?, ?)
     ON CONFLICT(source_type, handle) DO UPDATE SET enabled=enabled
     RETURNING id`,
  );

  const insertItem = db.prepare(`
    INSERT INTO items (
      source_id, source_type, external_id, url, title, body, author,
      published_at, lang, engagement_raw, engagement_normalized, raw_json
    ) VALUES (
      @source_id, @source_type, @external_id, @url, @title, @body, @author,
      @published_at, @lang, @engagement_raw, @engagement_normalized, @raw_json
    )
    ON CONFLICT(source_type, external_id) DO NOTHING
    RETURNING id
  `);

  let inserted = 0;
  let skipped = 0;

  const tx = db.transaction((batch: NormalizedItem[]) => {
    for (const it of batch) {
      const handle = deriveHandle(it);
      const sourceRow = ensureSource.get(it.source_type, handle) as {
        id: number;
      };
      const engagement_normalized = normalizeEngagement(
        it.source_type,
        it.engagement_raw,
      );
      const row = insertItem.get({
        source_id: sourceRow.id,
        source_type: it.source_type,
        external_id: it.external_id,
        url: it.url,
        title: it.title,
        body: it.body,
        author: it.author,
        published_at: it.published_at,
        lang: it.lang,
        engagement_raw: it.engagement_raw,
        engagement_normalized,
        raw_json: it.raw_json ? JSON.stringify(it.raw_json) : null,
      }) as { id: number } | undefined;

      if (!row) {
        skipped += 1;
        continue;
      }

      inserted += 1;
      const text = `${it.title ?? ""} ${it.body ?? ""}`.trim();
      applyTickerTags(row.id, tagText(text));
    }
  });
  tx(items);

  return { inserted, skipped };
}

function deriveHandle(it: NormalizedItem): string {
  // Stable per-source-account grouping. Wave 1 agents can override author beforehand
  // if they want feed-level rather than author-level granularity (e.g. RSS feed name).
  return it.author ?? `${it.source_type}-unknown`;
}

// Backfill helper - insertItems already tags inline, this is for re-tagging stored rows.
export function tagTickers(itemId: number, text: string): TaggedTicker[] {
  const tags = tagText(text);
  if (tags.length === 0) return [];
  getDb().transaction(() => applyTickerTags(itemId, tags))();
  return tags;
}

export function getUnscoredItems(limit: number): Item[] {
  const db = getDb();
  // "Unscored" = items that have at least one ticker tag but no sentiment row yet.
  const sql = `
    SELECT i.*
    FROM items i
    JOIN item_tickers it ON it.item_id = i.id
    LEFT JOIN sentiments s ON s.item_id = i.id
    WHERE s.item_id IS NULL
    GROUP BY i.id
    ORDER BY i.published_at DESC
    LIMIT ?
  `;
  return db.prepare(sql).all(limit) as Item[];
}

export function upsertSentiment(
  item_id: number,
  ticker_symbol: string,
  label: SentimentLabel,
  score: number,
  confidence: number,
  summary_he: string | null,
  model_version: string,
): void {
  const db = getDb();
  db.prepare(
    `
    INSERT INTO sentiments (item_id, ticker_symbol, label, score, confidence, summary_he, model_version, analyzed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(item_id, ticker_symbol) DO UPDATE SET
      label=excluded.label,
      score=excluded.score,
      confidence=excluded.confidence,
      summary_he=excluded.summary_he,
      model_version=excluded.model_version,
      analyzed_at=excluded.analyzed_at
  `,
  ).run(
    item_id,
    ticker_symbol,
    label,
    score,
    confidence,
    summary_he,
    model_version,
  );
}

export function upsertTrendSnapshot(
  ticker_symbol: string,
  window: TrendWindow,
  window_start: number,
  mention_count: number,
  sentiment_avg: number | null,
  velocity: number | null,
): void {
  const db = getDb();
  db.prepare(
    `
    INSERT INTO trend_snapshots (ticker_symbol, window, window_start, mention_count, sentiment_avg, velocity, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(ticker_symbol, window, window_start) DO UPDATE SET
      mention_count=excluded.mention_count,
      sentiment_avg=excluded.sentiment_avg,
      velocity=excluded.velocity,
      updated_at=excluded.updated_at
  `,
  ).run(
    ticker_symbol,
    window,
    window_start,
    mention_count,
    sentiment_avg,
    velocity,
  );
}

// --- Wave 3 read-only query helpers (UI-side) -----------------------------
// All additive. No schema changes, no behaviour changes to the helpers above.

export type FeedItemRow = {
  id: number;
  source_type: SourceType;
  url: string;
  title: string | null;
  body: string | null;
  author: string | null;
  published_at: number;
  lang: "en" | "he" | "other";
  engagement_normalized: number;
  engagement_raw: number;
  tickers: string; // comma-joined ticker symbols
  sentiment_label: SentimentLabel | null; // dominant per-item sentiment
  sentiment_count: number;
};

export function queryFeedItems(opts: {
  sources?: SourceType[];
  tickers?: string[];
  lang?: "en" | "he" | "other";
  limit?: number;
  offset?: number;
}): FeedItemRow[] {
  const db = getDb();
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (opts.sources && opts.sources.length > 0) {
    const placeholders = opts.sources
      .map((s, idx) => {
        const key = `src_${idx}`;
        params[key] = s;
        return `@${key}`;
      })
      .join(",");
    where.push(`i.source_type IN (${placeholders})`);
  }
  if (opts.lang) {
    where.push(`i.lang = @lang`);
    params.lang = opts.lang;
  }

  let tickerJoin = "";
  if (opts.tickers && opts.tickers.length > 0) {
    const tplaceholders = opts.tickers
      .map((t, idx) => {
        const key = `tk_${idx}`;
        params[key] = t;
        return `@${key}`;
      })
      .join(",");
    tickerJoin = `
      JOIN item_tickers it_filter
        ON it_filter.item_id = i.id
       AND it_filter.ticker_symbol IN (${tplaceholders})
    `;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Math.max(1, opts.limit ?? 100), 500);
  const offset = Math.max(0, opts.offset ?? 0);
  params.limit = limit;
  params.offset = offset;

  const sql = `
    SELECT
      i.id,
      i.source_type,
      i.url,
      i.title,
      i.body,
      i.author,
      i.published_at,
      i.lang,
      i.engagement_normalized,
      i.engagement_raw,
      COALESCE(
        (SELECT GROUP_CONCAT(ticker_symbol) FROM item_tickers it WHERE it.item_id = i.id),
        ''
      ) AS tickers,
      (
        SELECT s.label FROM sentiments s
        WHERE s.item_id = i.id
        ORDER BY s.confidence DESC
        LIMIT 1
      ) AS sentiment_label,
      (SELECT COUNT(*) FROM sentiments s2 WHERE s2.item_id = i.id) AS sentiment_count
    FROM items i
    ${tickerJoin}
    ${whereSql}
    GROUP BY i.id
    ORDER BY i.published_at DESC
    LIMIT @limit OFFSET @offset
  `;
  return db.prepare(sql).all(params) as FeedItemRow[];
}

export type ItemSentimentRow = {
  ticker_symbol: string;
  label: SentimentLabel;
  score: number;
  confidence: number;
  summary_he: string | null;
  analyzed_at: number;
};

export function getItemSentiments(itemId: number): ItemSentimentRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT ticker_symbol, label, score, confidence, summary_he, analyzed_at
       FROM sentiments WHERE item_id = ?
       ORDER BY confidence DESC`,
    )
    .all(itemId) as ItemSentimentRow[];
}

export type TrendingTickerRow = {
  ticker_symbol: string;
  ticker_name: string;
  category: string;
  mention_count: number;
  sentiment_avg: number | null;
  velocity: number | null;
  window_start: number;
};

export function queryTrendingTickers(
  window: TrendWindow,
  limit = 20,
): TrendingTickerRow[] {
  const db = getDb();
  // Pick the latest snapshot per ticker for this window.
  const sql = `
    WITH latest AS (
      SELECT ts.*,
        ROW_NUMBER() OVER (PARTITION BY ts.ticker_symbol ORDER BY ts.window_start DESC) AS rn
      FROM trend_snapshots ts
      WHERE ts.window = @window
    )
    SELECT l.ticker_symbol,
           t.name AS ticker_name,
           t.category AS category,
           l.mention_count,
           l.sentiment_avg,
           l.velocity,
           l.window_start
    FROM latest l
    JOIN tickers t ON t.symbol = l.ticker_symbol
    WHERE l.rn = 1
    ORDER BY l.mention_count DESC, l.velocity DESC
    LIMIT @limit
  `;
  return db.prepare(sql).all({ window, limit }) as TrendingTickerRow[];
}

export type TrendSeriesPoint = {
  window_start: number;
  mention_count: number;
  velocity: number | null;
  sentiment_avg: number | null;
};

export function getTrendSeries(
  ticker: string,
  window: TrendWindow,
  limit = 50,
): TrendSeriesPoint[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT window_start, mention_count, velocity, sentiment_avg
       FROM trend_snapshots
       WHERE ticker_symbol = ? AND window = ?
       ORDER BY window_start DESC
       LIMIT ?`,
    )
    .all(ticker, window, limit) as TrendSeriesPoint[];
  return rows.reverse(); // chronological for chart consumption
}

export type MentionTimePoint = {
  window_start: number;
  mention_count: number;
  sentiment_avg: number | null;
};

// Real time-series of mentions for a ticker, bucketed from the items table.
// 1h window  -> 12 buckets of 5 minutes
// 24h window -> 24 buckets of 1 hour
// 7d window  -> 7 buckets of 1 day
// Buckets with zero mentions are filled in so the chart shows continuous time.
export function getMentionTimeSeries(
  ticker: string,
  window: TrendWindow,
  nowSec: number = Math.floor(Date.now() / 1000),
): MentionTimePoint[] {
  const db = getDb();
  const config: Record<TrendWindow, { bucketSec: number; buckets: number }> = {
    "1h": { bucketSec: 300, buckets: 12 },
    "24h": { bucketSec: 3600, buckets: 24 },
    "7d": { bucketSec: 86400, buckets: 7 },
  };
  const { bucketSec, buckets } = config[window];
  if (!Number.isInteger(bucketSec) || bucketSec <= 0) {
    throw new Error(`invalid bucket size: ${bucketSec}`);
  }
  // Snap "now" to the next bucket boundary so the rightmost bar is the current bucket.
  const endBucket = Math.floor(nowSec / bucketSec) * bucketSec + bucketSec;
  const startBucket = endBucket - bucketSec * buckets;

  const rows = db
    .prepare(
      // bucketSec is inlined into the SQL because better-sqlite3's named-param
      // binding promotes JS numbers to REAL, which breaks SQLite's
      // (x / bucket) * bucket integer-truncation trick. Validated above.
      `SELECT (i.published_at / ${bucketSec}) * ${bucketSec} AS bucket_start,
              COUNT(*) AS mention_count,
              AVG(s.score) AS sentiment_avg
         FROM item_tickers it
         JOIN items i ON i.id = it.item_id
         LEFT JOIN sentiments s ON s.item_id = i.id AND s.ticker_symbol = it.ticker_symbol
        WHERE it.ticker_symbol = ?
          AND i.published_at >= ?
          AND i.published_at < ?
        GROUP BY bucket_start
        ORDER BY bucket_start ASC`,
    )
    .all(ticker, startBucket, endBucket) as {
    bucket_start: number;
    mention_count: number;
    sentiment_avg: number | null;
  }[];

  const byBucket = new Map<
    number,
    { mention_count: number; sentiment_avg: number | null }
  >();
  for (const r of rows) {
    byBucket.set(r.bucket_start, {
      mention_count: r.mention_count,
      sentiment_avg: r.sentiment_avg,
    });
  }

  const out: MentionTimePoint[] = [];
  for (let i = 0; i < buckets; i++) {
    const bucketStart = startBucket + i * bucketSec;
    const hit = byBucket.get(bucketStart);
    out.push({
      window_start: bucketStart,
      mention_count: hit ? hit.mention_count : 0,
      sentiment_avg: hit ? hit.sentiment_avg : null,
    });
  }
  return out;
}

export type SourceBreakdownRow = {
  source_type: SourceType;
  mention_count: number;
};

// Per-source mention split for a single ticker within the chosen window.
// Lets the dashboard show "where is this ticker being discussed" (Twitter vs Reddit vs RSS vs HN).
export function getSourceBreakdownForTicker(
  ticker: string,
  window: TrendWindow,
  nowSec: number = Math.floor(Date.now() / 1000),
): SourceBreakdownRow[] {
  const db = getDb();
  const windowSec: Record<TrendWindow, number> = {
    "1h": 3600,
    "24h": 86400,
    "7d": 7 * 86400,
  };
  const since = nowSec - windowSec[window];
  const rows = db
    .prepare(
      `SELECT i.source_type AS source_type, COUNT(*) AS mention_count
         FROM item_tickers it
         JOIN items i ON i.id = it.item_id
        WHERE it.ticker_symbol = ?
          AND i.published_at >= ?
        GROUP BY i.source_type
        ORDER BY mention_count DESC`,
    )
    .all(ticker, since) as SourceBreakdownRow[];

  // Always return all 4 source types so the UI can render an honest 0 for missing ones.
  const all: SourceType[] = ["twitter", "reddit", "rss", "hn"];
  const map = new Map<SourceType, number>(
    rows.map((r) => [r.source_type, r.mention_count]),
  );
  return all.map((s) => ({
    source_type: s,
    mention_count: map.get(s) ?? 0,
  }));
}

export type TickerSentimentSummary = {
  ticker_symbol: string;
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  avg_score: number;
  recent: {
    item_id: number;
    summary_he: string | null;
    label: SentimentLabel;
    score: number;
    published_at: number;
    url: string;
    title: string | null;
  }[];
};

export function getTickerSentimentSummary(
  ticker: string,
  recentLimit = 20,
): TickerSentimentSummary {
  const db = getDb();
  const counts = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN label='positive' THEN 1 ELSE 0 END) AS positive,
         SUM(CASE WHEN label='negative' THEN 1 ELSE 0 END) AS negative,
         SUM(CASE WHEN label='neutral'  THEN 1 ELSE 0 END) AS neutral,
         COALESCE(AVG(score), 0) AS avg_score
       FROM sentiments WHERE ticker_symbol = ?`,
    )
    .get(ticker) as {
    total: number;
    positive: number;
    negative: number;
    neutral: number;
    avg_score: number;
  };

  const recent = db
    .prepare(
      `SELECT s.item_id, s.summary_he, s.label, s.score, i.published_at, i.url, i.title
       FROM sentiments s
       JOIN items i ON i.id = s.item_id
       WHERE s.ticker_symbol = ?
       ORDER BY i.published_at DESC
       LIMIT ?`,
    )
    .all(ticker, recentLimit) as TickerSentimentSummary["recent"];

  return {
    ticker_symbol: ticker,
    total: counts?.total ?? 0,
    positive: counts?.positive ?? 0,
    negative: counts?.negative ?? 0,
    neutral: counts?.neutral ?? 0,
    avg_score: counts?.avg_score ?? 0,
    recent,
  };
}

export type SourceSummaryRow = {
  source_type: SourceType;
  handle: string;
  enabled: number;
  last_synced_at: number | null;
  item_count: number;
};

export function getSourceSummary(): SourceSummaryRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT s.source_type, s.handle, s.enabled, s.last_synced_at,
              COALESCE((SELECT COUNT(*) FROM items i WHERE i.source_id = s.id), 0) AS item_count
       FROM sources s
       ORDER BY s.source_type, s.handle`,
    )
    .all() as SourceSummaryRow[];
}

export type SourceTypeStats = {
  source_type: SourceType;
  item_count: number;
  last_published_at: number | null;
};

export function getSourceTypeStats(): SourceTypeStats[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT source_type,
              COUNT(*) AS item_count,
              MAX(published_at) AS last_published_at
       FROM items
       GROUP BY source_type
       ORDER BY source_type`,
    )
    .all() as SourceTypeStats[];
}

export type AllTickerRow = { symbol: string; name: string; category: string };

export function getAllTickers(): AllTickerRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT symbol, name, category FROM tickers ORDER BY symbol`)
    .all() as AllTickerRow[];
}

// Per-source 30-day rolling percentile rank of `raw`. If the source has no prior
// items yet, falls back to 0.5 (neutral) so the first sync isn't ranked against nothing.
const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60;

export function normalizeEngagement(
  source_type: SourceType,
  raw: number,
): number {
  const db = getDb();
  const cutoff = Math.floor(Date.now() / 1000) - THIRTY_DAYS_SEC;
  const row = db
    .prepare(
      `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN engagement_raw <= ? THEN 1 ELSE 0 END) AS leq
    FROM items
    WHERE source_type = ? AND created_at >= ?
  `,
    )
    .get(raw, source_type, cutoff) as { total: number; leq: number };

  if (!row || row.total === 0) return 0.5;
  // Percentile rank: fraction of historical items <= raw.
  return Math.max(0, Math.min(1, row.leq / row.total));
}
