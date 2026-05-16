"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";

import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

type Tab = "filters" | "actions" | "history";

const TABS: { key: Tab; label: string }[] = [
  { key: "filters", label: copy.bottomTabFilters },
  { key: "actions", label: copy.bottomTabActions },
  { key: "history", label: copy.bottomTabHistory },
];

export function BottomPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("filters");

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Cmd/Ctrl+B
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setOpen((p) => !p);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="border-t border-[#2A2E39] bg-[#131722]">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-label={open ? copy.bottomPanelClose : copy.bottomPanelOpen}
        className="w-full h-6 flex items-center justify-between px-3 text-[11px] text-[#787B86] hover:text-[#D1D4DC] cursor-pointer"
      >
        <span>
          {open ? copy.bottomPanelClose : copy.bottomPanelOpen} (Cmd/Ctrl+B)
        </span>
        {open ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronUp className="w-3 h-3" />
        )}
      </button>
      {open && (
        <div className="h-[200px] border-t border-[#2A2E39] flex flex-col">
          <div className="flex border-b border-[#2A2E39]">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "px-3 py-1.5 text-[12px] border-l border-[#2A2E39] cursor-pointer transition-colors duration-100",
                  tab === t.key
                    ? "bg-[#1E222D] text-[#D1D4DC]"
                    : "text-[#787B86] hover:text-[#D1D4DC]",
                )}
              >
                {t.label}
              </button>
            ))}
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={copy.closeButton}
              className="px-3 text-[#787B86] hover:text-[#D1D4DC] cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="flex-1 p-3 text-[12px] text-[#D1D4DC] overflow-y-auto">
            {tab === "filters" && <p>{copy.bottomFiltersHint}</p>}
            {tab === "actions" && <p>{copy.bottomActionsHint}</p>}
            {tab === "history" && <p>{copy.bottomHistoryEmpty}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
