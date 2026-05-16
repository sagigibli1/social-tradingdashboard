import { spawn } from "child_process";
import path from "path";
import fs from "fs";

// Wrapper around the local `claude` CLI subprocess. Uses Peleg's subscription
// credits, not an API key. Key behaviours layered on top of the raw spawn from
// ig-dashboard/lib/claude-bridge.ts:
//   1. Concurrency cap: max 3 simultaneous CLI processes (FIFO queue).
//   2. Rate-limit backoff: stderr containing "rate limit" -> wait 60s, retry once.
//   3. Daily call cap: hard 500/day, tracked in db/claude-call-log.txt
//      so a runaway loop can't drain the subscription mid-workshop.

const MAX_CONCURRENT = 3;
const RATE_LIMIT_BACKOFF_MS = 60_000;
const DAILY_CAP = 500;
const DEFAULT_TIMEOUT_MS = 180_000;

const CALL_LOG_PATH = path.join(process.cwd(), "db", "claude-call-log.txt");

let active = 0;
const waitQueue: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(() => {
      active += 1;
      resolve();
    });
  });
}

function release(): void {
  active -= 1;
  const next = waitQueue.shift();
  if (next) next();
}

function todayKey(): string {
  // YYYY-MM-DD in local Israeli time - matches when the daily cap "resets" intuitively.
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readTodaysCount(): number {
  if (!fs.existsSync(CALL_LOG_PATH)) return 0;
  const key = todayKey();
  const lines = fs.readFileSync(CALL_LOG_PATH, "utf8").split("\n");
  let count = 0;
  for (const line of lines) {
    if (line.startsWith(`${key} `)) count += 1;
  }
  return count;
}

function recordCall(): void {
  const dir = path.dirname(CALL_LOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(CALL_LOG_PATH, `${todayKey()} ${Date.now()}\n`);
}

type SpawnResult = { stdout: string; stderr: string; code: number | null };

function rawSpawn(
  prompt: string,
  timeoutMs: number,
  jsonResponse: boolean,
): Promise<SpawnResult> {
  const escapedPrompt = prompt.replace(/'/g, "'\\''");
  const outputFlag = jsonResponse ? "--output-format json" : "";
  // Strip CLAUDE_* / MCP_* env vars so the subprocess uses the user's logged-in
  // CLI session, not whatever transient credentials the Next.js process inherited.
  const shellCmd = [
    "for v in $(env | grep -E '^(CLAUDE|MCP_)' | cut -d= -f1); do unset $v; done;",
    `/usr/local/bin/claude -p '${escapedPrompt}' ${outputFlag}`,
  ].join(" ");

  return new Promise((resolve, reject) => {
    const child = spawn("/bin/bash", ["-c", shellCmd], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Claude CLI timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });
    child.unref();
  });
}

export type RunClaudeOpts = {
  jsonResponse?: boolean;
  timeoutMs?: number;
};

export async function runClaude(
  prompt: string,
  opts: RunClaudeOpts = {},
): Promise<string> {
  const jsonResponse = opts.jsonResponse ?? false;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (readTodaysCount() >= DAILY_CAP) {
    throw new Error(
      `Claude CLI daily cap reached (${DAILY_CAP}). Try again tomorrow.`,
    );
  }

  await acquire();
  try {
    recordCall();
    let result = await rawSpawn(prompt, timeoutMs, jsonResponse);

    if (result.code !== 0 && /rate.?limit/i.test(result.stderr)) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_BACKOFF_MS));
      recordCall();
      result = await rawSpawn(prompt, timeoutMs, jsonResponse);
    }

    if (result.code !== 0) {
      throw new Error(
        `Claude CLI exited with code ${result.code}. stderr: ${result.stderr.slice(0, 400)}`,
      );
    }
    return result.stdout;
  } finally {
    release();
  }
}

// Best-effort JSON extraction from the CLI's wrapped output. Handles both
// raw JSON and the {result: "..."} envelope that --output-format json returns.
export function parseClaudeJson<T = unknown>(stdout: string): T {
  try {
    const parsed = JSON.parse(stdout);
    if (
      parsed &&
      typeof parsed === "object" &&
      "result" in parsed &&
      typeof parsed.result === "string"
    ) {
      const inner = parsed.result.match(/[\[{][\s\S]*[\]}]/);
      if (inner) return JSON.parse(inner[0]) as T;
    }
    return parsed as T;
  } catch {
    const inner = stdout.match(/[\[{][\s\S]*[\]}]/);
    if (inner) return JSON.parse(inner[0]) as T;
    throw new Error(
      `Could not parse Claude JSON response. stdout: ${stdout.slice(0, 300)}`,
    );
  }
}
