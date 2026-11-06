/**
 * Pure helpers for the stream dashboard (spec 0090). Minutes are plotted as they are stored; a
 * missing minute breaks the line (a gap is a gap, never a zero — ADR-006), and statistics come from
 * the raw counts: the mean rate over a range is ΣN / minutes with a Poisson uncertainty √ΣN / minutes.
 */
import type { v2 } from "@muonhub/shared";

export const MINUTE_MS = 60_000;

export interface ChartData {
  /** Minute starts, in seconds (uPlot's time scale). */
  readonly x: number[];
  readonly rate: (number | null)[];
  readonly pressure: (number | null)[];
  readonly temperature: (number | null)[];
}

/** One row per stored minute, plus one empty row after each missing stretch so lines break. */
export function toChartData(minutes: readonly v2.MinuteRecord[]): ChartData {
  const sorted = [...minutes].sort((a, b) => a.ts - b.ts);
  const out: ChartData = { x: [], rate: [], pressure: [], temperature: [] };
  let previous: number | null = null;
  for (const m of sorted) {
    if (previous !== null && m.ts - previous > MINUTE_MS) {
      out.x.push((previous + MINUTE_MS) / 1000);
      out.rate.push(null);
      out.pressure.push(null);
      out.temperature.push(null);
    }
    out.x.push(m.ts / 1000);
    out.rate.push(m.n);
    out.pressure.push(m.pressureHpa ?? null);
    out.temperature.push(m.temperatureC ?? null);
    previous = m.ts;
  }
  return out;
}

export interface RangeStats {
  readonly minutes: number;
  readonly events: number;
  /** Mean counts per minute over the stored minutes; null without data. */
  readonly meanPerMin: number | null;
  /** Poisson uncertainty of that mean: √ΣN / minutes. */
  readonly sigmaPerMin: number | null;
  /** Stored minutes over the minutes the range spans (0–1). */
  readonly coverage: number;
  readonly lastTs: number | null;
  /** Time-averages of the minutes that carry the quantity; null when none does. */
  readonly meanPressureHpa: number | null;
  readonly meanTemperatureC: number | null;
}

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, v) => a + v, 0) / values.length;

export function rangeStats(
  minutes: readonly v2.MinuteRecord[],
  fromTs: number,
  toTs: number,
): RangeStats {
  const inRange = minutes.filter((m) => m.ts >= fromTs && m.ts < toTs);
  const events = inRange.reduce((a, m) => a + m.n, 0);
  const n = inRange.length;
  const span = Math.max(1, Math.round((toTs - fromTs) / MINUTE_MS));
  return {
    minutes: n,
    events,
    meanPerMin: n === 0 ? null : events / n,
    sigmaPerMin: n === 0 ? null : Math.sqrt(events) / n,
    coverage: Math.min(1, n / span),
    lastTs: n === 0 ? null : Math.max(...inRange.map((m) => m.ts)),
    meanPressureHpa: mean(
      inRange.flatMap((m) => (m.pressureHpa === undefined ? [] : [m.pressureHpa])),
    ),
    meanTemperatureC: mean(
      inRange.flatMap((m) => (m.temperatureC === undefined ? [] : [m.temperatureC])),
    ),
  };
}

export type Freshness = "fresh" | "stale" | "none";

/**
 * A minute record exists only once its minute is complete, so the newest one is normally about one
 * to two minutes old; data is "fresh" while the last minute ended at most three minutes ago.
 */
export function freshness(lastTs: number | null, now: number): Freshness {
  if (lastTs === null) return "none";
  return now - (lastTs + MINUTE_MS) <= 3 * MINUTE_MS ? "fresh" : "stale";
}

/**
 * Coverage as a percentage with one decimal, rounded down: 100.0 % only when every minute of the
 * range is stored (1439 of 1440 minutes is 99.9 %, never 100.0 %). Integer arithmetic, so exact.
 */
export function coveragePercent(minutes: number, span: number): string {
  if (span <= 0) return "0.0";
  return (Math.floor((Math.min(minutes, span) * 1000) / span) / 10).toFixed(1);
}

/** The text alternative of a chart: what a screen-reader user needs instead of the canvas. */
export interface ChartSummary {
  readonly count: number;
  readonly min: number | null;
  readonly max: number | null;
}

export function chartSummary(y: readonly (number | null)[]): ChartSummary {
  const values = y.filter((v): v is number => v !== null && Number.isFinite(v));
  if (values.length === 0) return { count: 0, min: null, max: null };
  return {
    count: values.length,
    min: values.reduce((a, v) => Math.min(a, v)),
    max: values.reduce((a, v) => Math.max(a, v)),
  };
}
