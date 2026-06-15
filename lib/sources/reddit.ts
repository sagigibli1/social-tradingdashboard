// Reddit ingestor using public subreddit RSS feeds — no credentials needed.
// Each subreddit exposes a top.rss feed; we parse it with rss-parser (already
// a project dependency). 15-min disk cache to avoid hammering Reddit on repeated syncs.

import fs from "fs";
import path from "path";
import Parser from "rss-parser";

import { getExistingExternalIds, insertItems, tagTickers, getDb } from "../db";
import type { IngestResult, Ingestor, NormalizedItem } from "../types";

// --- Config -----------------------------------------------------------------

const SOURCE: "reddit" = "reddit";
const CACHE_PATH = path.join(process.cwd(), "db", "cache", "reddit.json");
const CACHE_TTL_SEC = 900;

const SUBREDDITS = [
  "investing",
  "stocks",
  "wallstreetbets",
  "CryptoCurrency",
  "MachineLearning",
] as const;

const HEBREW_RE = /[֐-׿]/;

// --- Types ------------------------------------------------------------------

type RedditRssItem = {
  id: string;
  title: string;
  body: string | null;
  url: string;
  author: string | null;
  published_at: number;
  subreddit: string;
};

type CachedShape = { fetchedAt: number; items: RedditRssItem[] };

// --- Cache ------------------------------------------------------------------

function readCache(): CachedShape | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const parsed = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")) as CachedShape;
    if (!parsed || typeof parsed.fetchedAt !== "number") return null;
    if (Math.floor(Date.now() / 1000) - parsed.fetchedAt > CACHE_TTL_SEC) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(items: RedditRssItem[]): void {
  try {
    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify({ fetchedAt: Math.floor(Date.now() / 1000), items }), "utf-8");
  } catch {
    // best-effort
  }
}

// --- Fetch ------------------------------------------------------------------

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const parser = new Parser({
  timeout: 10000,
  headers: { "User-Agent": BROWSER_UA },
});

async function fetchSubreddit(sub: string): Promise<RedditRssItem[]> {
  const feedUrl = `https://www.reddit.com/r/${sub}/top.rss?t=day&limit=25`;
  const feed = await parser.parseURL(feedUrl);
  return (feed.items ?? []).map((item) => {
    // Reddit RSS id looks like: t3_<postid>
    const nativeId = (item.id ?? item.guid ?? "").replace(/^t3_/, "").split("/").pop() ?? "";
    const link = item.link ?? item.guid ?? "";
    const postMatch = link.match(/\/comments\/([a-z0-9]+)\b/i);
    const id = postMatch ? postMatch[1] : nativeId;

    const published_at = item.pubDate
      ? Math.floor(new Date(item.pubDate).getTime() / 1000)
      : Math.floor(Date.now() / 1000);

    // Strip HTML from content
    const rawBody = item.content ?? item.contentSnippet ?? null;
    const body = rawBody ? rawBody.replace(/<[^>]*>/g, "").trim() || null : null;

    return {
      id,
      title: item.title ?? "",
      body,
      url: link.startsWith("http") ? link : `https://www.reddit.com${link}`,
      author: (item.author ?? item.creator ?? null)?.replace(/^\/u\//i, "") ?? null,
      published_at,
      subreddit: sub,
    };
  }).filter((r) => r.id.length > 0);
}

async function fetchAllSubreddits(): Promise<RedditRssItem[]> {
  const all: RedditRssItem[] = [];
  for (const sub of SUBREDDITS) {
    try {
      const posts = await fetchSubreddit(sub);
      all.push(...posts);
    } catch (err) {
      console.error(`[reddit] failed to fetch r/${sub}:`, (err as Error).message);
    }
    // delay to avoid Reddit rate limiting
    await new Promise((r) => setTimeout(r, 3000));
  }
  return all;
}

// --- Normalization ----------------------------------------------------------

function detectLang(text: string): "en" | "he" | "other" {
  if (HEBREW_RE.test(text)) return "he";
  return "en";
}

function normalize(raw: RedditRssItem): NormalizedItem | null {
  if (!raw.id || !raw.url) return null;
  const langSample = `${raw.title} ${raw.body ?? ""}`.trim();
  return {
    source_type: SOURCE,
    external_id: `reddit:${raw.id}`,
    url: raw.url,
    title: raw.title || null,
    body: raw.body,
    author: raw.author,
    published_at: raw.published_at,
    lang: detectLang(langSample),
    engagement_raw: 0,
    raw_json: raw,
  };
}

// --- Ingestor ---------------------------------------------------------------

export class RedditIngestor implements Ingestor {
  async run(): Promise<IngestResult> {
    const failed: IngestResult["failed"] = [];
    const result: IngestResult = { source_type: SOURCE, fetched: 0, inserted: 0, skipped_duplicates: 0, failed };

    let raw: RedditRssItem[];
    const cached = readCache();
    if (cached) {
      raw = cached.items;
    } else {
      try {
        raw = await fetchAllSubreddits();
        writeCache(raw);
      } catch (err) {
        failed.push({ reason: "fetch-failed", sample: (err as Error).message.slice(0, 200) });
        return result;
      }
    }

    result.fetched = raw.length;

    const normalized: NormalizedItem[] = [];
    for (const r of raw) {
      const n = normalize(r);
      if (!n) {
        failed.push({ reason: "normalize: missing id/url", sample: JSON.stringify({ id: r.id }).slice(0, 200) });
        continue;
      }
      normalized.push(n);
    }

    if (normalized.length === 0) return result;

    const ids = normalized.map((n) => n.external_id);
    const existing = getExistingExternalIds(SOURCE, ids);
    const fresh = normalized.filter((n) => !existing.has(n.external_id));

    const { inserted, skipped } = insertItems(fresh);
    result.inserted = inserted;
    result.skipped_duplicates = skipped + (normalized.length - fresh.length);

    if (existing.size > 0) {
      const db = getDb();
      const rows = db
        .prepare(`SELECT id, title, body FROM items WHERE source_type = ? AND external_id IN (${ids.map(() => "?").join(",")})`)
        .all(SOURCE, ...ids) as { id: number; title: string | null; body: string | null }[];
      for (const row of rows) {
        const text = `${row.title ?? ""} ${row.body ?? ""}`.trim();
        if (text.length > 0) tagTickers(row.id, text);
      }
    }

    return result;
  }
}

const redditIngestor = new RedditIngestor();
export default redditIngestor;
