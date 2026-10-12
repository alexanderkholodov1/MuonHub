/**
 * Barometric correction (THEORETICAL-FOUNDATION §8A; spec 0085 FR4).
 *
 *   I(P) = I₀ · exp((β/100)(P − P₀))   ⇒   ln(I/I₀) = (β/100)(P − P₀),   β in %/hPa
 *
 * β is fitted per station on hourly bins (counts and live time per hour), with the device
 * temperature as an instrument covariate (SiPM gain, electronics — not the atmospheric thermal
 * effect). σ_β is inflated for overdispersion and for autocorrelation of the residuals. β is
 * applied only if |β|/σ_β ≥ 3 and β lies in the plausible range. P₀ is the station's own mean
 * pressure over the fit period — never a fixed value.
 */
import type { CorrectedRate } from "./live-time.js";
import { invert, lag1Autocorrelation, madSigma, mean, median, variance } from "./math.js";
import { provenance, type Provenance, type ResultStatus } from "./provenance.js";

/** One hour of a stream: counts, live time, and the hour's mean pressure / temperature. */
export interface HourlyPoint {
  readonly hourStart: number;
  readonly counts: number;
  readonly liveMs: number;
  readonly pressureHpa?: number;
  readonly temperatureC?: number;
}

export interface BetaFitOptions {
  /** Minimum data span (days). Proposed default: 7. */
  readonly minSpanDays?: number;
  /** Minimum standard deviation of the hourly pressure (hPa). Proposed default: 0.8. */
  readonly minPressureStdHpa?: number;
  /** Significance gate |β|/σ_β. Default 3. */
  readonly gateSigma?: number;
  /** Plausible β range (%/hPa). Proposed default: [−0.4, 0]. */
  readonly betaRange?: readonly [number, number];
  /** Outlier rule on standardized residuals: median ± k·MAD. Proposed default: 5. */
  readonly outlierMad?: number;
  /** Use the device temperature as a covariate when every hour reports it. Default true. */
  readonly useTemperature?: boolean;
}

export interface BetaFitResult {
  readonly status: ResultStatus;
  /** β in %/hPa. */
  readonly beta?: number;
  readonly sigmaBeta?: number;
  /** Temperature coefficient in %/°C (instrument covariate), when used. */
  readonly temperatureCoef?: number;
  readonly p0Hpa?: number;
  readonly periodStart?: number;
  readonly periodEnd?: number;
  readonly hoursUsed: number;
  readonly hoursExcluded: number;
  /** |β|/σ_β. */
  readonly significance?: number;
  readonly applied: boolean;
  readonly reason: string;
  readonly provenance: Provenance;
}

/** β (1/hPa) → %/hPa. */
export function betaToPercentPerHpa(betaPerHpa: number): number {
  return betaPerHpa * 100;
}

interface Wls {
  readonly coef: number[];
  readonly cov: number[][];
  readonly stdResiduals: number[];
}

function wls(rows: number[][], y: number[], w: number[]): Wls | undefined {
  const p = (rows[0] as number[]).length;
  const xtwx: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const xtwy = new Array<number>(p).fill(0);
  for (let i = 0; i < rows.length; i++) {
    const x = rows[i] as number[];
    const wi = w[i] as number;
    for (let a = 0; a < p; a++) {
      xtwy[a] = (xtwy[a] as number) + wi * (x[a] as number) * (y[i] as number);
      const ra = xtwx[a] as number[];
      for (let b = 0; b < p; b++)
        ra[b] = (ra[b] as number) + wi * (x[a] as number) * (x[b] as number);
    }
  }
  const inv = invert(xtwx);
  if (inv === undefined) return undefined;
  const coef = inv.map((row) => row.reduce((s, v, j) => s + v * (xtwy[j] as number), 0));
  const stdResiduals: number[] = [];
  let chi2 = 0;
  for (let i = 0; i < rows.length; i++) {
    const x = rows[i] as number[];
    let fit = 0;
    for (let a = 0; a < p; a++) fit += (coef[a] as number) * (x[a] as number);
    const z = ((y[i] as number) - fit) * Math.sqrt(w[i] as number);
    stdResiduals.push(z);
    chi2 += z * z;
  }
  const dof = rows.length - p;
  const scale = dof > 0 ? Math.max(1, chi2 / dof) : 1;
  return { coef, cov: inv.map((r) => r.map((v) => v * scale)), stdResiduals };
}

export function fitBarometricBeta(
  hours: readonly HourlyPoint[],
  opts: BetaFitOptions = {},
): BetaFitResult {
  const minSpanDays = opts.minSpanDays ?? 7;
  const minPressureStdHpa = opts.minPressureStdHpa ?? 0.8;
  const gateSigma = opts.gateSigma ?? 3;
  const [betaMin, betaMax] = opts.betaRange ?? [-0.4, 0];
  const outlierMad = opts.outlierMad ?? 5;
  const params = {
    minSpanDays,
    minPressureStdHpa,
    gateSigma,
    betaRange: [betaMin, betaMax],
    outlierMad,
  };

  const usable = hours
    .filter(
      (h) =>
        h.counts > 0 &&
        h.liveMs > 0 &&
        h.pressureHpa !== undefined &&
        Number.isFinite(h.pressureHpa) &&
        Number.isFinite(h.counts),
    )
    .sort((a, b) => a.hourStart - b.hourStart);
  const notComputable = (reason: string, extra: Partial<BetaFitResult> = {}): BetaFitResult => ({
    status: "not-computable",
    hoursUsed: usable.length,
    hoursExcluded: hours.length - usable.length,
    applied: false,
    reason,
    provenance: provenance("fitBarometricBeta", params),
    ...extra,
  });
  if (usable.length < 3) return notComputable("fewer than 3 hours with counts and pressure");

  const periodStart = (usable[0] as HourlyPoint).hourStart;
  const periodEnd = (usable[usable.length - 1] as HourlyPoint).hourStart + 3_600_000;
  const spanDays = (periodEnd - periodStart) / 86_400_000;
  if (spanDays < minSpanDays) {
    return notComputable(`data span ${spanDays.toFixed(2)} d < ${minSpanDays} d`, {
      periodStart,
      periodEnd,
    });
  }
  const pressures = usable.map((h) => h.pressureHpa as number);
  if (Math.sqrt(variance(pressures)) < minPressureStdHpa) {
    return notComputable(`pressure standard deviation < ${minPressureStdHpa} hPa`, {
      periodStart,
      periodEnd,
    });
  }
  const useT =
    (opts.useTemperature ?? true) &&
    usable.every((h) => h.temperatureC !== undefined && Number.isFinite(h.temperatureC));

  const fitOn = (pts: readonly HourlyPoint[]): { res: Wls; p0: number } | undefined => {
    const p0 = mean(pts.map((h) => h.pressureHpa as number));
    const t0 = useT ? mean(pts.map((h) => h.temperatureC as number)) : 0;
    const rows = pts.map((h) => {
      const r = [1, (h.pressureHpa as number) - p0];
      if (useT) r.push((h.temperatureC as number) - t0);
      return r;
    });
    const y = pts.map((h) => Math.log(h.counts / (h.liveMs / 1000)));
    const w = pts.map((h) => h.counts);
    const res = wls(rows, y, w);
    return res === undefined ? undefined : { res, p0 };
  };

  let pts: readonly HourlyPoint[] = usable;
  let fit = fitOn(pts);
  if (fit === undefined) return notComputable("degenerate regression");
  const med = median(fit.res.stdResiduals);
  const mad = madSigma(fit.res.stdResiduals);
  const keep = fit.res.stdResiduals.map((z) => mad === 0 || Math.abs(z - med) <= outlierMad * mad);
  const excludedOutliers = keep.filter((k) => !k).length;
  if (excludedOutliers > 0) {
    pts = pts.filter((_, i) => keep[i]);
    fit = fitOn(pts);
    if (fit === undefined) return notComputable("degenerate regression after outlier exclusion");
  }

  const rho = Math.max(0, lag1Autocorrelation(fit.res.stdResiduals));
  const inflation = Math.sqrt((1 + rho) / (1 - Math.min(rho, 0.99)));
  const beta = 100 * (fit.res.coef[1] as number);
  const sigmaBeta = 100 * Math.sqrt((fit.res.cov[1] as number[])[1] as number) * inflation;
  const significance = Math.abs(beta) / sigmaBeta;
  const inRange = beta >= betaMin && beta <= betaMax;
  const applied = significance >= gateSigma && inRange;
  const reason = applied
    ? "applied"
    : !inRange
      ? `β outside the plausible range [${betaMin}, ${betaMax}] %/hPa`
      : `|β|/σ_β = ${significance.toFixed(2)} < ${gateSigma}`;
  const result: BetaFitResult = {
    status: "ok",
    beta,
    sigmaBeta,
    p0Hpa: fit.p0,
    periodStart,
    periodEnd,
    hoursUsed: pts.length,
    hoursExcluded: hours.length - pts.length,
    significance,
    applied,
    reason,
    provenance: provenance(
      "fitBarometricBeta",
      { ...params, useTemperature: useT, lag1Autocorrelation: rho, excludedOutliers },
      { start: periodStart, end: periodEnd },
    ),
  };
  return useT ? { ...result, temperatureCoef: 100 * (fit.res.coef[2] as number) } : result;
}

export type BarometricState = "applied" | "not-applied" | "not-computable";

export interface BarometricCorrectedRate extends CorrectedRate {
  readonly barometric: BarometricState;
}

/**
 * Corrects a rate to the reference pressure P₀ when the fit was applied:
 * R_c = R · exp(−(β/100)(P − P₀)); σ adds σ_β/100 · |P − P₀| · R in quadrature.
 */
export function applyBarometricCorrection(
  rate: CorrectedRate,
  pressureHpa: number | undefined,
  fit: BetaFitResult,
): BarometricCorrectedRate {
  if (rate.rate === undefined || rate.sigma === undefined)
    return { ...rate, barometric: "not-computable" };
  if (pressureHpa === undefined || !Number.isFinite(pressureHpa)) {
    return { ...rate, barometric: "not-computable" };
  }
  if (
    !fit.applied ||
    fit.beta === undefined ||
    fit.sigmaBeta === undefined ||
    fit.p0Hpa === undefined
  ) {
    return { ...rate, barometric: "not-applied" };
  }
  const dp = pressureHpa - fit.p0Hpa;
  const factor = Math.exp(-(fit.beta / 100) * dp);
  const sigma = Math.hypot(rate.sigma * factor, (fit.sigmaBeta / 100) * Math.abs(dp) * rate.rate);
  return {
    ...rate,
    rate: rate.rate * factor,
    sigma,
    barometric: "applied",
    provenance: provenance("applyBarometricCorrection", {
      input: rate.provenance,
      beta: fit.beta,
      sigmaBeta: fit.sigmaBeta,
      p0Hpa: fit.p0Hpa,
      pressureHpa,
    }),
  };
}
