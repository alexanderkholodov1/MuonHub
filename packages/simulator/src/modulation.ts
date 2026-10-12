/**
 * Time-dependent modulation of the true rate (spec 0086 FR2): pressure (barometric β), diurnal
 * variation, Forbush-like dips, and a temperature series for covariate tests.
 *
 * Pressure modulation uses the same expression as spec 0085:
 *   R = R₀ · exp((β/100) · (P − P₀)),  β in %/hPa (negative for cosmic rays).
 */
import { Rng } from "./rng.js";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export type PressureConfig =
  | { readonly kind: "constant"; readonly hPa: number }
  | {
      /** Semidiurnal 12-hour tide plus AR(1) synoptic noise, deterministic for a seed. */
      readonly kind: "tide";
      readonly meanHpa: number;
      readonly semidiurnalAmplitudeHpa: number;
      /** Phase of the tide maximum, hours after 00:00 UTC. */
      readonly phaseHours?: number;
      /** Stationary standard deviation of the synoptic noise (hPa). */
      readonly synopticSigmaHpa?: number;
      /** Correlation time of the synoptic noise (hours). */
      readonly synopticCorrelationHours?: number;
      readonly seed: number;
    }
  | {
      /** Supplied samples, linearly interpolated (held constant outside the range). */
      readonly kind: "samples";
      readonly samples: readonly { readonly tMs: number; readonly hPa: number }[];
    };

export interface TemperatureConfig {
  readonly meanC: number;
  readonly diurnalAmplitudeC?: number;
  /** Hour (UTC) of the temperature maximum. */
  readonly phaseHours?: number;
  /** Per-minute white noise (°C), deterministic for a seed. */
  readonly noiseSigmaC?: number;
  readonly seed?: number;
}

export interface ForbushConfig {
  readonly onsetMs: number;
  /** Instantaneous depth of the dip in % of the rate. */
  readonly depthPercent: number;
  /** Exponential recovery time constant (hours). */
  readonly recoveryHours: number;
}

export interface DiurnalConfig {
  /** Fractional amplitude (e.g. 0.002 for 0.2 %). */
  readonly amplitude: number;
  /** Hour (UTC) of the maximum. */
  readonly phaseHours: number;
}

export type Series = (tMs: number) => number;

/** A deterministic pressure series in hPa. `startMs` anchors the synoptic noise sequence. */
export function createPressureSeries(config: PressureConfig, startMs = 0): Series {
  switch (config.kind) {
    case "constant":
      return () => config.hPa;
    case "samples": {
      const s = [...config.samples].sort((a, b) => a.tMs - b.tMs);
      if (s.length === 0) throw new RangeError("pressure samples must not be empty");
      return (t) => interpolate(s, t);
    }
    case "tide": {
      const phase = config.phaseHours ?? 10;
      const sigma = config.synopticSigmaHpa ?? 0;
      const tauH = config.synopticCorrelationHours ?? 48;
      const phi = Math.exp(-1 / tauH);
      const innovation = sigma * Math.sqrt(1 - phi * phi);
      const rng = new Rng(config.seed >>> 0).fork("pressure-synoptic");
      const hourly: number[] = [sigma * rng.normal()];
      const noiseAt = (hourIndex: number): number => {
        while (hourly.length <= hourIndex) {
          const prev = hourly[hourly.length - 1] ?? 0;
          hourly.push(phi * prev + innovation * rng.normal());
        }
        return hourly[hourIndex] ?? 0;
      };
      return (t) => {
        const tide =
          config.semidiurnalAmplitudeHpa *
          Math.cos((2 * Math.PI * (t / HOUR_MS - phase)) / 12);
        if (sigma === 0) return config.meanHpa + tide;
        const h = Math.max(0, (t - startMs) / HOUR_MS);
        const i = Math.floor(h);
        const frac = h - i;
        const noise = noiseAt(i) * (1 - frac) + noiseAt(i + 1) * frac;
        return config.meanHpa + tide + noise;
      };
    }
  }
}

function interpolate(s: readonly { tMs: number; hPa: number }[], t: number): number {
  const first = s[0];
  const last = s[s.length - 1];
  if (first === undefined || last === undefined) return Number.NaN;
  if (t <= first.tMs) return first.hPa;
  if (t >= last.tMs) return last.hPa;
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const m = s[mid];
    if (m !== undefined && m.tMs <= t) lo = mid;
    else hi = mid;
  }
  const a = s[lo];
  const b = s[hi];
  if (a === undefined || b === undefined) return Number.NaN;
  return a.hPa + ((b.hPa - a.hPa) * (t - a.tMs)) / (b.tMs - a.tMs);
}

/** A deterministic temperature series (°C) with diurnal cycle and per-minute noise. */
export function createTemperatureSeries(config: TemperatureConfig): Series {
  const amp = config.diurnalAmplitudeC ?? 0;
  const phase = config.phaseHours ?? 14;
  const sigma = config.noiseSigmaC ?? 0;
  const seed = (config.seed ?? 0) >>> 0;
  return (t) => {
    const diurnal = amp * Math.cos((2 * Math.PI * (t / HOUR_MS - phase)) / 24);
    if (sigma === 0) return config.meanC + diurnal;
    const minute = Math.floor(t / 60_000);
    const noise = sigma * new Rng((seed ^ Math.imul(minute | 0, 0x9e3779b1)) >>> 0).normal();
    return config.meanC + diurnal + noise;
  };
}

export interface RateModelConfig {
  /** Rate at the reference pressure (s⁻¹). */
  readonly baseRatePerS: number;
  /** Barometric coefficient in %/hPa (negative). Omitted = no pressure modulation. */
  readonly betaPercentPerHpa?: number;
  readonly p0Hpa?: number;
  readonly pressure?: Series;
  readonly diurnal?: DiurnalConfig;
  readonly forbush?: readonly ForbushConfig[];
}

/** Multiplicative Forbush-like dip: 1 − (depth/100) · exp(−(t − onset)/τ) after the onset. */
export function forbushFactor(dips: readonly ForbushConfig[], t: number): number {
  let f = 1;
  for (const d of dips) {
    if (t >= d.onsetMs) {
      f *= 1 - (d.depthPercent / 100) * Math.exp(-(t - d.onsetMs) / (d.recoveryHours * HOUR_MS));
    }
  }
  return f;
}

/** The instantaneous true rate R(t) in s⁻¹. */
export function createRateModel(config: RateModelConfig): Series {
  const beta = config.betaPercentPerHpa ?? 0;
  const pressure = config.pressure;
  const p0 = config.p0Hpa ?? (pressure ? pressure(0) : 0);
  return (t) => {
    let r = config.baseRatePerS;
    if (beta !== 0 && pressure) r *= Math.exp((beta / 100) * (pressure(t) - p0));
    if (config.diurnal) {
      r *= 1 + config.diurnal.amplitude * Math.cos(2 * Math.PI * (t / DAY_MS - config.diurnal.phaseHours / 24));
    }
    if (config.forbush && config.forbush.length > 0) r *= forbushFactor(config.forbush, t);
    return Math.max(0, r);
  };
}

/**
 * Poisson arrivals of a non-homogeneous process with piecewise-constant intensity over `stepMs`
 * steps (exact for that intensity: exponential inter-arrival times, restarted at each step boundary
 * thanks to memorylessness). Yields arrival times in ms.
 */
export function* poissonArrivals(
  rng: Rng,
  rate: Series,
  startMs: number,
  endMs: number,
  stepMs = 1000,
): Generator<number> {
  for (let segStart = startMs; segStart < endMs; segStart += stepMs) {
    const segEnd = Math.min(endMs, segStart + stepMs);
    const r = rate(segStart + (segEnd - segStart) / 2);
    if (r <= 0) continue;
    const ratePerMs = r / 1000;
    let t = segStart + rng.exponential(ratePerMs);
    while (t < segEnd) {
      yield t;
      t += rng.exponential(ratePerMs);
    }
  }
}
