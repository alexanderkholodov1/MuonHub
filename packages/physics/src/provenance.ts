/**
 * Provenance and status shared by every derived result (ADR-006: derived data records how it was
 * produced). Spec 0085.
 */

/** Version of the physics algorithms; bump when a result for the same input can change. */
export const PHYSICS_VERSION = "2.0.0";

/**
 * - `ok`: computed and corrected as requested.
 * - `uncorrected`: computed, but a correction could not be applied (e.g. unknown dead time).
 * - `not-computable`: the input does not allow a result (absent quantity, too little data).
 * - `invalid`: the input is inconsistent (e.g. a counter reset, R·τ ≥ 1); no number is returned.
 */
export type ResultStatus = "ok" | "uncorrected" | "not-computable" | "invalid";

export interface Interval {
  readonly start: number;
  readonly end: number;
}

export interface Provenance {
  readonly fn: string;
  readonly version: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly interval?: Interval;
}

export function provenance(
  fn: string,
  params: Readonly<Record<string, unknown>>,
  interval?: Interval,
): Provenance {
  return interval === undefined
    ? { fn, version: PHYSICS_VERSION, params }
    : { fn, version: PHYSICS_VERSION, params, interval };
}
