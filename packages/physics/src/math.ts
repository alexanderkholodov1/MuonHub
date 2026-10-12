/**
 * Small numeric helpers. Loops only — never spread large arrays into function arguments
 * (spreading an array into Math.max overflows the call stack above ~10⁵ elements).
 */

export function sum(values: readonly number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError("mean of an empty sample");
  return sum(values) / values.length;
}

export function variance(values: readonly number[]): number {
  if (values.length < 2) throw new RangeError("variance needs at least two values");
  const m = mean(values);
  let s = 0;
  for (const v of values) s += (v - m) * (v - m);
  return s / (values.length - 1);
}

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError("median of an empty sample");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const hi = sorted[mid] as number;
  return sorted.length % 2 === 1 ? hi : ((sorted[mid - 1] as number) + hi) / 2;
}

/** Median absolute deviation scaled to σ for a normal distribution (×1.4826). */
export function madSigma(values: readonly number[]): number {
  const m = median(values);
  const dev: number[] = [];
  for (const v of values) dev.push(Math.abs(v - m));
  return 1.4826 * median(dev);
}

/** Lag-1 autocorrelation of a series. */
export function lag1Autocorrelation(values: readonly number[]): number {
  if (values.length < 3) return 0;
  const m = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < values.length; i++) {
    const d = (values[i] as number) - m;
    den += d * d;
    if (i > 0) num += d * ((values[i - 1] as number) - m);
  }
  return den === 0 ? 0 : num / den;
}

/** Complementary error function (W. J. Cody–style rational approximation, |error| < 1.2e-7). */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** Two-sided normal tail probability P(|Z| ≥ k). */
export function twoSidedTail(k: number): number {
  return erfc(k / Math.SQRT2);
}

/** Solves a small dense linear system A·x = b by Gaussian elimination with partial pivoting. */
export function solveLinear(a: number[][], b: number[]): number[] | undefined {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i] as number]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (
        Math.abs((m[r] as number[])[col] as number) > Math.abs((m[piv] as number[])[col] as number)
      )
        piv = r;
    }
    const pivotRow = m[piv] as number[];
    if (Math.abs(pivotRow[col] as number) < 1e-300) return undefined;
    [m[col], m[piv]] = [pivotRow, m[col] as number[]];
    const p = m[col] as number[];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const row = m[r] as number[];
      const f = (row[col] as number) / (p[col] as number);
      for (let c = col; c <= n; c++) row[c] = (row[c] as number) - f * (p[c] as number);
    }
  }
  return m.map((row, i) => (row[n] as number) / (row[i] as number));
}

/** Inverse of a small symmetric positive-definite matrix (via solveLinear on unit vectors). */
export function invert(a: number[][]): number[][] | undefined {
  const n = a.length;
  const cols: number[][] = [];
  for (let i = 0; i < n; i++) {
    const e = new Array<number>(n).fill(0);
    e[i] = 1;
    const x = solveLinear(
      a.map((r) => [...r]),
      e,
    );
    if (x === undefined) return undefined;
    cols.push(x);
  }
  return a.map((_, i) => cols.map((c) => c[i] as number));
}
