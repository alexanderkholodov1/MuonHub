/**
 * Per-device detection process (spec 0086 FR3–FR5): amplitudes (exact Moyal + Gaussian noise +
 * saturation), noise triggers, and **non-paralyzable** dead time.
 */
import type { Rng } from "./rng.js";

export interface AmplitudeConfig {
  /** Most probable value of the Moyal (Landau-like) distribution, in `unit`. */
  readonly mpv: number;
  /** Width (scale) of the Moyal distribution, in `unit`. */
  readonly width: number;
  readonly unit: "mV";
  /** Gaussian electronic noise σ added to each amplitude (0 = none). */
  readonly noiseSigma: number;
  /** Saturation level: amplitudes at or above it are clipped and flagged. */
  readonly saturation: { readonly value: number; readonly unit: "mV" };
}

export interface NoiseTriggerConfig {
  /** Rate of uncorrelated noise triggers above threshold (s⁻¹). */
  readonly ratePerS: number;
  /** Mean of the exponential amplitude distribution of noise triggers (mV). */
  readonly meanAmplitude: number;
}

export interface SampledAmplitude {
  readonly value: number;
  readonly saturated: boolean;
}

/** Amplitude of a true event: MPV + width·λ (λ standard Moyal) + noise, clipped at saturation. */
export function sampleSignalAmplitude(rng: Rng, config: AmplitudeConfig): SampledAmplitude {
  let a = config.mpv + config.width * rng.moyal();
  if (config.noiseSigma > 0) a += config.noiseSigma * rng.normal();
  return clip(Math.max(0, a), config.saturation.value);
}

/** Amplitude of a noise trigger: exponential with the configured mean, clipped at saturation. */
export function sampleNoiseAmplitude(
  rng: Rng,
  noise: NoiseTriggerConfig,
  saturation: number,
): SampledAmplitude {
  return clip(rng.exponential(1 / noise.meanAmplitude), saturation);
}

function clip(value: number, saturation: number): SampledAmplitude {
  return value >= saturation ? { value: saturation, saturated: true } : { value, saturated: false };
}

/**
 * Non-paralyzable dead-time filter on time-ordered arrival times (ms). Returns a flag per arrival:
 * true = recorded, false = lost (arrived within τ after the last **recorded** event).
 */
export function applyDeadTime(timesMs: readonly number[], tauMs: number): boolean[] {
  const recorded: boolean[] = new Array<boolean>(timesMs.length);
  let busyUntil = -Infinity;
  for (let i = 0; i < timesMs.length; i++) {
    const t = timesMs[i] ?? 0;
    if (t >= busyUntil) {
      recorded[i] = true;
      busyUntil = t + tauMs;
    } else {
      recorded[i] = false;
    }
  }
  return recorded;
}

export interface DeadTimeRun {
  readonly trueEvents: number;
  readonly recorded: number;
  readonly lost: number;
  /** Elapsed time of the run (s). */
  readonly elapsedS: number;
  /** Cumulative dead time as a device counter would report it (s). */
  readonly cumulativeDeadS: number;
}

/**
 * Streaming non-paralyzable dead-time simulation for a constant true rate (memory-free, for
 * known-answer tests with 10⁷ events): expected loss fraction nτ/(1 + nτ).
 */
export function simulateDeadTimeRun(
  rng: Rng,
  trueRatePerS: number,
  tauS: number,
  trueEvents: number,
): DeadTimeRun {
  let t = 0;
  let busyUntil = -Infinity;
  let recorded = 0;
  for (let i = 0; i < trueEvents; i++) {
    t += rng.exponential(trueRatePerS);
    if (t >= busyUntil) {
      recorded++;
      busyUntil = t + tauS;
    }
  }
  return {
    trueEvents,
    recorded,
    lost: trueEvents - recorded,
    elapsedS: t,
    cumulativeDeadS: recorded * tauS,
  };
}
