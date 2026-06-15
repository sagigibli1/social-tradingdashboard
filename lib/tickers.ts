import type { TickerDef } from "./types";

export const SEED_TICKERS: TickerDef[] = [
  { symbol: "GOOGL", name: "Alphabet", category: "stock" },
  { symbol: "GOOX", name: "GOOX", category: "stock" },
  { symbol: "META", name: "Meta Platforms", category: "stock" },
  { symbol: "MSFT", name: "Microsoft", category: "stock" },
  { symbol: "NVDA", name: "NVIDIA", category: "stock" },
  { symbol: "APP", name: "Applovin", category: "stock" },
  { symbol: "ZETA", name: "Zeta Global", category: "stock" },
  { symbol: "TQQQ", name: "ProShares UltraPro QQQ", category: "stock" },
  { symbol: "PLTR", name: "Palantir", category: "stock" },
  { symbol: "TSLA", name: "Tesla", category: "stock" },
  { symbol: "AVGO", name: "Broadcom", category: "stock" },
  { symbol: "OPEN", name: "Opendoor", category: "stock" },
];

export const TICKER_BY_SYMBOL: Record<string, TickerDef> = Object.fromEntries(
  SEED_TICKERS.map((t) => [t.symbol, t]),
);

export const STOCK_SYMBOLS = SEED_TICKERS.map((t) => t.symbol);

// Kept as empty arrays so imports in other files don't break.
export const CRYPTO_SYMBOLS: string[] = [];
export const AI_KEYWORDS: { symbol: string; pattern: RegExp }[] = [];
