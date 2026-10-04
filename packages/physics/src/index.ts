/**
 * @muonhub/physics
 *
 * Pure scientific calculations for cosmic-ray / MIP-type particle data.
 * NO I/O dependencies — every function is a pure transformation testable in isolation.
 * Scientific basis: docs/science/THEORETICAL-FOUNDATION.md (binding). Spec: specs/0005-physics.
 *
 *   Dead-time correction : R_real = R_measured / (1 − R_measured × τ_DT)        (§4)
 *   Barometric correction: I(P) = I₀ · e^(β · (P − P₀)), β fitted per station   (§8A)
 *   Counting statistics  : σ = √N on raw counts; empirical robust baselines     (§10)
 *   Amplitude spectrum   : histogram + Landau MPV (~2 MeV MIP deposit)          (§6)
 */

export {
  correctDeadTime,
  correctDeadTimeForHardware,
  correctDeadTimeFromPercent,
  deadTimeLossFraction,
} from "./deadTime.js";

export { fitBarometricBeta, applyBarometricCorrection, betaToPercentPerHpa } from "./barometric.js";
export type { BarometricFit, RatePressurePoint } from "./barometric.js";

export {
  poissonSigma,
  poissonRelativeError,
  sigmaBand,
  countsZScore,
  robustBaseline,
} from "./statistics.js";
export type { RobustBaseline } from "./statistics.js";

export { buildAmplitudeHistogram, estimateMpv } from "./spectrum.js";
export type { AmplitudeHistogram, HistogramOptions } from "./spectrum.js";

export { buildEventSummary, calibrateNoiseThreshold } from "./event-science.js";
export type {
  BuildEventSummaryParams,
  NoiseThresholdCalibration,
  NoiseThresholdCalibrationOptions,
} from "./event-science.js";

export { DEFAULT_BETA_MIN_POINTS, buildCorrectedRateInsights } from "./insights.js";
export type {
  AnomalyFlag,
  BetaReadout,
  CorrectedRateInsights,
  CorrectedRateInsightsOptions,
  CorrectedRatePoint,
} from "./insights.js";

export { rateToFlux } from "./flux.js";
