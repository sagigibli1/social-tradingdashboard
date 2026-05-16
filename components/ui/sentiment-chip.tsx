"use client";

import { cn } from "@/lib/utils";
import { copy } from "@/lib/copy";
import type { SentimentLabel } from "@/lib/types";

type SentimentChipProps = {
  label: SentimentLabel | null;
  className?: string;
  title?: string;
};

const HE_LABEL: Record<SentimentLabel, string> = {
  positive: copy.sentimentPositive,
  negative: copy.sentimentNegative,
  neutral: copy.sentimentNeutral,
};

export function SentimentChip({ label, className, title }: SentimentChipProps) {
  if (!label) {
    return (
      <span
        className={cn(
          "inline-flex items-center px-1.5 py-0.5 text-[11px] rounded-sm bg-[#363A45] text-[#787B86]",
          className,
        )}
        aria-label={copy.sentimentTooltip}
        title={copy.sentimentTooltip}
      >
        -
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 text-[11px] rounded-sm bg-[#363A45] text-[#D1D4DC]",
        className,
      )}
      title={title ?? copy.sentimentTooltip}
      aria-label={HE_LABEL[label]}
    >
      {HE_LABEL[label]}
    </span>
  );
}
