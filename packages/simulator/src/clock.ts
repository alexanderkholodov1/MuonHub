/**
 * Device clock and host reception time (spec 0086 FR6).
 *
 * The device clock starts at `offsetMs` when a session starts (it restarts at 0 after a reset),
 * runs fast or slow by `driftPpm`, has per-line jitter, and — for millisecond counters — wraps at
 * 2^rolloverBits (e.g. Arduino `millis()` at 2³² ms ≈ 49.7 days). Host reception time is the true
 * time plus a USB-latency model (mean + |Gaussian jitter|, can exceed 10 ms).
 */
import type { Rng } from "./rng.js";

export interface ClockConfig {
  /** Device clock reading at the start of the first session (ms). */
  readonly offsetMs?: number | undefined;
  /** Rate error in parts per million (positive = runs fast). */
  readonly driftPpm?: number | undefined;
  /** Standard deviation of per-line timing jitter (ms). */
  readonly jitterMs?: number | undefined;
  /** Width of the millisecond counter (default 32). */
  readonly rolloverBits?: number | undefined;
}

export interface HostLatencyConfig {
  readonly meanMs: number;
  readonly jitterMs: number;
}

/**
 * Device clock reading in ms (unwrapped) for a true time, given the session start. Jitter never
 * makes the clock run backwards: the reading is clamped to at least `notBeforeMs` (the previous
 * reading of the same session) and to at least 0.
 */
export function deviceElapsedMs(
  trueMs: number,
  sessionStartTrueMs: number,
  sessionStartReadingMs: number,
  config: ClockConfig,
  rng?: Rng,
  notBeforeMs = 0,
): number {
  const drift = (config.driftPpm ?? 0) * 1e-6;
  const jitter = rng && (config.jitterMs ?? 0) > 0 ? (config.jitterMs ?? 0) * rng.normal() : 0;
  const reading = sessionStartReadingMs + (trueMs - sessionStartTrueMs) * (1 + drift) + jitter;
  return Math.max(reading, notBeforeMs, 0);
}

/** Wrap a millisecond reading into an unsigned counter of `bits` width. */
export function wrapCounter(readingMs: number, bits = 32): number {
  const modulus = 2 ** bits;
  const v = Math.floor(readingMs) % modulus;
  return v < 0 ? v + modulus : v;
}

/** Host reception time (ms) for a line whose last byte left the device at `trueMs`. */
export function hostReceivedAt(trueMs: number, latency: HostLatencyConfig, rng: Rng): number {
  return trueMs + latency.meanMs + Math.abs(latency.jitterMs * rng.normal());
}
