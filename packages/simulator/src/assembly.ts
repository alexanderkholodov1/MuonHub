/**
 * Stacked assembly helpers (spec 0086 FR9). The coincidence process itself (shared true events,
 * per-pair fraction, hardware flag with half-window τ_c) lives in `simulate()` in `scenario.ts`.
 */
import type { SimulationResult } from "./scenario.js";

/** Expected accidental coincidence rate 2·τ_c·R₁·R₂ (s⁻¹) from recorded singles rates. */
export function expectedAccidentalRate(
  halfWindowS: number,
  recordedRate1PerS: number,
  recordedRate2PerS: number,
): number {
  return 2 * halfWindowS * recordedRate1PerS * recordedRate2PerS;
}

/**
 * Number of true-coincidence groups: coincidence group ids that appear in the truth of both the
 * upper device (index `upper`) and the next device, counted among the upper device's true signal
 * events (FR9: fraction of the upper device's true events that also cross the lower one).
 */
export function trueCoincidenceCount(
  sim: SimulationResult,
  upper = 0,
): { upperEvents: number; shared: number } {
  const top = sim.devices[upper]?.truth ?? [];
  const lowerIds = new Set<number>();
  for (const e of sim.devices[upper + 1]?.truth ?? []) if (!e.noise) lowerIds.add(e.groupId);
  let upperEvents = 0;
  let shared = 0;
  for (const e of top) {
    if (e.noise) continue;
    upperEvents++;
    if (lowerIds.has(e.groupId)) shared++;
  }
  return { upperEvents, shared };
}

/** Count hardware-flagged recorded events of a device. */
export function flaggedCount(sim: SimulationResult, deviceIndex: number): number {
  return (sim.devices[deviceIndex]?.recorded ?? []).filter((e) => e.coincidenceFlag === 1).length;
}
