import { NextRequest, NextResponse } from "next/server";

import { getSourceBreakdownForTicker } from "@/lib/db";
import type { TrendWindow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_WINDOWS = new Set<TrendWindow>(["1h", "24h", "7d"]);

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const ticker = (searchParams.get("ticker") ?? "").toUpperCase();
  if (!ticker) {
    return NextResponse.json(
      { error: "missing ticker param" },
      { status: 400 },
    );
  }
  const windowParam = searchParams.get("window") ?? "24h";
  const window: TrendWindow = VALID_WINDOWS.has(windowParam as TrendWindow)
    ? (windowParam as TrendWindow)
    : "24h";

  const rows = getSourceBreakdownForTicker(ticker, window);
  return NextResponse.json(rows);
}
