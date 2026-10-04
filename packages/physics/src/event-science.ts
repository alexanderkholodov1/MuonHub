import {
  EventSummarySchema,
  type EventSummary,
  type NoiseCalibrationMethod,
  type SignalRecord,
} from "@muonhub/shared";
import { buildAmplitudeHistogram, estimateMpv } from "./spectrum.js";

const DEFAULT_NOISE_FRACTION = 0.25;
const DEFAULT_MIN_NOISE_SAMPLES = 8;
const DEFAULT_SIGMA_MULTIPLIER = 6;
const DEFAULT_NOISE_MARGIN_MV = 0.5;
const DEFAULT_HISTOGRAM_BINS = 64;
const DEFAULT_TAIL_MPV_MULTIPLIER = 2;

export interface NoiseThresholdCalibrationOptions {
  /**
   * Fraction of the lowest amplitudes used as the sub-threshold dark-count lobe seed.
   * The detector must be calibrated on a window that contains baseline noise.
   */
  readonly noiseFraction?: number;
  readonly minNoiseSamples?: number;
  /** Threshold rule: noise median + N * robust sigma. */
  readonly sigmaMultiplier?: number;
  /** Keeps a zero-width or quantized noise lobe strictly below the detection threshold. */
  readonly noiseMarginMv?: number;
}

export interface NoiseThresholdCalibration {
  readonly thresholdMv: number;
  readonly method: NoiseCalibrationMethod;
}

export interface BuildEventSummaryParams {
  readonly detectorId: string;
  readonly sessionId: string;
  readonly intervalStartTs: number;
  readonly intervalEndTs: number;
  readonly noiseThresholdMv: number;
  readonly signalCount?: number;
  readonly aboveThresholdCount?: number;
  readonly binCount?: number;
  readonly histogramMinMv?: number;
  readonly histogramMaxMv?: number;
  /**
   * Documented high-amplitude tail cut. When omitted, the tail is counted above
   * `tailMpvMultiplier * MPV`, which marks the Landau high-energy tail without particle labels.
   */
  readonly tailCutMv?: number;
  readonly tailMpvMultiplier?: number;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer, got ${value}`);
  }
}

function finiteNonNegative(values: ReadonlyArray<number>): number[] {
  return values.filter((value) => Number.isFinite(value) && value >= 0);
}

function quantile(sortedValues: ReadonlyArray<number>, q: number): number {
  if (sortedValues.length === 0) {
    throw new RangeError("cannot compute quantile of an empty sample");
  }

  const position = (sortedValues.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sortedValues[lower];
  const upperValue = sortedValues[upper];
  if (lowerValue === undefined || upperValue === undefined) {
    throw new RangeError("quantile index outside sample");
  }

  if (lower === upper) {
    return lowerValue;
  }

  return lowerValue + (upperValue - lowerValue) * (position - lower);
}

function median(sortedValues: ReadonlyArray<number>): number {
  return quantile(sortedValues, 0.5);
}

function robustSigma(values: ReadonlyArray<number>, center: number): number {
  const deviations = values.map((value) => Math.abs(value - center)).sort((a, b) => a - b);
  const mad = median(deviations);
  if (mad > 0) {
    return 1.4826 * mad;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  return iqr > 0 ? iqr / 1.349 : 0;
}

function expandNoiseLobe(
  sortedValues: ReadonlyArray<number>,
  seedCount: number,
  gapThresholdMv: number,
): ReadonlyArray<number> {
  const searchLimit = Math.max(seedCount, Math.floor(sortedValues.length * 0.75));
  let lobeEnd = seedCount - 1;

  for (let index = seedCount - 1; index < searchLimit - 1; index++) {
    const current = sortedValues[index];
    const next = sortedValues[index + 1];
    if (current === undefined || next === undefined) {
      break;
    }

    if (next - current > gapThresholdMv) {
      lobeEnd = index;
      break;
    }

    lobeEnd = index + 1;
  }

  return sortedValues.slice(0, lobeEnd + 1);
}

/**
 * Auto-calibrate the above-noise detection threshold from a SiPM amplitude window.
 *
 * Foundation §6 separates the low-amplitude thermal/dark-count lobe from the Landau bulk. This
 * function seeds that lobe with the lowest amplitudes, expands it until the first significant
 * amplitude gap, and sets `threshold = median(lobe) + N * robustSigma(lobe)`, with a small margin
 * above the lobe's high quantile. The returned threshold is a documented detection threshold for
 * reproducibility, not arbitrary event filtering.
 */
export function calibrateNoiseThreshold(
  amplitudesMv: ReadonlyArray<number>,
  options: NoiseThresholdCalibrationOptions = {},
): NoiseThresholdCalibration {
  const values = finiteNonNegative(amplitudesMv).sort((a, b) => a - b);
  if (values.length === 0) {
    throw new RangeError("calibration requires at least one finite non-negative amplitude");
  }

  const noiseFraction = options.noiseFraction ?? DEFAULT_NOISE_FRACTION;
  if (!(noiseFraction > 0 && noiseFraction <= 1)) {
    throw new RangeError(`noiseFraction must be in (0, 1], got ${noiseFraction}`);
  }

  const minNoiseSamples = options.minNoiseSamples ?? DEFAULT_MIN_NOISE_SAMPLES;
  assertPositiveInteger(minNoiseSamples, "minNoiseSamples");

  const sigmaMultiplier = options.sigmaMultiplier ?? DEFAULT_SIGMA_MULTIPLIER;
  if (!(sigmaMultiplier > 0)) {
    throw new RangeError(`sigmaMultiplier must be positive, got ${sigmaMultiplier}`);
  }

  const noiseMarginMv = options.noiseMarginMv ?? DEFAULT_NOISE_MARGIN_MV;
  if (!(noiseMarginMv >= 0)) {
    throw new RangeError(`noiseMarginMv must be non-negative, got ${noiseMarginMv}`);
  }

  const noiseSampleCount = Math.min(
    values.length,
    Math.max(minNoiseSamples, Math.ceil(values.length * noiseFraction)),
  );
  const seedLobe = values.slice(0, noiseSampleCount);
  const seedCenter = median(seedLobe);
  const seedSigma = robustSigma(seedLobe, seedCenter);
  const noiseLobe = expandNoiseLobe(
    values,
    noiseSampleCount,
    Math.max(noiseMarginMv, seedSigma * 4),
  );
  const center = median(noiseLobe);
  const sigma = robustSigma(noiseLobe, center);
  const highQuantile = quantile(noiseLobe, 0.995);
  const thresholdMv = Math.max(center + sigmaMultiplier * sigma, highQuantile + noiseMarginMv);

  return {
    thresholdMv,
    method: "auto-sigma",
  };
}

function buildEmptyHistogram(
  noiseThresholdMv: number,
  binCount: number,
): EventSummary["histogram"] {
  return {
    binWidthMv: 1,
    minMv: noiseThresholdMv,
    counts: new Array<number>(binCount).fill(0),
  };
}

function assertIntervalSignals(
  signals: ReadonlyArray<SignalRecord>,
  startTs: number,
  endTs: number,
): void {
  for (const signal of signals) {
    if (signal.ts < startTs || signal.ts >= endTs) {
      throw new RangeError("all signals must be inside [intervalStartTs, intervalEndTs)");
    }
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}

export function buildEventSummary(
  signals: ReadonlyArray<SignalRecord>,
  params: BuildEventSummaryParams,
): EventSummary {
  const binCount = params.binCount ?? DEFAULT_HISTOGRAM_BINS;
  assertPositiveInteger(binCount, "binCount");

  if (!(params.intervalEndTs > params.intervalStartTs)) {
    throw new RangeError("intervalEndTs must be after intervalStartTs");
  }

  if (!(Number.isFinite(params.noiseThresholdMv) && params.noiseThresholdMv >= 0)) {
    throw new RangeError(
      `noiseThresholdMv must be finite and non-negative, got ${params.noiseThresholdMv}`,
    );
  }

  assertIntervalSignals(signals, params.intervalStartTs, params.intervalEndTs);

  const aboveThresholdSignals = signals.filter(
    (signal) => signal.sipmMv >= params.noiseThresholdMv,
  );
  const signalCount = params.signalCount ?? signals.length;
  const aboveThresholdCount = params.aboveThresholdCount ?? aboveThresholdSignals.length;
  assertNonNegativeInteger(signalCount, "signalCount");
  assertNonNegativeInteger(aboveThresholdCount, "aboveThresholdCount");

  const amplitudes = aboveThresholdSignals.map((signal) => signal.sipmMv);
  let histogram: EventSummary["histogram"];
  let mpvMv: number | undefined;
  if (amplitudes.length === 0) {
    histogram = buildEmptyHistogram(params.noiseThresholdMv, binCount);
  } else {
    const minMv = params.histogramMinMv ?? params.noiseThresholdMv;
    const amplitudeMax = Math.max(...amplitudes);
    const maxMv = params.histogramMaxMv ?? Math.max(amplitudeMax, minMv + 1);
    const spectrum = buildAmplitudeHistogram(amplitudes, {
      binCount,
      minMv,
      maxMv: maxMv > minMv ? maxMv : minMv + 1,
      thresholdMv: params.noiseThresholdMv,
    });

    histogram = {
      binWidthMv: spectrum.binWidthMv,
      minMv: spectrum.binEdges[0] ?? minMv,
      counts: [...spectrum.counts],
    };
    mpvMv = estimateMpv(spectrum);
  }

  const tailCutMv =
    params.tailCutMv ??
    (mpvMv === undefined
      ? Number.POSITIVE_INFINITY
      : mpvMv * (params.tailMpvMultiplier ?? DEFAULT_TAIL_MPV_MULTIPLIER));
  const tailCount = aboveThresholdSignals.filter((signal) => signal.sipmMv >= tailCutMv).length;
  const coincidenceCount = aboveThresholdSignals.filter((signal) => signal.coincident).length;

  const summaryBase = {
    detectorId: params.detectorId,
    sessionId: params.sessionId,
    intervalStartTs: params.intervalStartTs,
    intervalEndTs: params.intervalEndTs,
    signalCount,
    aboveThresholdCount,
    tailCount,
    coincidenceCount,
    noiseThresholdMv: params.noiseThresholdMv,
    histogram,
  };

  return EventSummarySchema.parse(
    mpvMv === undefined
      ? summaryBase
      : {
          ...summaryBase,
          mpvMv,
        },
  );
}
