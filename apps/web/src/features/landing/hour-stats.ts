import type { MinuteRecord } from "./live-feed";

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
