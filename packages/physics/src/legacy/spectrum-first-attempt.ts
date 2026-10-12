/**
 * FIRST-ATTEMPT CODE — kept only for the first-attempt agent (apps/agent) until M1 step 7 replaces
 * it. It filters events at ingest, which ADR-006 forbids; do not use it in new code. Spec 0085.
 */
/**
 * Amplitude spectrum (THEORETICAL-FOUNDATION.md §6).
 *
 * The aggregate SiPM amplitude histogram of a single detector shows three structures:
 * sub-threshold noise (dark counts, soft gammas), the Landau bulk whose MPV corresponds to
 * the ~2 MeV MIP deposit, and the high-amplitude tail (diagonal tracks, showers, delta rays).
 * The MPV is the one honest "energy-scale" observable for single-SiPM hardware.
 *
 * Units: amplitudes in mV.
 */

export interface HistogramOptions {
  /** Number of bins (default 64). */
  readonly binCount?: number;
  /** Lower edge (default: sample minimum, or `thresholdMv` when higher). */
  readonly minMv?: number;
  /** Upper edge (default: sample maximum). */
  readonly maxMv?: number;
  /** Sub-threshold cut: amplitudes below this are excluded before binning. */
  readonly thresholdMv?: number;
}

export interface AmplitudeHistogram {
  /** Bin edges, length = counts.length + 1, uniform width. */
  readonly binEdges: ReadonlyArray<number>;
  /** Event count per bin. */
  readonly counts: ReadonlyArray<number>;
  readonly binWidthMv: number;
  /** Events excluded by the sub-threshold cut. */
  readonly underThreshold: number;
  /** Total events binned (excludes the sub-threshold cut). */
  readonly total: number;
}

/** Uniform-bin amplitude histogram with an optional sub-threshold noise cut. */
export function buildAmplitudeHistogram(
  amplitudesMv: ReadonlyArray<number>,
  options: HistogramOptions = {},
): AmplitudeHistogram {
  const { binCount = 64, thresholdMv = 0 } = options;
  if (!Number.isInteger(binCount) || binCount < 1) {
    throw new RangeError(`binCount must be a positive integer, got ${binCount}`);
  }
  if (!Number.isFinite(thresholdMv) || thresholdMv < 0) {
    throw new RangeError(`thresholdMv must be finite and ≥ 0, got ${thresholdMv}`);
  }

  const finite = amplitudesMv.filter((a) => Number.isFinite(a) && a >= 0);
  const kept = finite.filter((a) => a >= thresholdMv);
  const underThreshold = finite.length - kept.length;
  if (kept.length === 0) {
    throw new RangeError("no amplitudes above threshold to histogram");
  }

  const min = options.minMv ?? Math.min(...kept);
  const max = options.maxMv ?? Math.max(...kept);
  if (!(max > min)) {
    throw new RangeError(`histogram range must satisfy max > min (got [${min}, ${max}])`);
  }

  const binWidthMv = (max - min) / binCount;
  const counts = new Array<number>(binCount).fill(0);
  let total = 0;
  for (const a of kept) {
    if (a < min || a > max) continue;
    const idx = Math.min(Math.floor((a - min) / binWidthMv), binCount - 1);
    counts[idx] = (counts[idx] ?? 0) + 1;
    total += 1;
  }

  const binEdges = Array.from({ length: binCount + 1 }, (_, i) => min + i * binWidthMv);
  return { binEdges, counts, binWidthMv, underThreshold, total };
}

/**
 * Most-probable value (Landau MPV) estimate: the highest bin's center refined by parabolic
 * interpolation over the three bins around the peak (exact for a locally quadratic peak).
 */
export function estimateMpv(histogram: AmplitudeHistogram): number {
  const { counts, binEdges, binWidthMv } = histogram;
  if (counts.length === 0) {
    throw new RangeError("cannot estimate MPV of an empty histogram");
  }

  let peak = 0;
  for (let i = 1; i < counts.length; i++) {
    if ((counts[i] ?? 0) > (counts[peak] ?? 0)) peak = i;
  }
  const center = (binEdges[peak] ?? 0) + binWidthMv / 2;

  if (peak === 0 || peak === counts.length - 1) return center;
  const yl = counts[peak - 1] ?? 0;
  const yc = counts[peak] ?? 0;
  const yr = counts[peak + 1] ?? 0;
  const denom = yl - 2 * yc + yr;
  if (denom === 0) return center;
  const offset = (0.5 * (yl - yr)) / denom;
  return center + offset * binWidthMv;
}
