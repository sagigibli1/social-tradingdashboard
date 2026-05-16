import { NextRequest, NextResponse } from "next/server";

import { getItemSentiments, queryFeedItems } from "@/lib/db";
import type { SourceType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SOURCES: SourceType[] = ["twitter", "reddit", "rss", "hn"];
const VALID_LANGS = new Set(["en", "he", "other"]);

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const sourcesParam = searchParams.get("source");
  const sources = sourcesParam
    ? (sourcesParam
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => VALID_SOURCES.includes(s as SourceType)) as SourceType[])
    : undefined;

  const tickersParam = searchParams.get("ticker");
  const tickers = tickersParam
    ? tickersParam
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean)
    : undefined;

  const langParam = searchParams.get("lang");
  const lang =
    langParam && VALID_LANGS.has(langParam)
      ? (langParam as "en" | "he" | "other")
      : undefined;

  const limit = Number.parseInt(searchParams.get("limit") ?? "100", 10);
  const offset = Number.parseInt(searchParams.get("offset") ?? "0", 10);

  const rows = queryFeedItems({
    sources,
    tickers,
    lang,
    limit: Number.isFinite(limit) ? limit : 100,
    offset: Number.isFinite(offset) ? offset : 0,
  });

  const includeSentiments = searchParams.get("withSentiments") === "1";
  const enriched = includeSentiments
    ? rows.map((r) => ({ ...r, sentiments: getItemSentiments(r.id) }))
    : rows;

  return NextResponse.json(enriched);
}
