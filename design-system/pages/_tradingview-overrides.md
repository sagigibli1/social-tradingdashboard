# TradingView Terminal Overrides

> Supersedes MASTER.md Pattern + Style + Effects sections.
> Wave 3 UI agents MUST read this file AFTER MASTER.md. Overrides win.

## Source of truth

User picked TradingView.com as the reference. Bento + OLED design from MASTER.md is discarded for this product. Terminal/cockpit aesthetic applies to every page, every component.

We do NOT show prices. We show news + social mentions + sentiment + velocity. TradingView's red/green-for-price-change convention does NOT apply here: sentiment stays gray.

## Layout (TradingView terminal)

- Top bar (32px): app brand left, ticker tape scrolling right-to-left across center showing tracked tickers + 24h mention count (no prices), sync button + status pill right
- Disclaimer strip (28px) pinned BELOW top bar, amber border-bottom, single Hebrew line plus (פרטים) modal trigger
- Left rail (48px collapsed, 200px expanded): icon nav - Overview, Feed, Trends, Sources, Terms. Hebrew labels appear on expand
- Main area (flex-1): page content with dense 8px gutters, sharp corners
- Right watchlist (260px, collapsible, RTL puts it on the visual LEFT of main area but it remains logically "right"): compact sortable table with ticker, 24h mentions, velocity, sentiment chip. Shown on Overview and Trends, hidden on Feed and Sources
- Bottom panel (collapsible, 200-360px, Cmd/Ctrl+B): filters, bulk actions, sync history

## Style (dark terminal, TradingView-matched)

- Page BG: `#131722`
- Panel/card BG: `#1E222D`
- Border: `#2A2E39` (1px, no shadows - shadows feel too soft for terminal)
- Hover BG: `#2A2E39`
- Text primary: `#D1D4DC`
- Text muted: `#787B86`
- Accent links: `#2962FF`
- Brand/CTA accent: amber `#F59E0B` (sync button, spike alerts, important counters)
- Cyan accent for live data pulses: `#26C6DA`
- Sentiment chips: `#363A45` bg + `#D1D4DC` text. No red/green, no arrows.
- NO `scale-1.02`, NO `rounded-2xl`, NO glow effects - wrong feel for terminal
- Hover: subtle BG shift (`#1E222D` -> `#2A2E39`), corners `rounded-sm` (2px) or none, transitions 100ms

## Typography

- UI body: Noto Sans Hebrew, 13px (TradingView density, not 16px luxury)
- Numbers + tickers: JetBrains Mono or Roboto Mono, 13px `tabular-nums` (column alignment is critical in watchlist + tables)
- Headings: Noto Sans Hebrew, 14-16px, weight 600 (no display sizes)
- Line height 1.4 (tighter than the 1.5-1.75 default - density over breathing room)

## Charts (recharts)

- Trend velocity per ticker: Line chart, `#2962FF` primary, multi-series distinct colors, NO area fill, thin 1.5px stroke
- Forecast band (7d): Line with confidence band - actual solid `#2962FF`, forecast dashed `#F59E0B`, band fill `rgba(41,98,255,0.08)`
- Real-time sync pulse: sparkline-style mini area chart near sync button, with visible PAUSE BUTTON (a11y per MASTER.md flashing-element risk)
- Sentiment distribution: horizontal stacked bar in watchlist row (gray fills, no red/green)
- Chart axes: `#787B86` text, `#2A2E39` grid lines (very low contrast)
- All recharts Tooltip: `contentStyle: { direction: 'rtl', background: '#1E222D', border: '1px solid #2A2E39', fontSize: 12 }`

## Effects (terminal-restrained)

- Hover: subtle BG shift only, 100ms ease, no scale
- Focus: 1px ring `#2962FF`, no glow
- No animations on data updates (TradingView shows instant value changes, smooth tweens hide latency)
- `prefers-reduced-motion`: ticker tape MUST pause when set
- Ticker tape: linear scroll 30px/s, pauses on hover and on `prefers-reduced-motion`

## Source badge palette

- twitter: `#2962FF`
- reddit: `#FF4500`
- rss: `#9C27B0`
- hn: `#F59E0B`

## Hebrew RTL hard rules

- `<html lang="he" dir="rtl">` always
- Every visible string from `lib/copy.ts`
- Numbers via `Intl.NumberFormat('he-IL')`
- Dates via `Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem' })` (format `17.5.2026 14:32`)
- Punctuation AFTER Hebrew text: `רוצים ללמוד עוד?` not `?רוצים ללמוד עוד`
- All ARIA labels in Hebrew

## Forbidden Tailwind classes

`grep -rE "(scale-|rounded-2xl|shadow-(sm|md|lg|xl|2xl))" app/ components/` must return empty.
