"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Info } from "lucide-react";

import { copy } from "@/lib/copy";
import { formatDateShort, formatNumber, formatVelocity } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { SentimentChip } from "@/components/ui/sentiment-chip";
import type { TrendingTickerRow } from "@/lib/db";

type SortKey = "ticker_symbol" | "mention_count" | "velocity" | "sentiment_avg";
type SortDir = "asc" | "desc";

function labelFromAvg(
  avg: number | null,
): "positive" | "negative" | "neutral" | null {
  if (avg === null) return null;
  if (avg > 0.15) return "positive";
  if (avg < -0.15) return "negative";
  return "neutral";
}

export function RightWatchlist({ tickers: initialTickers }: { tickers: TrendingTickerRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("mention_count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [tickers, setTickers] = useState<TrendingTickerRow[]>(initialTickers);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch("/api/metrics/trends?window=24h&limit=12", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const rows = (await res.json()) as TrendingTickerRow[];
        if (!cancelled) setTickers(rows);
      } catch { /* silent */ }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const lastUpdated = useMemo(() => {
    if (tickers.length === 0) return null;
    const latest = Math.max(...tickers.map((t) => t.window_start ?? 0));
    return latest > 0 ? formatDateShort(latest) : null;
  }, [tickers]);

  const sorted = useMemo(() => {
    const list = [...tickers];
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const an = typeof av === "number" ? av : 0;
      const bn = typeof bv === "number" ? bv : 0;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return list;
  }, [tickers, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <aside
      className="h-full w-[260px] border-r border-[#2A2E39] bg-[#131722] flex flex-col"
      aria-label={copy.watchlistTitle}
    >
      <div className="h-8 px-3 flex items-center justify-between border-b border-[#2A2E39] text-[12px] font-semibold text-[#D1D4DC]">
        <span>{copy.watchlistTitle}</span>
        {lastUpdated ? (
          <span className="text-[10px] text-[#787B86] font-normal">
            {`Updated ${lastUpdated}`}
          </span>
        ) : null}
      </div>
      {tickers.length === 0 ? (
        <div className="p-3 text-[12px] text-[#787B86]">
          {copy.watchlistEmpty}
        </div>
      ) : (
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="text-[11px] text-[#787B86] sticky top-0 bg-[#131722]">
                <Th
                  active={sortKey === "ticker_symbol"}
                  dir={sortDir}
                  onClick={() => toggleSort("ticker_symbol")}
                >
                  {copy.watchlistColTicker}
                </Th>
                <Th
                  active={sortKey === "mention_count"}
                  dir={sortDir}
                  align="end"
                  onClick={() => toggleSort("mention_count")}
                >
                  {copy.watchlistColMentions24h}
                </Th>
                <Th
                  active={sortKey === "velocity"}
                  dir={sortDir}
                  align="end"
                  onClick={() => toggleSort("velocity")}
                >
                  {copy.watchlistColTrend}
                </Th>
                <Th
                  active={sortKey === "sentiment_avg"}
                  dir={sortDir}
                  align="end"
                  onClick={() => toggleSort("sentiment_avg")}
                >
                  {copy.watchlistColSentiment}
                </Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => {
                const isSpike = (t.velocity ?? 0) > 2.0 && t.mention_count >= 3;
                return (
                  <tr
                    key={t.ticker_symbol}
                    className="border-t border-[#2A2E39] hover:bg-[#1E222D] cursor-pointer transition-colors duration-100"
                    onClick={() => {
                      // Scroll to anchor in main area, if present.
                      if (typeof document !== "undefined") {
                        const el = document.getElementById(
                          `ticker-${t.ticker_symbol}`,
                        );
                        el?.scrollIntoView({ behavior: "smooth" });
                      }
                    }}
                  >
                    <td className="px-3 py-1.5 font-mono tabular-nums text-[#D1D4DC]">
                      {t.ticker_symbol}
                    </td>
                    <td className="px-3 py-1.5 font-mono tabular-nums text-end text-[#D1D4DC]">
                      {formatNumber(t.mention_count)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-1.5 font-mono tabular-nums text-end",
                        isSpike ? "text-[#F59E0B]" : "text-[#787B86]",
                      )}
                    >
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="inline-flex items-center justify-end gap-1 cursor-help" title={copy.tooltipTrendExplain}>
                              <span>{formatVelocity(t.velocity ?? 0)}</span>
                              <Info className="w-3 h-3 text-[#787B86]" aria-hidden="true" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{copy.tooltipTrendExplain}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                    <td className="px-3 py-1.5 text-end">
                      <SentimentChip label={labelFromAvg(t.sentiment_avg)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </aside>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
  align,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: SortDir;
  align?: "start" | "end";
}) {
  return (
    <th
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 font-normal cursor-pointer select-none",
        align === "end" ? "text-end" : "text-start",
      )}
    >
      <span className="inline-flex items-center gap-1">
        {active &&
          (dir === "asc" ? (
            <ArrowUp className="w-3 h-3" />
          ) : (
            <ArrowDown className="w-3 h-3" />
          ))}
        {children}
      </span>
    </th>
  );
}
