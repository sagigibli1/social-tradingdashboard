// Wave 1 Agent A - Twitter/X ingestor.
// Pulls latest tweets from a hardcoded fintwit + AI account list via Apify
// `apidojo/tweet-scraper`. Normalizes to `NormalizedItem` and persists via
// `insertItems`. Idempotent: re-running within 15min hits the local cache;
// the DB UNIQUE(source_type, external_id) constraint dedups across cache
// expiries.

import fs from "fs";
import path from "path";

import { ApifyClient } from "apify-client";

import { getDb, getExistingExternalIds, insertItems, tagTickers } from "../db";
import type { IngestResult, Ingestor, NormalizedItem } from "../types";

// --- Config -----------------------------------------------------------------

const ACTOR_ID = "apidojo/tweet-scraper";

// 20 fintwit + AI handles. Order matters only for the Apify request payload.
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

const MAX_ITEMS = 20 * TARGET_HANDLES.length; // ~20 tweets per handle
const CACHE_TTL_SEC = 900; // 15 minutes
const ACTOR_TIMEOUT_SEC = 90; // hard cap per spec
const CACHE_PATH = path.join(process.cwd(), "db", "cache", "twitter.json");

// Hebrew unicode block U+0590..U+05FF. We classify as 'he' if any Hebrew char
// appears in the text. Otherwise default to 'en' (per spec; we treat the
// non-Hebrew long tail as English here since this is a Hebrew-first dashboard
// wrapping mostly English source content).
const HEBREW_CHAR_RE = /[֐-׿]/;

// --- Actor output type (subset we rely on, defensive optional fields) -------

type ApifyTweetAuthor = {
  userName?: string;
  name?: string;
  id?: string;
};

type ApifyTweet = {
  type?: string;
  id?: string;
  url?: string;
  twitterUrl?: string;
  text?: string;
  fullText?: string;
  createdAt?: string; // Twitter date format, parseable by `new Date(...)`
  lang?: string;
  retweetCount?: number;
  replyCount?: number;
  likeCount?: number;
  quoteCount?: number;
  viewCount?: number;
  author?: ApifyTweetAuthor;
};

type TwitterCache = {
  fetchedAt: number;
  items: ApifyTweet[];
};

// --- Cache helpers ----------------------------------------------------------

function readCache(): TwitterCache | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const raw = fs.readFileSync(CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as TwitterCache;
    if (
      !parsed ||
      typeof parsed.fetchedAt !== "number" ||
      !Array.isArray(parsed.items)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(items: ApifyTweet[]): void {
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const payload: TwitterCache = {
    fetchedAt: Math.floor(Date.now() / 1000),
    items,
  };
  fs.writeFileSync(CACHE_PATH, JSON.stringify(payload), "utf8");
}

// --- Apify fetch ------------------------------------------------------------

async function fetchFromApify(token: string): Promise<ApifyTweet[]> {
  const client = new ApifyClient({ token });

  // Per the actor's input schema: twitterHandles (array), maxItems (int),
  // sort (enum: Top|Latest|Latest + Top). `tweetLanguage` has a strict enum
  // that does NOT contain 'any', so we OMIT it to get all languages.
  const input = {
    twitterHandles: TARGET_HANDLES,
    maxItems: MAX_ITEMS,
    sort: "Latest",
  };

  const run = await client.actor(ACTOR_ID).call(input, {
    timeout: ACTOR_TIMEOUT_SEC,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return items as unknown as ApifyTweet[];
}

// --- Cached fetch entry point ----------------------------------------------

async function getTweets(token: string): Promise<{
  items: ApifyTweet[];
  fromCache: boolean;
}> {
  const cached = readCache();
  const now = Math.floor(Date.now() / 1000);
  if (cached && now - cached.fetchedAt < CACHE_TTL_SEC) {
    return { items: cached.items, fromCache: true };
  }
  const items = await fetchFromApify(token);
  writeCache(items);
  return { items, fromCache: false };
}

// --- Normalization ----------------------------------------------------------

function detectLang(text: string): "en" | "he" | "other" {
  if (HEBREW_CHAR_RE.test(text)) return "he";
  // Per spec: simplify - all non-Hebrew gets 'en'.
  return "en";
}

function computeEngagement(t: ApifyTweet): number {
  const likes = t.likeCount ?? 0;
  const retweets = t.retweetCount ?? 0;
  const replies = t.replyCount ?? 0;
  return likes + retweets * 3 + replies;
}

function normalizeTweet(t: ApifyTweet): NormalizedItem | null {
  if (!t.id || !t.url) return null;
  const body = t.fullText ?? t.text ?? "";
  const author = t.author?.userName ?? null;

  let publishedAt: number;
  if (t.createdAt) {
    const ms = new Date(t.createdAt).getTime();
    publishedAt = Number.isFinite(ms)
      ? Math.floor(ms / 1000)
      : Math.floor(Date.now() / 1000);
  } else {
    publishedAt = Math.floor(Date.now() / 1000);
  }

  return {
    source_type: "twitter",
    external_id: `twitter:${t.id}`,
    url: t.url,
    title: null,
    body,
    author,
    published_at: publishedAt,
    lang: detectLang(body),
    engagement_raw: computeEngagement(t),
    raw_json: t,
  };
}

// --- Ingestor implementation ------------------------------------------------

export class TwitterIngestor implements Ingestor {
  async run(): Promise<IngestResult> {
    const result: IngestResult = {
      source_type: "twitter",
      fetched: 0,
      inserted: 0,
      skipped_duplicates: 0,
      failed: [],
    };

    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
      result.failed.push({
        reason: "missing-token",
        sample: "APIFY_API_TOKEN env var not set",
      });
      return result;
    }

    let tweets: ApifyTweet[];
    try {
      const fetched = await getTweets(token);
      tweets = fetched.items;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const lower = message.toLowerCase();
      const reason =
        lower.includes("quota") ||
        lower.includes("monthly") ||
        lower.includes("limit") ||
        lower.includes("usage")
          ? "quota"
          : "apify-fetch-failed";
      const sample =
        reason === "quota" ? "apify monthly limit" : message.slice(0, 200);
      result.failed.push({ reason, sample });
      return result;
    }

    result.fetched = tweets.length;
    if (tweets.length === 0) return result;

    // Normalize and drop malformed entries (no id or no url).
    const normalized: NormalizedItem[] = [];
    for (const t of tweets) {
      const n = normalizeTweet(t);
      if (n) normalized.push(n);
    }

    if (normalized.length === 0) {
      result.failed.push({
        reason: "no-valid-tweets",
        sample: "actor returned items but none had id+url",
      });
      return result;
    }

    // Dedup against DB up front so we know how many we actually skip
    // before insertItems (which also skips internally).
    const allIds = normalized.map((n) => n.external_id);
    const existing = getExistingExternalIds("twitter", allIds);
    const fresh = normalized.filter((n) => !existing.has(n.external_id));
    const preInsertSkipped = normalized.length - fresh.length;

    try {
      const { inserted, skipped } = insertItems(fresh);
      result.inserted = inserted;
      result.skipped_duplicates = preInsertSkipped + skipped;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed.push({
        reason: "db-insert-failed",
        sample: message.slice(0, 200),
      });
      return result;
    }

    // Backfill ticker tags for any inserted item. insertItems already tags
    // inline, but we re-run via the public helper to be defensive in case
    // raw_json/body lookup needs a second pass (no-op if tags exist).
    if (result.inserted > 0) {
      try {
        const db = getDb();
        const recent = db
          .prepare(
            `SELECT id, body FROM items
             WHERE source_type = 'twitter' AND external_id IN (${fresh
               .map(() => "?")
               .join(",")})`,
          )
          .all(...fresh.map((n) => n.external_id)) as {
          id: number;
          body: string | null;
        }[];
        for (const r of recent) {
          if (r.body) tagTickers(r.id, r.body);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.failed.push({
          reason: "ticker-tag-failed",
          sample: message.slice(0, 200),
        });
      }
    }

    return result;
  }
}

const twitter = new TwitterIngestor();
export default twitter;
