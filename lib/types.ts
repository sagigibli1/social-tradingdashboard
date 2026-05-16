// LOCKED Wave 0 contract. Wave 1-4 agents import from here.
// Do NOT modify these exported shapes after Wave 0 ships.

export type SourceType = "twitter" | "reddit" | "rss" | "hn";

export type NormalizedItem = {
  source_type: SourceType;
  external_id: string; // MUST be `${source_type}:${nativeId}`
  url: string; // canonical article/post URL
  title: string | null;
  body: string | null;
  author: string | null;
  published_at: number; // unix seconds UTC
  lang: "en" | "he" | "other";
  engagement_raw: number; // source-native units
  raw_json: unknown;
};

export type IngestResult = {
  source_type: SourceType;
  fetched: number;
  inserted: number;
  skipped_duplicates: number;
  failed: { reason: string; sample: string }[];
};

export interface Ingestor {
  run(): Promise<IngestResult>;
}

// --- Wave 0 additions used internally and by Wave 2 ---

export type TickerCategory = "stock" | "crypto" | "ai-keyword";

export type TickerDef = {
  symbol: string;
  name: string;
  category: TickerCategory;
};

export type MatchType = "cashtag" | "context" | "keyword";

export type TaggedTicker = {
  ticker_symbol: string;
  match_type: MatchType;
  match_confidence: number; // 0..1
};

export type SentimentLabel = "positive" | "negative" | "neutral";

export type Item = {
  id: number;
  source_id: number;
  source_type: SourceType;
  external_id: string;
  url: string;
  title: string | null;
  body: string | null;
  author: string | null;
  published_at: number;
  lang: "en" | "he" | "other";
  engagement_raw: number;
  engagement_normalized: number;
  raw_json: string | null;
  created_at: number;
  updated_at: number;
};

export type SentimentRow = {
  item_id: number;
  ticker_symbol: string;
  label: SentimentLabel;
  score: number; // -1..1
  confidence: number; // 0..1
  summary_he: string | null;
  model_version: string;
  analyzed_at: number;
};

export type TrendWindow = "1h" | "24h" | "7d";

export type TrendSnapshotRow = {
  ticker_symbol: string;
  window: TrendWindow;
  window_start: number;
  mention_count: number;
  sentiment_avg: number | null;
  velocity: number | null;
  updated_at: number;
};
