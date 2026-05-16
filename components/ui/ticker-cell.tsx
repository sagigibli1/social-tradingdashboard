import { cn } from "@/lib/utils";

type TickerCellProps = {
  symbol: string;
  name?: string | null;
  className?: string;
};

export function TickerCell({ symbol, name, className }: TickerCellProps) {
  return (
    <span className={cn("inline-flex items-baseline gap-2", className)}>
      <span className="font-mono tabular-nums text-[13px] text-[#D1D4DC]">
        {symbol}
      </span>
      {name && (
        <span className="text-[11px] text-[#787B86] truncate max-w-[120px]">
          {name}
        </span>
      )}
    </span>
  );
}
