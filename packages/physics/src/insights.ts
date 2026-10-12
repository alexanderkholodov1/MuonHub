/**
 * Corrected-rate insights for a stream (spec 0085): live-time correction per hour, the barometric
 * fit (applied only when significant), and hour-scale deviations. Built on the v2 functions; every
 * result carries its status and provenance.
 */
import type { v2 } from "@muonhub/shared";
import { detectHourScaleDeviations, type AnomalyOptions, type AnomalyResult } from "./anomalies.js";
import {
  applyBarometricCorrection,
  fitBarometricBeta,
  type BarometricCorrectedRate,
  type BetaFitOptions,
  type BetaFitResult,
} from "./barometric.js";
import { correctRateByLiveTime, uncorrectedRate } from "./live-time.js";
import { madSigma, median } from "./math.js";
import { effectiveSampleSize } from "./statistics.js";
import { provenance, type Provenance, type ResultStatus } from "./provenance.js";

/** One hour of a stream, as read from a day summary (spec 0083). */
export interface InsightHour {
  readonly hourStart: number;
  readonly counts: number;
  readonly completeMinutes: number;
  readonly liveSource: v2.LiveSource;
  readonly liveMs?: number;
  readonly pressureHpa?: number;
  readonly temperatureC?: number;
}

export interface CorrectedRateInsightsOptions {
  readonly beta?: BetaFitOptions;
  readonly anomalies?: AnomalyOptions;
}

export interface CorrectedRateInsights {
  readonly status: ResultStatus;
  readonly hourly: ReadonlyArray<{
    readonly hourStart: number;
    readonly corrected: BarometricCorrectedRate;
  }>;
  readonly beta: BetaFitResult;
  readonly deviations: AnomalyResult;
  readonly provenance: Provenance;
}

export function buildCorrectedRateInsights(
  hours: readonly InsightHour[],
  opts: CorrectedRateInsightsOptions = {},
): CorrectedRateInsights {
  const durationMs = (h: InsightHour): number => h.completeMinutes * 60_000;
  const fit = fitBarometricBeta(
    hours.map((h) => {
      const p = { hourStart: h.hourStart, counts: h.counts, liveMs: h.liveMs ?? durationMs(h) };
      return {
        ...p,
        ...(h.pressureHpa === undefined ? {} : { pressureHpa: h.pressureHpa }),
        ...(h.temperatureC === undefined ? {} : { temperatureC: h.temperatureC }),
      };
    }),
    opts.beta,
  );
  const liveSources: Record<string, number> = {};
  for (const h of hours) liveSources[h.liveSource] = (liveSources[h.liveSource] ?? 0) + 1;
  const nominalHours = liveSources["nominal"] ?? 0;
  // Nominal hours enter the fit without a dead-time correction: say so, never silently.
  const beta: BetaFitResult = {
    ...fit,
    status: fit.status === "ok" && nominalHours > 0 ? "uncorrected" : fit.status,
    provenance: provenance(fit.provenance.fn, {
      ...fit.provenance.params,
      liveSources,
      nominalHours,
    }),
  };
  const hourly = hours.map((h) => {
    const base =
      h.liveSource === "nominal" || h.liveMs === undefined
        ? uncorrectedRate(h.counts, durationMs(h))
        : { ...correctRateByLiveTime(h.counts, h.liveMs), liveSource: h.liveSource };
    return {
      hourStart: h.hourStart,
      corrected: applyBarometricCorrection(base, h.pressureHpa, beta),
    };
  });
  const usable = hourly.filter(
    (h) => h.corrected.rate !== undefined && h.corrected.sigma !== undefined,
  );
  const rates = usable.map((h) => h.corrected.rate as number);
  const baseline =
    rates.length >= 2
      ? {
          value: median(rates),
          sigma: (1.2533 * madSigma(rates)) / Math.sqrt(effectiveSampleSize(rates)),
        }
      : { value: 0, sigma: 0 };
  const deviations = detectHourScaleDeviations(
    usable.map((h) => ({
      hourStart: h.hourStart,
      rate: h.corrected.rate as number,
      sigma: h.corrected.sigma as number,
    })),
    baseline,
    opts.anomalies,
  );
  return {
    status: hours.length === 0 ? "not-computable" : "ok",
    hourly,
    beta,
    deviations,
    provenance: provenance("buildCorrectedRateInsights", { hours: hours.length }),
  };
}
