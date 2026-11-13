"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MinuteRecord } from "./live-feed";
import { clockTime, niceTicks, type HourStats } from "./hour-stats";

const HEIGHT = 240;
const MARGIN = { top: 12, right: 12, bottom: 32, left: 48 };
const MINUTE_MS = 60_000;

/**
 * Counts per minute over the last hour, each with its ±√N bar, against the band that chance alone
 * would fill around the mean (±√mean). A lightweight SVG: no chart library on the landing.
 */
export function LastHourChart({
  minutes,
  stats,
  timeZone,
  label,
}: {
  minutes: readonly MinuteRecord[];
  stats: HourStats;
  timeZone: string;
  label: string;
}): ReactNode {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = host.current;
    if (el === null) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const end = stats.last.start;
  const start = end - 59 * MINUTE_MS;
  const lo = Math.min(stats.min - Math.sqrt(stats.min), stats.mean - 2 * stats.chanceSpread);
  const hi = Math.max(stats.max + Math.sqrt(stats.max), stats.mean + 2 * stats.chanceSpread);
  const pad = (hi - lo) * 0.06;
  const yMin = Math.max(0, lo - pad);
  const yMax = hi + pad;
  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 1);
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (t: number): number => MARGIN.left + ((t - start) / (end - start)) * plotW;
  const y = (v: number): number => MARGIN.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const shown = minutes.filter((m) => m.start >= start);
  const bandTop = y(stats.mean + stats.chanceSpread);
  const bandBottom = y(stats.mean - stats.chanceSpread);
  const timeTicks = [start, start + 30 * MINUTE_MS, end];

  return (
    <div ref={host} className="w-full">
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={label} className="block">
          <rect
            x={MARGIN.left}
            y={bandTop}
            width={plotW}
            height={bandBottom - bandTop}
            className="fill-surface-2"
          />
          <line
            x1={MARGIN.left}
            x2={MARGIN.left + plotW}
            y1={y(stats.mean)}
            y2={y(stats.mean)}
            className="stroke-accent-warm"
            strokeWidth={1.5}
          />
          {niceTicks(yMin, yMax).map((v) => (
            <g key={v}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + plotW}
                y1={y(v)}
                y2={y(v)}
                className="stroke-border"
                strokeWidth={1}
                strokeOpacity={0.6}
              />
              <text
                x={MARGIN.left - 8}
                y={y(v)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted font-mono text-xs"
              >
                {v}
              </text>
            </g>
          ))}
          {timeTicks.map((t, i) => (
            <text
              key={t}
              x={x(t)}
              y={HEIGHT - 8}
              textAnchor={i === 0 ? "start" : i === timeTicks.length - 1 ? "end" : "middle"}
              className="fill-muted font-mono text-xs"
            >
              {clockTime(t, timeZone)}
            </text>
          ))}
          {shown.map((m) => {
            const cx = x(m.start);
            const sigma = Math.sqrt(m.count);
            return (
              <g key={m.start}>
                <line
                  x1={cx}
                  x2={cx}
                  y1={y(m.count + sigma)}
                  y2={y(m.count - sigma)}
                  className="stroke-accent"
                  strokeOpacity={0.45}
                  strokeWidth={1}
                />
                <circle cx={cx} cy={y(m.count)} r={2.5} className="fill-accent" />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
