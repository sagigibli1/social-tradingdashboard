"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  List,
  Radio,
  TrendingUp,
} from "lucide-react";

import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

const COLLAPSED_KEY = "tradingdashboard.rail_collapsed";

type RailItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

const ITEMS: RailItem[] = [
  { href: "/", label: copy.navOverview, icon: LayoutDashboard },
  { href: "/feed", label: copy.navFeed, icon: List },
  { href: "/trends", label: copy.navTrends, icon: TrendingUp },
  { href: "/sources", label: copy.navSources, icon: Radio },
  { href: "/terms", label: copy.navTerms, icon: FileText },
];

export function LeftRail() {
  const pathname = usePathname();
  // Default collapsed = true (48px). Expands to 200px on user toggle.
  const [collapsed, setCollapsed] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = window.localStorage.getItem(COLLAPSED_KEY);
    if (v === "0") setCollapsed(false);
    setHydrated(true);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      }
      return next;
    });
  };

  // Match the active route. For "/" only count exact match so /feed doesn't highlight overview.
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside
      className={cn(
        "h-full border-l border-[#2A2E39] bg-[#131722] flex flex-col transition-[width] duration-100",
        hydrated && !collapsed ? "w-[200px]" : "w-12",
      )}
      aria-label={copy.navOverview}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? copy.railExpand : copy.railCollapse}
        className="h-8 w-full flex items-center justify-center text-[#787B86] hover:text-[#D1D4DC] border-b border-[#2A2E39] cursor-pointer"
      >
        {collapsed ? (
          <ChevronLeft className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>
      <nav className="flex-1 flex flex-col py-1">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              className={cn(
                "h-9 flex items-center gap-2 px-3 text-[12px] transition-colors duration-100 cursor-pointer",
                active
                  ? "bg-[#2A2E39] text-[#D1D4DC] border-r-2 border-[#2962FF]"
                  : "text-[#787B86] hover:bg-[#1E222D] hover:text-[#D1D4DC]",
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
