import { NextResponse } from "next/server";

import { getCurrentSync, getLastCompletedAt } from "@/lib/sync-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const current = getCurrentSync();
  return NextResponse.json({
    syncId: current?.syncId ?? null,
    started_at: current?.started_at ?? null,
    completed_at: current?.completed_at ?? null,
    sources: current?.sources ?? [],
    trends_done: current?.trends_done ?? false,
    sentiment_running: current?.sentiment_running ?? false,
    last_completed_at: getLastCompletedAt(),
  });
}
