// Centralized formatters for the Hebrew RTL UI.
// Every visible date and number in the dashboard goes through here.

const DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  timeZone: "Asia/Jerusalem",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const SHORT_DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  timeZone: "Asia/Jerusalem",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const NUMBER_FMT = new Intl.NumberFormat("he-IL");

const RELATIVE_FMT = new Intl.RelativeTimeFormat("he-IL", { numeric: "auto" });

// `published_at` is unix seconds. Convert to ms inside, then format.
export function formatDate(unixSec: number | null | undefined): string {
  if (unixSec === null || unixSec === undefined || !Number.isFinite(unixSec))
    return "";
  // Avoid Intl's default formatToParts spacing - we want "17.5.2026 14:32".
  const parts = DATE_FMT.formatToParts(new Date(unixSec * 1000));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const day = map.day ?? "";
  const month = map.month ?? "";
  const year = map.year ?? "";
  const hour = map.hour ?? "";
  const minute = map.minute ?? "";
  if (!day || !month || !year) return DATE_FMT.format(new Date(unixSec * 1000));
  return `${day}.${month}.${year} ${hour}:${minute}`;
}

export function formatDateShort(unixSec: number | null | undefined): string {
  if (unixSec === null || unixSec === undefined || !Number.isFinite(unixSec))
    return "";
  const parts = SHORT_DATE_FMT.formatToParts(new Date(unixSec * 1000));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const day = map.day ?? "";
  const month = map.month ?? "";
  const hour = map.hour ?? "";
  const minute = map.minute ?? "";
  if (!day || !month) return SHORT_DATE_FMT.format(new Date(unixSec * 1000));
  return `${day}.${month} ${hour}:${minute}`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "0";
  return NUMBER_FMT.format(n);
}

// Hebrew relative time. Picks the biggest sensible unit.
export function formatRelative(unixSec: number | null | undefined): string {
  if (unixSec === null || unixSec === undefined || !Number.isFinite(unixSec))
    return "";
  const nowSec = Math.floor(Date.now() / 1000);
  const diffSec = unixSec - nowSec;
  const abs = Math.abs(diffSec);

  if (abs < 60) return RELATIVE_FMT.format(Math.round(diffSec), "second");
  if (abs < 3600)
    return RELATIVE_FMT.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400)
    return RELATIVE_FMT.format(Math.round(diffSec / 3600), "hour");
  if (abs < 604800)
    return RELATIVE_FMT.format(Math.round(diffSec / 86400), "day");
  if (abs < 2629800)
    return RELATIVE_FMT.format(Math.round(diffSec / 604800), "week");
  return RELATIVE_FMT.format(Math.round(diffSec / 2629800), "month");
}

// "1.2k" / "3.4M" style. Used in the ticker tape where space is tight.
export function formatCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "0";
  if (Math.abs(n) < 1000) return String(n);
  if (Math.abs(n) < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

// Velocity rounded to 1 decimal, with a trailing 'x'. Velocity is a ratio.
export function formatVelocity(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "0.0x";
  return `${v.toFixed(1)}x`;
}
