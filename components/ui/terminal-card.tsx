import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type TerminalCardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
  amber?: boolean;
};

// Terminal-style panel. No shadow, no rounded-xl, hover BG shift only.
export function TerminalCard({
  className,
  interactive = false,
  amber = false,
  ...props
}: TerminalCardProps) {
  return (
    <div
      data-slot="terminal-card"
      className={cn(
        "bg-[#1E222D] border rounded-sm transition-colors duration-100",
        amber ? "border-[#F59E0B]" : "border-[#2A2E39]",
        interactive &&
          "hover:bg-[#2A2E39] cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-[#2962FF]",
        className,
      )}
      {...props}
    />
  );
}

export function TerminalCardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-3 py-2 border-b border-[#2A2E39] flex items-center justify-between",
        className,
      )}
      {...props}
    />
  );
}

export function TerminalCardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("text-[13px] font-semibold text-[#D1D4DC]", className)}
      {...props}
    />
  );
}

export function TerminalCardBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-3", className)} {...props} />;
}
