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
  const h = buildAmplitudeHistogram(amplitudes, binning, {
    value: Number.MAX_VALUE,
    unit: binning.unit,
  });
  const base = { inputCount: h.total, provenance: prov };
  if (h.status !== "ok" || h.counts.length < 3) {
    return {
      ...base,
      status: "not-computable",
      reason: "histogram not available",
      diagnostics: {},
    };
  }
  // 3-bin moving average so single-bin fluctuations are not read as lobes or valleys.
  const raw = h.counts;
  const c = raw.map((_, i) => {
    const lo = Math.max(0, i - 1);
    const hi = Math.min(raw.length - 1, i + 1);
    let s = 0;
    for (let j = lo; j <= hi; j++) s += raw[j] as number;
    return s / (hi - lo + 1);
  });
  let main = 0;
  for (let i = 1; i < c.length; i++) if ((c[i] as number) > (c[main] as number)) main = i;
  const mainCount = c[main] as number;
  // Walk down from the main peak: track the running minimum (valley) and, below it, the highest lobe.
  let best: { valley: number; noise: number } | undefined;
  let valley = main;
  let lobe = -1;
  for (let i = main - 1; i >= 0; i--) {
    const v = c[i] as number;
    if (v < (c[valley] as number) && lobe < 0) valley = i;
    else if (v > (c[valley] as number) && (lobe < 0 || v > (c[lobe] as number))) lobe = i;
  }
  if (lobe >= 0 && valley > lobe) {
    const lobeCount = c[lobe] as number;
    const significant = lobeCount >= 10 && lobeCount >= 0.02 * mainCount;
    if (significant && (c[valley] as number) < valleyDepth * Math.min(lobeCount, mainCount)) {
      best = { valley, noise: lobe };
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
