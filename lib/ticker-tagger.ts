import type { TaggedTicker } from "./types";
import { AI_KEYWORDS, CRYPTO_SYMBOLS, STOCK_SYMBOLS } from "./tickers";

// Context words that promote a bare uppercase stock match to a confident ticker.
// Without one of these within 50 chars of "META", we skip - too many false positives
// from English prose ("meta-analysis", proper noun "Meta").
const STOCK_CONTEXT_WORDS = [
  "stock",
  "shares",
  "earnings",
  "price",
  "ticker",
  "market",
  "cap",
  "trading",
  "trade",
  "invest",
];

const STOCK_CONTEXT_REGEX = new RegExp(
  `\\b(?:${STOCK_CONTEXT_WORDS.join("|")})\\b`,
  "i",
);
const CONTEXT_WINDOW = 50;

// Hoist per-symbol regexes once at module load - avoids allocating on every tagText call.
type SymbolRegex = { symbol: string; cashtag: RegExp; word: RegExp };

function compile(symbols: string[]): SymbolRegex[] {
  return symbols.map((symbol) => ({
    symbol,
    cashtag: new RegExp(`\\$${symbol}\\b`),
    word: new RegExp(`\\b${symbol}\\b`, "g"),
  }));
}

const STOCK_REGEXES = compile(STOCK_SYMBOLS);
const CRYPTO_REGEXES = compile(CRYPTO_SYMBOLS);

function hasContextNearby(
  text: string,
  matchStart: number,
  matchEnd: number,
): boolean {
  const from = Math.max(0, matchStart - CONTEXT_WINDOW);
  const to = Math.min(text.length, matchEnd + CONTEXT_WINDOW);
  return STOCK_CONTEXT_REGEX.test(text.slice(from, to));
}

// Returns the first bare-word match whose surrounding window contains a context word,
// or null if no qualifying match exists. Stops at the first qualifying hit because we
// only emit one tag per (symbol, item).
function findContextualMatch(
  text: string,
  wordRe: RegExp,
): RegExpExecArray | null {
  wordRe.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = wordRe.exec(text)) !== null) {
    if (hasContextNearby(text, match.index, match.index + match[0].length)) {
      return match;
    }
  }
  return null;
}

// One pass over text -> list of (symbol, match_type, confidence).
// Per symbol, keeps the highest-confidence match (cashtag wins over context wins over keyword).
export function tagText(text: string): TaggedTicker[] {
  if (!text) return [];
  const out = new Map<string, TaggedTicker>();

  const consider = (cand: TaggedTicker) => {
    const existing = out.get(cand.ticker_symbol);
    if (!existing || cand.match_confidence > existing.match_confidence) {
      out.set(cand.ticker_symbol, cand);
    }
  };

  // Stocks: cashtag (1.0) wins; otherwise require nearby context word (0.7); else skip.
  for (const { symbol, cashtag, word } of STOCK_REGEXES) {
    if (cashtag.test(text)) {
      consider({
        ticker_symbol: symbol,
        match_type: "cashtag",
        match_confidence: 1.0,
      });
      continue;
    }
    if (findContextualMatch(text, word)) {
      consider({
        ticker_symbol: symbol,
        match_type: "context",
        match_confidence: 0.7,
      });
    }
  }

  // Crypto: cashtag (1.0) wins; bare uppercase alone is enough (0.9, low collision risk).
  for (const { symbol, cashtag, word } of CRYPTO_REGEXES) {
    if (cashtag.test(text)) {
      consider({
        ticker_symbol: symbol,
        match_type: "cashtag",
        match_confidence: 1.0,
      });
      continue;
    }
    word.lastIndex = 0;
    if (word.test(text)) {
      consider({
        ticker_symbol: symbol,
        match_type: "context",
        match_confidence: 0.9,
      });
    }
  }

  // AI keywords: keyword-only, conf 0.6. Never tagged as a stock ticker.
  for (const { symbol, pattern } of AI_KEYWORDS) {
    if (pattern.test(text)) {
      consider({
        ticker_symbol: symbol,
        match_type: "keyword",
        match_confidence: 0.6,
      });
    }
  }

  return Array.from(out.values());
}
