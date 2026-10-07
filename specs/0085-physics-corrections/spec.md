# 0085 — Physics corrections

- **Status:** approved (2026-10-07)
- **Milestone:** M1 — Core + Agent (version range `6.0.0-alpha.1.x`)
- **Owner:** Adjutant writes and implements; the `physicist` reviewer is **mandatory** (veto over
  incorrect scientific claims); `code-reviewer` reviews the code.
- **Depends on:** spec 0083 (contracts and data model v2 — input shapes; field names in this spec
  follow 0083), ADR-006 (rules 7–9), `docs/science/THEORETICAL-FOUNDATION.md`,
  `docs/science/SERIAL-FORMATS.md`. Backlog: B-M1-03, 08, 09, 10, 11, 12, 35.

## Context

The first-attempt `packages/physics` has known scientific defects, verified in the 2026-10-02 audit
and the 2026-10-03 physicist review (`docs/audit/2026-10-02-V6-RESET-SESSION-RECORD.md` §4.3,
`docs/product/BACKLOG.md` M1):

- dead time is parsed from a cumulative counter as if it were an instantaneous percentage, and the
  "unknown hardware" fallback (τ = 50 ms) can make corrections negative or infinite;
- the barometric β is accepted after 168 minute points (one week counted in hours) and is applied
  even when it is statistically noise;
- anomalies are flagged per minute, against the foundation's hour-scale ≥ 3σ persistence rule;
- the "Landau spectrum" is built from per-minute min/avg/max, and `Math.max(...array)` crashes on
  large event arrays;
- the noise auto-calibration classifies almost every real event as noise and drops it at the source.

This spec rewrites those functions as pure, numerically tested code and applies the foundation's
erratum and amendments. It is **not** about storage, ingest, or UI: it consumes canonical records and
event summaries (0083) and returns derived values with provenance.

**Established behavior that this spec keeps (WORKFLOW §4):** only complete minutes are recorded —
partial first/last minutes are discarded, as in v5 (ADR-006 rule 7; SERIAL-FORMATS §4). The physics
never assumes a partial minute exists; a minute is either complete or absent.

## Functional requirements

- **FR1 — Measured live time (one definition, shared with spec 0083 FR10).** For a device with a
  cumulative dead-time counter, per minute: `deadMs` = D(last line of this minute) − D(last line of
  the previous minute); Δt_device = the device-clock span between the same two lines; dead fraction
  f = deadMs / Δt_device (never a mean of per-line ratios); `liveMs` = 60 000 · (1 − f);
  `liveSource: "counter"`. A decrease of the counter or of the device clock is a **reset**: it is
  reported as a session boundary, never folded into a fraction, and a reset inside a minute
  invalidates that minute (discarded and counted, like a partial minute). Corrected rate
  R_true = N / T_live with σ(R_true) = √N / T_live. √N is slightly conservative for non-paralyzable
  dead time (counts are marginally sub-Poisson); the difference is negligible at nτ ≈ 10⁻³.
- **FR2 — τ model only as a fallback** (`liveSource: "tau"`). When a device type declares no
  dead-time counter but a documented τ: R_true = R/(1 − Rτ), with R the measured rate and
  σ²(R_true) = [σ_R/(1 − Rτ)²]² + [R²σ_τ/(1 − Rτ)²]² (both terms use (1 − Rτ)²). Known answer:
  R = 2.4 s⁻¹, τ = 400 µs → R_true = 2.40231 s⁻¹. If Rτ ≥ 1 the result is an explicit `invalid`
  status, never a negative or infinite number.
- **FR3 — Unknown hardware** (`liveSource: "nominal"`). No dead-time correction; `liveMs` is
  absent and the result is labelled `uncorrected` (never treated as zero dead time). (An
  assumed 50 ms at ≈ 2.4 s⁻¹ would inflate a true ≈ 0.4 ms device's rate by ≈ 13.5 %.)
- **FR4 — Barometric β.** β is expressed in **%/hPa** everywhere; the model is written explicitly
  as I = I₀ · exp((β/100)(P − P₀)) (same expression in spec 0086). Fit on hourly bins (counts and
  live time per hour) with the device temperature as a covariate — an **instrument** covariate (SiPM
  gain, electronics), not the atmospheric thermal effect; σ_β corrected for autocorrelation
  (effective sample size). Minimums before a fit is attempted *(Proposed)*: data span ≥ 7 days and
  hourly pressure standard deviation ≥ 0.8 hPa. Apply β only if |β|/σ_β ≥ 3; reject a β with the
  wrong sign or outside the plausible range; exclude outlier hours (robust, documented rule);
  P₀ = the station's own long-term mean pressure over the fit period (never 730 hPa, never a single
  reading). `applyBarometricCorrection` propagates σ_β: the corrected rate's uncertainty adds
  σ_β/100 · |P − P₀| · R in quadrature. The result always reports β, σ_β, P₀, the period, the number
  of hours, and whether it was applied.
- **FR5 — Anomalies.** Deviations are evaluated only on hour-scale windows of the corrected rate,
  requiring ≥ 3σ **and** persistence over a configured number of consecutive windows; never per
  minute. σ combines the window's Poisson term (√N), the baseline's own uncertainty, and an
  empirical overdispersion term estimated from the residuals (uncorrected pressure/temperature
  residuals are autocorrelated, so √N alone underestimates the false-alarm rate). The result
  documents the expected look-elsewhere false-alarm rate per year of hourly windows for the chosen
  threshold and persistence.
- **FR6 — Amplitude spectrum and MPV.** Built only from event-level amplitudes or from event-level
  histograms in hourly summaries (0083), never from per-minute min/avg/max; fixed binning declared
  by the device type; events at or above the device type's `saturation` level (a value with its unit:
  mV or ADC counts, per 0083) counted only in an explicit saturation bin, never also in the last
  regular bin; MPV from a Landau/Moyal-type fit around the peak with an uncertainty; no spread of
  large arrays into function arguments (`Math.max(...a)` and similar are forbidden).
- **FR7 — Noise threshold as a suggestion.** The noise routine returns a proposed threshold with its
  diagnostics; it never removes events. Applying a threshold is a recipe step on stored data
  (ADR-006), chosen by the user.
- **FR8 — Foundation erratum and amendments** in `docs/science/THEORETICAL-FOUNDATION.md`:
  - §8A: the linear form becomes `ln(I/I₀) = β(P − P₀)` (remove the erratum warning); table labels
    corrected (Jeddah, 21.5° N, is not equatorial; Marambio, 64° S, is not the South Pole).
  - §4: `dt` becomes the measured dead fraction f = Δdead/Δt, with R/(1 − f); the τ model is a
    fallback.
  - §10 and §0 item 4: the noise example uses this hardware (25 cm² device at ≈ 2.4 s⁻¹ ≈ 144
    counts/min → ≈ 8.3 % per minute, ≈ 1.08 % per hour, ≈ 11.6 h to reach 100k counts); "N ≥ 100k →
    < 0.3 %" becomes ≈ 0.32 %.
  - §0 / §8D: altitude-dependent factors are stated per station (at 768 hPa the hadronic factor is
    ≈ 4.0–6.7× instead of 5–9× at 730 hPa).

## Non-functional requirements

- Pure TypeScript, no I/O, no dependencies beyond `@muonhub/shared` types; deterministic; strict
  types, no `any`.
- Every public function has known-answer numeric tests; coverage gate ≥ 80 % (statements, branches,
  functions, lines) stays.
- Large arrays processed with loops or reductions (works for ≥ 10⁶ events).
- **Free-tier budget (ADR-005):** none (pure computation).
- **Security (ADR-009):** none (no input from outside the process; inputs are already validated by
  0083 schemas at the boundary).

## Data integrity (ADR-006)

Consumes canonical records (layer 1) and returns **derived** values (layer 2). Every derived result
carries its provenance: the function/version that produced it, the inputs' interval, and the
parameters used (τ source, β with σ_β and P₀, threshold, binning). Nothing is written back to
canonical or raw data. Absent quantities (e.g. no barometer) yield "not computable", never a value
computed from 0. Partial minutes do not exist in the inputs (rule 7).

## Design / approach

Package `packages/physics` (rewrite; first-attempt files are replaced as listed).

| File | Functions (signatures, Proposed names) | Fate of first-attempt code |
|---|---|---|
| `src/live-time.ts` (new) | `deadFractionFromCounter(start: CounterSample, end: CounterSample): DeadFractionResult` · `correctRateByLiveTime(counts: number, liveMs: number): CorrectedRate` · `correctRateByTau(rate: number, tauS: number, sigmaTauS?: number): CorrectedRate` | replaces `deadTime.ts` (`correctDeadTimeFromPercent`, `correctDeadTimeForHardware`, `deadTimeLossFraction` removed) |
| `src/barometric.ts` (rewrite) | `fitBarometricBeta(hours: readonly HourlyPoint[], opts: BetaFitOptions): BetaFitResult` · `applyBarometricCorrection(rate: CorrectedRate, pressureHpa: number, fit: BetaFitResult): CorrectedRate` | keeps `betaToPercentPerHpa`; regression rewritten (covariate, autocorrelation, gate) |
| `src/anomalies.ts` (new) | `detectHourScaleDeviations(windows: readonly HourlyRate[], baseline: RobustBaseline, opts: AnomalyOptions): Deviation[]` | replaces the per-minute flags in `insights.ts` |
| `src/spectrum.ts` (rewrite) | `buildAmplitudeHistogram(amplitudes: Iterable<number>, binning: Binning, saturation: { value: number; unit: "mV" \| "adc" }): AmplitudeHistogram` · `mergeHistograms(hs: readonly AmplitudeHistogram[]): AmplitudeHistogram` · `fitMpv(h: AmplitudeHistogram): MpvFit` | `estimateMpv` (argmax) removed |
| `src/noise.ts` (new) | `suggestNoiseThreshold(amplitudes: Iterable<number>, opts): ThresholdSuggestion` | replaces `calibrateNoiseThreshold` and the filtering in `event-science.ts` |
| `src/statistics.ts` | keeps `poissonSigma`, `poissonRelativeError`, `countsZScore`, `robustBaseline`; adds `effectiveSampleSize(series: readonly number[]): number` | kept |
| `src/flux.ts` | keeps `rateToFlux` (area from device geometry, 0083) | kept |
| `src/insights.ts` | rebuilt on the functions above; `DEFAULT_BETA_MIN_POINTS = 168` removed | rewritten |
| `src/provenance.ts` (new) | `type Provenance = { fn: string; version: string; params: Record<string, unknown>; interval: … }` | new |

Every result type includes `status: "ok" | "uncorrected" | "not-computable" | "invalid"` and a
`provenance` field. Exact input field names follow spec 0083.

**Proposed** (to be confirmed in review): the outlier rule for β (median ± 5 MAD on hourly
residuals), the default persistence for anomalies (3 consecutive hourly windows), the plausible β
range (−0.4 to 0 %/hPa), and the Moyal function for the MPV fit.

### Known-answer tests (numbers checked by the physicist review, 2026-10-03)

| Test | Input | Expected |
|---|---|---|
| per-minute noise | R = 2.4 s⁻¹, 60 s | N ≈ 144, σ/N ≈ 8.3 % |
| per-hour noise | R = 2.4 s⁻¹, 3600 s | σ/N ≈ 1.08 % |
| time to 100k counts | R = 2.4 s⁻¹ | ≈ 11.6 h; σ/N ≈ 0.32 % |
| wrong τ inflation | R = 2.4 s⁻¹, τ_assumed = 50 ms vs τ_true = 0.4 ms | inflation ≈ 13.5 % |
| Rτ ≥ 1 | R = 30 s⁻¹, τ = 50 ms | status `invalid`, no number |
| cumulative counter | D: 46,000 → 52,000 µs over 60 s device time | dead fraction 1.0 × 10⁻⁴ |
| counter reset | D decreases | reset reported, no fraction |
| σ by live time | N = 144, T_live = 59.9 s | σ(R) = 12/59.9 s⁻¹ |
| τ model | R = 2.4 s⁻¹, τ = 400 µs | R_true = 2.40231 s⁻¹ |
| reset inside a minute | counter decreases mid-minute | minute invalid (discarded, counted) |
| nominal live time | device type with no counter and no τ | status `uncorrected`, no `liveMs` |
| β recovery | fixed seed; 90 days of synthetic hours, β = −0.12 %/hPa, pressure = ±1.5 hPa semidiurnal tide + synoptic noise (σ 1 hPa), temperature drift, AR(1) noise | β within 2σ_β; \|β\|/σ_β ≥ 3; applied |
| β gate | same seed and pressure series, one week | \|β\|/σ_β ≈ 1.6 (σ_β ≈ 0.075 %/hPa); not applied |
| β propagation | β = −0.12 ± 0.02 %/hPa, P − P₀ = 5 hPa, R = 2.4 s⁻¹ | added σ = 0.02/100 · 5 · 2.4 = 2.4 × 10⁻³ s⁻¹ |
| P₀ | hourly pressures around 768 hPa | P₀ = mean of the fit period, not 730 |
| altitude | 767.85 hPa | ISA 2,278 m; tropical ≈ 2,350–2,375 m (documentation check) |
| hadronic factor | 5–9× at 730 hPa scaled to 768 hPa | ≈ 4.0–6.7× (documentation check) |
| spectrum scale | 10⁶ amplitudes | no exception; counts sum to 10⁶ including the saturation bin |
| MPV (consistency) | Moyal sample, noise = 0, known MPV | fitted MPV within its uncertainty (circular by construction: Moyal fit on Moyal data) |
| MPV (robustness) | Landau sample (numerical inverse CDF), noise = 0 | fitted MPV within 3 % of the Landau MPV; the bias of the Moyal approximation is documented |
| anomaly persistence | one 4σ hour | no deviation; 3 consecutive 4σ hours → one deviation |
| anomaly overdispersion | residuals with AR(1) correlation | σ includes the overdispersion term; false-alarm rate per year reported |
| noise suggestion | triggered stream without a noise lobe | a suggestion is returned and **no event is removed** |

## Acceptance criteria (verifiable)

- [ ] CA1: every known-answer test in the table above exists by name in `packages/physics/src/*.test.ts` and passes.
- [ ] CA2: `grep -rnE "Math\.(max|min)\(\.\.\." packages/physics/src` returns nothing.
- [ ] CA3: `grep -rn "DEFAULT_BETA_MIN_POINTS\|correctDeadTimeFromPercent\|calibrateNoiseThreshold\|estimateMpv" packages/physics/src` returns nothing.
- [ ] CA4: no function in `packages/physics` returns or removes a subset of input events (test: suggestion routines return the input count unchanged).
- [ ] CA5: every exported result type has `status` and `provenance` (typecheck + a type-level test).
- [ ] CA6: physics coverage ≥ 80 % on statements, branches, functions, lines (`pnpm --filter @muonhub/physics test`).
- [ ] CA7: `THEORETICAL-FOUNDATION.md` §8A reads `ln(I/I₀) = β(P−P₀)` and the erratum warning is gone; §4, §10, §0, §8D amendments present (grep for "0.32", "8.3", "4.0–6.7").
- [ ] CA8: the `physicist` reviewer returns APPROVE (or WARNING with every finding resolved).
- [ ] CA9: typecheck · lint · build · test green.
- [ ] CA10: only `packages/physics/**`, `docs/science/THEORETICAL-FOUNDATION.md`, docs of the matrix, and `changelog.d/` are touched.

## Validation in practice

During the M1 72-hour run, the hourly corrected rates of the real CosmicWatch are computed from the
uploaded canonical records and compared with the same quantities recomputed from the agent's local
raw log: identical counts and live times per hour. The dead fraction from the real MuNRa counter (once
its unit is confirmed by the step-9 capture) must be plausible (≪ 1, non-decreasing counter within a
session). β is reported but **not applied** (72 h is far below the significance needed); the report
shows σ_β. Results recorded in the M1 Stage Report.

## Out of scope

Comparison statistics, coincidences, accidental-rate estimation (M3); thermal correction (no data
source yet); ML corrections (after 6.0.0); UI for recipes (M3); simulator (spec 0086).

## Tasks

- [ ] T1: write the known-answer tests first (table above).
- [ ] T2: `live-time.ts`, remove `deadTime.ts`.
- [ ] T3: rewrite `barometric.ts` (covariate, effective sample size, gate, P₀).
- [ ] T4: `anomalies.ts`; rebuild `insights.ts`.
- [ ] T5: rewrite `spectrum.ts` (fixed binning, saturation bin, Moyal fit).
- [ ] T6: `noise.ts` (suggestion only); remove filtering from `event-science.ts`.
- [ ] T7: `provenance.ts` and `status` on every result.
- [ ] T8: foundation erratum and amendments (FR8); physicist review.
- [ ] T9: update the affected documentation (documentation matrix in `AGENTS.md`).
- [ ] T10: changelog fragment in `changelog.d/`.
