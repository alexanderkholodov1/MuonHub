/**
 * Barometric correction (THEORETICAL-FOUNDATION.md §8A) — the dominant surface modulation.
 *
 *   I(P) = I₀ · e^{β (P − P₀)}   ⇒   ln(I/I₀) = β (P − P₀)
 *
 * β is NOT universal: it is fitted per station by linear regression over that station's own
 * history of (pressure, rate) pairs. Documented surface-muon range ≈ −0.085 … −0.24 %/hPa.
 *
 * Units: rates in counts/min, pressure in hPa, β in 1/hPa (use `betaToPercentPerHpa` for %/hPa).
 */

export interface RatePressurePoint {
  /** Charged-particle rate (counts/min), dead-time corrected upstream. */
  readonly rate: number;
  /** Atmospheric pressure (hPa). */
  readonly pressureHpa: number;
}

export interface BarometricFit {
  /** Barometric coefficient β (1/hPa) — negative for surface counters. */
  readonly beta: number;
  /** β expressed in %/hPa (β × 100), for comparison with the literature. */
  readonly betaPercentPerHpa: number;
  /** Reference pressure P₀ (hPa): mean pressure of the fitted sample. */
  readonly refPressureHpa: number;
  /** Reference rate I₀ (counts/min) at P₀, from the regression intercept. */
  readonly refRate: number;
  /** Coefficient of determination of the log-linear fit. */
  readonly rSquared: number;
  /** Number of points actually used (positive-rate, finite). */
  readonly n: number;
}

/** β (1/hPa) → %/hPa. */
export function betaToPercentPerHpa(beta: number): number {
  return beta * 100;
}

/**
 * Least-squares fit of ln(I/Ī) against (P − P̄). Points with non-positive or non-finite rate
 * or pressure are excluded (log domain). Requires ≥ 2 usable points with pressure variance.
 */
export function fitBarometricBeta(points: ReadonlyArray<RatePressurePoint>): BarometricFit {
  const usable = points.filter(
    (p) =>
      Number.isFinite(p.rate) && p.rate > 0 && Number.isFinite(p.pressureHpa) && p.pressureHpa > 0,
  );
  if (usable.length < 2) {
    throw new RangeError(`barometric fit needs ≥ 2 usable points, got ${usable.length}`);
  }

  const n = usable.length;
  const meanP = usable.reduce((s, p) => s + p.pressureHpa, 0) / n;
  const logRates = usable.map((p) => Math.log(p.rate));
  const meanLogI = logRates.reduce((s, v) => s + v, 0) / n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (usable[i]?.pressureHpa ?? meanP) - meanP;
    const dy = (logRates[i] ?? meanLogI) - meanLogI;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) {
    throw new RangeError("barometric fit needs pressure variance (all pressures identical)");
  }

  const beta = sxy / sxx;
  // r² of the log-linear model; a constant-rate series (syy = 0) is perfectly explained.
  const rSquared = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);

  return {
    beta,
    betaPercentPerHpa: betaToPercentPerHpa(beta),
    refPressureHpa: meanP,
    refRate: Math.exp(meanLogI),
    rSquared,
    n,
  };
}

/**
 * Normalize a measured rate to the reference pressure: I₀ = I · e^{−β (P − P₀)}.
 * This is the `ecCorr` derived field (applied over the dead-time-corrected rate).
 */
export function applyBarometricCorrection(
  ratePerMin: number,
  pressureHpa: number,
  fit: Pick<BarometricFit, "beta" | "refPressureHpa">,
): number {
  if (!Number.isFinite(ratePerMin) || ratePerMin < 0) {
    throw new RangeError(`ratePerMin must be finite and ≥ 0, got ${ratePerMin}`);
  }
  if (!Number.isFinite(pressureHpa) || pressureHpa <= 0) {
    throw new RangeError(`pressureHpa must be finite and > 0, got ${pressureHpa}`);
  }
  return ratePerMin * Math.exp(-fit.beta * (pressureHpa - fit.refPressureHpa));
}
