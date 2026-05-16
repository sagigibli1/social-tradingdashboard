"use client";

import { usePathname } from "next/navigation";

import { Brand } from "@/components/shell/brand";
import { TickerTape } from "@/components/shell/ticker-tape";
import { SyncStatusPill } from "@/components/shell/sync-status-pill";
import { DisclaimerStrip } from "@/components/shell/disclaimer";
import { LeftRail } from "@/components/shell/left-rail";
import { RightWatchlist } from "@/components/shell/right-watchlist";
import { BottomPanel } from "@/components/shell/bottom-panel";
import type { TrendingTickerRow } from "@/lib/db";

// Routes that show the right watchlist. Anything else hides it.
const WATCHLIST_ROUTES = ["/", "/trends"];

type LayoutShellProps = {
  children: React.ReactNode;
  tapeTickers: Pick<TrendingTickerRow, "ticker_symbol" | "mention_count">[];
  watchlistTickers: TrendingTickerRow[];
};

export function LayoutShell({
  children,
  tapeTickers,
  watchlistTickers,
}: LayoutShellProps) {
  const pathname = usePathname();
  const showWatchlist =
    pathname === "/" ||
    WATCHLIST_ROUTES.some((r) => r !== "/" && pathname.startsWith(r));

  return (
    <div className="h-screen flex flex-col bg-[#131722] overflow-hidden">
      <header className="h-8 flex items-stretch border-b border-[#2A2E39]">
        <Brand />
        <TickerTape tickers={tapeTickers} />
        <SyncStatusPill />
      </header>
      <DisclaimerStrip />
      <div className="flex-1 flex overflow-hidden">
        <LeftRail />
        <main className="flex-1 overflow-y-auto bg-[#131722]">{children}</main>
        {showWatchlist && <RightWatchlist tickers={watchlistTickers} />}
      </div>
      <BottomPanel />
    </div>
  );
}
