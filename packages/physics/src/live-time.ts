/**
 * Live time and dead-time correction (THEORETICAL-FOUNDATION §4; spec 0085 FR1–FR3).
 *
 * One definition, shared with the contracts (spec 0083 FR10): for a device that reports a cumulative
 * dead-time counter, the dead time of a minute is the counter increment between the last line of
 * that minute and the last line of the previous minute, over the device-clock span between the same
 * two lines. A decrease of the counter or of the device clock is a reset — never a fraction.
 */
import type { v2 } from "@muonhub/shared";
import { provenance, type Provenance, type ResultStatus } from "./provenance.js";

type LiveSource = v2.LiveSource;

/** One counter reading: cumulative dead time (µs) and the device clock (ms) on the same line. */
export interface CounterSample {
  readonly deadTimeUs: number;
  readonly deviceTimeMs: number;
}

export interface DeadFractionResult {
  readonly status: ResultStatus;
  /** True when the counter or the device clock went backwards (a session boundary). */
  readonly reset: boolean;
  readonly deadMs?: number;
  readonly deltaDeviceMs?: number;
  readonly deadFraction?: number;
  readonly liveFraction?: number;
  readonly provenance: Provenance;
}

export function deadFractionFromCounter(
  start: CounterSample,
  end: CounterSample,
): DeadFractionResult {
  const prov = provenance("deadFractionFromCounter", {
    startDeadTimeUs: start.deadTimeUs,
    endDeadTimeUs: end.deadTimeUs,
    startDeviceTimeMs: start.deviceTimeMs,
    endDeviceTimeMs: end.deviceTimeMs,
  });
  const values = [start.deadTimeUs, end.deadTimeUs, start.deviceTimeMs, end.deviceTimeMs];
  if (values.some((v) => !Number.isFinite(v))) {
    return { status: "invalid", reset: false, provenance: prov };
  }
  if (end.deadTimeUs < start.deadTimeUs || end.deviceTimeMs <= start.deviceTimeMs) {
    return { status: "invalid", reset: true, provenance: prov };
  }
  const deadMs = (end.deadTimeUs - start.deadTimeUs) / 1000;
  const deltaDeviceMs = end.deviceTimeMs - start.deviceTimeMs;
  if (deadMs > deltaDeviceMs) {
    return { status: "invalid", reset: false, provenance: prov };
  }
  const deadFraction = deadMs / deltaDeviceMs;
  return {
    status: "ok",
    reset: false,
    deadMs,
    deltaDeviceMs,
    deadFraction,
    liveFraction: 1 - deadFraction,
    provenance: prov,
  };
}

/** liveMs of a complete minute from its dead fraction: 60 000 · (1 − f). */
export function liveMsForMinute(deadFraction: number): number {
  if (!Number.isFinite(deadFraction) || deadFraction < 0 || deadFraction >= 1) {
    throw new RangeError(`dead fraction must be in [0, 1), got ${deadFraction}`);
  }
  return 60_000 * (1 - deadFraction);
}

/** A rate in events per second with its 1σ uncertainty. */
export interface CorrectedRate {
  readonly status: ResultStatus;
  readonly liveSource: LiveSource;
  readonly rate?: number;
  readonly sigma?: number;
  readonly provenance: Provenance;
}

/** R_true = N / T_live, σ = √N / T_live (FR1). √N is marginally conservative for non-paralyzable dead time. */
export function correctRateByLiveTime(counts: number, liveMs: number): CorrectedRate {
  const prov = provenance("correctRateByLiveTime", { counts, liveMs });
  if (!Number.isInteger(counts) || counts < 0 || !Number.isFinite(liveMs) || liveMs <= 0) {
    return { status: "invalid", liveSource: "counter", provenance: prov };
  }
  const liveS = liveMs / 1000;
  return {
    status: "ok",
    liveSource: "counter",
    rate: counts / liveS,
    sigma: Math.sqrt(counts) / liveS,
    provenance: prov,
  };
}

/**
 * Fallback τ model (FR2): R_true = R / (1 − Rτ),
 * σ² = [σ_R / (1 − Rτ)²]² + [R² σ_τ / (1 − Rτ)²]². Rτ ≥ 1 → `invalid`, never a number.
 */
export function correctRateByTau(
  rate: number,
  sigmaRate: number,
  tauS: number,
  sigmaTauS = 0,
): CorrectedRate {
  const prov = provenance("correctRateByTau", { rate, sigmaRate, tauS, sigmaTauS });
  const finite = [rate, sigmaRate, tauS, sigmaTauS].every((v) => Number.isFinite(v) && v >= 0);
  if (!finite || rate * tauS >= 1) {
    return { status: "invalid", liveSource: "tau", provenance: prov };
  }
  const denom = 1 - rate * tauS;
  const d2 = denom * denom;
  const sigma = Math.hypot(sigmaRate / d2, (rate * rate * sigmaTauS) / d2);
  return { status: "ok", liveSource: "tau", rate: rate / denom, sigma, provenance: prov };
}

/** Unknown hardware (FR3): no dead-time correction; the rate is labelled `uncorrected`. */
export function uncorrectedRate(counts: number, durationMs: number): CorrectedRate {
  const prov = provenance("uncorrectedRate", { counts, durationMs });
  if (!Number.isInteger(counts) || counts < 0 || !Number.isFinite(durationMs) || durationMs <= 0) {
    return { status: "invalid", liveSource: "nominal", provenance: prov };
  }
  const s = durationMs / 1000;
  return {
    status: "uncorrected",
    liveSource: "nominal",
    rate: counts / s,
    sigma: Math.sqrt(counts) / s,
    provenance: prov,
  };
}

/** Rate of a complete minute record according to its live-time source. */
export function minuteRate(record: v2.MinuteRecord): CorrectedRate {
  if (record.liveSource === "nominal" || record.liveMs === undefined) {
    return uncorrectedRate(record.n, 60_000);
  }
  const r = correctRateByLiveTime(record.n, record.liveMs);
  return { ...r, liveSource: record.liveSource };
}
