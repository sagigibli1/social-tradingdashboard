"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import {
  TerminalCard,
  TerminalCardBody,
  TerminalCardHeader,
  TerminalCardTitle,
} from "@/components/ui/terminal-card";
import { ConfidenceBandLine } from "@/components/charts/confidence-band-line";
import { SourceBadge } from "@/components/ui/source-badge";
import { SentimentChip } from "@/components/ui/sentiment-chip";
import { SourceBreakdownBar } from "@/components/ui/source-breakdown-bar";
import { copy } from "@/lib/copy";
import { formatDate, formatNumber, formatVelocity } from "@/lib/format";
import type {
  FeedItemRow,
  MentionTimePoint,
  SourceBreakdownRow,
  TrendingTickerRow,
} from "@/lib/db";
import type { TrendWindow } from "@/lib/types";

type WindowOption = { value: TrendWindow; label: string };

const WINDOW_OPTIONS: WindowOption[] = [
  { value: "1h", label: copy.trendsWindow1h },
  { value: "24h", label: copy.trendsWindow24h },
  { value: "7d", label: copy.trendsWindow7d },
];

function velocityArrow(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "->";
  if (v > 1.2) return "^";
  if (v < 0.8) return "v";
  return "->";
}

export default function TrendsPage() {
  const [windowValue, setWindowValue] = useState<TrendWindow>("24h");
  const [trends, setTrends] = useState<TrendingTickerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<FeedItemRow[]>([]);
  const [selectedItemsLoading, setSelectedItemsLoading] = useState(false);
  const [selectedSeries, setSelectedSeries] = useState<MentionTimePoint[]>([]);
  const [selectedBreakdown, setSelectedBreakdown] = useState<
    SourceBreakdownRow[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/metrics/trends?window=${windowValue}&limit=30`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as TrendingTickerRow[];
      })
      .then((rows) => {
        if (cancelled) return;
        setTrends(rows);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[trends] fetch failed", msg, err);
        if (!cancelled) {
          setError(`${copy.errorGeneric} (${msg})`);
          setTrends([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [windowValue]);

  const openTicker = useCallback(
    (ticker: string) => {
      setSelected(ticker);
      setSelectedItems([]);
      setSelectedSeries([]);
      setSelectedBreakdown([]);
      setSelectedItemsLoading(true);
      const itemsP = fetch(
        `/api/metrics/feed?ticker=${encodeURIComponent(ticker)}&limit=20`,
      )
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return (await r.json()) as FeedItemRow[];
        })
        .then((rows) => setSelectedItems(rows))
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[trends] items fetch failed", msg, err);
          setSelectedItems([]);
        });
      const seriesP = fetch(
        `/api/metrics/series?ticker=${encodeURIComponent(ticker)}&window=${windowValue}`,
      )
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return (await r.json()) as MentionTimePoint[];
        })
        .then((rows) => setSelectedSeries(rows))
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[trends] series fetch failed", msg, err);
          setSelectedSeries([]);
        });
      const breakdownP = fetch(
        `/api/metrics/source-breakdown?ticker=${encodeURIComponent(ticker)}&window=${windowValue}`,
      )
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return (await r.json()) as SourceBreakdownRow[];
        })
        .then((rows) => setSelectedBreakdown(rows))
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[trends] breakdown fetch failed", msg, err);
          setSelectedBreakdown([]);
        });
      Promise.allSettled([itemsP, seriesP, breakdownP]).finally(() =>
        setSelectedItemsLoading(false),
      );
    },
    [windowValue],
  );

  const closeDetail = useCallback(() => {
    setSelected(null);
    setSelectedItems([]);
    setSelectedSeries([]);
    setSelectedBreakdown([]);
  }, []);

  const selectedRow = useMemo(
    () =>
      selected ? trends.find((t) => t.ticker_symbol === selected) : undefined,
    [selected, trends],
  );

  return (
    <div className="p-3 min-h-full space-y-3">
      <TerminalCard>
        <TerminalCardHeader>
          <TerminalCardTitle>{copy.trendsTitle}</TerminalCardTitle>
          <div className="flex items-center gap-1.5">
            {WINDOW_OPTIONS.map((opt) => {
              const active = opt.value === windowValue;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setWindowValue(opt.value)}
                  className={`px-2 py-0.5 text-[11px] rounded-sm border cursor-pointer transition-colors duration-100 ${
                    active
                      ? "bg-[#2962FF] border-[#2962FF] text-white"
                      : "bg-[#131722] border-[#2A2E39] text-[#787B86] hover:text-[#D1D4DC]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </TerminalCardHeader>
        <TerminalCardBody>
          {error && <p className="text-[12px] text-[#F23645] mb-2">{error}</p>}
          {loading && trends.length === 0 ? (
            <p className="text-[12px] text-[#787B86]">{copy.loading}</p>
          ) : trends.length === 0 ? (
            <p className="text-[12px] text-[#787B86]">{copy.trendsEmpty}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
              {trends.map((t) => (
                <TickerCard
                  key={t.ticker_symbol}
                  row={t}
                  onOpen={() => openTicker(t.ticker_symbol)}
                />
              ))}
            </div>
          )}
        </TerminalCardBody>
      </TerminalCard>

      {selectedRow && (
        <TerminalCard>
          <TerminalCardHeader>
            <TerminalCardTitle>
              {selectedRow.ticker_symbol} - {selectedRow.ticker_name}
            </TerminalCardTitle>
            <button
              type="button"
              onClick={closeDetail}
              className="text-[#787B86] hover:text-[#D1D4DC] cursor-pointer inline-flex items-center gap-1 text-[11px]"
              aria-label={copy.trendsBackToGrid}
            >
              <X className="w-3 h-3" />
              {copy.trendsBackToGrid}
            </button>
          </TerminalCardHeader>
          <TerminalCardBody>
            <ConfidenceBandLine
              points={
                selectedSeries.length > 0
                  ? selectedSeries.map((p) => ({
                      window_start: p.window_start,
                      actual: p.mention_count,
                      forecast: null,
                    }))
                  : [
                      {
                        window_start: selectedRow.window_start,
                        actual: selectedRow.mention_count,
                        forecast: null,
                      },
                    ]
              }
              height={240}
            />
            <div className="mt-3 border-t border-[#2A2E39] pt-3">
              <h4 className="text-[12px] font-semibold text-[#D1D4DC] mb-2">
                {copy.sourceBreakdownTitle}
              </h4>
              <SourceBreakdownBar rows={selectedBreakdown} />
            </div>
            <div className="mt-3 border-t border-[#2A2E39] pt-3">
              <h4 className="text-[12px] font-semibold text-[#D1D4DC] mb-2">
                {copy.trendsRecentItems}
              </h4>
              {selectedItemsLoading ? (
                <p className="text-[11px] text-[#787B86]">{copy.loading}</p>
              ) : selectedItems.length === 0 ? (
                <p className="text-[11px] text-[#787B86]">{copy.emptyFeed}</p>
              ) : (
                <ul className="space-y-1.5">
                  {selectedItems.map((item) => (
                    <li
                      key={item.id}
                      className="px-2 py-1.5 border-t border-[#2A2E39] hover:bg-[#2A2E39] transition-colors duration-100 cursor-pointer"
                    >
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="block cursor-pointer"
                      >
                        <div className="flex items-center gap-2 mb-0.5">
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
          </TerminalCardBody>
        </TerminalCard>
      )}
    </div>
  );
}

function TickerCard({
  row,
  onOpen,
}: {
  row: TrendingTickerRow;
  onOpen: () => void;
}) {
  const velocity = row.velocity ?? 0;
  const spike = velocity > 2.0 && row.mention_count >= 3;
  const arrow = velocityArrow(velocity);

  return (
    <TerminalCard
      interactive
      amber={spike}
      onClick={onOpen}
      className="cursor-pointer"
    >
      <TerminalCardBody>
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="font-mono tabular-nums text-[14px] font-semibold text-[#D1D4DC]">
            {row.ticker_symbol}
          </span>
          {spike && (
            <span className="text-[10px] font-mono tabular-nums text-[#F59E0B]">
              {copy.trendsSpikeBadge}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between text-[11px] mb-1.5">
          <span className="text-[#787B86]">{copy.trendsCardMentions}</span>
          <span className="font-mono tabular-nums text-[#D1D4DC]">
            {formatNumber(row.mention_count)}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#787B86]">{copy.trendsCardVelocity}</span>
          <span
            className={`font-mono tabular-nums ${
              spike ? "text-[#F59E0B]" : "text-[#787B86]"
            }`}
          >
            {arrow} {formatVelocity(velocity)}
          </span>
        </div>
      </TerminalCardBody>
    </TerminalCard>
  );
}
