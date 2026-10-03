# 0075 — Event & storage data contract (`@munhub/shared` schemas)

> **Superseded (2026-10-03):** first v6 attempt, kept as a historical record. The v6 rebuild
> replaces this work — see [`specs/README.md`](../README.md) and [`docs/product/ROADMAP.md`](../../docs/product/ROADMAP.md).

- **Status:** implemented
- **Responsible:** Adjutant (spec + ADR-003) → Cursor (impl) → cross-provider review (D35; Gemini or
  supervisor fallback if Gemini quota is out) → Adjutant (verify + macro + PR)
- **Depends on:** 0003 (shared schema patterns), 0005 (`@munhub/physics` histogram/MPV types).
  Branches from `main`. Pure contracts — no provider/agent/UI changes here.
- **Phase:** F2/F3 · **Epic:** EPIC-2/9 (data + lifecycle) · **Source:** ADR-003.

## Context
ADR-003 defines the storage tiers, event model, noise calibration, clock correction, and provenance.
This milestone lands the **shared zod contracts** they all build on — the single source of truth
(like every `@munhub/shared` schema), validated and tested, with **no I/O**. Everything downstream
(agent EventSummary, blob storage, admin console, migration) consumes these types.

## Functional requirements (all in `packages/shared/src/schemas/`, exported from `index.ts`, with tests)

- **FR1 — `StorageTierConfig`** (`storage.ts`): the per-detector retention axes from ADR-003 §1:
  - `minuteSummaries: boolean` (default true),
  - `individualSignals: boolean`,
  - `realtimeMode: "none" | "local-only" | "cloud-volatile"`,
  - `completeRaw: { enabled: boolean; autoStopMinutes: number | null }`,
  - `eventSummaryIntervalMs: number` (default 3_600_000 = 1 h).
  Plus a `RECOMMENDED_STORAGE_TIER` constant (minute summaries + realtime `local-only` +
  individual signals on + complete off). Reject the incoherent combo (everything off) with a
  `.refine`.
- **FR2 — `SignalRecord`** (`signal.ts`): one **above-noise** signal, complete:
  `ts` (epoch ms), `sipmMv` (NonNegative), `adc1`/`adc2` (int ≥ 0, optional), `coincident` (boolean),
  `deadtimeUs` (NonNegative), `tempC` (number, optional), `pressureHpa` (NonNegative, optional).
  Strict; this is the "individual signal" stored in blobs.
- **FR3 — `EventSummary`** (`event-summary.ts`): per-interval science (ADR §2):
  `detectorId`, `sessionId`, `intervalStartTs`, `intervalEndTs` (end > start), `signalCount`,
  `aboveThresholdCount`, `tailCount`, `coincidenceCount`, `noiseThresholdMv`, `mpvMv` (optional),
  and `histogram: { binWidthMv, minMv, counts: number[] }` (the Landau amplitude histogram).
  Validate counts non-negative and `intervalEnd > intervalStart`.
- **FR4 — Noise calibration + history** (extend `detector.ts`): a `NoiseCalibration` schema —
  `thresholdMv` (NonNegative), `method` (e.g. `"auto-sigma" | "manual"`), `calibratedAt` (epoch ms);
  and `NoiseCalibrationHistory = NoiseCalibration[]` (ordered). Add an optional
  `noiseCalibration: NoiseCalibration` (+ optional `noiseCalibrationHistory`) to the `Detector` /
  `Calibration` shape so the active threshold + its versioned history are part of the detector.
- **FR5 — Session provenance** (extend `session.ts`): add to `Session` —
  `storageTier: StorageTierConfig` (the homogeneous tier of the session), `agentVersion` (string,
  optional), `clockOffsetMs` (number, optional — `trueTime − machineTime` measured via NTP),
  `calibrationRef` (optional). Keep backward-compatible (optionals).
- **FR6 — `StorageQuota`** (`storage.ts`): `detectorMaxBytes` (int > 0, chosen within admin
  min..max), `accountMaxBytes` (int > 0). A constant `DEFAULT_DETECTOR_QUOTA_BYTES = 100 * 1024 *
  1024`. (Pure schema; provisioning/admit-control logic is a later milestone.)
- **FR7 — Pure helpers (tested):** `isRecommendedTier(config)`, and a pure
  `estimateMonthlyBytes(config, signalsPerMinute)` that returns an approximate per-month byte
  footprint per the model (minute record size × 1440 × 30 + individual-signal blob estimate +
  complete-raw estimate). No randomness, no I/O. This powers the install "storage simulator" later.

## Non-functional
- Strict TS, no `any`; pure ESM; **only** `zod` + `@munhub/shared` internals (+ optional
  `@munhub/physics` types). No I/O, no SDK. Mandatory unit tests (this is a contracts package):
  valid/invalid cases per schema, the `RECOMMENDED_STORAGE_TIER` round-trips, the refine rejects the
  empty combo, `estimateMonthlyBytes` matches hand-computed values.
- Backward-compatible: new `Session`/`Detector` fields are optional so existing data still validates.

## Acceptance criteria
1. All schemas + constants + helpers exported from `@munhub/shared`; `zod` validation rejects the
   documented invalid cases (e.g. all-axes-off tier, `intervalEnd ≤ intervalStart`, negative counts).
2. `RECOMMENDED_STORAGE_TIER` is valid and `isRecommendedTier` returns true for it.
3. `estimateMonthlyBytes` returns the expected approximate values in unit tests for a few rates/tiers.
4. Existing `Session`/`Detector` records (without the new optional fields) still validate.
5. `pnpm build·test·lint·typecheck` green across the workspace; new schema files have meaningful tests.

## Out of scope (later milestones, per ADR roadmap)
- Agent EventSummary computation + noise auto-calibration + NTP clock sync.
- Blob storage of signals/raw in the provider; cold archive.
- Admin storage console, placement/admit-control, runway, quota provisioning, notifications.
- The migration. The federation backends.

## Documentation (D42)
- `docs/technical/DATA-MODEL.md` (link ADR-003; the event/tier model summary), `docs/technical/adr/003-*`
  (this ADR), spec status, `docs/STATUS.md` (Adjutant), `changelog.d/event-storage-contract.added.md`.
