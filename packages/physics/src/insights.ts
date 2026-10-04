import type { HardwareVersion, MinuteRecord } from "@muonhub/shared";
import { applyBarometricCorrection, fitBarometricBeta, type BarometricFit } from "./barometric.js";
import { correctDeadTimeForHardware } from "./deadTime.js";
import { countsZScore, poissonSigma, robustBaseline, type RobustBaseline } from "./statistics.js";

export const DEFAULT_BETA_MIN_POINTS = 168;

export interface CorrectedRatePoint {
  readonly ts: number;
  readonly rawRate: number;
  readonly pressureHpa: number;
  readonly deadTimeCorrectedRate: number;
  readonly barometricCorrectedRate: number | null;
  readonly rawSigma: number;
  readonly deadTimeSigma: number;
  readonly barometricSigma: number | null;
  readonly zScore: number | null;
}

export interface AnomalyFlag {
  readonly ts: number;
  readonly correctedRate: number;
  readonly zScore: number;
}

export interface BetaReadout {
  readonly fit: BarometricFit;
  readonly fromTs: number;
  readonly toTs: number;
}

export interface CorrectedRateInsights {
  readonly points: ReadonlyArray<CorrectedRatePoint>;
  readonly beta: BetaReadout | null;
  readonly baseline: RobustBaseline | null;
  readonly anomalies: ReadonlyArray<AnomalyFlag>;
  readonly usableBetaSampleCount: number;
}

export interface CorrectedRateInsightsOptions {
  readonly betaMinPoints?: number;
}

interface FitSample {
  readonly ts: number;
  readonly rate: number;
  readonly pressureHpa: number;
}

function propagatedSigma(rawRate: number, correctedRate: number, rawSigma: number): number {
  return rawRate === 0 ? 0 : rawSigma * (correctedRate / rawRate);
}

/**
 * Build the station-dashboard corrected-rate series from canonical minute records.
 *
 * The correction order is mandatory: raw event rate → hardware dead-time correction →
 * station-local barometric correction. Statistical uncertainty starts from raw Poisson counts
 * and is propagated by the same scale factor as the corrected rate.
 */
export function buildCorrectedRateInsights(
  records: ReadonlyArray<MinuteRecord>,
  hwVersion: HardwareVersion,
  options: CorrectedRateInsightsOptions = {},
): CorrectedRateInsights {
  const betaMinPoints = options.betaMinPoints ?? DEFAULT_BETA_MIN_POINTS;
  if (!Number.isInteger(betaMinPoints) || betaMinPoints < 2) {
    throw new RangeError(`betaMinPoints must be an integer ≥ 2, got ${betaMinPoints}`);
  }

  const sortedRecords = [...records].sort((a, b) => a.ts - b.ts);
  const deadTimePoints = sortedRecords.map((record) => {
    const deadTimeCorrectedRate = correctDeadTimeForHardware(record.ec, hwVersion);
    const rawSigma = poissonSigma(record.ec);
    return {
      record,
      deadTimeCorrectedRate,
      rawSigma,
      deadTimeSigma: propagatedSigma(record.ec, deadTimeCorrectedRate, rawSigma),
    };
  });

  const fitSamples: FitSample[] = deadTimePoints
    .filter(({ record, deadTimeCorrectedRate }) => {
      return (
        Number.isFinite(record.pr) &&
        record.pr > 0 &&
        Number.isFinite(deadTimeCorrectedRate) &&
        deadTimeCorrectedRate > 0
      );
    })
    .map(({ record, deadTimeCorrectedRate }) => ({
      ts: record.ts,
      rate: deadTimeCorrectedRate,
      pressureHpa: record.pr,
    }));

  const beta = fitSamples.length >= betaMinPoints ? buildBetaReadout(fitSamples) : null;

  const preliminaryPoints = deadTimePoints.map(
    ({ record, deadTimeCorrectedRate, rawSigma, deadTimeSigma }) => {
      const barometricCorrectedRate =
        beta == null || record.pr <= 0
          ? null
          : applyBarometricCorrection(deadTimeCorrectedRate, record.pr, beta.fit);
      return {
        ts: record.ts,
        rawRate: record.ec,
        pressureHpa: record.pr,
        deadTimeCorrectedRate,
        barometricCorrectedRate,
        rawSigma,
        deadTimeSigma,
        barometricSigma:
          barometricCorrectedRate == null
            ? null
            : propagatedSigma(record.ec, barometricCorrectedRate, rawSigma),
      };
    },
  );

  const correctedValues = preliminaryPoints
    .map((point) => point.barometricCorrectedRate)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const baseline = correctedValues.length > 0 ? robustBaseline(correctedValues) : null;

  const points = preliminaryPoints.map((point): CorrectedRatePoint => {
    const zScore =
      baseline == null || point.barometricCorrectedRate == null || baseline.median <= 0
        ? null
        : countsZScore(point.barometricCorrectedRate, baseline.median);
    return { ...point, zScore };
  });

  const anomalies = points
    .filter((point) => {
      return (
        point.barometricCorrectedRate != null && point.zScore != null && Math.abs(point.zScore) >= 3
      );
    })
    .map((point): AnomalyFlag => ({
      ts: point.ts,
      correctedRate: point.barometricCorrectedRate ?? 0,
      zScore: point.zScore ?? 0,
    }));

  return {
    points,
    beta,
    baseline,
    anomalies,
    usableBetaSampleCount: fitSamples.length,
  };
}

function buildBetaReadout(fitSamples: ReadonlyArray<FitSample>): BetaReadout | null {
  try {
    const fit = fitBarometricBeta(fitSamples);
    const first = fitSamples[0];
    const last = fitSamples[fitSamples.length - 1];
    if (first == null || last == null) return null;
    return {
      fit,
      fromTs: first.ts,
      toTs: last.ts,
    };
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}
