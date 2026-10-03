# 0005 — Physics package (scientific corrections and statistics)

> **Superseded (2026-10-03):** first v6 attempt, kept as a historical record. The v6 rebuild
> replaces this work — see [`specs/README.md`](../README.md) and [`docs/product/ROADMAP.md`](../../docs/product/ROADMAP.md).

- **Status:** implemented (this PR)
- **Responsible:** Adjutant (spec + implementation) — physics lane
- **Depends on:** 0003 (shared contracts: `MinuteRecord`, `HardwareVersion`, `DEAD_TIME_TAU_S`);
  `docs/research/THEORETICAL-FOUNDATION.md` §4, §6, §8A, §10 (binding scientific basis)
- **Phase:** F1 · **Epic:** EPIC-1 · **Backlog:** S04 (pre-renumbering)

## Context

`packages/physics` is the pure scientific core of the platform: every correction applied to
detector data before it is displayed, stored as a derived field (`ecDt`, `ecCorr`, `flux`), or
consumed by the future ML layer. The package has **no I/O and no SDK dependencies** — every
function is a pure, deterministic transformation, individually testable against reference values
from the theoretical foundation. Numeric tests are mandatory for this package (CLAUDE.md map).

Scientific requirements come from `THEORETICAL-FOUNDATION.md` and may not be contradicted:

- **Dead-time correction is mandatory** (§4): the measured rate underestimates the real rate;
  non-paralyzable model `R_real = R_measured / (1 − R_measured·τ_DT)`, with τ_DT per hardware
  generation (v2 ≈ 50 ms, v3X ≈ 400 µs — `DEAD_TIME_TAU_S` in `@munhub/shared`).
- **Barometric β is local, never universal** (§8A): `I(P) = I₀·e^{β(P−P₀)}`; β is obtained by
  linear regression of `ln(I/I₀)` against `(P−P₀)` over each station's own history. Documented
  surface-muon range: ≈ −0.085 to −0.24 %/hPa.
- **Amplitude spectrum** (§6): histogram of SiPM amplitudes with a sub-threshold noise region,
  a Landau bulk whose **MPV** corresponds to the ~2 MeV MIP deposit, and a high-amplitude tail.
- **Poisson statistics** (§10): σ ≈ √N on raw counts; minute windows are noisy (~1.6% at
  N≈3600); anomalies are defined at ≥3σ on corrected rates over long windows; baselines are
  empirical (robust median/IQR over quiet history), never a-priori formulas.

## Functional requirements

- FR1 **Dead time** — non-paralyzable correction from a rate and τ (seconds), a hardware-version
  convenience using `DEAD_TIME_TAU_S`, a correction from the recorded `dt` percent field, and the
  loss fraction. Saturated inputs (`R·τ ≥ 1`) are rejected with a `RangeError`, never silently
  clamped.
- FR2 **Barometric** — `fitBarometricBeta(points)` performs the least-squares regression on
  `ln(I/Ī)` vs `(P−P̄)` and reports β (1/hPa), β as %/hPa, the reference pressure/rate, `r²`, and
  the sample count; `applyBarometricCorrection` normalizes a rate to the reference pressure.
  Points with non-positive rates are excluded from the fit (log domain).
- FR3 **Statistics** — `poissonSigma`, `poissonRelativeError` (√N on **counts**, per guardrail 5),
  `sigmaBand(expected, k)`, `countsZScore`, and `robustBaseline(values)` (median + IQR with
  Tukey-style normal bounds) for empirical per-detector "normal" ranges.
- FR4 **Spectrum** — `buildAmplitudeHistogram(amplitudesMv, options)` with explicit bin control
  and an optional sub-threshold cut; `estimateMpv(histogram)` returns the most-probable value
  with parabolic (3-point) peak interpolation.
- FR5 **Flux** — `rateToFlux(ratePerMin, effectiveAreaCm2)` → particles/cm²/min (the `flux`
  derived field), defined only for a positive area.
- FR6 All functions validate their numeric domain (finite, non-negative where physical) and throw
  `RangeError` with a descriptive message on violation — garbage in is rejected at the boundary,
  consistent with the zod-at-boundaries doctrine.

## Non-functional

- Pure ESM module; **only** `@munhub/shared` may be imported. No I/O, no Date.now, no randomness.
- Strict TypeScript, no `any`.
- **Numeric tests against reference values** from the foundation (see acceptance criteria) and a
  coverage hard-gate ≥ 80% (statements/branches/functions/lines) enforced by vitest — this
  activates the quality gate announced in `docs/STATUS.md`.
- Scientific wording: rates are "charged-particle / MIP-type" rates; "muon" appears only in
  aggregate-inference commentary, never in event-level naming.

## Design / approach

```
src/deadTime.ts    correctDeadTime, correctDeadTimeForHardware, correctDeadTimeFromPercent,
                   deadTimeLossFraction
src/barometric.ts  fitBarometricBeta, applyBarometricCorrection, BarometricFit
src/statistics.ts  poissonSigma, poissonRelativeError, sigmaBand, countsZScore, robustBaseline
src/spectrum.ts    buildAmplitudeHistogram, estimateMpv, AmplitudeHistogram
src/flux.ts        rateToFlux
src/index.ts       barrel (replaces the stub)
```

Unit conventions (documented on every signature): rates in counts/min (`ec` semantics), τ in
seconds, pressure in hPa, amplitudes in mV, β in 1/hPa (helpers expose %/hPa).

## Acceptance criteria (verifiable)

- [x] CA1: dead-time reference — `R = 30/min`, τ = 50 ms (v2) → `R_real = 30.769…/min`
  (loss fraction 0.025); v3X correction at the same rate is < 0.02%; `R·τ ≥ 1` throws.
- [x] CA2: barometric reference — synthetic series generated with β in the documented range
  (−0.24 %/hPa) is recovered by `fitBarometricBeta` to ≤ 1e-9 (noiseless) with `r² ≈ 1`, and the
  applied correction flattens the series back to I₀; fitted β lands inside −0.085…−0.30 %/hPa
  for in-range synthetic data.
- [x] CA3: Poisson reference — N = 3600 → σ = 60, relative error ≈ 1.67%; 3σ band and z-scores
  consistent; `robustBaseline` reproduces median/IQR on a known sample.
- [x] CA4: spectrum — MPV estimate recovers the known mode of a synthetic asymmetric
  (Landau-like) sample within one bin width; sub-threshold cut excludes noise bins.
- [x] CA5: coverage gate ≥ 80% active and green; `pnpm build && pnpm test && pnpm lint &&
  pnpm typecheck` green across the workspace.
- [x] CA6: only `packages/physics` (+ spec, docs matrix, changelog fragment) touched; the only
  import in `src/` from outside the package is `@munhub/shared`.

## Out of scope

- Thermal correction (§8B — needs vertical atmospheric profiles; future spec).
- Wiring corrections into ingestion/dashboards (`ecDt`/`ecCorr` writers — later specs).
- Anomaly *detection* pipelines (Insights v0 / services/ai — WP-09 and `planning/06`).
- Coincidence-mode statistics beyond what `cc` already carries.

## Tasks

- [x] T1: dead-time module + numeric tests.
- [x] T2: barometric regression + correction + numeric tests.
- [x] T3: Poisson statistics + robust baseline + tests.
- [x] T4: amplitude histogram + MPV + tests.
- [x] T5: flux + tests; barrel export replacing the stub.
- [x] T6: coverage gate (≥80%) in vitest config; workspace green.
- [x] T7: docs matrix (architecture note, STATUS row) + changelog fragment — D42.
