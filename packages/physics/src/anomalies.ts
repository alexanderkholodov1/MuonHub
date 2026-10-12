/**
 * Hour-scale deviations (THEORETICAL-FOUNDATION §10; spec 0085 FR5).
 *
 * Deviations are evaluated only on hourly windows of the corrected rate, require |z| ≥ threshold
 * AND persistence over consecutive windows, and are never flagged per minute. The σ of a window
 * combines its Poisson term, the baseline's own uncertainty, and an empirical overdispersion term
 * estimated from the residuals (uncorrected pressure/temperature residuals are autocorrelated, so
 * √N alone underestimates the false-alarm rate).
 */
import { madSigma, mean, twoSidedTail } from "./math.js";
import { provenance, type Provenance, type ResultStatus } from "./provenance.js";

export interface HourlyRate {
  readonly hourStart: number;
  /** Corrected rate (s⁻¹) and its statistical 1σ. */
  readonly rate: number;
  readonly sigma: number;
}

export interface Baseline {
  readonly value: number;
  readonly sigma: number;
}

export interface AnomalyOptions {
  /** |z| threshold. Default 3. */
  readonly threshold?: number;
  /** Consecutive hourly windows required. Proposed default: 3. */
  readonly persistence?: number;
}

export interface Deviation {
  readonly start: number;
  readonly end: number;
  readonly windows: number;
  readonly sign: 1 | -1;
  readonly maxAbsZ: number;
}

export interface AnomalyResult {
  readonly status: ResultStatus;
  readonly deviations: readonly Deviation[];
  /** Empirical overdispersion σ added in quadrature (s⁻¹). */
  readonly sigmaOverdispersion: number;
  /**
   * Expected false alarms per year of hourly windows for this threshold and persistence, assuming
   * independent windows after the overdispersion term (a lower bound when residuals remain correlated).
   */
  readonly falseAlarmsPerYear: number;
  readonly provenance: Provenance;
}

const HOUR = 3_600_000;
const HOURS_PER_YEAR = 8766;

export function detectHourScaleDeviations(
  windows: readonly HourlyRate[],
  baseline: Baseline,
  opts: AnomalyOptions = {},
): AnomalyResult {
  const threshold = opts.threshold ?? 3;
  const persistence = opts.persistence ?? 3;
  const pTail = twoSidedTail(threshold) / 2; // one-sided, same sign across the run
  const falseAlarmsPerYear = HOURS_PER_YEAR * 2 * Math.pow(pTail, persistence);
  const prov = provenance("detectHourScaleDeviations", { threshold, persistence, baseline });
  if (windows.length < 2) {
    return { status: "not-computable", deviations: [], sigmaOverdispersion: 0, falseAlarmsPerYear, provenance: prov };
  }
  const sorted = [...windows].sort((a, b) => a.hourStart - b.hourStart);
  const residuals = sorted.map((w) => w.rate - baseline.value);
  const expectedVar = mean(sorted.map((w) => w.sigma * w.sigma + baseline.sigma * baseline.sigma));
  // Robust spread (MAD) so the deviations being searched for do not inflate their own σ.
  const observedVar = madSigma(residuals) ** 2;
  const sigmaOverdispersion = Math.sqrt(Math.max(0, observedVar - expectedVar));

  const deviations: Deviation[] = [];
  let run: { start: number; last: number; sign: 1 | -1; count: number; maxAbsZ: number } | undefined;
  const close = (): void => {
    if (run !== undefined && run.count >= persistence) {
      deviations.push({
        start: run.start,
        end: run.last + HOUR,
        windows: run.count,
        sign: run.sign,
        maxAbsZ: run.maxAbsZ,
      });
    }
    run = undefined;
  };
  for (let i = 0; i < sorted.length; i++) {
    const w = sorted[i] as HourlyRate;
    const s = Math.sqrt(
      w.sigma * w.sigma + baseline.sigma * baseline.sigma + sigmaOverdispersion * sigmaOverdispersion,
    );
    const z = (residuals[i] as number) / s;
    const sign: 1 | -1 = z >= 0 ? 1 : -1;
    if (Math.abs(z) >= threshold) {
      if (run !== undefined && run.sign === sign && w.hourStart === run.last + HOUR) {
        run.last = w.hourStart;
        run.count += 1;
        run.maxAbsZ = Math.max(run.maxAbsZ, Math.abs(z));
      } else {
        close();
        run = { start: w.hourStart, last: w.hourStart, sign, count: 1, maxAbsZ: Math.abs(z) };
      }
    } else {
      close();
    }
  }
  close();
  return { status: "ok", deviations, sigmaOverdispersion, falseAlarmsPerYear, provenance: prov };
}
