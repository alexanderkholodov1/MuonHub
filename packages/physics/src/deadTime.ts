/**
 * Dead-time correction (mandatory — THEORETICAL-FOUNDATION.md §4).
 *
 * CosmicWatch-class counters are blind for τ_DT after each trigger, so the measured rate
 * underestimates the real one. Non-paralyzable model:
 *
 *   R_real = R_measured / (1 − R_measured · τ_DT)
 *
 * Units: rates are counts per minute (the `ec` field semantics); τ_DT is in seconds
 * (per-hardware constants in `DEAD_TIME_TAU_S`, @muonhub/shared).
 */
import { DEAD_TIME_TAU_S } from "@muonhub/shared";
import type { HardwareVersion } from "@muonhub/shared";

const SECONDS_PER_MINUTE = 60;

function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number, got ${value}`);
  }
}

/**
 * Fraction of live time lost to dead time: R·τ expressed on a common time base.
 * A value ≥ 1 means the counter is saturated and the rate is unrecoverable.
 */
export function deadTimeLossFraction(ratePerMin: number, tauSeconds: number): number {
  assertFiniteNonNegative(ratePerMin, "ratePerMin");
  assertFiniteNonNegative(tauSeconds, "tauSeconds");
  return (ratePerMin / SECONDS_PER_MINUTE) * tauSeconds;
}

/**
 * Non-paralyzable dead-time correction: R_real = R / (1 − R·τ).
 * Throws RangeError when R·τ ≥ 1 (saturation) — never silently clamps.
 */
export function correctDeadTime(ratePerMin: number, tauSeconds: number): number {
  const loss = deadTimeLossFraction(ratePerMin, tauSeconds);
  if (loss >= 1) {
    throw new RangeError(
      `dead-time loss fraction ${loss.toFixed(3)} ≥ 1: counter saturated, rate unrecoverable`,
    );
  }
  return ratePerMin / (1 - loss);
}

/** Convenience wrapper resolving τ_DT from the detector hardware generation. */
export function correctDeadTimeForHardware(ratePerMin: number, hwVersion: HardwareVersion): number {
  return correctDeadTime(ratePerMin, DEAD_TIME_TAU_S[hwVersion]);
}

/**
 * Correction from the recorded per-minute dead-time percentage (`dt` field):
 * R_real = R / (1 − dt/100). Throws when dt ≥ 100 (no live time).
 */
export function correctDeadTimeFromPercent(ratePerMin: number, dtPercent: number): number {
  assertFiniteNonNegative(ratePerMin, "ratePerMin");
  if (!Number.isFinite(dtPercent) || dtPercent < 0 || dtPercent >= 100) {
    throw new RangeError(`dtPercent must be in [0, 100), got ${dtPercent}`);
  }
  return ratePerMin / (1 - dtPercent / 100);
}
