import { NextRequest, NextResponse } from "next/server";

import { getTickerSentimentSummary } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: "missing-ticker" }, { status: 400 });
  }
  const summary = getTickerSentimentSummary(ticker);
  return NextResponse.json(summary);
}
