/**
 * Counting statistics (THEORETICAL-FOUNDATION.md §10).
 *
 * Detector events are Poisson: for N raw counts, σ ≈ √N and the relative error is 1/√N.
 * Uncertainties are ALWAYS derived from raw counts (guardrail 5), never from averaged values.
 * For a 25 cm² device at ≈ 2.4 s⁻¹ a minute holds ≈ 144 counts (≈ 8.3 % relative error) and an
 * hour ≈ 8 640 (≈ 1.08 %); anomalies are defined at ≥ 3σ on corrected rates over hour-scale windows
 * (spec 0085); per-stream baselines are empirical (robust median/IQR), never a-priori formulas.
 */

function assertCounts(counts: number, name = "counts"): void {
  if (!Number.isFinite(counts) || counts < 0) {
    throw new RangeError(`${name} must be a finite non-negative number, got ${counts}`);
  }
}

/** Poisson standard deviation for N raw counts: σ = √N. */
export function poissonSigma(counts: number): number {
  assertCounts(counts);
  return Math.sqrt(counts);
}

/** Relative statistical error for N raw counts: 1/√N. Throws for N = 0 (undefined). */
export function poissonRelativeError(counts: number): number {
  assertCounts(counts);
  if (counts === 0) {
    throw new RangeError("relative error is undefined for zero counts");
  }
  return 1 / Math.sqrt(counts);
}

/** Symmetric k·σ band around an expected raw count (default 3σ, the anomaly threshold). */
export function sigmaBand(
  expectedCounts: number,
  k = 3,
): { readonly lower: number; readonly upper: number } {
  assertCounts(expectedCounts, "expectedCounts");
  if (!Number.isFinite(k) || k <= 0) {
    throw new RangeError(`k must be finite and > 0, got ${k}`);
  }
  const halfWidth = k * Math.sqrt(expectedCounts);
  return { lower: Math.max(0, expectedCounts - halfWidth), upper: expectedCounts + halfWidth };
}

/** z-score of an observed raw count against a Poisson expectation: (N − E)/√E. */
export function countsZScore(observedCounts: number, expectedCounts: number): number {
  assertCounts(observedCounts, "observedCounts");
  assertCounts(expectedCounts, "expectedCounts");
  if (expectedCounts === 0) {
    throw new RangeError("z-score is undefined for an expectation of zero counts");
  }
  return (observedCounts - expectedCounts) / Math.sqrt(expectedCounts);
}

export interface RobustBaseline {
  readonly median: number;
  /** Interquartile range (q75 − q25). */
  readonly iqr: number;
  readonly q25: number;
  readonly q75: number;
  /** Tukey-style bounds: median ± 1.5 × IQR (the empirical "normal" band). */
  readonly lower: number;
  readonly upper: number;
  readonly n: number;
}

/** Linear-interpolation quantile on a sorted copy of the sample (q in [0, 1]). */
function quantileSorted(sorted: ReadonlyArray<number>, q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const vLo = sorted[lo];
  const vHi = sorted[hi];
  if (vLo === undefined || vHi === undefined) {
    throw new RangeError("quantile requested on an empty sample");
  }
  return vLo + (vHi - vLo) * (pos - lo);
}

/**
 * Empirical per-detector baseline from quiet-period history: median + IQR with Tukey bounds.
 * Robust to the occasional spike/dropout; input order does not matter.
 */
export function robustBaseline(values: ReadonlyArray<number>): RobustBaseline {
  const usable = values.filter((v) => Number.isFinite(v));
  if (usable.length === 0) {
    throw new RangeError("robustBaseline needs at least one finite value");
  }
  const sorted = [...usable].sort((a, b) => a - b);
  const median = quantileSorted(sorted, 0.5);
  const q25 = quantileSorted(sorted, 0.25);
  const q75 = quantileSorted(sorted, 0.75);
  const iqr = q75 - q25;
  return {
    median,
    iqr,
    q25,
    q75,
    lower: median - 1.5 * iqr,
    upper: median + 1.5 * iqr,
    n: sorted.length,
  };
}

/**
 * Effective sample size of an autocorrelated series (AR(1) approximation):
 * n_eff = n · (1 − ρ) / (1 + ρ), with ρ the lag-1 autocorrelation (negative ρ treated as 0).
 */
export function effectiveSampleSize(series: ReadonlyArray<number>): number {
  const n = series.length;
  if (n < 3) return n;
  let m = 0;
  for (const v of series) m += v;
  m /= n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const d = (series[i] as number) - m;
    den += d * d;
    if (i > 0) num += d * ((series[i - 1] as number) - m);
  }
  const rho = den === 0 ? 0 : Math.max(0, num / den);
  return (n * (1 - rho)) / (1 + rho);
}
