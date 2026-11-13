import type { MinuteRecord } from "./live-feed";
import type { Point } from "./LineChart";

export interface HourStats {
  /** Minutes recorded (gaps are not minutes). */
  minutes: number;
  total: number;
  /** Mean counts per minute and its Poisson uncertainty √ΣN / minutes. */
  mean: number;
  meanUncertainty: number;
  /** Expected minute-to-minute spread from chance alone: √mean. */
  chanceSpread: number;
  min: number;
  max: number;
  last: MinuteRecord;
}

/** Statistics of the recorded minutes; null when there are none. */
export function hourStats(minutes: readonly MinuteRecord[]): HourStats | null {
  const last = minutes.at(-1);
  if (last === undefined) return null;
  let total = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const m of minutes) {
    total += m.count;
    min = Math.min(min, m.count);
    max = Math.max(max, m.count);
  }
  const mean = total / minutes.length;
  return {
    minutes: minutes.length,
    total,
    mean,
    meanUncertainty: Math.sqrt(total) / minutes.length,
    chanceSpread: Math.sqrt(mean),
    min,
    max,
    last,
  };
}

/** Round, evenly spaced axis ticks inside [lo, hi]: at least three when the range allows. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  for (const factor of [5, 2, 1, 0.5]) {
    const step = factor * magnitude;
    if (step > raw * 1.5) continue;
    const ticks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
      ticks.push(Number(v.toFixed(6)));
    }
    if (ticks.length >= 3) return ticks;
  }
  return [lo, hi];
}

const timeFormats = new Map<string, Intl.DateTimeFormat>();

/** "14:05" in the station's time zone. */
export function clockTime(epochMs: number, timeZone: string): string {
  let format = timeFormats.get(timeZone);
  if (format === undefined) {
    format = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
    timeFormats.set(timeZone, format);
  }
  return format.format(epochMs);
}

export interface Binned {
  /** Counts per minute: the bin's mean with its Poisson uncertainty √ΣN / minutes. */
  rate: Point[];
  sipm: Point[];
  temperature: Point[];
  pressure: Point[];
}

/**
 * Minutes grouped into bins of `binMinutes` (aligned to the clock). Gaps stay gaps: a bin exists only
 * where minutes were recorded, and a bin's mean uses only the minutes it holds.
 */
export function binMinutes(minutes: readonly MinuteRecord[], binMinutes: number): Binned {
  const size = binMinutes * 60_000;
  const bins = new Map<number, MinuteRecord[]>();
  for (const m of minutes) {
    const start = Math.floor(m.start / size) * size;
    const list = bins.get(start);
    if (list === undefined) bins.set(start, [m]);
    else list.push(m);
  }
  const out: Binned = { rate: [], sipm: [], temperature: [], pressure: [] };
  const mean = (values: number[]): number | null =>
    values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
  for (const [t, list] of [...bins.entries()].sort((a, b) => a[0] - b[0])) {
    const total = list.reduce((sum, m) => sum + m.count, 0);
    const v = total / list.length;
    const sigma = Math.sqrt(total) / list.length;
    out.rate.push({ t, v, lo: v - sigma, hi: v + sigma });
    const s = mean(list.flatMap((m) => (m.sipmMeanMv === null ? [] : [m.sipmMeanMv])));
    if (s !== null) out.sipm.push({ t, v: s });
    const c = mean(list.flatMap((m) => (m.temperatureC === null ? [] : [m.temperatureC])));
    if (c !== null) out.temperature.push({ t, v: c });
    const p = mean(list.flatMap((m) => (m.pressureHpa === null ? [] : [m.pressureHpa])));
    if (p !== null) out.pressure.push({ t, v: p });
  }
  return out;
}

/** Counts of values in logarithmic bins between `min` and `max` (values outside are clamped). */
export function logHistogram(
  values: readonly number[],
  min: number,
  max: number,
  bins: number,
): Array<{ from: number; to: number; count: number }> {
  const lmin = Math.log10(min);
  const step = (Math.log10(max) - lmin) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({
    from: 10 ** (lmin + i * step),
    to: 10 ** (lmin + (i + 1) * step),
    count: 0,
  }));
  for (const v of values) {
    if (!(v > 0)) continue;
    const i = Math.min(Math.max(Math.floor((Math.log10(v) - lmin) / step), 0), bins - 1);
    const bin = out[i];
    if (bin !== undefined) bin.count++;
  }
  return out;
}
