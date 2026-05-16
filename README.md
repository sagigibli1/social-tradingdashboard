# tradingdashboard

> **כלי לימודי בלבד. לא ייעוץ השקעות.**
> **Educational tool only. Not investment advice.**

A Hebrew-RTL, TradingView-styled news aggregator that pulls posts and articles about tech / AI / crypto tickers from X (Twitter), Reddit, RSS, and Hacker News, classifies the tone of each item in Hebrew via Claude Code, and tracks mention velocity over time.

Built as the live worked example for the AI Agent School Claude Code workshop. Students clone this repo, plug in their own keys, and have a real working dashboard in under 10 minutes.

---

## תוכן עניינים / Table of contents

- [English quick start](#english-quick-start)
- [התחלה מהירה בעברית](#hebrew-quick-start)
- [What it does](#what-it-does)
- [Architecture in one screen](#architecture-in-one-screen)
- [Adding your own sources](#adding-your-own-sources)
- [Production / workshop mode](#production--workshop-mode)
- [Optional: MCP servers](#optional-mcp-servers)
- [Troubleshooting](#troubleshooting)
- [Disclaimer](#disclaimer)

---

## English quick start

### 1. Prerequisites

- **Node 22+** and **npm 10+** (`node -v` to check)
- **Claude Code CLI** installed and authenticated. Get it from [claude.com/code](https://claude.com/code). The sentiment analyzer uses the CLI as a subprocess instead of the API, so you do NOT need an Anthropic API key - your existing Claude subscription is used.
- **Apify account**, free tier. The free tier gives you $5/month in credits, which is plenty for the workshop demo (the sync button is server-side rate-gated to 1 call per 5 min).

### 2. Clone and install

```bash
git clone https://github.com/peleg-jpg/tradingdashboard.git
cd tradingdashboard
npm install
```

### 3. Get your Apify token

1. Go to [console.apify.com/account/integrations](https://console.apify.com/account/integrations)
2. Sign up (free, no credit card)
3. Copy the **Personal API token**

### 4. Configure

```bash
cp .env.example .env.local
```

Open `.env.local` and paste your token:

```
APIFY_API_TOKEN=apify_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

`.env.local` is gitignored, so your key stays on your machine.

### 5. First sync (populates the DB)

```bash
npx tsx scripts/smoke-rss.ts        # free, no Apify cost, gets you going
npx tsx scripts/smoke-hn.ts         # free
npx tsx scripts/smoke-twitter.ts    # uses Apify (~$0.40)
npx tsx scripts/smoke-reddit.ts     # uses Apify (~$0.85)
```

Or hit them all at once after the dev server is up by clicking **סנכרן עכשיו** in the UI.

### 6. Score sentiment (Hebrew, via Claude Code CLI)

```bash
npx tsx scripts/smoke-sentiment.ts          # 15-item smoke run
# or full pass:
npx tsx -e "import('./lib/analysis/sentiment.ts').then(m => m.runSentimentBatch({ maxBatches: 30 })).then(console.log)"
```

This uses your local `claude` CLI. No API key burn.

### 7. Run it

```bash
npm run dev
```

Open [http://127.0.0.1:3003](http://127.0.0.1:3003).

---

## Hebrew quick start

### 1. דרישות מקדימות

- **Node 22+** ו-**npm 10+** (בדקו עם `node -v`)
- **קלוד קוד CLI** מותקן ומחובר. תורידו מ-[claude.com/code](https://claude.com/code). הסנטימנט רץ דרך ה-CLI במקום ה-API, אז לא צריכים מפתח אנת'רופיק, המנוי הקיים שלכם משמש.
- **חשבון Apify** במסלול החינמי. החינמי נותן 5$ קרדיט בחודש, מספיק לסדנה (כפתור הסנכרן מוגבל ל-1 לחיצה כל 5 דקות בצד השרת).

### 2. שכפול והתקנה

```bash
git clone https://github.com/peleg-jpg/tradingdashboard.git
cd tradingdashboard
npm install
```

### 3. השגת טוקן Apify

1. היכנסו ל-[console.apify.com/account/integrations](https://console.apify.com/account/integrations)
2. הירשמו (חינם, ללא כרטיס אשראי)
3. העתיקו את ה-**Personal API token**

### 4. הגדרה

```bash
cp .env.example .env.local
```

פתחו את `.env.local` והדביקו את הטוקן:

```
APIFY_API_TOKEN=apify_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

הקובץ `.env.local` כלול ב-gitignore, אז המפתח לא יעלה לגיטהאב.

### 5. סנכרון ראשון

```bash
npx tsx scripts/smoke-rss.ts        # חינם, מתחילים בלי לבזבז קרדיט Apify
npx tsx scripts/smoke-hn.ts         # חינם
npx tsx scripts/smoke-twitter.ts    # Apify, כ-0.40$
npx tsx scripts/smoke-reddit.ts     # Apify, כ-0.85$
```

או לחיצה אחת על **סנכרן עכשיו** ב-UI אחרי שהשרת רץ.

### 6. ניקוד סנטימנט בעברית

```bash
npx tsx scripts/smoke-sentiment.ts
# או ריצה מלאה:
npx tsx -e "import('./lib/analysis/sentiment.ts').then(m => m.runSentimentBatch({ maxBatches: 30 })).then(console.log)"
```

רץ דרך ה-CLI המקומי של קלוד. בלי לבזבז API.

### 7. הפעלה

```bash
npm run dev
```

פתחו [http://127.0.0.1:3003](http://127.0.0.1:3003).

---

## What it does

Pulls items from 4 sources, dedupes them into a single SQLite table, tags each item with mentioned tickers (cashtag-or-context regex), asks Claude Code to classify the tone of the text toward each ticker in Hebrew, and shows you trends.

| Source      | How                                                                   | Cost                               |
| ----------- | --------------------------------------------------------------------- | ---------------------------------- |
| X (Twitter) | Apify actor `apidojo/tweet-scraper`                                   | ~$0.40 per full sync               |
| Reddit      | Apify actor `trudax/reddit-scraper-lite`                              | ~$0.85 per full sync               |
| RSS         | `rss-parser` against Google News + Yahoo Finance + CNBC + MarketWatch | free                               |
| Hacker News | Algolia HN Search API                                                 | free                               |
| Sentiment   | Claude Code CLI subprocess                                            | uses your subscription, no API key |

The dashboard never shows prices. It tracks **mentions over time**, **per-source split**, and **text tone** (positive / negative / neutral, deliberately not "bullish / bearish", the educational framing matters).

---

## Architecture in one screen

```
    Apify actors            Public APIs
   (TW + Reddit)            (RSS + HN)
        |                       |
        +---------+-------------+
                  |
                  v
        lib/sources/*.ts       <- 4 Ingestor classes, same interface
                  |
                  v
        SQLite (db/tradingdashboard.db)
        items / item_tickers / sentiments / trend_snapshots
                  |
                  v
        lib/analysis/*.ts      <- Claude CLI sentiment + SQL trends
                  |
                  v
        Next.js (app/, components/)
        TradingView terminal UI, RTL Hebrew
```

Every file is small and reads top-to-bottom. Open any `lib/sources/*.ts` to see one ingestor end-to-end. Open `lib/analysis/sentiment.ts` to see the Claude prompt.

---

## Adding your own sources

### Add a Twitter account

Edit `lib/sources/twitter.ts`, find the `TARGET_HANDLES` array, append the handle (without `@`):

```ts
const TARGET_HANDLES = ["AnthropicAI", "sama", "elonmusk", "your_handle_here"];
```

### Add a subreddit

Edit `lib/sources/reddit.ts`, find the `SUBREDDITS` array.

### Add an RSS feed

Edit `lib/sources/rss.ts`, find the `FEEDS` array. Google News RSS works for almost anything: `https://news.google.com/rss/search?q=YOUR+QUERY+when:1d&hl=en`.

### Add a tracked ticker

Edit `lib/tickers.ts`. Stocks need a cashtag-or-context match (the regex in `lib/ticker-tagger.ts` avoids false-positives like "Meta" the English word matching `META`). AI keywords are keyword-only and never compete with stock tickers.

### Change Hebrew labels

All UI strings live in `lib/copy.ts`. Edit there, not in JSX.

---

## Production / workshop mode

For the live workshop, you want two terminal tabs:

```bash
# Tab 1 - production build, runs the dashboard
npm run build
npx next start -H 127.0.0.1 -p 3003
```

```bash
# Tab 2 - prewarm cron, keeps RSS + HN + Twitter fresh every 5 min
npx tsx scripts/prewarm-cron.ts
```

Start tab 2 about 60 seconds before the lesson begins so the dashboard always has fresh items when students see it.

Reddit is intentionally excluded from the prewarm cron because Apify's cold-start hurts demo flow (30-90s).

---

## Optional: MCP servers

This project does NOT require any MCP servers to run. It uses the Claude Code CLI subprocess for sentiment scoring. But if you want to extend it (e.g. a "research a ticker deeper" feature), these MCP servers pair well:

- **firecrawl** - scrape any URL into clean markdown. Useful for enriching an RSS item with full article body. Install: `claude mcp add firecrawl` (then add your `FIRECRAWL_API_KEY`).
- **context7** - fetch up-to-date library docs while coding extensions. Install: `claude mcp add context7`.
- **apify** - call any Apify actor from Claude Code directly. Install: `claude mcp add apify` (uses the same `APIFY_API_TOKEN` you already have).

To enable any of these, run the install command, then restart Claude Code. They are not required for the dashboard itself.

---

## Troubleshooting

| Problem                                          | Fix                                                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Cannot find module 'lib/analysis/sentiment.ts'` | You ran `npx tsx` from the wrong folder. `cd` into the project root first.                                                                                         |
| All sentiment scores are 0                       | Your Claude CLI is not authenticated. Run `claude` once in a terminal, finish auth, retry.                                                                         |
| Apify returns "quota exceeded"                   | You hit the $5 free monthly limit. Either wait until next month, top up the account, or comment out the Twitter/Reddit sources and run RSS+HN only (still useful). |
| Dev server says "port 3003 in use"               | `pkill -f "next dev"; pkill -f "next start"` then retry.                                                                                                           |
| Hebrew labels show as boxes                      | Your system does not have the Noto Sans Hebrew font cached. First page load fetches it from Google Fonts, refresh once it is downloaded.                           |

---

## Disclaimer

**Educational tool only.** The information collected, classified, and displayed here is NOT investment advice, NOT a recommendation to buy or sell any security, NOT a price prediction, and NOT a valuation. All use is at the user's own responsibility.

The sentiment chips describe the **tone of text** mentioning a ticker, they do not describe the ticker's prospects. The dashboard never shows prices, it shows volume and tone of public discussion.

This codebase exists as a teaching example for the AI Agent School Claude Code workshop. Use it to learn the orchestration pattern (parallel subagents, validator gates, wave-based builds), not to make financial decisions.

**כלי לימודי בלבד.** המידע שנאסף ומוצג כאן הוא לא ייעוץ השקעות, לא המלצה לקנייה או מכירה, לא תחזית מחירים, ולא הערכת שווי. כל שימוש על אחריות המשתמש בלבד.
