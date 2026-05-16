"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import { copy } from "@/lib/copy";
import { formatCompact } from "@/lib/format";
import type { TrendingTickerRow } from "@/lib/db";

type TickerTapeProps = {
  tickers: Pick<TrendingTickerRow, "ticker_symbol" | "mention_count">[];
};

export function TickerTape({ tickers }: TickerTapeProps) {
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const items = tickers.length > 0 ? tickers : [];
  // Duplicate the list so the loop appears seamless.
  const loop = [...items, ...items];
  const animationPlay = paused || reducedMotion ? "paused" : "running";

  return (
    <div
      className="flex-1 h-8 border-l border-[#2A2E39] overflow-hidden relative flex items-center"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-label={paused ? copy.resumeTickerTape : copy.pauseTickerTape}
        className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-5 h-5 flex items-center justify-center bg-[#1E222D] text-[#787B86] hover:text-[#D1D4DC] rounded-sm cursor-pointer"
      >
        {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
      </button>
      <div
        ref={trackRef}
        className="flex items-center gap-6 whitespace-nowrap will-change-transform"
        style={{
          animationName: "tape-scroll",
          animationDuration: `${Math.max(40, items.length * 4)}s`,
          animationTimingFunction: "linear",
          animationIterationCount: "infinite",
          animationPlayState: animationPlay,
        }}
      >
        {loop.map((t, idx) => (
          <span
            key={`${t.ticker_symbol}-${idx}`}
            className="inline-flex items-baseline gap-1 text-[12px]"
          >
            <span className="font-mono tabular-nums font-semibold text-[#D1D4DC]">
              {t.ticker_symbol}
            </span>
            <span className="font-mono tabular-nums text-[#787B86]">
              {formatCompact(t.mention_count)}
            </span>
          </span>
        ))}
        {items.length === 0 && (
          <span className="text-[12px] text-[#787B86] px-3">
            {copy.watchlistEmpty}
          </span>
        )}
      </div>
      <style>{`
        @keyframes tape-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
