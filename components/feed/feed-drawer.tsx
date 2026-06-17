"use client";

import { useEffect, useState } from "react";
import { ExternalLink, X, Info } from "lucide-react";

import { SentimentChip } from "@/components/ui/sentiment-chip";
import { SourceBadge } from "@/components/ui/source-badge";
import { copy } from "@/lib/copy";
import { formatDate, formatNumber } from "@/lib/format";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import type { FeedItemRow, ItemSentimentRow } from "@/lib/db";

type FeedDrawerProps = {
  item: FeedItemRow | null;
  onClose: () => void;
};

export function FeedDrawer({ item, onClose }: FeedDrawerProps) {
  const [sentiments, setSentiments] = useState<ItemSentimentRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!item) {
      setSentiments([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/metrics/feed?limit=1&offset=0&withSentiments=1`)
      .then((r) => r.json())
      .catch(() => null)
      .finally(() => setLoading(false));
    // Just load the per-item sentiments via dedicated query
    fetch(`/api/metrics/feed?withSentiments=1&limit=500`)
      .then(async (r) => {
        if (!r.ok) return [];
        const arr = (await r.json()) as (FeedItemRow & {
          sentiments?: ItemSentimentRow[];
        })[];
        const match = arr.find((x) => x.id === item.id);
        if (!cancelled) setSentiments(match?.sentiments ?? []);
      })
      .catch((err) => console.error("[drawer] sentiment fetch failed", err));
    return () => {
      cancelled = true;
    };
  }, [item]);

  if (!item) return null;

  const tickers = item.tickers ? item.tickers.split(",").filter(Boolean) : [];

  return (
    <div className="fixed inset-y-0 left-0 w-full sm:w-[420px] bg-[#1E222D] border-r border-[#2A2E39] z-40 flex flex-col">
      <div className="h-9 px-3 flex items-center justify-between border-b border-[#2A2E39]">
        <span className="text-[12px] font-semibold text-[#D1D4DC]">
          {copy.feedRowOpen}
        </span>
        <button
          type="button"
          aria-label={copy.feedDrawerClose}
          onClick={onClose}
          className="text-[#787B86] hover:text-[#D1D4DC] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="flex items-center gap-2 text-[11px]">
          <SourceBadge source={item.source_type} />
          <span className="font-mono tabular-nums text-[#787B86]">
            {formatDate(item.published_at)}
          </span>
          {item.author && (
            <span className="text-[#787B86]">@{item.author}</span>
          )}
        </div>
        {item.title && (
          <h3 className="text-[14px] font-semibold text-[#D1D4DC]">
            {item.title}
          </h3>
        )}
        {item.body && (
          <p className="text-[12px] text-[#D1D4DC] leading-6 whitespace-pre-wrap">
            {item.body}
          </p>
        )}
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-[12px] text-[#2962FF] hover:underline cursor-pointer"
        >
          <ExternalLink className="w-3 h-3" />
          {copy.drawerOpenExternal}
        </a>
        <div className="border-t border-[#2A2E39] pt-3">
          <h4 className="text-[12px] font-semibold text-[#D1D4DC] mb-2">
            {copy.drawerTickers}
          </h4>
          {tickers.length === 0 ? (
            <p className="text-[11px] text-[#787B86]">
              {copy.feedDrawerNoSentiment}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {tickers.map((t) => (
                <span
                  key={t}
                  className="px-1.5 py-0.5 text-[11px] font-mono tabular-nums rounded-sm bg-[#2A2E39] text-[#D1D4DC]"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-[#2A2E39] pt-3">
          <h4 className="text-[12px] font-semibold text-[#D1D4DC] mb-2">
            {copy.drawerSentimentSection}
          </h4>
          {loading && (
            <p className="text-[11px] text-[#787B86]">{copy.loading}</p>
          )}
          {!loading && sentiments.length === 0 && (
            <p className="text-[11px] text-[#787B86]">
              {copy.feedDrawerNoSentiment}
            </p>
          )}
          <ul className="space-y-2">
            {sentiments.map((s) => (
              <li
                key={s.ticker_symbol}
                className="border border-[#2A2E39] rounded-sm p-2 bg-[#131722]"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono tabular-nums text-[12px] text-[#D1D4DC]">
                    {s.ticker_symbol}
                  </span>
                  <SentimentChip label={s.label} />
                </div>
                {s.summary_he && (
                  <p className="text-[12px] text-[#D1D4DC] leading-5">
                    {s.summary_he}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-[#2A2E39] pt-3 text-[11px] text-[#787B86] space-y-1">
          <div className="flex justify-between">
            <span>{copy.feedDrawerEngagementLabel}</span>
            <span className="font-mono tabular-nums">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <span className="inline-flex items-center gap-1 cursor-help">
                      <span>{formatNumber(Math.round(item.engagement_normalized * 100))}%</span>
                      <Info className="w-3 h-3 text-[#787B86]" aria-hidden="true" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{copy.tooltipEngagementExplain}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
          </div>
          <div className="flex justify-between">
            <span>{copy.feedDrawerRawEngagement}</span>
            <span className="font-mono tabular-nums">
              {formatNumber(item.engagement_raw)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
