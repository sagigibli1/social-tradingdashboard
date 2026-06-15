import type { Metadata } from "next";
import { Noto_Sans_Hebrew, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";

import "./globals.css";
import { copy } from "@/lib/copy";
import { queryTrendingTickers } from "@/lib/db";
import { LayoutShell } from "@/components/shell/layout-shell";

const sans = Noto_Sans_Hebrew({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: copy.pageTitle,
  description: copy.pageDescription,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Server-side load of trending tickers for the ticker tape + watchlist.
  // Wave 2 trend_snapshots are already populated.
  const trending = safeTrending();
  const tapeTickers = trending
    .filter((t) => t.mention_count > 0)
    .slice(0, 20)
    .map((t) => ({
      ticker_symbol: t.ticker_symbol,
      mention_count: t.mention_count,
    }));
  const watchlistTickers = trending.slice(0, 12);

  return (
    <html lang="he" dir="rtl">
      <body
        className={`${sans.variable} ${mono.variable} antialiased bg-[#131722] text-[#D1D4DC] font-sans`}
      >
        <LayoutShell
          tapeTickers={tapeTickers}
          watchlistTickers={watchlistTickers}
        >
          {children}
        </LayoutShell>
        <Toaster
          position="bottom-left"
          dir="rtl"
          toastOptions={{
            style: {
              background: "#1E222D",
              color: "#D1D4DC",
              border: "1px solid #2A2E39",
              fontFamily: "var(--font-sans)",
            },
          }}
        />
      </body>
    </html>
  );
}

function safeTrending() {
  try {
    return queryTrendingTickers("24h", 25);
  } catch (err) {
    console.error("[layout] failed to load trending tickers", err);
    return [];
  }
}
