"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatDateShort, formatNumber } from "@/lib/format";

export type TrendSeries = {
  name: string;
  color: string;
  points: { window_start: number; value: number }[];
};

type TrendLineProps = {
  series: TrendSeries[];
  height?: number;
  yLabel?: string;
};

type Row = {
  window_start: number;
  [seriesName: string]: number;
};

function mergeSeries(series: TrendSeries[]): Row[] {
  const map = new Map<number, Row>();
  for (const s of series) {
    for (const p of s.points) {
      const row = map.get(p.window_start) ?? { window_start: p.window_start };
      row[s.name] = p.value;
      map.set(p.window_start, row);
    }
  }
  return [...map.values()].sort((a, b) => a.window_start - b.window_start);
}

export function TrendLine({ series, height = 200 }: TrendLineProps) {
  const data = mergeSeries(series);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
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
        {series.map((s) => (
          <Line
            key={s.name}
            type="monotone"
            dataKey={s.name}
            stroke={s.color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// Tiny sparkline variant for ticker cards on /trends.
export function MiniTrendLine({
  points,
  color = "#2962FF",
  height = 32,
}: {
  points: { window_start: number; value: number }[];
  color?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={points}
        margin={{ top: 2, right: 0, left: 0, bottom: 2 }}
      >
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
