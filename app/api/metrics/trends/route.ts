import { NextRequest, NextResponse } from "next/server";

import { queryTrendingTickers } from "@/lib/db";
import type { TrendWindow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_WINDOWS = new Set<TrendWindow>(["1h", "24h", "7d"]);

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const windowParam = searchParams.get("window") ?? "24h";
  const window: TrendWindow = VALID_WINDOWS.has(windowParam as TrendWindow)
    ? (windowParam as TrendWindow)
    : "24h";
  const limit = Number.parseInt(searchParams.get("limit") ?? "30", 10);

  const rows = queryTrendingTickers(
    window,
    Number.isFinite(limit) ? limit : 30,
  );
  return NextResponse.json(rows);
}
