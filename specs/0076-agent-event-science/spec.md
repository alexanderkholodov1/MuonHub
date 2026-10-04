# 0076 — Agent event science: noise auto-calibration + EventSummary + NTP clock sync

> **Superseded (2026-10-03):** first v6 attempt, kept as a historical record. The v6 rebuild
> replaces this work — see [`specs/README.md`](../README.md) and [`docs/product/ROADMAP.md`](../../docs/product/ROADMAP.md).

- **Status:** implemented
- **Responsible:** Adjutant (spec) → Cursor (impl) → independent review (Cursor review-only / Gemini
  when quota returns) → Adjutant (verify + macro + PR)
- **Depends on:** 0075 (`StorageTierConfig`, `SignalRecord`, `EventSummary`, `NoiseCalibration`),
  0005 (`@munhub/physics` `buildAmplitudeHistogram`/`estimateMpv`), 0013 (agent acquisition core).
  **Stacks on #50 (0075)** — branch off `spec/0075-event-storage-contract`; rebase onto `main` once
  #50 merges.
- **Phase:** F2 · **Epic:** EPIC-4 + EPIC-10(science) · **Source:** ADR-003.

## Context
ADR-003 says the agent computes the science **at the edge**, independent of cloud retention: it
detects **above-noise signals** (per an auto-calibrated per-detector threshold), produces an
**`EventSummary`** per interval, and corrects the **machine-clock skew** (the legacy 3-min problem)
via NTP. This milestone builds that pure, testable logic (real NTP/serial verified manually).

## Functional requirements

### Pure science (`@munhub/physics`, tested)
- **FR1 — `calibrateNoiseThreshold(amplitudesMv, options?)`** → `{ thresholdMv, method }`: from a
  window of SiPM amplitudes, locate the **sub-threshold noise / dark-count region** and set the
  threshold so real signals are those above it (e.g. N·σ above the dark-count peak, or a robust
  high-percentile of the noise lobe — pick a defensible, documented rule, foundation §6). Pure,
  deterministic, no I/O. Returns a value usable as a `NoiseCalibration` (`@munhub/shared`).
- **FR2 — `buildEventSummary(signals, params)`** → `EventSummary`: given the above-threshold
  `SignalRecord`s in `[intervalStartTs, intervalEndTs)` plus `detectorId`, `sessionId`,
  `noiseThresholdMv`, compute the amplitude **histogram** (`buildAmplitudeHistogram`), **MPV**
  (`estimateMpv`), `signalCount`, `aboveThresholdCount`, high-amplitude **tailCount** (above a
  documented tail cut), and `coincidenceCount`. Returns a schema-valid `EventSummary`. Pure.

### Agent orchestration (`apps/agent`, tested with mocks)
- **FR3 — Clock offset (NTP):** `measureClockOffset(timeSource)` measures
  `offsetMs = trueTime − machineTime` against an injectable NTP/time source (mockable for tests);
  expose the offset for **session provenance** (`Session.clockOffsetMs`) and a `clockSkewWarning`
  when `|offset|` exceeds a configurable threshold. Real NTP query is a thin adapter; the logic is
  pure/tested.
- **FR4 — Edge pipeline wiring:** extend the agent so, driven by the detector's `StorageTierConfig`,
  it (a) maintains the noise threshold per detector (initial `calibrateNoiseThreshold`, periodic
  re-calibration, appended to `noiseCalibrationHistory`), (b) classifies incoming events as
  above/below threshold, (c) emits an `EventSummary` every `eventSummaryIntervalMs`, and (d) collects
  above-noise `SignalRecord`s when `individualSignals` is on. All computed locally; **upload/retention
  is a later milestone** (this milestone produces the records + summaries in memory/local store).
- **FR5 — Tier honoring:** the pipeline respects the config (e.g. `minuteSummaries` off in
  realtime-only; `individualSignals` gating; `completeRaw.autoStopMinutes` stops raw capture). No
  cloud writes here.

## Non-functional
- Strict TS, no `any`. `@munhub/physics` stays pure (no I/O); the agent's NTP/serial adapters isolate
  I/O behind injectable interfaces so the logic is unit-tested without network/hardware. Guardrail 5
  (no scientific value altered; above-noise filtering is a *documented detection threshold*, not
  arbitrary event filtering — it removes sub-threshold noise per foundation §6, and the threshold +
  counts are recorded for reproducibility). No "muon" labeling.
- Reuse `@munhub/physics` histogram/MPV; do not reimplement.

## Acceptance criteria
1. `calibrateNoiseThreshold` returns a sensible threshold on a synthetic noise+Landau distribution
   (unit test: threshold sits above the noise lobe and below the MIP peak).
2. `buildEventSummary` produces a schema-valid `EventSummary` with correct counts, histogram, and MPV
   for a synthetic signal set (incl. tail and coincidence counts).
3. `measureClockOffset` returns the correct offset against a mock time source and raises the skew
   warning past the threshold (unit test).
4. The agent pipeline, given a `StorageTierConfig` and a synthetic event stream, emits the expected
   `EventSummary` cadence, re-calibrates the threshold and appends history, and gathers individual
   signals only when enabled (unit tests with mocks).
5. `pnpm build·test·lint·typecheck` green; new physics + agent logic unit-tested; no I/O in physics.

## Out of scope (later)
- Cloud upload/retention of EventSummary/signals as blobs (provider milestone); the admin console,
  notifications, migration, federation; real NTP/serial hardware verification (manual).

## Documentation (D42)
- `docs/technical/ARCHITECTURE.md` (edge event-science pipeline), `docs/research/THEORETICAL-FOUNDATION.md`
  cross-ref for the noise-threshold rule, spec status, `docs/STATUS.md` (Adjutant),
  `changelog.d/agent-event-science.added.md`.
