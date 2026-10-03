# 0018 — Station dashboard: corrected rate + spectrum + insights (the science payoff)

> **Superseded (2026-10-03):** first v6 attempt, kept as a historical record. The v6 rebuild
> replaces this work — see [`specs/README.md`](../README.md) and [`docs/product/ROADMAP.md`](../../docs/product/ROADMAP.md).

- **Status:** implemented
- **Responsible:** Adjutant (spec) → Cursor (implementation, Claude model) → Gemini (cross-provider review, D35) → Adjutant (verification + macro + PR)
- **Depends on:** 0005 (`@munhub/physics`), 0007 (`DataProvider.getMinuteRecords`/`subscribeRealtime`), 0008 (`@munhub/ui`), 0009 (auth), 0011 (station/detector). Branches from a linear `main`.
- **Phase:** F2/F3 entry · **Epic:** EPIC-5 · **Implements:** backlog 0018 (station dashboard) **and** `specs/0006-insights-v0` (corrected rate + statistical baseline). Honest particle labeling per D9 (backlog 0021).

## Context
The platform has stations, detectors, and a data layer, but shows **no science** yet. This milestone
delivers the **station dashboard** — the visible payoff: a detector's **dead-time + barometrically
corrected rate**, its **amplitude (Landau) spectrum**, and an **insights panel** (robust baseline,
local β, √N bands), all computed via `@munhub/physics` and rendered with Plotly themed to
Observatory Dark. It reads through the `DataProvider`; until the agent (later) feeds real data it
shows correct **empty/loading** states (and may render a clearly-labeled demo series in dev only).

**Also fixes a web-robustness bug** found on the Vercel deploy: the app white-screens when Firebase
env vars are absent because `getDataProvider()` throws at init.

## Functional requirements

### Dashboard
- **FR1 — Dashboard surface** on the station detail (`/stations/[id]`, e.g. a "Dashboard" tab/section)
  for the selected detector. Loads minute records via `DataProvider.getMinuteRecords(detectorId, range)`
  with a range selector (e.g. 24h / 7d / 30d).
- **FR2 — Corrected-rate chart (primary):** time series of **`ecDt`** (dead-time corrected,
  `correctDeadTimeForHardware` with the detector's `hwVersion`) and **`ecCorr`** (barometric,
  `applyBarometricCorrection` using a station-local β from `fitBarometricBeta`) overlaid, with **√N
  error bands** (`poissonSigma` on raw `ec`). Plotly: transparent paper, `border`-opacity gridlines,
  `accent` primary series, mono tabular tick labels, log-scale toggle, gaps **break the line**
  (≥ `GAP_THRESHOLD`). The **raw `ec` is NOT the primary series** — corrected rate is.
- **FR3 — Amplitude spectrum:** `buildAmplitudeHistogram` over the window's SiPM amplitudes with the
  **MPV** marked (`estimateMpv`), sub-threshold region indicated. Labeled "amplitude / deposited
  energy (Landau, MIP ≈ 2 MeV)".
- **FR4 — Insights panel** (fulfils 0006): robust **baseline band** (`robustBaseline`, median ± 1.5·IQR),
  the fitted **β readout** (%/hPa + r² + date range + sample count) from `fitBarometricBeta`, and a
  simple **≥3σ anomaly flag** with the honest disclaimer ("individual-minute anomalies are noise;
  confirmed anomalies need sustained deviation or multi-station coincidence"). Shown when the
  detector has enough data (≥ ~168 points for β; a "collecting data" state below that).
- **FR5 — Honest labeling (D9):** for `single` stations the primary metric is the **"charged-particle
  / MIP-type rate"**, NEVER "muons". Tooltips take exact wording from `THEORETICAL-FOUNDATION.md`.
  "Muon" language only for `coincidence` stations (the `cc` series).
- **FR6 — All corrections via `@munhub/physics`** — never recompute inline. The dashboard is a pure
  consumer of the physics functions + the provider.
- **FR7 — States:** empty (no data → clear "no data yet; connect the agent" message), loading,
  error; performance via `useMemo` for a 7-day window (~10k points) without blocking.

### Web-robustness fix (the Vercel white-screen)
- **FR8 — Graceful missing-config:** `getDataProvider()` / `apps/web/src/lib/data-provider.ts` must
  NOT throw an unhandled error when `NEXT_PUBLIC_FIREBASE_*` is missing. Detect missing config and
  surface a clear **"backend not configured"** state in the UI (and the `AuthProvider` handles it as
  a known state), so the app never client-crashes/white-screens. Document the required env in
  `.env.example` if not already complete.

## Non-functional
- Strict TS, no `any`. `@munhub/ui` tokens only; §0 anti-AI-look checklist; WCAG AA. No `firebase/*`
  import in `apps/web` (guardrail 6 — provider only). Plotly themed per DESIGN-LANGUAGE §4.
- **Scientific honesty is non-negotiable** (guardrail 4 / D9): the physicist-persona wording; no
  "muon" mislabeling; error bars + log toggle available; units on every axis.
- Any new pure helper goes in `@munhub/physics` or `@munhub/shared` with tests, not inline.

## Acceptance criteria
1. The dashboard renders the corrected-rate chart (ecDt + ecCorr + √N bands) from provider data;
   raw `ec` is not the primary series; gaps break the line.
2. The amplitude spectrum renders with the MPV marked.
3. The insights panel shows the baseline band, β (%/hPa + r²), and 3σ anomaly flags with the
   disclaimer; a "collecting data" state appears below the data threshold.
4. No "muon" label anywhere for a `single`-type station (grep + review).
5. All corrections come from `@munhub/physics` (no inline correction math).
6. With `NEXT_PUBLIC_FIREBASE_*` unset, the app shows a "backend not configured" state and does
   **not** throw a client-side exception (the Vercel white-screen is fixed).
7. `pnpm build·test·lint·typecheck` green; no `firebase/*` in `apps/web`; new physics/shared
   helpers unit-tested.

## Out of scope
- The full configurable chart grid + every chart (0019), comparison/contrast (0020), multi-format
  export (0022), the agent/live ingestion (0013–0015), the public map/demo (0024/0025).

## Documentation (D42)
- `docs/technical/ARCHITECTURE.md` (dashboard consumes physics + provider; graceful config),
  `specs/0006-insights-v0` status (implemented here), `docs/STATUS.md` (Adjutant),
  `changelog.d/station-dashboard.added.md`.
