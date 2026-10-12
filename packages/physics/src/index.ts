/**
 * @muonhub/physics
 *
 * Pure scientific calculations for charged-particle (MIP-type) data. No I/O — every function is a
 * pure transformation testable in isolation. Scientific basis: docs/science/THEORETICAL-FOUNDATION.md
 * (binding). Spec: specs/0085-physics-corrections. Every derived result carries `status` and
 * `provenance` (ADR-006).
 *
 *   Live time            : dead fraction from the cumulative counter; R = N / T_live      (§4)
 *   Barometric           : I = I₀ · exp((β/100)(P − P₀)), β in %/hPa, fitted per station (§8A)
 *   Counting statistics  : σ = √N on raw counts; hour-scale persistent deviations        (§10)
 *   Amplitude spectrum   : event-level histogram with saturation bin; Moyal MPV fit      (§6)
 */

export { PHYSICS_VERSION, provenance } from "./provenance.js";
export type { Interval, Provenance, ResultStatus } from "./provenance.js";

export {
  correctRateByLiveTime,
  correctRateByTau,
  deadFractionFromCounter,
  liveMsForMinute,
  minuteRate,
  uncorrectedRate,
} from "./live-time.js";
export type { CorrectedRate, CounterSample, DeadFractionResult } from "./live-time.js";

export { applyBarometricCorrection, betaToPercentPerHpa, fitBarometricBeta } from "./barometric.js";
export type {
  BarometricCorrectedRate,
  BarometricState,
  BetaFitOptions,
  BetaFitResult,
  HourlyPoint,
} from "./barometric.js";

export { detectHourScaleDeviations } from "./anomalies.js";
export type {
  AnomalyOptions,
  AnomalyResult,
  Baseline,
  Deviation,
  HourlyRate,
} from "./anomalies.js";

export { buildAmplitudeHistogram, fitMpv, mergeHistograms, moyalPdf } from "./spectrum.js";
export type { AmplitudeHistogram, AmplitudeUnit, Binning, MpvFit, Saturation } from "./spectrum.js";

export { suggestNoiseThreshold } from "./noise.js";
export type { NoiseOptions, ThresholdSuggestion } from "./noise.js";

export {
  countsZScore,
  effectiveSampleSize,
  poissonRelativeError,
  poissonSigma,
  robustBaseline,
  sigmaBand,
} from "./statistics.js";
export type { RobustBaseline } from "./statistics.js";

export { buildCorrectedRateInsights } from "./insights.js";
export type {
  CorrectedRateInsights,
  CorrectedRateInsightsOptions,
  InsightHour,
} from "./insights.js";

export { rateToFlux } from "./flux.js";

// First-attempt event science, kept only for the first-attempt agent until M1 step 7 removes both.
export { buildEventSummary, calibrateNoiseThreshold } from "./legacy/event-science.js";
export type {
  BuildEventSummaryParams,
  NoiseThresholdCalibration,
  NoiseThresholdCalibrationOptions,
} from "./legacy/event-science.js";
