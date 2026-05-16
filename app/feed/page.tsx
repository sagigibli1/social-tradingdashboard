"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  TerminalCard,
  TerminalCardHeader,
  TerminalCardTitle,
} from "@/components/ui/terminal-card";
import { FeedRow } from "@/components/feed/feed-row";
import { FeedDrawer } from "@/components/feed/feed-drawer";
import { copy } from "@/lib/copy";
import type { FeedItemRow } from "@/lib/db";
import type { SourceType } from "@/lib/types";

const PAGE_SIZE = 100;
type LangValue = "en" | "he" | "other" | "all";

const SOURCE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: "twitter", label: "Twitter" },
  { value: "reddit", label: "Reddit" },
  { value: "rss", label: "RSS" },
  { value: "hn", label: "Hacker News" },
];

const LANG_OPTIONS: { value: LangValue; label: string }[] = [
  { value: "all", label: copy.feedFilterAll },
  { value: "en", label: copy.langEnglish },
  { value: "he", label: copy.langHebrew },
  { value: "other", label: copy.langOther },
];

// Reusable chip button so filter rows don't duplicate Tailwind class lists.
function ChipButton({
  active,
  onClick,
  children,
  ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`px-2 py-0.5 text-[11px] rounded-sm border cursor-pointer transition-colors duration-100 ${
        active
          ? "bg-[#2962FF] border-[#2962FF] text-white"
          : "bg-[#131722] border-[#2A2E39] text-[#787B86] hover:text-[#D1D4DC]"
      }`}
    >
      {children}
    </button>
  );
}

const PREFS_KEY = "tradingdashboard.feed_prefs";

type FeedPrefs = {
  sources: SourceType[];
  tickers: string[];
  lang: LangValue;
};

function loadPrefs(): FeedPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FeedPrefs;
    if (
      !Array.isArray(parsed.sources) ||
      !Array.isArray(parsed.tickers) ||
      typeof parsed.lang !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export default function FeedPage() {
  const [sources, setSources] = useState<Set<SourceType>>(new Set());
  const [tickers, setTickers] = useState<string[]>([]);
  const [tickerInput, setTickerInput] = useState("");
  const [lang, setLang] = useState<LangValue>("all");
  const [page, setPage] = useState(0);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Restore saved filters on first mount.
  useEffect(() => {
    const prefs = loadPrefs();
    if (prefs) {
      setSources(new Set(prefs.sources));
      setTickers(prefs.tickers);
      setLang(prefs.lang);
    }
    setPrefsLoaded(true);
  }, []);

  // Persist filters whenever they change (skip the initial render before load completes).
  useEffect(() => {
    if (!prefsLoaded) return;
    if (typeof window === "undefined") return;
    const prefs: FeedPrefs = {
      sources: [...sources],
      tickers,
      lang,
    };
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // localStorage full or denied - silently skip
    }
  }, [sources, tickers, lang, prefsLoaded]);

  const [items, setItems] = useState<FeedItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<FeedItemRow | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (sources.size > 0) params.set("source", [...sources].join(","));
    if (tickers.length > 0) params.set("ticker", tickers.join(","));
    if (lang !== "all") params.set("lang", lang);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page * PAGE_SIZE));
    return params.toString();
  }, [sources, tickers, lang, page]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/metrics/feed?${queryString}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as FeedItemRow[];
      })
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[feed] fetch failed", msg, err);
        if (!cancelled) {
          setError(`${copy.errorGeneric} (${msg})`);
          setItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  const toggleSource = useCallback((s: SourceType) => {
    setPage(0);
    setSources((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }, []);

  const addTicker = useCallback((raw: string) => {
    const t = raw.trim().toUpperCase();
    if (!t) return;
    setPage(0);
    setTickers((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setTickerInput("");
  }, []);

  const removeTicker = useCallback((t: string) => {
    setPage(0);
    setTickers((prev) => prev.filter((x) => x !== t));
  }, []);

  const onLangChange = useCallback((v: LangValue) => {
    setPage(0);
    setLang(v);
  }, []);

  return (
    <div className="p-3 min-h-full">
      <TerminalCard className="flex flex-col">
        <TerminalCardHeader>
          <TerminalCardTitle>{copy.feedTitle}</TerminalCardTitle>
          <span className="text-[11px] text-[#787B86] font-mono tabular-nums">
            {items.length} / {PAGE_SIZE}
          </span>
        </TerminalCardHeader>

        {/* Sticky filter chips */}
        <div className="sticky top-0 z-10 bg-[#1E222D] border-b border-[#2A2E39] px-3 py-2 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#787B86]">
              {copy.feedFilterSource}
            </span>
            {SOURCE_OPTIONS.map((opt) => (
              <ChipButton
                key={opt.value}
                active={sources.has(opt.value)}
                onClick={() => toggleSource(opt.value)}
              >
                {opt.label}
              </ChipButton>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#787B86]">
              {copy.feedFilterTicker}
            </span>
            <input
              type="text"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTicker(tickerInput);
                }
              }}
              placeholder="NVDA"
              className="px-2 py-0.5 w-20 text-[11px] font-mono tabular-nums bg-[#131722] border border-[#2A2E39] rounded-sm text-[#D1D4DC] focus:outline-none focus:border-[#2962FF]"
            />
            {tickers.map((t) => (
              <ChipButton
                key={t}
                active
                onClick={() => removeTicker(t)}
                ariaLabel={`${t} x`}
              >
                {t} x
              </ChipButton>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#787B86]">
              {copy.feedFilterLang}
            </span>
            {LANG_OPTIONS.map((opt) => (
              <ChipButton
                key={opt.value}
                active={lang === opt.value}
                onClick={() => onLangChange(opt.value)}
              >
                {opt.label}
              </ChipButton>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-x-auto">
          {error && <p className="p-3 text-[12px] text-[#F23645]">{error}</p>}
          {loading && items.length === 0 ? (
            <p className="p-3 text-[12px] text-[#787B86]">{copy.loading}</p>
          ) : items.length === 0 ? (
            <p className="p-3 text-[12px] text-[#787B86]">{copy.emptyFeed}</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="text-[11px] text-[#787B86] bg-[#1E222D]">
                <tr className="border-b border-[#2A2E39]">
                  <th className="px-2 py-1.5 text-start font-normal">
                    {copy.feedColTime}
                  </th>
                  <th className="px-2 py-1.5 text-start font-normal">
                    {copy.feedColSource}
                  </th>
                  <th className="px-2 py-1.5 text-start font-normal">
                    {copy.feedColTitle}
                  </th>
                  <th className="px-2 py-1.5 text-start font-normal">
                    {copy.feedColTickers}
                  </th>
                  <th className="px-2 py-1.5 text-start font-normal">
                    {copy.feedColSentiment}
                  </th>
                  <th className="px-2 py-1.5 text-end font-normal">
                    {copy.feedColEngagement}
                  </th>
                  <th className="px-2 py-1.5 w-8" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <FeedRow
                    key={item.id}
                    item={item}
                    selected={openItem?.id === item.id}
                    onOpen={(it) => setOpenItem(it)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div className="border-t border-[#2A2E39] px-3 py-2 flex items-center justify-between">
          <span className="text-[11px] text-[#787B86] font-mono tabular-nums">
            {page + 1}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="px-3 py-1 text-[12px] bg-[#131722] border border-[#2A2E39] rounded-sm text-[#D1D4DC] cursor-pointer hover:bg-[#2A2E39] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {copy.paginationPrev}
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={items.length < PAGE_SIZE || loading}
              className="px-3 py-1 text-[12px] bg-[#131722] border border-[#2A2E39] rounded-sm text-[#D1D4DC] cursor-pointer hover:bg-[#2A2E39] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {copy.paginationNext}
            </button>
          </div>
        </div>
      </TerminalCard>

      {openItem && (
        <FeedDrawer item={openItem} onClose={() => setOpenItem(null)} />
      )}
    </div>
  );
}
