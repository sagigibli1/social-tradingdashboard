/**
 * Wave 1 Agent C - RSS ingestor.
 *
 * Parallel-fetches a hardcoded set of finance/tech/crypto RSS feeds, normalizes
 * each item into the shared NormalizedItem shape, and inserts via db.ts.
 *
 * Notes:
 * - Bloomberg + Reuters intentionally excluded (they killed their public RSS).
 *   We rely on Google News aggregator + Yahoo per-ticker + CNBC + MarketWatch.
 * - Promise.allSettled per feed: one dead feed never poisons the whole sync.
 * - 15-min cache at db/cache/rss.json keyed by feed URL.
 * - rss-parser exposes `contentSnippet` (HTML stripped) - prefer that over `content`.
 */

import fs from "fs";
import path from "path";
import Parser from "rss-parser";

import { getExistingExternalIds, insertItems } from "../db";
import type { IngestResult, Ingestor, NormalizedItem } from "../types";

// --- Feed list (seeds) -----------------------------------------------------

const FEEDS: { url: string; label: string }[] = [
  // Google News aggregator - broadest free coverage
  {
    label: "google-news:stocks",
    url: "https://news.google.com/rss/search?q=NVDA+OR+AAPL+OR+GOOGL+OR+MSFT+OR+META+OR+AMZN+OR+TSLA+when:1d&hl=en-US&gl=US&ceid=US:en",
  },
  {
    label: "google-news:crypto",
    url: "https://news.google.com/rss/search?q=BTC+OR+ETH+OR+SOL+OR+crypto+when:1d&hl=en-US&gl=US&ceid=US:en",
  },
  {
    label: "google-news:ai",
    url: "https://news.google.com/rss/search?q=AI+OR+LLM+OR+OpenAI+OR+Anthropic+when:1d&hl=en-US&gl=US&ceid=US:en",
  },
  // Yahoo Finance per-ticker
  { label: "yahoo:NVDA", url: "https://finance.yahoo.com/rss/headline?s=NVDA" },
  { label: "yahoo:AAPL", url: "https://finance.yahoo.com/rss/headline?s=AAPL" },
  { label: "yahoo:TSLA", url: "https://finance.yahoo.com/rss/headline?s=TSLA" },
  {
    label: "yahoo:BTC-USD",
    url: "https://finance.yahoo.com/rss/headline?s=BTC-USD",
  },
  {
    label: "yahoo:ETH-USD",
    url: "https://finance.yahoo.com/rss/headline?s=ETH-USD",
  },
  // Broad finance media
  {
    label: "cnbc:top",
    url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
  },
  {
    label: "marketwatch:top",
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
  },
];

// --- Cache -----------------------------------------------------------------

const CACHE_DIR = path.join(process.cwd(), "db", "cache");
const CACHE_PATH = path.join(CACHE_DIR, "rss.json");
const CACHE_TTL_MS = 15 * 60 * 1000;
const FEED_TIMEOUT_MS = 15_000;

type RssItem = Parser.Item & {
  // rss-parser falls back to these for non-Atom feeds.
  author?: string;
  "dc:creator"?: string;
};

type CacheShape = {
  fetchedAt: number;
  itemsByFeed: Record<string, RssItem[]>;
};

function readCache(): CacheShape | null {
  if (!fs.existsSync(CACHE_PATH)) return null;
  try {
    const raw = fs.readFileSync(CACHE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as CacheShape;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch (err) {
    // Corrupt cache shouldn't kill ingestion, but we surface it so we know to nuke the file.
    console.warn(`[rss] cache read failed: ${(err as Error).message}`);
    return null;
  }
}

function writeCache(cache: CacheShape): void {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  // Let fs errors propagate - cache write failing means disk/perm trouble worth surfacing.
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), "utf-8");
}

// --- Fetch -----------------------------------------------------------------

type FetchOutcome =
  | { ok: true; url: string; label: string; items: RssItem[] }
  | { ok: false; url: string; label: string; reason: string };

async function fetchFeed(feed: {
  url: string;
  label: string;
}): Promise<FetchOutcome> {
  const parser = new Parser({
    timeout: FEED_TIMEOUT_MS,
    headers: {
      // Some feeds (Yahoo, CNBC) reject default Node UA.
      "User-Agent":
        "Mozilla/5.0 (compatible; tradingdashboard/0.1; +https://localhost)",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
  });
  try {
    const parsed = await parser.parseURL(feed.url);
    const items = (parsed.items ?? []) as RssItem[];
    return { ok: true, url: feed.url, label: feed.label, items };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, url: feed.url, label: feed.label, reason };
  }
}

// --- Normalization ---------------------------------------------------------

const HEBREW_RE = /[֐-׿]/;

function detectLang(text: string): "en" | "he" | "other" {
  if (!text) return "en";
  return HEBREW_RE.test(text) ? "he" : "en";
}

function parsePublishedAt(item: RssItem): {
  ts: number;
  fellBack: boolean;
} {
  const candidate = item.isoDate ?? item.pubDate;
  if (candidate) {
    const ms = new Date(candidate).getTime();
    if (!Number.isNaN(ms))
      return { ts: Math.floor(ms / 1000), fellBack: false };
  }
  return { ts: Math.floor(Date.now() / 1000), fellBack: true };
}

function normalize(item: RssItem, feedLabel: string): NormalizedItem | null {
  const url = item.link?.trim();
  if (!url) return null;

  const nativeId = (item.guid ?? item.link ?? "").toString().trim();
  if (!nativeId) return null;

  const { ts } = parsePublishedAt(item);

  const title = item.title?.trim() || null;
  const bodyRaw =
    item.contentSnippet?.trim() ||
    item.summary?.trim() ||
    item.content?.trim() ||
    null;

  // Strip remaining HTML tags from body (contentSnippet usually clean, but
  // `content`/`summary` fallbacks can still carry markup).
  const body = bodyRaw ? bodyRaw.replace(/<[^>]+>/g, "").trim() || null : null;

  const author =
    item.creator?.trim() ||
    item.author?.trim() ||
    (item["dc:creator"] as string | undefined)?.trim() ||
    feedLabel; // feed label as fallback so handle grouping in db.ts is stable per-feed

  const langSource = `${title ?? ""} ${body ?? ""}`;

  return {
    source_type: "rss",
    external_id: `rss:${nativeId}`,
    url,
    title,
    body,
    author: author ?? null,
    published_at: ts,
    lang: detectLang(langSource),
    engagement_raw: 0, // RSS has no engagement signal
    raw_json: item,
  };
}

// --- Ingestor --------------------------------------------------------------

type GatherResult = {
  itemsByFeed: Record<string, RssItem[]>;
  failed: { reason: string; sample: string }[];
};

// Returns cached items if fresh, else parallel-fetches all feeds and refreshes cache.
async function gatherItemsByFeed(): Promise<GatherResult> {
  const cached = readCache();
  if (cached) return { itemsByFeed: cached.itemsByFeed, failed: [] };

  const failed: { reason: string; sample: string }[] = [];
  const itemsByFeed: Record<string, RssItem[]> = {};
  const outcomes = await Promise.allSettled(FEEDS.map(fetchFeed));

  for (let i = 0; i < outcomes.length; i++) {
    const feed = FEEDS[i];
    const settled = outcomes[i];
    if (settled.status === "rejected") {
      failed.push({
        reason: `unhandled rejection: ${String(settled.reason)}`,
        sample: feed.url,
      });
      continue;
    }
    const res = settled.value;
    if (!res.ok) {
      failed.push({ reason: res.reason, sample: res.url });
      continue;
    }
    if (res.items.length === 0) {
      failed.push({ reason: "empty channel", sample: res.url });
    }
    itemsByFeed[res.url] = res.items;
  }
  writeCache({ fetchedAt: Date.now(), itemsByFeed });
  return { itemsByFeed, failed };
}

// Normalizes every cached item; returns the count dropped for missing url/guid.
function normalizeAll(itemsByFeed: Record<string, RssItem[]>): {
  normalized: NormalizedItem[];
  droppedNoUrl: number;
} {
  const normalized: NormalizedItem[] = [];
  let droppedNoUrl = 0;
  for (const feed of FEEDS) {
    const items = itemsByFeed[feed.url] ?? [];
    for (const it of items) {
      const n = normalize(it, feed.label);
      if (n) normalized.push(n);
      else droppedNoUrl += 1;
    }
  }
  return { normalized, droppedNoUrl };
}

export class RssIngestor implements Ingestor {
  async run(): Promise<IngestResult> {
    const { itemsByFeed, failed } = await gatherItemsByFeed();
    const { normalized, droppedNoUrl } = normalizeAll(itemsByFeed);

    if (droppedNoUrl > 0) {
      failed.push({
        reason: `dropped ${droppedNoUrl} items with no url/guid`,
        sample: "n/a",
      });
    }

    // Dedup against DB so skipped_duplicates is accurate even when insertItems
    // would also reject via UNIQUE constraint.
    const existing = getExistingExternalIds(
      "rss",
      normalized.map((n) => n.external_id),
    );
    const toInsert = normalized.filter((n) => !existing.has(n.external_id));

    // insertItems already calls tagText inline (db.ts), so no second tagging pass needed.
    const { inserted, skipped } = insertItems(toInsert);

    return {
      source_type: "rss",
      fetched: normalized.length,
      inserted,
      skipped_duplicates: skipped + existing.size,
      failed,
    };
  }
}

const rssIngestor = new RssIngestor();
export default rssIngestor;
