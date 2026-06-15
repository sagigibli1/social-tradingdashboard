// Twitter/X ingestor using TwitterAPI.io (replaces Apify).
// Fetches latest tweets from each handle in TARGET_HANDLES via
// GET /twitter/user/last_tweets, normalizes to NormalizedItem, persists via insertItems.
// 15-min disk cache so repeated syncs don't burn API credits.

import fs from "fs";
import path from "path";

import { getDb, getExistingExternalIds, insertItems, tagTickers } from "../db";
import type { IngestResult, Ingestor, NormalizedItem } from "../types";

// --- Config -----------------------------------------------------------------

const BASE_URL = "https://api.twitterapi.io";
const MAX_RESULTS_PER_HANDLE = 20;
const CACHE_TTL_SEC = 900;
const CACHE_PATH = path.join(process.cwd(), "db", "cache", "twitter.json");

const TARGET_HANDLES: string[] = [
  "AnthropicAI",
  "alexalbert__",
  "dwarkesh_sp",
  "sama",
  "elonmusk",
  "naval",
  "jason",
  "paulg",
  "balajis",
  "lexfridman",
  "federalreserve",
  "business",
  "WSJmarkets",
  "CNBC",
  "cz_binance",
  "VitalikButerin",
  "michael_saylor",
  "APompliano",
  "levelsio",
  "swyx",
];

const HEBREW_CHAR_RE = /[֐-׿]/;

// --- Raw API types ----------------------------------------------------------

type TweetAuthor = {
  userName?: string;
  name?: string;
  id?: string;
};

type RawTweet = {
  id?: string;
  url?: string;
  text?: string;
  fullText?: string;
  createdAt?: string;
  lang?: string;
  retweetCount?: number;
  replyCount?: number;
  likeCount?: number;
  quoteCount?: number;
  viewCount?: number;
  author?: TweetAuthor;
};

type ApiResponse = {
  status?: string;
  data?: {
    tweets?: RawTweet[];
    pin_tweet?: RawTweet | null;
  };
};

type TwitterCache = {
  fetchedAt: number;
  items: RawTweet[];
};

// --- Cache helpers ----------------------------------------------------------

function readCache(): TwitterCache | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const raw = fs.readFileSync(CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as TwitterCache;
    if (!parsed || typeof parsed.fetchedAt !== "number" || !Array.isArray(parsed.items)) return null;
    const ageSec = Math.floor(Date.now() / 1000) - parsed.fetchedAt;
    if (ageSec > CACHE_TTL_SEC) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(items: RawTweet[]): void {
  try {
    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify({ fetchedAt: Math.floor(Date.now() / 1000), items }), "utf8");
  } catch {
    // best-effort
  }
}

// --- Fetch ------------------------------------------------------------------

async function fetchHandleTweets(apiKey: string, handle: string): Promise<RawTweet[]> {
  const url = `${BASE_URL}/twitter/user/last_tweets?userName=${encodeURIComponent(handle)}&maxResults=${MAX_RESULTS_PER_HANDLE}`;
  const res = await fetch(url, {
    headers: { "X-API-Key": apiKey },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TwitterAPI.io ${res.status} for @${handle}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as ApiResponse;
  return json.data?.tweets ?? [];
}

async function fetchAllTweets(apiKey: string): Promise<RawTweet[]> {
  const all: RawTweet[] = [];
  for (const handle of TARGET_HANDLES) {
    try {
      const tweets = await fetchHandleTweets(apiKey, handle);
      all.push(...tweets);
    } catch (err) {
      console.error(`[twitter] failed to fetch @${handle}:`, (err as Error).message);
    }
    // free tier: 1 request per 5 seconds
    await new Promise((r) => setTimeout(r, 5500));
  }
  return all;
}

// --- Normalization ----------------------------------------------------------

function detectLang(text: string): "en" | "he" | "other" {
  if (HEBREW_CHAR_RE.test(text)) return "he";
  return "en";
}

function computeEngagement(t: RawTweet): number {
  return (t.likeCount ?? 0) + (t.retweetCount ?? 0) * 3 + (t.replyCount ?? 0);
}

function normalizeTweet(t: RawTweet): NormalizedItem | null {
  if (!t.id || !t.url) return null;
  const body = t.fullText ?? t.text ?? "";
  const author = t.author?.userName ?? null;

  let published_at: number;
  if (t.createdAt) {
    const ms = new Date(t.createdAt).getTime();
    published_at = Number.isFinite(ms) ? Math.floor(ms / 1000) : Math.floor(Date.now() / 1000);
  } else {
    published_at = Math.floor(Date.now() / 1000);
  }

  return {
    source_type: "twitter",
    external_id: `twitter:${t.id}`,
    url: t.url,
    title: null,
    body,
    author,
    published_at,
    lang: detectLang(body),
    engagement_raw: computeEngagement(t),
    raw_json: t,
  };
}

// --- Ingestor ---------------------------------------------------------------

export class TwitterIngestor implements Ingestor {
  async run(): Promise<IngestResult> {
    const result: IngestResult = {
      source_type: "twitter",
      fetched: 0,
      inserted: 0,
      skipped_duplicates: 0,
      failed: [],
    };

    const apiKey = process.env.TWITTERAPI_KEY;
    if (!apiKey) {
      result.failed.push({ reason: "missing-token", sample: "TWITTERAPI_KEY env var not set" });
      return result;
    }

    let rawTweets: RawTweet[];
    const cached = readCache();
    if (cached) {
      rawTweets = cached.items;
    } else {
      try {
        rawTweets = await fetchAllTweets(apiKey);
        writeCache(rawTweets);
      } catch (err) {
        result.failed.push({ reason: "fetch-failed", sample: (err as Error).message.slice(0, 200) });
        return result;
      }
    }

    result.fetched = rawTweets.length;
    if (rawTweets.length === 0) return result;

    const normalized: NormalizedItem[] = [];
    for (const t of rawTweets) {
      const n = normalizeTweet(t);
      if (n) normalized.push(n);
    }

    if (normalized.length === 0) {
      result.failed.push({ reason: "no-valid-tweets", sample: "none had id+url" });
      return result;
    }

    const allIds = normalized.map((n) => n.external_id);
    const existing = getExistingExternalIds("twitter", allIds);
    const fresh = normalized.filter((n) => !existing.has(n.external_id));
    result.skipped_duplicates = normalized.length - fresh.length;

    try {
      const { inserted, skipped } = insertItems(fresh);
      result.inserted = inserted;
      result.skipped_duplicates += skipped;
    } catch (err) {
      result.failed.push({ reason: "db-insert-failed", sample: (err as Error).message.slice(0, 200) });
      return result;
    }

    if (result.inserted > 0) {
      try {
        const db = getDb();
        const recent = db
          .prepare(
            `SELECT id, body FROM items WHERE source_type = 'twitter' AND external_id IN (${fresh.map(() => "?").join(",")})`,
          )
          .all(...fresh.map((n) => n.external_id)) as { id: number; body: string | null }[];
        for (const r of recent) {
          if (r.body) tagTickers(r.id, r.body);
        }
      } catch {
        // tagging is best-effort
      }
    }

    return result;
  }
}

const twitter = new TwitterIngestor();
export default twitter;
