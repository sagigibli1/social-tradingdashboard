"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { copy } from "@/lib/copy";
import { formatDateShort, formatNumber } from "@/lib/format";

type Point = {
  window_start: number;
  actual?: number | null;
  forecast?: number | null;
  band?: [number, number];
};

type Props = {
  points: Point[];
  height?: number;
};

export function ConfidenceBandLine({ points, height = 280 }: Props) {
  // Recharts needs the band as separate min/max keys to render as Area.
  const data = points.map((p) => ({
    window_start: p.window_start,
    actual: p.actual ?? null,
    forecast: p.forecast ?? null,
    bandMin: p.band ? p.band[0] : null,
    bandMax: p.band ? p.band[1] : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
      >
        <CartesianGrid stroke="#2A2E39" strokeDasharray="0" />
        <XAxis
          dataKey="window_start"
          tickFormatter={(v: number) => formatDateShort(v)}
          stroke="#787B86"
          fontSize={11}
          tickLine={false}
        />
        <YAxis
          stroke="#787B86"
          fontSize={11}
          tickLine={false}
          tickFormatter={(v: number) => formatNumber(v)}
          width={32}
        />
        <Tooltip
          contentStyle={{
            direction: "rtl",
            background: "#1E222D",
            border: "1px solid #2A2E39",
            fontSize: 12,
            color: "#D1D4DC",
          }}
          labelFormatter={(v) => formatDateShort(Number(v))}
          formatter={(v) => formatNumber(Number(v))}
        />
        <Area
          type="monotone"
          dataKey="bandMax"
          stroke="none"
          fill="rgba(41,98,255,0.08)"
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="bandMin"
          stroke="none"
          fill="rgba(19,23,34,1)"
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="actual"
          stroke="#2962FF"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
          name={copy.trendsActualLabel}
        />
        <Line
          type="monotone"
          dataKey="forecast"
          stroke="#F59E0B"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
          isAnimationActive={false}
          name={copy.trendsForecastLabel}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
