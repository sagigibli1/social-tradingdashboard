/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Reddit ingestor - Wave 1 Agent B.
 *
 * Wraps Apify `trudax/reddit-scraper-lite` to pull top posts of the day from
 * a hardcoded seed list of finance / tech / AI subs. 15-min disk cache so the
 * workshop demo can re-click "sync" without burning Apify credits.
 *
 * Field names from the actor's dataset can vary slightly between runs / item
 * types (post vs comment vs community). We defensively coalesce across the
 * commonly observed shapes (`id|postId`, `createdAt|created|createdAtIso`,
 * `score|ups|upVotes`, `numberOfComments|num_comments|numComments`,
 * `body|selftext|text`, `url|postUrl|permalink`).
 */

import fs from "fs";
import path from "path";
import { ApifyClient } from "apify-client";

import { getExistingExternalIds, insertItems, tagTickers, getDb } from "../db";
import type { IngestResult, Ingestor, NormalizedItem } from "../types";

// ---------- config ----------

const SOURCE: "reddit" = "reddit";
const ACTOR_ID = "trudax/reddit-scraper-lite";
const ACTOR_TIMEOUT_SEC = 90;

const SUBREDDITS = [
  "investing",
  "stocks",
  "wallstreetbets",
  "CryptoCurrency",
  "MachineLearning",
] as const;

const MAX_ITEMS_PER_SUB = 20;

const CACHE_PATH = path.join(process.cwd(), "db", "cache", "reddit.json");
const CACHE_TTL_SEC = 900; // 15 min

// Hebrew unicode range. If a post has any Hebrew char, tag it `he`.
const HEBREW_RE = /[֐-׿]/;

// ---------- cache ----------

type CachedShape = {
  fetchedAt: number;
  items: RedditRawPost[];
};

function readCache(): CachedShape | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const txt = fs.readFileSync(CACHE_PATH, "utf-8");
    const parsed = JSON.parse(txt) as CachedShape;
    if (!parsed || typeof parsed.fetchedAt !== "number") return null;
    const ageSec = Math.floor(Date.now() / 1000) - parsed.fetchedAt;
    if (ageSec > CACHE_TTL_SEC) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(items: RedditRawPost[]): void {
  try {
    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const payload: CachedShape = {
      fetchedAt: Math.floor(Date.now() / 1000),
      items,
    };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(payload), "utf-8");
  } catch {
    // cache is best-effort, never fatal
  }
}

// ---------- raw shape ----------

// Conservative interface, every field optional - the actor returns different
// shapes for posts vs comments vs link-only posts.
type RedditRawPost = {
  id?: string;
  postId?: string;
  parsedId?: string;
  dataType?: string;
  title?: string;
  body?: string;
  selftext?: string;
  text?: string;
  url?: string;
  postUrl?: string;
  permalink?: string;
  username?: string;
  author?: string;
  score?: number;
  ups?: number;
  upVotes?: number;
  numberOfComments?: number;
  num_comments?: number;
  numComments?: number;
  createdAt?: string | number;
  createdAtIso?: string;
  created?: number;
  created_utc?: number;
  community?: { name?: string };
  subreddit?: string;
  parsedCommunityName?: string;
  // catchall for raw_json preservation
  [k: string]: unknown;
};

// ---------- helpers ----------

function pickString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return null;
}

function pickNumber(...vals: unknown[]): number {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 0;
}

function parsePublishedSec(raw: RedditRawPost): number | null {
  const candidates: unknown[] = [
    raw.createdAt,
    raw.createdAtIso,
    raw.created,
    raw.created_utc,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    if (typeof c === "number" && Number.isFinite(c)) {
      // Reddit native is unix seconds. Some actor versions return ms.
      const sec = c > 1e12 ? Math.floor(c / 1000) : Math.floor(c);
      if (sec > 0) return sec;
    }
    if (typeof c === "string" && c.length > 0) {
      const t = Date.parse(c);
      if (!Number.isNaN(t)) return Math.floor(t / 1000);
    }
  }
  return null;
}

function extractNativeId(raw: RedditRawPost): string | null {
  const candidates = [raw.id, raw.postId, raw.parsedId];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
  }
  // Fallback: derive from permalink (`/r/<sub>/comments/<id>/<slug>/`)
  const link = pickString(raw.permalink, raw.url, raw.postUrl);
  if (link) {
    const m = link.match(/\/comments\/([a-z0-9]+)\b/i);
    if (m) return m[1];
  }
  return null;
}

function pickRedditUrl(raw: RedditRawPost): string | null {
  // Prefer the reddit.com permalink over the linked-out article so dedup is
  // stable and clicking lands you in the comment thread.
  const candidates = [raw.permalink, raw.postUrl, raw.url];
  for (const c of candidates) {
    if (typeof c !== "string" || c.length === 0) continue;
    if (c.startsWith("http")) return c;
    if (c.startsWith("/r/")) return `https://www.reddit.com${c}`;
  }
  return null;
}

function detectLang(text: string): "en" | "he" | "other" {
  if (!text) return "en";
  if (HEBREW_RE.test(text)) return "he";
  return "en";
}

function normalize(raw: RedditRawPost): NormalizedItem | null {
  const nativeId = extractNativeId(raw);
  if (!nativeId) return null;
  const url = pickRedditUrl(raw);
  if (!url) return null;
  const published_at = parsePublishedSec(raw);
  if (published_at == null) return null;

  const title = pickString(raw.title);
  const body = pickString(raw.body, raw.selftext, raw.text);
  const author = pickString(raw.username, raw.author);
  const score = pickNumber(raw.score, raw.ups, raw.upVotes);
  const comments = pickNumber(
    raw.numberOfComments,
    raw.num_comments,
    raw.numComments,
  );

  // Per plan: simple int weighting, db.ts will percentile-rank per source.
  const engagement_raw = Math.round(score + comments * 3);

  const langSample = `${title ?? ""} ${body ?? ""}`.trim();

  return {
    source_type: SOURCE,
    external_id: `reddit:${nativeId}`,
    url,
    title,
    body,
    author,
    published_at,
    lang: detectLang(langSample),
    engagement_raw,
    raw_json: raw,
  };
}

// ---------- actor invocation ----------

function buildStartUrls(): { url: string }[] {
  return SUBREDDITS.map((sub) => ({
    url: `https://www.reddit.com/r/${sub}/top/?t=day`,
  }));
}

async function fetchFromApify(token: string): Promise<RedditRawPost[]> {
  const client = new ApifyClient({ token });

  const run = await client.actor(ACTOR_ID).call(
    {
      startUrls: buildStartUrls(),
      // maxItems is per actor run, not per startUrl. We multiply so each sub
      // gets a fair share.
      maxItems: MAX_ITEMS_PER_SUB * SUBREDDITS.length,
      // Per actor input schema - these are the documented sort + time fields.
      sort: "top",
      time: "day",
      // Lite actor focuses on posts by default; we still narrow defensively.
      skipComments: true,
      skipCommunity: true,
      skipUserPosts: true,
    },
    { timeout: ACTOR_TIMEOUT_SEC },
  );

  const datasetId = run.defaultDatasetId;
  const { items } = await client.dataset(datasetId).listItems();
  return items as unknown as RedditRawPost[];
}

// ---------- ingestor ----------

export class RedditIngestor implements Ingestor {
  async run(): Promise<IngestResult> {
    const failed: IngestResult["failed"] = [];
    const result: IngestResult = {
      source_type: SOURCE,
      fetched: 0,
      inserted: 0,
      skipped_duplicates: 0,
      failed,
    };

    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
      failed.push({
        reason: "missing APIFY_API_TOKEN",
        sample: "env var unset",
      });
      return result;
    }

    // 1. Cache lookup
    let raw: RedditRawPost[];
    const cached = readCache();
    if (cached) {
      raw = cached.items;
    } else {
      try {
        raw = await fetchFromApify(token);
        writeCache(raw);
      } catch (err) {
        failed.push({
          reason: "apify call failed",
          sample: (err as Error).message ?? String(err),
        });
        return result;
      }
    }

    result.fetched = raw.length;

    // 2. Normalize
    const normalized: NormalizedItem[] = [];
    for (const r of raw) {
      const n = normalize(r);
      if (!n) {
        failed.push({
          reason: "normalize: missing id/url/published_at",
          sample: JSON.stringify({
            id: r.id,
            url: r.url ?? r.permalink ?? r.postUrl,
            createdAt: r.createdAt,
          }).slice(0, 200),
        });
        continue;
      }
      normalized.push(n);
    }

    if (normalized.length === 0) return result;

    // 3. Idempotency check - report what'd be skipped before insert.
    const ids = normalized.map((n) => n.external_id);
    const existing = getExistingExternalIds(SOURCE, ids);
    const fresh = normalized.filter((n) => !existing.has(n.external_id));

    // insertItems is itself idempotent on UNIQUE(source_type, external_id)
    // and handles tagging inline, but we re-tag any pre-existing rows in case
    // ticker rules changed between syncs.
    const { inserted, skipped } = insertItems(fresh);
    result.inserted = inserted;
    result.skipped_duplicates = skipped + (normalized.length - fresh.length);

    // 4. Re-tag any rows we already had (cheap, idempotent inside tagTickers).
    if (existing.size > 0) {
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT id, title, body FROM items
           WHERE source_type = ? AND external_id IN (${ids.map(() => "?").join(",")})`,
        )
        .all(SOURCE, ...ids) as {
        id: number;
        title: string | null;
        body: string | null;
      }[];
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
