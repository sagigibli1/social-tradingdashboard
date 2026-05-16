/* eslint-disable no-console */
/**
 * Wave 2 Agent E - Sentiment analyzer.
 *
 * Reads items that have at least one ticker tag but no sentiment row yet,
 * batches them (default 20 per Claude call), asks claude-bridge to classify
 * each (item, ticker) pair, and upserts the result into the `sentiments`
 * table with a one-sentence Hebrew tone summary.
 *
 * Hard rules baked in:
 *   - Uses runClaude() from lib/claude-bridge (semaphore + rate-limit retry +
 *     500/day cap). Never spawns the CLI directly.
 *   - Labels are "positive" | "negative" | "neutral". Never bullish/bearish.
 *   - summary_he must be Hebrew. Punctuation goes AFTER Hebrew text.
 *   - Stops cleanly when the daily cap is hit (no thrown surprise to the caller).
 *   - Stops after 5 consecutive malformed-JSON batches to avoid burning the cap
 *     on a broken prompt.
 */

import { getDb, upsertSentiment } from "../db";
import { parseClaudeJson, runClaude } from "../claude-bridge";
import type { SentimentLabel } from "../types";

const DEFAULT_BATCH_SIZE = 20;
const MAX_CONSECUTIVE_FAILURES = 5;
const TEXT_TRUNCATE_CHARS = 1500;
const DAILY_CAP_REGEX = /daily cap reached/i;

const MODEL_VERSION = process.env.CLAUDE_MODEL ?? "claude-opus-4-7";

type UnscoredRow = {
  id: number;
  title: string | null;
  body: string | null;
  lang: string;
  tickers: string; // comma-joined ticker symbols from GROUP_CONCAT
};

type BatchInputItem = {
  item_id: number;
  text: string;
  tickers: string[];
};

type ClaudeResponseRow = {
  item_id: number;
  ticker: string;
  label: SentimentLabel;
  score: number;
  confidence: number;
  summary_he: string;
};

export type RunSentimentBatchOpts = {
  maxBatches?: number;
  batchSize?: number;
};

export type RunSentimentBatchResult = {
  batchesProcessed: number;
  itemsScored: number;
  pairsWritten: number;
  failures: number;
  hitDailyCap: boolean;
};

function fetchUnscoredBatch(batchSize: number): UnscoredRow[] {
  const sql = `
    SELECT i.id, i.title, i.body, i.lang, GROUP_CONCAT(it.ticker_symbol) AS tickers
    FROM items i
    JOIN item_tickers it ON it.item_id = i.id
    LEFT JOIN sentiments s ON s.item_id = i.id AND s.ticker_symbol = it.ticker_symbol
    WHERE s.item_id IS NULL
    GROUP BY i.id
    ORDER BY i.published_at DESC
    LIMIT ?
  `;
  return getDb().prepare(sql).all(batchSize) as UnscoredRow[];
}

function buildBatchInput(rows: UnscoredRow[]): BatchInputItem[] {
  const out: BatchInputItem[] = [];
  for (const r of rows) {
    const rawText = `${r.title ?? ""}\n${r.body ?? ""}`.trim();
    if (!rawText) continue;
    const text =
      rawText.length > TEXT_TRUNCATE_CHARS
        ? rawText.slice(0, TEXT_TRUNCATE_CHARS)
        : rawText;
    const tickers = (r.tickers ?? "")
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0);
    if (tickers.length === 0) continue;
    out.push({ item_id: r.id, text, tickers });
  }
  return out;
}

function buildPrompt(batch: BatchInputItem[]): string {
  return [
    "You are a text-tone classifier for a Hebrew-language educational dashboard about social/news mentions of tech and crypto tickers. You DO NOT give investment advice.",
    "",
    "For each input item, classify the tone of the text toward each mentioned ticker symbol. Return a JSON array, one object per (item_id, ticker) pair.",
    "",
    "Each object MUST have exactly these fields:",
    "- item_id: number (echo from input)",
    "- ticker: string (echo from input, uppercase)",
    '- label: one of "positive", "negative", "neutral"',
    "- score: number between -1.0 (very negative) and 1.0 (very positive)",
    "- confidence: number between 0.0 and 1.0",
    '- summary_he: a single Hebrew sentence (10-20 words) describing the text\'s tone toward this ticker. Use plain everyday Israeli Hebrew, never formal/literary. Punctuation goes AFTER Hebrew text (e.g. "המניה עלתה." not ".המניה עלתה").',
    "",
    "IMPORTANT (Hebrew disclaimer for context, do not include in output):",
    "תאר את אופי הטקסט כלפי כל טיקר במשפט אחד בעברית. זה לצרכי לימוד טכנולוגי בלבד, לא ייעוץ השקעות, לא המלצת קנייה או מכירה.",
    "",
    "Output ONLY the JSON array. No prose. No markdown. No code fences.",
    "",
    "INPUT (JSON array of items):",
    JSON.stringify(batch),
  ].join("\n");
}

function stripCodeFences(raw: string): string {
  let s = raw.trim();
  // Some models still wrap JSON in ```json ... ``` despite being told not to.
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return s.trim();
}

const VALID_LABELS: ReadonlySet<SentimentLabel> = new Set([
  "positive",
  "negative",
  "neutral",
]);

function validateRow(
  row: unknown,
  allowedPairs: Set<string>,
): ClaudeResponseRow | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const item_id = typeof r.item_id === "number" ? r.item_id : NaN;
  const ticker =
    typeof r.ticker === "string" ? r.ticker.trim().toUpperCase() : "";
  const label =
    typeof r.label === "string"
      ? (r.label as SentimentLabel)
      : ("" as SentimentLabel);
  const score = typeof r.score === "number" ? r.score : NaN;
  const confidence = typeof r.confidence === "number" ? r.confidence : NaN;
  const summary_he =
    typeof r.summary_he === "string" ? r.summary_he.trim() : "";

  if (!Number.isFinite(item_id)) return null;
  if (!ticker) return null;
  if (!VALID_LABELS.has(label)) return null;
  if (!Number.isFinite(score) || score < -1 || score > 1) return null;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)
    return null;
  if (!summary_he) return null;

  // Drop pairs Claude invented that weren't in the input (hallucinated tickers).
  const pairKey = `${item_id}:${ticker}`;
  if (!allowedPairs.has(pairKey)) return null;

  return { item_id, ticker, label, score, confidence, summary_he };
}

function parseClaudeOutput(
  stdout: string,
  allowedPairs: Set<string>,
): ClaudeResponseRow[] {
  // claude-bridge parseClaudeJson handles both raw JSON and the {result:"..."}
  // envelope. We add markdown-fence stripping as a defensive pass.
  const cleaned = stripCodeFences(stdout);
  let parsed: unknown;
  try {
    parsed = parseClaudeJson<unknown>(cleaned);
  } catch (err) {
    throw new Error(
      `parseClaudeJson failed: ${(err as Error).message}. head=${cleaned.slice(0, 200)}`,
    );
  }

  // Sometimes the model returns {results: [...]} or {rows: [...]} despite the prompt.
  let arr: unknown[] = [];
  if (Array.isArray(parsed)) {
    arr = parsed;
  } else if (parsed && typeof parsed === "object") {
    const candidate = parsed as Record<string, unknown>;
    for (const key of ["results", "rows", "data", "items", "output"]) {
      const v = candidate[key];
      if (Array.isArray(v)) {
        arr = v;
        break;
      }
    }
  }
  if (arr.length === 0) {
    throw new Error(
      `Expected JSON array, got: ${JSON.stringify(parsed).slice(0, 200)}`,
    );
  }

  const out: ClaudeResponseRow[] = [];
  for (const row of arr) {
    const v = validateRow(row, allowedPairs);
    if (v) out.push(v);
  }
  return out;
}

function isDailyCapError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return DAILY_CAP_REGEX.test(msg);
}

export async function runSentimentBatch(
  opts: RunSentimentBatchOpts = {},
): Promise<RunSentimentBatchResult> {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxBatches = opts.maxBatches ?? Number.POSITIVE_INFINITY;

  let batchesProcessed = 0;
  let itemsScored = 0;
  let pairsWritten = 0;
  let failures = 0;
  let consecutiveFailures = 0;
  let hitDailyCap = false;

  while (batchesProcessed < maxBatches) {
    const rows = fetchUnscoredBatch(batchSize);
    if (rows.length === 0) {
      console.log("[sentiment] no more unscored items, stopping.");
      break;
    }

    const batch = buildBatchInput(rows);
    if (batch.length === 0) {
      // All rows in this slice had empty text or no tickers - skip to avoid an
      // infinite loop where the same rows keep coming back.
      console.warn(
        `[sentiment] batch had ${rows.length} rows but no usable text. Skipping ids: ${rows.map((r) => r.id).join(",")}`,
      );
      // Mark each ticker pair as a neutral 0-confidence row so the loop progresses.
      for (const r of rows) {
        const tickers = (r.tickers ?? "")
          .split(",")
          .map((t) => t.trim().toUpperCase())
          .filter((t) => t.length > 0);
        for (const ticker of tickers) {
          upsertSentiment(r.id, ticker, "neutral", 0, 0, null, MODEL_VERSION);
          pairsWritten += 1;
        }
      }
      batchesProcessed += 1;
      continue;
    }

    const allowedPairs = new Set<string>();
    for (const b of batch)
      for (const t of b.tickers) allowedPairs.add(`${b.item_id}:${t}`);

    const prompt = buildPrompt(batch);
    let stdout: string;
    try {
      stdout = await runClaude(prompt, { jsonResponse: true });
    } catch (err) {
      if (isDailyCapError(err)) {
        console.warn("[sentiment] daily cap hit, stopping cleanly.");
        hitDailyCap = true;
        break;
      }
      failures += 1;
      consecutiveFailures += 1;
      console.error(
        `[sentiment] runClaude failed (batch ${batchesProcessed + 1}, consecutive failures ${consecutiveFailures}): ${(err as Error).message}`,
      );
      batchesProcessed += 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(
          `[sentiment] ${MAX_CONSECUTIVE_FAILURES} consecutive failures, stopping.`,
        );
        break;
      }
      continue;
    }

    let parsedRows: ClaudeResponseRow[];
    try {
      parsedRows = parseClaudeOutput(stdout, allowedPairs);
    } catch (err) {
      failures += 1;
      consecutiveFailures += 1;
      console.error(
        `[sentiment] parse failure (batch ${batchesProcessed + 1}, consecutive ${consecutiveFailures}): ${(err as Error).message}`,
      );
      console.error(`[sentiment] raw stdout head: ${stdout.slice(0, 400)}`);
      batchesProcessed += 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(
          `[sentiment] ${MAX_CONSECUTIVE_FAILURES} consecutive failures, stopping.`,
        );
        break;
      }
      continue;
    }

    if (parsedRows.length === 0) {
      failures += 1;
      consecutiveFailures += 1;
      console.error(
        `[sentiment] batch ${batchesProcessed + 1} returned 0 valid rows (raw head: ${stdout.slice(0, 200)})`,
      );
      batchesProcessed += 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(
          `[sentiment] ${MAX_CONSECUTIVE_FAILURES} consecutive failures, stopping.`,
        );
        break;
      }
      continue;
    }

    // Write all rows that passed validation.
    const writtenItemIds = new Set<number>();
    for (const row of parsedRows) {
      try {
        upsertSentiment(
          row.item_id,
          row.ticker,
          row.label,
          row.score,
          row.confidence,
          row.summary_he,
          MODEL_VERSION,
        );
        pairsWritten += 1;
        writtenItemIds.add(row.item_id);
      } catch (err) {
        // Foreign-key violation (ticker not in tickers table) or out-of-range
        // value the DB CHECK rejected. Don't blow up the whole batch.
        console.error(
          `[sentiment] upsert failed for item=${row.item_id} ticker=${row.ticker}: ${(err as Error).message}`,
        );
      }
    }

    itemsScored += writtenItemIds.size;
    batchesProcessed += 1;
    consecutiveFailures = 0;
    console.log(
      `[sentiment] batch ${batchesProcessed}: ${parsedRows.length} rows parsed, ${pairsWritten} pairs total, ${itemsScored} items scored.`,
    );
  }

  return {
    batchesProcessed,
    itemsScored,
    pairsWritten,
    failures,
    hitDailyCap,
  };
}
