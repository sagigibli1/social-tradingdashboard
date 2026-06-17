"use client";

import { ExternalLink, Info } from "lucide-react";

import { SentimentChip } from "@/components/ui/sentiment-chip";
import { SourceBadge } from "@/components/ui/source-badge";
import { formatDate, formatNumber } from "@/lib/format";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import type { FeedItemRow } from "@/lib/db";

type FeedRowProps = {
  item: FeedItemRow;
  selected?: boolean;
  onSelect?: (id: number) => void;
  onOpen?: (item: FeedItemRow) => void;
};

export function FeedRow({ item, selected, onSelect, onOpen }: FeedRowProps) {
  const tickers = item.tickers ? item.tickers.split(",").filter(Boolean) : [];
  const engagementPct = Math.round(item.engagement_normalized * 100);

  return (
    <tr
      className={cn(
        "h-7 border-t border-[#2A2E39] transition-colors duration-100 cursor-pointer",
        selected ? "bg-[#2A2E39]" : "hover:bg-[#1E222D]",
      )}
      onClick={() => onOpen?.(item)}
    >
      {onSelect && (
        <td className="px-2 w-7" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            aria-label={String(item.id)}
            checked={!!selected}
            onChange={() => onSelect(item.id)}
            className="cursor-pointer"
          />
        </td>
      )}
      <td className="px-2 text-[11px] font-mono tabular-nums text-[#787B86] whitespace-nowrap">
        {formatDate(item.published_at)}
      </td>
      <td className="px-2">
        <SourceBadge source={item.source_type} />
      </td>
      <td className="px-2 text-[12px] text-[#D1D4DC] truncate max-w-[420px]">
        {item.title ?? item.body?.slice(0, 120) ?? ""}
      </td>
      <td className="px-2">
        <div className="flex flex-wrap gap-1">
          {tickers.slice(0, 4).map((t) => (
            <span
              key={t}
              className="px-1 py-0.5 text-[10px] font-mono tabular-nums rounded-sm bg-[#2A2E39] text-[#D1D4DC]"
            >
              {t}
            </span>
          ))}
        </div>
      </td>
      <td className="px-2">
        <SentimentChip label={item.sentiment_label} />
      </td>
      <td className="px-2 text-end font-mono tabular-nums text-[11px] text-[#787B86]">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <span className="inline-flex items-center gap-1 cursor-help" title={copy.tooltipEngagementExplain}>
                <span>{formatNumber(engagementPct)}%</span>
                <Info className="w-3 h-3 text-[#787B86]" aria-hidden="true" />
              </span>
            </TooltipTrigger>
            <TooltipContent>{copy.tooltipEngagementExplain}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>
      <td className="px-2 w-8">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          className="text-[#787B86] hover:text-[#D1D4DC] cursor-pointer"
          aria-label={item.url}
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      </td>
    </tr>
  );
}
