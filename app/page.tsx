import Link from "next/link";
import { Info } from "lucide-react";

import {
  TerminalCard,
  TerminalCardBody,
  TerminalCardHeader,
  TerminalCardTitle,
} from "@/components/ui/terminal-card";
import { TrendLine, type TrendSeries } from "@/components/charts/trend-line";
import { SourceBadge } from "@/components/ui/source-badge";
import { SentimentChip } from "@/components/ui/sentiment-chip";
import { copy } from "@/lib/copy";
import { getTrendSeries, queryFeedItems, queryTrendingTickers } from "@/lib/db";
import { formatDate, formatNumber, formatVelocity } from "@/lib/format";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

export const dynamic = "force-dynamic";

const CHART_COLORS = ["#2962FF", "#F59E0B", "#26C6DA"];

export default function OverviewPage() {
  const topTickers = queryTrendingTickers("24h", 50);
  const recentItems = queryFeedItems({ limit: 20 });

  const topThree = topTickers.slice(0, 3);
  const series: TrendSeries[] = topThree.map((t, i) => {
    const points = getTrendSeries(t.ticker_symbol, "1h", 24);
    return {
      name: t.ticker_symbol,
      color: CHART_COLORS[i % CHART_COLORS.length],
      points: points.map((p) => ({
        window_start: p.window_start,
        value: p.mention_count,
      })),
    };
  });

  return (
    <div className="p-3 grid grid-cols-1 lg:grid-cols-3 gap-3 min-h-full">
      <TerminalCard className="lg:col-span-1 flex flex-col">
        <TerminalCardHeader>
          <TerminalCardTitle>{copy.overviewTopTickers}</TerminalCardTitle>
          <span className="text-[11px] text-[#787B86]">
            {copy.trendsWindow24h}
          </span>
        </TerminalCardHeader>
        <div className="overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead className="text-[11px] text-[#787B86] sticky top-0 bg-[#1E222D]">
              <tr>
                <th className="px-3 py-1.5 text-start font-normal">
                  {copy.watchlistColTicker}
                </th>
                <th className="px-3 py-1.5 text-end font-normal">
                  {copy.watchlistColMentions24h}
                </th>
                <th className="px-3 py-1.5 text-end font-normal">
                  {copy.watchlistColTrend}
                </th>
              </tr>
            </thead>
            <tbody>
              {topTickers.map((t) => {
                const spike = (t.velocity ?? 0) > 2.0 && t.mention_count >= 3;
                return (
                  <tr
                    key={t.ticker_symbol}
                    id={`ticker-${t.ticker_symbol}`}
                    className="border-t border-[#2A2E39] hover:bg-[#2A2E39] cursor-pointer transition-colors duration-100"
                  >
                    <td className="px-3 py-1.5 font-mono tabular-nums text-[#D1D4DC]">
                      {t.ticker_symbol}
                    </td>
                    <td className="px-3 py-1.5 font-mono tabular-nums text-end text-[#D1D4DC]">
                      {formatNumber(t.mention_count)}
                    </td>
                    <td className="px-3 py-1.5 font-mono tabular-nums text-end">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="inline-flex items-center justify-end gap-1 cursor-help">
                              <span
                                className={`${
                                  spike ? "text-[#F59E0B]" : "text-[#787B86]"
                                }`}
                              >
                                {formatVelocity(t.velocity ?? 0)}
                              </span>
                              <Info className="w-3 h-3 text-[#787B86]" aria-hidden="true" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{copy.tooltipTrendExplain}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {topTickers.length === 0 && (
            <p className="p-3 text-[12px] text-[#787B86]">{copy.trendsEmpty}</p>
          )}
        </div>
      </TerminalCard>

      <TerminalCard className="lg:col-span-1">
        <TerminalCardHeader>
          <TerminalCardTitle>{copy.overviewVelocity}</TerminalCardTitle>
          <span className="text-[11px] text-[#787B86]">
            {copy.trendsWindow24h}
          </span>
        </TerminalCardHeader>
        <TerminalCardBody>
          {series.length === 0 || series.every((s) => s.points.length === 0) ? (
            <p className="text-[12px] text-[#787B86] py-8 text-center">
              {copy.trendsEmpty}
            </p>
          ) : (
            <>
              <TrendLine series={series} height={220} />
              <div className="flex items-center gap-4 mt-2">
                {series.map((s) => (
                  <span
                    key={s.name}
                    className="inline-flex items-center gap-1 text-[11px]"
                  >
                    <span
                      aria-hidden
                      className="w-2 h-2 rounded-sm"
                      style={{ background: s.color }}
                    />
                    <span className="font-mono tabular-nums text-[#D1D4DC]">
                      {s.name}
                    </span>
                  </span>
                ))}
              </div>
            </>
          )}
        </TerminalCardBody>
      </TerminalCard>

      <TerminalCard className="lg:col-span-1 flex flex-col">
        <TerminalCardHeader>
          <TerminalCardTitle>{copy.overviewLiveFeed}</TerminalCardTitle>
          <Link
            href="/feed"
            className="text-[11px] text-[#2962FF] hover:underline cursor-pointer"
          >
            {copy.overviewSeeAll}
          </Link>
        </TerminalCardHeader>
        <div className="overflow-y-auto flex-1">
          {recentItems.length === 0 ? (
            <p className="p-3 text-[12px] text-[#787B86]">{copy.emptyFeed}</p>
          ) : (
            <ul>
              {recentItems.map((item) => (
                <li
                  key={item.id}
                  className="px-3 py-2 border-t border-[#2A2E39] hover:bg-[#2A2E39] transition-colors duration-100 cursor-pointer"
                >
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block cursor-pointer"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <SourceBadge source={item.source_type} />
                      <span className="text-[10px] font-mono tabular-nums text-[#787B86]">
                        {formatDate(item.published_at)}
                      </span>
                      <SentimentChip label={item.sentiment_label} />
                    </div>
                    <p className="text-[12px] text-[#D1D4DC] line-clamp-2">
                      {item.title ?? item.body?.slice(0, 140) ?? ""}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </TerminalCard>
    </div>
  );
}
