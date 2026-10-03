# 0006 — Insights v0 (per-station corrected rate + statistical baseline)

> **Superseded (2026-10-03):** first v6 attempt, kept as a historical record. The v6 rebuild
> replaces this work — see [`specs/README.md`](../README.md) and [`docs/product/ROADMAP.md`](../../docs/product/ROADMAP.md).

- **Status:** implemented by `specs/0018-station-dashboard`
- **Responsible:** Adjutant (spec) → Sonnet (implementation, after 0005 and FirebaseProvider merge)
- **Depends on:** 0003 (shared contracts), 0004 (DataProvider interface), 0005 (physics package),
  0007 (FirebaseProvider — the data is now reachable through a concrete provider)
- **Phase:** F3 · **Epic:** EPIC-5 (Insights/ML) · **Source:** audit WP-09
- **Proposed in:** `docs/audit/2026-06-12-STATE-OF-PROJECT.md` §6

## Context

This is the "earlier win" proposed in the audit: ship a scientifically honest Insights tab in F3
(before any ML) using pure statistics computed client-side from `@munhub/physics`. No new
backend routes, no model versioning, no `ai_insights` table writes. Immediate scientific value:
shows each station's dead-time and barometrically corrected rate, its per-detector empirical
baseline (robust median/IQR over quiet history), √N error bands, and a simple 3σ anomaly flag.

Three reasons this ships before the ML layer:

1. **Scientific honesty:** the corrected rate + empirical baseline is the ground truth that ML
   will try to predict. Shipping it first makes the future ML measurable and auditable.
2. **User value in F3:** a researcher visiting a station dashboard sees real science (not raw
   counts) the moment the network has any data, without waiting for training pipelines.
3. **Zero server cost:** everything runs client-side in the browser via `@munhub/physics`; no
   edge functions, no scheduled jobs, no Supabase dependency.

Scientific basis: `docs/research/THEORETICAL-FOUNDATION.md` §4 (dead-time), §8A (barometric),
§10 (Poisson, baselines, 3σ anomaly threshold). These requirements are non-negotiable.

## UI surface

A new **"Insights"** tab on the station dashboard (`apps/web`), accessible when the station
has at least 7 days of data for meaningful baseline statistics. The tab shows:

1. **Corrected rate chart** — the `ecDt` (dead-time corrected) and `ecCorr` (barometrically
   corrected) time series for the selected period, overlaid on the same chart.
2. **Baseline band** — the empirical robust baseline (median ± 1.5 × IQR, from
   `robustBaseline`), shown as a shaded band.
3. **√N error bars** — per-minute statistical uncertainty derived from raw counts (`ec` field)
   via `poissonSigma`; displayed as translucent error bands.
4. **Anomaly flags** — markers at minutes where the corrected rate falls outside 3σ of the
   baseline expectation (`countsZScore` > 3 or < -3 on the baseline-normalised counts). A
   quiet disclaimer: "Individual-minute anomalies are statistical noise; confirmed anomalies
   require sustained deviation over hours or multi-station coincidence."
5. **β readout** — the fitted barometric coefficient β (%/hPa) for this station, with the
   date range of the data used for the fit, and r² of the log-linear regression.

All numbers use `Geist Mono` (tabular figures), consistent with the Observatory Dark design
language. Charts via Plotly (D15).

## Functional requirements

- FR1: Load the station's minute records for a configurable window (default: last 7 days)
  via `DataProvider.getMinuteRecords`.
- FR2: Apply dead-time correction (`correctDeadTimeForHardware`) using the detector's
  `hwVersion` from its `Detector` record; store as `ecDt`.
- FR3: Fit barometric β (`fitBarometricBeta`) from the loaded window's (`pr`, `ecDt`) pairs,
  excluding minutes with missing pressure or zero rate. Require ≥ 168 points (1 week of
  minutes) for a reliable fit; show a "Not enough data" state if below threshold.
- FR4: Apply barometric correction (`applyBarometricCorrection`) to produce `ecCorr`.
- FR5: Compute `robustBaseline` over the corrected series; compute `poissonSigma` per minute
  from raw `ec` counts; compute `countsZScore` against the baseline's expected count
  (median × 1 min).
- FR6: Render the Insights tab with the five elements described in the UI surface section,
  using Observatory Dark design tokens and Plotly.
- FR7: All computations are **pure client-side** — no new API route, no database write, no
  worker/service involvement. If `DataProvider` is unavailable, the tab shows an error state.
- FR8: The tab is hidden when the station has fewer than 1440 minute records (less than 1 day)
  and shows a "collecting data" state when between 1 day and 7 days.

## Non-functional

- Calculations complete in < 200 ms for a 7-day window (~10,080 points) on a mid-range device.
  Use `useMemo` / lazy loading to avoid blocking the main dashboard tab.
- No "muon" language in any label, tooltip, or annotation. Use "charged-particle rate",
  "MIP-type rate", "corrected rate" per guardrail 4.
- Anomaly disclaimer must be visible on the chart (tooltip or footnote), not buried.
- WCAG AA contrast (Observatory Dark tokens enforce this by design).
- `packages/physics` is the **only** place corrections are computed — never inline.

## Out of scope

- Writing `ai_insights` database records (that is the ML layer).
- Thermal correction (needs atmospheric profile data).
- Multi-station coincidence anomaly detection.
- Forbush/GLE event pages (`Events` tab — future spec).
- β persistence across sessions (recomputed client-side each load; stored β is the ML layer's job).

## Acceptance criteria

- [x] CA1: the Insights tab appears on a station dashboard with ≥ 1440 records; shows
  "collecting data" state for < 1440; hides for < 1440 total records in the DB.
- [x] CA2: the corrected rate chart shows `ecDt` and `ecCorr` with correct labels and units;
  raw `ec` is NOT displayed as the primary series.
- [x] CA3: the β readout shows the fitted value and r²; toggling a different pressure range
  updates the chart.
- [x] CA4: anomaly flags appear at the correct minutes for a synthetic test series where known
  deviations exceed 3σ.
- [x] CA5: `@munhub/physics` functions are called; no correction logic is duplicated inline.
- [x] CA6: `pnpm build && pnpm lint && pnpm typecheck` green; no "muon" in the new code.
- [x] CA7: Observatory Dark design tokens used throughout; Geist Mono for all numeric readouts.

## Tasks

- [x] T1: route/page scaffold for the Insights tab (`apps/web`).
- [x] T2: data-loading hook — `useInsightsData(stationId, windowDays)`.
- [x] T3: corrections pipeline hook — `useInsightsMetrics(records, detector)`.
- [x] T4: corrected-rate + baseline chart component (Plotly).
- [x] T5: anomaly flag overlay + disclaimer.
- [x] T6: β readout component.
- [x] T7: empty/loading/error states.
- [x] T8: lint, typecheck, build green.
- [x] T9: docs matrix — architecture note, STATUS row, changelog fragment.
