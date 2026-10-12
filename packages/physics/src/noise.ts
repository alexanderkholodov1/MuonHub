/**
 * Noise threshold as a suggestion only (spec 0085 FR7; ADR-006).
 *
 * The routine looks for a low-amplitude noise lobe separated from the main (MIP-type) peak by a
 * valley and proposes the valley as a threshold, with its diagnostics. It never removes events:
 * applying a threshold is a recipe step on stored data, chosen by the user.
 */
import { buildAmplitudeHistogram, type Binning } from "./spectrum.js";
import { provenance, type Provenance, type ResultStatus } from "./provenance.js";

export interface ThresholdSuggestion {
  readonly status: ResultStatus;
  /** Proposed threshold in the binning unit (valley between noise lobe and main peak). */
  readonly suggestedThreshold?: number;
  readonly reason: string;
  /** Number of input values — always equal to what the caller passed; nothing is removed. */
  readonly inputCount: number;
  readonly diagnostics: {
    readonly mainPeakBin?: number;
    readonly noisePeakBin?: number;
    readonly valleyBin?: number;
  };
  readonly provenance: Provenance;
}

export interface NoiseOptions {
  /** A valley must be below this fraction of the smaller of the two peaks. Default 0.5. */
  readonly valleyDepth?: number;
}

export function suggestNoiseThreshold(
  amplitudes: Iterable<number>,
  binning: Binning,
  opts: NoiseOptions = {},
): ThresholdSuggestion {
  const valleyDepth = opts.valleyDepth ?? 0.5;
  const prov = provenance("suggestNoiseThreshold", { valleyDepth, bins: binning.edges.length - 1 });
  const h = buildAmplitudeHistogram(amplitudes, binning, { value: Infinity, unit: binning.unit });
  const base = { inputCount: h.total, provenance: prov };
  if (h.status !== "ok" || h.counts.length < 3) {
    return { ...base, status: "not-computable", reason: "histogram not available", diagnostics: {} };
  }
  const c = h.counts;
  let main = 0;
  for (let i = 1; i < c.length; i++) if ((c[i] as number) > (c[main] as number)) main = i;
  // Search below the main peak for the deepest valley followed (towards lower amplitudes) by a lobe.
  let best: { valley: number; noise: number } | undefined;
  let valley = main;
  for (let i = main - 1; i >= 0; i--) {
    if ((c[i] as number) < (c[valley] as number)) valley = i;
    const lobe = c[i] as number;
    const smaller = Math.min(lobe, c[main] as number);
    if (lobe > (c[valley] as number) && (c[valley] as number) < valleyDepth * smaller && valley > i) {
      best = { valley, noise: i };
    }
  }
  if (best === undefined) {
    return {
      ...base,
      status: "not-computable",
      reason: "no noise lobe separated from the main peak (triggered stream); nothing to suggest",
      diagnostics: { mainPeakBin: main },
    };
  }
  return {
    ...base,
    status: "ok",
    suggestedThreshold: h.edges[best.valley] as number,
    reason: "valley between a low-amplitude lobe and the main peak (suggestion only)",
    diagnostics: { mainPeakBin: main, noisePeakBin: best.noise, valleyBin: best.valley },
  };
}
