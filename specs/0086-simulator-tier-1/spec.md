# 0086 — Simulator tier 1 (`@muonhub/simulator`): synthetic event streams and a virtual detector

- **Status:** approved (2026-10-07)
- **Milestone:** M1 — Core + Agent (version range `6.0.0-alpha.1.x`)
- **Owner:** Adjutant (spec) · implementation lane: `packages/simulator` · review: `physicist`
  (science), `code-reviewer`
- **Depends on:** ADR-004 (terminology), ADR-006 (data integrity), spec 0083 (contracts v2 — device
  type definitions), spec 0087 (agent — adopts the `LineSource` interface defined here),
  `docs/science/SERIAL-FORMATS.md`, `docs/science/RESEARCH-NOTES-2026-10.md` (simulation tiers),
  backlog B-M1-13

## Context

MuonHub needs realistic data before and beside real hardware: to test the agent end to end without
a CosmicWatch attached, to test coincidence and comparison tooling (M3) against **known answers**,
and to provide demo data. The research notes propose three tiers; this spec is **tier 1**: a pure
TypeScript analytic generator in the repository. Tier 2 (EcoMug/CRY) and tier 3 (PUMAS/Geant4) are
offline tools for later milestones.

It is deliberately **not** a physics simulation of particle transport or detector response: it
produces statistically correct event streams from parametrised models, so that software can be
checked against inputs whose true values are known. Everything it generates is labelled synthetic
and never mixed with real data.

## Functional requirements

- **FR1 — Deterministic randomness.** A seeded PRNG (documented algorithm, e.g. xoshiro128** or
  PCG32 — chosen and named in the implementation) drives everything. The same seed and configuration
  produce byte-identical output on every platform.
- **FR2 — Event arrival.** Events arrive as a Poisson process (exponential inter-arrival times) with
  an instantaneous true rate `R(t)` built from:
  - a **base rate** for the device: active area × integrated flux. The flux model is analytic:
    `I(θ) = I_v · cos²θ` (default) or the Guan et al. (2015) modification of the Gaisser formula
    (optional), integrated over the acceptance of a flat horizontal device. For cos²θ the closed form
    is **R = A · I_v · π/2** (A in cm², I_v in cm⁻² s⁻¹ sr⁻¹). A muon-only flux gives only ≈ 0.3–0.4 s⁻¹
    for a 25 cm² device, so the base rate may also be given directly as a **total trigger rate**
    (MIP-type charged particles, gammas, and noise triggers — never "muon flux"), e.g. ≈ 2.4 s⁻¹ for
    the USFQ CosmicWatch;
  - an **altitude/pressure modulation** written explicitly as `R = R₀ · exp((β/100) · (P − P₀))`
    with β in %/hPa (negative), the same expression as spec 0085 and a pressure time series (constant, semidiurnal 12-hour tide plus noise, or supplied
    samples);
  - optional **diurnal** modulation (amplitude, phase) and **Forbush-like dips** (onset time, depth
    in %, recovery time constant);
  - optional **temperature** series (for the β-fit covariate tests of spec 0085).
- **FR3 — Amplitudes.** Each true event gets a deposited-energy-like amplitude from a Landau-like
  distribution. **The Moyal approximation of the Landau distribution is used** (closed form; adequate
  for tier 1 — stated in the code and docs), with configurable MPV and width in device units (mV or
  ADC counts), plus Gaussian electronic noise and a **saturation** level `{ value, unit }` (values at
  or above it are clipped and flagged in the ground truth, mirroring real saturation; downstream
  histograms count them only in the saturation bin, never also in the last regular bin).
- **FR4 — Noise triggers.** Optional uncorrelated noise triggers (dark counts above threshold) at a
  configurable rate with their own amplitude distribution, marked as noise in the ground truth. Noise
  triggers go through the **same dead-time process** as real events (they occupy the electronics).
- **FR5 — Dead time.** A **non-paralyzable** dead time τ per device: events arriving within τ after a
  recorded event are lost and counted in the ground truth as lost. The device reports dead time as a
  **cumulative counter** whose unit and scale are configurable (FR8).
- **FR6 — Device clock.** Each device has its own clock: start offset, linear drift (ppm), jitter
  (per-line random error), and a configurable counter width with **rollover** (e.g. `millis()`
  32-bit unsigned at ≈ 49.7 days). Host reception time is generated separately (true time + USB
  latency model with configurable mean and jitter, can exceed 10 ms), so timing pipelines can be
  tested against both clocks.
- **FR7 — Interruptions.** Scheduled **gaps** (no lines for an interval — power or USB loss) and
  **resets** (event counter, device clock, and cumulative dead time restart from 0 → the agent must
  open a new session). Optional malformed lines: truncated line, two records concatenated on one line
  (the `COSMIC`+digit case), CRLF endings, invalid UTF-8 byte.
- **FR8 — Device-type output.** Generated events are rendered as serial lines of a chosen device type:
  - **CosmicWatch v3X (official order):** `Event, Timestamp[s], Flag(coinc 0/1), ADC[12b], SiPM[mV],
    Deadtime[s] (cumulative), Temp[C], Press[Pa]` (accelerometer/gyroscope columns optional zeros);
  - **MuNRa variant (USFQ):** `Event TimeStamp[ms] ADC1 ADC2 SiPM[mV] Pressure[Pa] Temp[C]
    DeadTime[us] Coincident COSMIC`, including the header line it prints at start-up.
  - Because the meaning and unit of the MuNRa dead-time column are **unverified** (SERIAL-FORMATS §2,
    backlog B-M1-10), the dead-time column semantics are a configuration option: cumulative in µs,
    ms, or s, or per-event. The default is cumulative µs and is labelled "assumption until the
    capture of M1 step 9".
  - Rendering uses the device-type definition shapes of spec 0083 where they exist; until then a
    local renderer table with the same field names.
- **FR9 — Multiple devices and coincidences.** N devices in a stacked assembly (vertical separation,
  active areas). A configurable **true-coincidence fraction** of events crosses two or more devices
  (with per-device detection efficiency) and produces lines on each with correlated true times;
  every device also has independent singles. The **true-coincidence fraction** is defined as the
  fraction of true events recorded by the upper device that also cross the lower device (geometric
  acceptance × efficiency of the partner). The hardware coincidence flag is set when a partner device
  recorded an event within the hardware window, specified as a **half-window τ_c** (an event at
  |Δt| ≤ τ_c counts; default τ_c ≈ 30 µs per the v2 paper — the v3X/MuNRa window is unverified,
  configurable). Accidentals arise naturally from the singles; the expected accidental rate is
  2 · τ_c · R₁ · R₂ with R₁, R₂ the **recorded** (post-dead-time) singles rates — ≈ 3.5 × 10⁻⁴ s⁻¹ at
  2.4 s⁻¹ and τ_c = 30 µs (≈ 90 in 72 h).
- **FR10 — Ground truth.** Alongside the lines, the generator emits a ground-truth record per event:
  true time, true amplitude, noise flag, saturation flag, lost-to-dead-time flag, coincidence group
  id, and per-interval true rate, `liveMs`, and `pressureHpa` (names as in spec 0083) — so tests can
  compare what software recovers with what was planted.
- **FR11 — `LineSource` interface and virtual detector.** The package defines

  ```ts
  export interface SourceLine {
    readonly bytes: Uint8Array;        // exactly what a serial port would deliver (may be a fragment)
    readonly hostReceivedAtMs: number; // host clock at reception
  }
  export interface LineSource extends AsyncIterable<SourceLine> {
    close(): Promise<void>;
  }
  ```

  and `createVirtualDetector(config): LineSource`, which yields the rendered stream either **as fast
  as possible** (tests) or **paced in real time** (scaled by a speed factor) for live runs. Spec 0087
  adopts `LineSource` as the agent's input interface, so the agent cannot tell a virtual detector
  from a serial port.
- **FR12 — Scenario presets.** Named presets: `usfq-cosmicwatch-munra` (≈ 2.4 s⁻¹ **total trigger
  rate** — MIP-type, gammas, noise; not a muon flux — ≈ 768 hPa reference, β = −0.12 %/hPa — the β value is a tunable assumption, not a measurement),
  `stacked-pair` (two devices, coincidences), `disruptions` (gaps, reset, malformed lines),
  `forbush` (a 3 % dip over 24 h).

## Non-functional requirements

- **Pure TypeScript, no I/O.** No file, network, serial, or timer access in the core; real-time pacing
  takes an injectable clock/sleep function. Runs in Node and the browser.
- Strict typing (`tsconfig.base.json`), zod validation of configurations at the public boundary,
  no `any`; ESM; tests with vitest; coverage ≥ 80 % like `packages/physics`.
- Performance: ≥ 1 million events per second-of-CPU in fast mode on the development laptop, so 72 h
  of a 2.4 s⁻¹ device (≈ 620k events) generates in about a second.
- **Free-tier budget (ADR-005):** none — local only. When the agent runs a virtual detector against
  `muonhub-dev`, the quota cost is that of the agent, not of this package.
- **Security (ADR-009):** none — no credentials, no network, no untrusted input except configuration
  (validated).

## Data integrity (ADR-006)

The simulator produces **layer-0-like raw lines** for tests. All generated data is **synthetic**:
the virtual detector identifies itself (header comment line and a `synthetic: true` flag the agent
propagates into session metadata per spec 0087), and synthetic streams are only ever written to
`muonhub-dev` or local test stores, never to `muonhub`. Nothing real is altered.

## Design / approach

```
packages/simulator/
  package.json            @muonhub/simulator; deps: zod (catalog version), @muonhub/shared (types)
  src/
    rng.ts                seeded PRNG + distributions (uniform, exponential, normal, exact Moyal)
    flux.ts               cos²θ and Guan/Gaisser models; base rate from area/acceptance
    modulation.ts         pressure (β), diurnal, Forbush, temperature series
    device.ts             per-device process: arrivals, dead time, amplitudes, noise, saturation
    clock.ts              device clock (offset, drift, jitter, rollover) and host latency model
    assembly.ts           N stacked devices, coincidence groups, hardware coincidence flag
    disruptions.ts        gaps, resets, malformed-line injection
    render/
      cosmicwatch-v3x.ts  official order
      munra.ts            USFQ variant (configurable dead-time semantics, header line)
    ground-truth.ts       per-event and per-interval truth records
    line-source.ts        SourceLine, LineSource, createVirtualDetector (fast / paced)
    presets.ts            named scenarios
    index.ts
  src/*.test.ts           unit + known-answer tests
```

The Moyal density `f(λ) = exp(−(λ + e^(−λ))/2)/√(2π)` with `λ = (x − MPV)/width` is sampled
**exactly**: if Z ~ N(0, 1) then λ = −ln(Z²) (because e^(−λ) follows χ²₁); equivalently
λ = −2 ln(√2 · erfc⁻¹(u)) with u uniform. No table or rejection step.

## Acceptance criteria (verifiable)

- [ ] CA1: same seed + config → identical output (`toEqual` on 10⁵ lines across two runs; a stored
  hash of a reference scenario matches in CI).
- [ ] CA2: Poisson arrivals — for a constant true rate, the measured rate over 10⁶ events is within
  3σ of the input; the inter-arrival distribution passes a KS test vs exponential (p > 0.01).
- [ ] CA3: dead time — for n·τ ∈ {0.001, 0.05, 0.2} the measured **loss fraction** (n − m)/n is within
  3σ of the expected nτ/(1 + nτ), with N = 10⁷ true events per case (≈ 10⁴ lost events at nτ = 0.001,
  so the case actually tests the loss); the cumulative dead-time column divided by elapsed device time
  equals the ground-truth dead fraction within 3σ.
- [ ] CA4: pressure modulation — with a fixed seed and a fixed pressure series (±1.5 hPa semidiurnal tide
  plus synoptic noise σ = 1 hPa), fitting `ln R` vs `P` on hourly bins of a 60-day generated series
  recovers the input β within 3 σ_β (σ_β from the fit); the same series is shared with spec 0085's β
  tests.
- [ ] CA4b: base rate — `R = A · I_v · π/2`: A = 25 cm², I_v = 0.0070 cm⁻² s⁻¹ sr⁻¹ → 0.2749 s⁻¹
  (±0.1 %), and a generated run reproduces it within 3σ.
- [ ] CA5: amplitudes — with **noise = 0** (Gaussian noise convolved with the asymmetric Moyal shifts the
  mode), a local fit of the peak of 10⁶ events recovers the configured MPV within 2 %; the sampler
  matches the Moyal CDF (KS test, p > 0.01); no amplitude exceeds the saturation level; saturated
  events are flagged.
- [ ] CA6: coincidences — for a stacked pair, the true-coincidence count in ground truth matches the
  configured fraction (as defined in FR9) within 3σ; accidentals match `2·τ_c·R₁·R₂` (half-window τ_c,
  recorded singles rates) within 3σ in a run with zero true fraction and **raised rates** —
  R₁ = R₂ = 100 s⁻¹, τ_c = 1 ms, 10⁴ s → expected 20 s⁻¹ (2 × 10⁵ accidentals).
- [ ] CA7: clock — a 32-bit `millis` counter rolls over at 4 294 967 296 ms in a scenario starting
  near the limit; drift of 50 ppm produces a 4.32 s offset per day (±1 %).
- [ ] CA8: disruptions — a scheduled gap yields no lines in its window; a reset makes the event
  counter, device clock, and dead-time counter restart at 0; concatenated, truncated, CRLF, and
  invalid-UTF-8 cases appear exactly as configured.
- [ ] CA9: rendering — rendered CosmicWatch v3X and MuNRa lines round-trip through a reference parser
  in the test suite (field by field), and the MuNRa header line equals the one in SERIAL-FORMATS §2.
- [ ] CA10: `createVirtualDetector` in paced mode with an injected fake clock emits lines at the
  expected host times (±1 ms) and stops cleanly on `close()`.
- [ ] CA11: coverage ≥ 80 % (statements, branches, functions, lines).
- [ ] CA12: typecheck · lint · build · test green; `format:check` green.
- [ ] CA13: only `packages/simulator/**`, the workspace wiring (`pnpm-lock.yaml`), and the documents
  listed in the tasks are touched.

## Validation in practice

- The agent (spec 0087) runs a **72-hour virtual detector** (`usfq-cosmicwatch-munra` +
  `disruptions`) against `muonhub-dev` in parallel with the real 72-hour run (M1 step 11); the
  recovered per-minute counts, live time, and gaps are compared with the ground truth and the result
  is recorded in the M1 Stage Report.
- After the step-9 capture, a rendered MuNRa stream is compared side by side with the real capture
  (column statistics) to confirm the renderer matches the real device (dead-time semantics updated
  if the capture shows otherwise).

## Out of scope

- Tier 2/3 simulations (EcoMug, CRY, PUMAS, Geant4) — later milestones, offline.
- Writing to pseudo-terminals, serial ports, files, or Firebase — the agent (spec 0087) does I/O.
- Sampled streams (seismometer) and multichannel muograph hodoscopes — after 6.0.0; the interfaces
  here do not preclude them.
- Comparison and coincidence analysis tools — M3 (they will consume this package's ground truth).

## Tasks

- [ ] T1: package scaffold (`packages/simulator`), catalog versions, tsconfig reference.
- [ ] T2: `rng.ts` with distributions and known-answer tests (CA1, CA2).
- [ ] T3: `flux.ts`, `modulation.ts` (CA4).
- [ ] T4: `device.ts` (dead time, amplitudes, noise, saturation) (CA3, CA5).
- [ ] T5: `clock.ts`, `disruptions.ts` (CA7, CA8).
- [ ] T6: `assembly.ts` (CA6).
- [ ] T7: renderers and ground truth (CA9).
- [ ] T8: `line-source.ts`, presets (CA10).
- [ ] T9: `physicist` review of models, defaults, and known-answer tolerances.
- [ ] T10: update the affected documentation (`docs/architecture/ARCHITECTURE.md` containers table,
  README repository structure, `docs/science/RESEARCH-NOTES-2026-10.md` tier-1 status).
- [ ] T11: changelog fragment in `changelog.d/`.

**Proposed (not yet decided):** the PRNG algorithm; the default β (−0.12 %/hPa) and noise rates in
the presets; the default hardware coincidence window (≈ 30 µs); the default MuNRa dead-time
semantics (cumulative µs) until the step-9 capture.
