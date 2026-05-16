"use client";

import { copy } from "@/lib/copy";
import { formatNumber } from "@/lib/format";
import type { SourceType } from "@/lib/types";

type Row = { source_type: SourceType; mention_count: number };

const PALETTE: Record<SourceType, string> = {
  twitter: "#2962FF",
  reddit: "#FF4500",
  rss: "#9C27B0",
  hn: "#F59E0B",
};

const LABELS: Record<SourceType, string> = {
  twitter: "TW",
  reddit: "RD",
  rss: "RSS",
  hn: "HN",
};

type Props = {
  rows: Row[];
};

export function SourceBreakdownBar({ rows }: Props) {
  const total = rows.reduce((s, r) => s + r.mention_count, 0);

  if (total === 0) {
    return (
      <p className="text-[11px] text-[#787B86]">{copy.sourceBreakdownEmpty}</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex w-full h-2 overflow-hidden rounded-sm bg-[#2A2E39]">
        {rows.map((r) =>
          r.mention_count === 0 ? null : (
            <div
              key={r.source_type}
              style={{
                width: `${(r.mention_count / total) * 100}%`,
                backgroundColor: PALETTE[r.source_type],
              }}
              aria-label={`${LABELS[r.source_type]} ${r.mention_count}`}
              title={`${LABELS[r.source_type]} ${r.mention_count}`}
            />
          ),
        )}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#D1D4DC]">
        {rows.map((r) => (
          <li key={r.source_type} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-sm"
              style={{ backgroundColor: PALETTE[r.source_type] }}
              aria-hidden="true"
            />
            <span className="font-mono tabular-nums text-[#787B86]">
              {LABELS[r.source_type]}
            </span>
            <span className="font-mono tabular-nums">
              {formatNumber(r.mention_count)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
