/** Deterministic synthetic data for tests (fixed seed; no I/O). */
import type { HourlyPoint } from "./barometric.js";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rng: () => number): number {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface SyntheticOptions {
  readonly hours: number;
  readonly betaPctPerHpa: number;
  readonly seed?: number;
  readonly baseRate?: number;
  /** Extra AR(1) fractional noise (σ of the stationary process, fraction of the rate). */
  readonly arSigma?: number;
}

/** Hourly stream: semidiurnal tide ±1.5 hPa + synoptic AR(1) noise (σ ≈ 1 hPa), temperature drift. */
export function syntheticHours(o: SyntheticOptions): HourlyPoint[] {
  const rng = mulberry32(o.seed ?? 20261003);
  const base = o.baseRate ?? 2.4;
  const arSigma = o.arSigma ?? 0.004;
  const phi = 0.95;
  let synoptic = 0;
  let ar = 0;
  const out: HourlyPoint[] = [];
  for (let h = 0; h < o.hours; h++) {
    synoptic = phi * synoptic + Math.sqrt(1 - phi * phi) * 1.0 * gaussian(rng);
    ar = 0.7 * ar + Math.sqrt(1 - 0.49) * arSigma * gaussian(rng);
    const p = 768 + 1.5 * Math.sin((2 * Math.PI * h) / 12.42) + synoptic;
    const t = 25 + 3 * Math.sin((2 * Math.PI * h) / 24) + (0.01 * h) / 24;
    const mean =
      base * 3600 * Math.exp((o.betaPctPerHpa / 100) * (p - 768) + 0.001 * (t - 25) + ar);
    const counts = Math.max(1, Math.round(mean + Math.sqrt(mean) * gaussian(rng)));
    out.push({
      hourStart: 1_700_000_000_000 + h * 3_600_000,
      counts,
      liveMs: 3_600_000 * 0.9999,
      pressureHpa: p,
      temperatureC: t,
    });
  }
  return out;
}
