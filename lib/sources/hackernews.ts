// Wave 1 Agent D - Hacker News ingestor.
// Uses the public HN Algolia Search API (no auth, 10k req/hr per IP).
// Endpoint: https://hn.algolia.com/api/v1/search_by_date?tags=story
//
// We hit `search_by_date` (not `search`) so we get recency-sorted hits, then
// restrict to the last 24h via `numericFilters=created_at_i>${24h_ago}`.
//
// Algolia quirk: a space-separated `query` is treated as AND, writing "X OR Y"
// matches "OR" as a literal word, and `optionalWords` only RANKS - it doesn't
// filter. The only way to OR-match a keyword set is to fire one request per
// keyword and union the results. That's what we do here, in parallel, with
// dedupe by objectID. False positives (e.g. "AAPL" matching "apply") get
// filtered downstream by the ticker tagger's cashtag-or-context rule.
//
// Volume: ~17 keywords * 30 hits/keyword = up to 510 hits per run, typically
// ~50-150 unique stories after dedupe. Well inside the 10k/hr rate limit.

import axios, { AxiosError } from "axios";

import { getExistingExternalIds, insertItems } from "../db";
import type { IngestResult, Ingestor, NormalizedItem } from "../types";

const ALGOLIA_SEARCH_URL = "https://hn.algolia.com/api/v1/search_by_date";
const REQUEST_TIMEOUT_MS = 10_000;
const RATE_LIMIT_RETRY_DELAY_MS = 5_000;
const HITS_PER_PAGE = 30;
const LOOKBACK_SECONDS = 24 * 60 * 60;

// Bucketed for distribution reporting; the actual fetch fires one request per
// keyword (Algolia can't OR within a single query - see file header).
const QUERY_BUCKETS: { label: string; keywords: string[] }[] = [
  {
    label: "stocks",
    keywords: ["NVDA", "AAPL", "GOOGL", "MSFT", "META", "AMZN", "TSLA"],
  },
  {
    label: "crypto",
    keywords: ["bitcoin", "ethereum", "crypto", "BTC", "ETH"],
  },
  {
    label: "ai-tech",
    keywords: ["AI", "LLM", "Anthropic", "OpenAI", "Claude", "GPT"],
  },
];

// Narrowed to the fields we actually consume. The rest is preserved in raw_json.
type AlgoliaHit = {
  objectID: string;
  title: string | null;
  url: string | null;
  author: string | null;
  points: number | null;
  num_comments: number | null;
  created_at: string;
  created_at_i: number;
  story_text: string | null;
};

type AlgoliaResponse = {
  hits: AlgoliaHit[];
  nbHits: number;
};

// HN is overwhelmingly English; this is a defensive check so a stray
// Israeli-posted story doesn't get mislabeled.
const HEBREW_RANGE = /[֐-׿]/;

function detectLang(text: string): "en" | "he" {
  return text && HEBREW_RANGE.test(text) ? "he" : "en";
}

async function requestAlgolia(keyword: string): Promise<AlgoliaResponse> {
  const sinceUnix = Math.floor(Date.now() / 1000) - LOOKBACK_SECONDS;
  const res = await axios.get<AlgoliaResponse>(ALGOLIA_SEARCH_URL, {
    params: {
      query: keyword,
      tags: "story",
      hitsPerPage: HITS_PER_PAGE,
      numericFilters: `created_at_i>${sinceUnix}`,
    },
    timeout: REQUEST_TIMEOUT_MS,
    validateStatus: (s) => s < 500,
  });
  if (res.status === 429) {
    const err = new Error(`HN Algolia 429 for keyword ${keyword}`) as Error & {
      status?: number;
    };
    err.status = 429;
    throw err;
  }
  if (res.status >= 400) {
    throw new Error(
      `HN Algolia ${res.status} for keyword ${keyword}: ${JSON.stringify(res.data).slice(0, 200)}`,
    );
  }
  return res.data;
}

async function fetchKeyword(keyword: string): Promise<AlgoliaHit[]> {
  try {
    return (await requestAlgolia(keyword)).hits ?? [];
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    const axiosStatus = (err as AxiosError).response?.status;
    // Single retry on rate-limit; other failures propagate so they show up in
    // IngestResult.failed instead of being silently swallowed.
    if (status !== 429 && axiosStatus !== 429) throw err;
    await new Promise((r) => setTimeout(r, RATE_LIMIT_RETRY_DELAY_MS));
    return (await requestAlgolia(keyword)).hits ?? [];
  }
}

function normalizeHit(hit: AlgoliaHit): NormalizedItem {
  // Ask HN / Show HN posts have no external URL - fall back to the HN item page.
  const url =
    hit.url && hit.url.length > 0
      ? hit.url
      : `https://news.ycombinator.com/item?id=${hit.objectID}`;
  const title = hit.title ?? null;
  const body = hit.story_text ?? null;
  const text = `${title ?? ""} ${body ?? ""}`.trim();
  const points = typeof hit.points === "number" ? hit.points : 0;
  const numComments =
    typeof hit.num_comments === "number" ? hit.num_comments : 0;

  return {
    source_type: "hn",
    external_id: `hn:${hit.objectID}`,
    url,
    title,
    body,
    author: hit.author ?? null,
    // Already unix seconds UTC - no conversion needed.
    published_at: hit.created_at_i,
    lang: detectLang(text),
    engagement_raw: points + numComments,
    raw_json: hit,
  };
}

export class HackerNewsIngestor implements Ingestor {
  async run(): Promise<IngestResult> {
    const failed: { reason: string; sample: string }[] = [];

    // Flatten to (bucket, keyword) pairs so we can attribute failures.
    const tasks = QUERY_BUCKETS.flatMap((b) =>
      b.keywords.map((kw) => ({ bucket: b.label, keyword: kw })),
    );

    const results = await Promise.allSettled(
      tasks.map((t) => fetchKeyword(t.keyword)),
    );

    // A story matching multiple keywords (e.g. "Anthropic ships Claude") would
    // appear in several result sets - dedupe by objectID before inserting.
    const seen = new Map<string, AlgoliaHit>();
    results.forEach((res, idx) => {
      const task = tasks[idx];
      const tag = `${task.bucket}/${task.keyword}`;
      if (res.status === "rejected") {
        const reason =
          res.reason instanceof Error ? res.reason.message : String(res.reason);
        failed.push({ reason: `keyword ${tag}: ${reason}`, sample: tag });
        return;
      }
      for (const hit of res.value) {
        if (hit?.objectID && !seen.has(hit.objectID))
          seen.set(hit.objectID, hit);
      }
    });

    const allHits = Array.from(seen.values());
    const fetched = allHits.length;

    if (fetched === 0) {
      return {
        source_type: "hn",
        fetched: 0,
        inserted: 0,
        skipped_duplicates: 0,
        failed,
      };
    }

    const externalIds = allHits.map((h) => `hn:${h.objectID}`);
    const existing = getExistingExternalIds("hn", externalIds);
    const fresh = allHits.filter((h) => !existing.has(`hn:${h.objectID}`));

    // insertItems tags tickers inline per inserted row, no separate tag loop needed.
    const { inserted, skipped } = insertItems(fresh.map(normalizeHit));

    return {
      source_type: "hn",
      fetched,
      inserted,
      skipped_duplicates: existing.size + skipped,
      failed,
    };
  }
}

const hackernewsIngestor = new HackerNewsIngestor();
export default hackernewsIngestor;
