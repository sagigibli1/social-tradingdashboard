"use client";

import { useEffect, useRef, useState } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Pause, Play } from "lucide-react";

import { copy } from "@/lib/copy";

const BUCKET_COUNT = 32;

// Cheap pseudo-random walk to indicate "alive" - real data not required for the visual cue.
function nextValue(prev: number): number {
  const delta = Math.random() * 6 - 3;
  return Math.max(0, prev + delta);
}

export function StreamingPulse() {
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [data, setData] = useState(() =>
    Array.from({ length: BUCKET_COUNT }, (_, i) => ({ x: i, y: 4 })),
  );
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const h = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion) return;
    tickRef.current = setInterval(() => {
      setData((prev) => {
        const last = prev[prev.length - 1]?.y ?? 4;
        const next = nextValue(last);
        return [
          ...prev.slice(1),
          { x: (prev[prev.length - 1]?.x ?? 0) + 1, y: next },
        ];
      });
    }, 600);
    return () => {
      if (tickRef.current !== null) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [paused, reducedMotion]);

  return (
    <div
      className="inline-flex items-center gap-1 h-8 px-2 border-l border-[#2A2E39] bg-[#131722]"
      style={{ width: 200 }}
    >
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-label={paused ? copy.resumePulse : copy.pausePulse}
        className="text-[#787B86] hover:text-[#D1D4DC] cursor-pointer"
      >
        {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
      </button>
      <div className="flex-1 h-8">
        <ResponsiveContainer width="100%" height={32}>
          <AreaChart
            data={data}
            margin={{ top: 4, right: 0, left: 0, bottom: 4 }}
          >
            <Area
              type="monotone"
              dataKey="y"
              stroke="#26C6DA"
              strokeWidth={1.5}
              fill="rgba(38,198,218,0.18)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
