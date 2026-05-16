import { cn } from "@/lib/utils";
import type { SourceType } from "@/lib/types";

type SourceBadgeProps = {
  source: SourceType;
  className?: string;
};

const SOURCE_PALETTE: Record<SourceType, { bg: string; label: string }> = {
  twitter: { bg: "#2962FF", label: "TW" },
  reddit: { bg: "#FF4500", label: "RD" },
  rss: { bg: "#9C27B0", label: "RSS" },
  hn: { bg: "#F59E0B", label: "HN" },
};

const FALLBACK_PALETTE = { bg: "#363A45", label: "??" };

export function SourceBadge({ source, className }: SourceBadgeProps) {
  // Defensive fallback in case the DB returns an unexpected source_type value
  // that has bypassed the CHECK constraint.
  const palette = SOURCE_PALETTE[source] ?? FALLBACK_PALETTE;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center min-w-[28px] px-1 py-0.5 text-[10px] font-mono tabular-nums rounded-sm text-white",
        className,
      )}
      style={{ backgroundColor: palette.bg }}
      aria-label={source}
    >
      {palette.label}
    </span>
  );
}
