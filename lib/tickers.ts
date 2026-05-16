import type { TickerDef } from "./types";

// Wave 0 seed list. Categories drive tagging rules in lib/ticker-tagger.ts.
export const SEED_TICKERS: TickerDef[] = [
  // Stocks (tech + AI focus)
  { symbol: "NVDA", name: "NVIDIA", category: "stock" },
  { symbol: "AAPL", name: "Apple", category: "stock" },
  { symbol: "GOOGL", name: "Alphabet", category: "stock" },
  { symbol: "MSFT", name: "Microsoft", category: "stock" },
  { symbol: "META", name: "Meta Platforms", category: "stock" },
  { symbol: "AMZN", name: "Amazon", category: "stock" },
  { symbol: "TSLA", name: "Tesla", category: "stock" },

  // Crypto
  { symbol: "BTC", name: "Bitcoin", category: "crypto" },
  { symbol: "ETH", name: "Ethereum", category: "crypto" },
  { symbol: "SOL", name: "Solana", category: "crypto" },

  // AI keywords (never tagged as a stock; sentiment can still attach)
  { symbol: "AI", name: "Artificial Intelligence", category: "ai-keyword" },
  {
    symbol: "MACHINE_LEARNING",
    name: "machine learning",
    category: "ai-keyword",
  },
  { symbol: "LLM", name: "LLM", category: "ai-keyword" },
  { symbol: "GPT", name: "GPT", category: "ai-keyword" },
  { symbol: "CLAUDE", name: "Claude", category: "ai-keyword" },
  { symbol: "GEMINI", name: "Gemini", category: "ai-keyword" },
];

// Lookup helpers
export const TICKER_BY_SYMBOL: Record<string, TickerDef> = Object.fromEntries(
  SEED_TICKERS.map((t) => [t.symbol, t]),
);

export const STOCK_SYMBOLS = SEED_TICKERS.filter(
  (t) => t.category === "stock",
).map((t) => t.symbol);
export const CRYPTO_SYMBOLS = SEED_TICKERS.filter(
  (t) => t.category === "crypto",
).map((t) => t.symbol);

// AI keyword tagging table: { symbol -> regex literal source for matching in text }
// symbol is the canonical key stored in DB (item_tickers.ticker_symbol).
export const AI_KEYWORDS: { symbol: string; pattern: RegExp }[] = [
  { symbol: "AI", pattern: /\bAI\b/ },
  { symbol: "MACHINE_LEARNING", pattern: /\bmachine learning\b/i },
  { symbol: "LLM", pattern: /\bLLMs?\b/ },
  { symbol: "GPT", pattern: /\bGPT(?:-\d+)?\b/i },
  { symbol: "CLAUDE", pattern: /\bClaude\b/i },
  { symbol: "GEMINI", pattern: /\bGemini\b/i },
];
