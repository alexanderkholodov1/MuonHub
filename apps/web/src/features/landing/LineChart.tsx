"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { t } from "@/i18n/t";
import { clockTime, niceTicks } from "./hour-stats";

export interface Point {
  /** Start of the bin, epoch ms. */
  t: number;
  v: number;
  /** Optional band (e.g. ± √N), drawn behind the line. */
  lo?: number;
  hi?: number;
}

export type Tone = "accent" | "brand" | "cosmic";

const TONE_CLASS: Record<Tone, string> = {
  accent: "text-accent",
  brand: "text-brand",
  cosmic: "text-cosmic",
};

const M = { top: 12, right: 12, bottom: 26, left: 52 };

/** Splits points into runs: a gap longer than `gapMs` breaks the line (gaps are never zeros). */
export function runs(points: readonly Point[], gapMs: number): Point[][] {
  const out: Point[][] = [];
  let current: Point[] = [];
  for (const p of points) {
    const prev = current.at(-1);
    if (prev !== undefined && p.t - prev.t > gapMs) {
      out.push(current);
      current = [];
    }
    current.push(p);
  }
  if (current.length > 0) out.push(current);
  return out;
}

/**
 * A light SVG time chart: a line with a soft gradient area, an optional band, round ticks, a line
 * that draws itself when shown, and a crosshair with the exact value under the pointer.
 */
export function LineChart({
  points,
  tone,
  height = 200,
  binMs,
  timeZone,
  digits,
  unit,
  label,
  minSpan = 0,
}: {
  points: readonly Point[];
  tone: Tone;
  height?: number;
  binMs: number;
  timeZone: string;
  digits: number;
  unit: string;
  label: string;
  /** Smallest vertical range shown, so that tiny steps (0.1 °C) do not look like large swings. */
  minSpan?: number;
}): ReactNode {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();

  useEffect(() => {
    const el = host.current;
    if (el === null) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const first = points[0];
  const last = points.at(-1);
  if (first === undefined || last === undefined) {
    return <div ref={host} className="w-full" style={{ height }} />;
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of points) {
    lo = Math.min(lo, p.lo ?? p.v);
    hi = Math.max(hi, p.hi ?? p.v);
  }
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  if (!(hi > lo)) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.12;
  const y0 = lo - pad;
  const y1 = hi + pad;
  const w = Math.max(width - M.left - M.right, 1);
  const h = height - M.top - M.bottom;
  const span = Math.max(last.t - first.t, binMs);
  const x = (ts: number): number => M.left + ((ts - first.t) / span) * w;
  const y = (v: number): number => M.top + (1 - (v - y0) / (y1 - y0)) * h;
  const segments = runs(points, binMs * 2.5);
  const line = (run: Point[]): string =>
    run.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const area = (run: Point[]): string =>
    `${line(run)}L${x(run.at(-1)?.t ?? 0).toFixed(1)},${String(M.top + h)}L${x(run[0]?.t ?? 0).toFixed(1)},${String(M.top + h)}Z`;
  const band = (run: Point[]): string => {
    const top = run.map(
      (p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.hi ?? p.v).toFixed(1)}`,
    );
    const bottom = [...run]
      .reverse()
      .map((p) => `L${x(p.t).toFixed(1)},${y(p.lo ?? p.v).toFixed(1)}`);
    return `${top.join("")}${bottom.join("")}Z`;
  };
  const ticks = niceTicks(y0, y1, height < 150 ? 2 : 4);
  const step = ticks.length > 1 ? Math.abs((ticks[1] ?? 0) - (ticks[0] ?? 0)) : 1;
  const tickDigits = Math.min(Math.max(0, -Math.floor(Math.log10(step) + 1e-9)), 4);
  const times = [first.t, first.t + span / 2, last.t];
  const hovered = hover === null ? null : points[hover];

  const t0 = first.t;
  function onMove(event: React.PointerEvent<SVGSVGElement>): void {
    const rect = event.currentTarget.getBoundingClientRect();
    const at = t0 + ((event.clientX - rect.left - M.left) / w) * span;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs((points[i]?.t ?? 0) - at) < Math.abs((points[best]?.t ?? 0) - at)) best = i;
    }
    setHover(best);
  }

  const fmt = (v: number): string => v.toFixed(digits);
  return (
    <div ref={host} className={`relative w-full ${TONE_CLASS[tone]}`}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          className="block touch-pan-y"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={M.left}
                x2={M.left + w}
                y1={y(v)}
                y2={y(v)}
                className="stroke-border"
                strokeOpacity={0.7}
              />
              <text
                x={M.left - 8}
                y={y(v)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted font-mono text-xs"
              >
                {v.toFixed(tickDigits)}
              </text>
            </g>
          ))}
          {times.map((tick, i) => (
            <text
              key={i}
              x={x(tick)}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
              className="fill-muted font-mono text-xs"
            >
              {clockTime(tick, timeZone)}
            </text>
          ))}
          {segments.map((run, i) => (
            <g key={i}>
              {run.some((p) => p.lo !== undefined) && (
                <path d={band(run)} className="fill-cosmic" fillOpacity={0.18} />
              )}
              <path d={area(run)} fill={`url(#${gradientId})`} />
              <path
                d={line(run)}
                pathLength={1}
                className="draw-in"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinejoin="round"
              />
            </g>
          ))}
          {hovered !== null && hovered !== undefined && (
            <g>
              <line
                x1={x(hovered.t)}
                x2={x(hovered.t)}
                y1={M.top}
                y2={M.top + h}
                className="stroke-text"
                strokeOpacity={0.35}
              />
              <circle
                cx={x(hovered.t)}
                cy={y(hovered.v)}
                r={4}
                fill="currentColor"
                className="stroke-bg"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>
      )}
      {hovered !== null && hovered !== undefined && (
        <div
          className="pointer-events-none absolute top-0 rounded-md border border-border bg-bg/90 px-3 py-1.5 font-mono text-sm text-text"
          style={{ left: Math.min(Math.max(x(hovered.t) - 70, 0), Math.max(width - 150, 0)) }}
        >
          {clockTime(hovered.t, timeZone)}
          {t("ui.separator")}
          {fmt(hovered.v)}
          {hovered.lo !== undefined && hovered.hi !== undefined
            ? ` ± ${fmt((hovered.hi - hovered.lo) / 2)}`
            : ""}{" "}
          {unit}
        </div>
      )}
    </div>
  );
}
