# 0090 — Stream dashboard

- **Status:** in-progress (first version built 2026-11-06 at the maintainer's instruction, before the
  M2 plan's formal approval)
- **Milestone:** M2 — Web platform (`6.0.0-alpha.2.x`), step 4
- **Owner:** written and implemented by the MuonHub brigadista; reviewed by code, silent-failure,
  physicist (labels, units, statistics) and design-language reviewers
- **Depends on:** specs 0083 (minute record v2), 0084 (rules), 0088 (foundation, accounts);
  ADR-005 (free tier), ADR-006 (data integrity); `docs/science/THEORETICAL-FOUNDATION.md`

## Context

A station owner opens a stream and must see, on a phone or a computer, what the detector is
recording: the per-minute rate, the environment, whether the data is current, and where it comes
from — with labels that never overstate what a single-SiPM detector measures (B-M2-06, 07, 08). Long
ranges from day summaries, the live event window, and calibrated views come later in M2 and M3.

## Functional requirements

- **FR1 — Route:** `/app/stream?id=…`, signed-in only (`RequireAuth`); missing id and unknown
  stream have their own messages.
- **FR2 — Ranges:** 6 h, 24 h (default), 72 h. Minutes are read with `readMinutes` (paged) and new
  minutes are fetched every 60 s; no realtime subscription (ADR-005: 100 connections).
- **FR3 — Charts** (uPlot, colors from the design tokens): the per-minute count as recorded
  ("charged-particle rate", counts per minute); barometric pressure (hPa) and temperature (°C) when
  present. A missing minute breaks the line; a gap is never drawn as zero (ADR-006).
- **FR4 — Statistics** over the range: mean count per minute ± its Poisson uncertainty
  (√ΣN / minutes, from raw counts); coverage (stored minutes over the minutes of the range);
  time-averaged pressure and temperature over the minutes that carry them.
- **FR5 — Honest labels:** "not corrected for dead time, barometric pressure or temperature",
  always (the page never applies corrections); a standing note that a single-SiPM scintillator measures a MIP-type
  charged-particle rate and that muon language applies only in aggregate.
- **FR6 — Status apart from data:** data freshness (up to date when the last minute ended at most
  three minutes ago; otherwise "no new minute recently"; "no data yet") shown separately from the
  connection (the last read succeeded or failed, with its time).
- **FR7 — Source:** recording sessions with start and end; when a session comes from the v5 mirror
  (`agentVersion` starting with `v5-mirror`), a banner says the data is copied read-only from v5.

## Non-functional requirements

- **Free-tier budget (ADR-005):** a 72 h view reads about 4 300 minutes once (≈ 0.5 MB), then one
  short read per minute while the page is open.
- **Security (ADR-009):** reads only what the rules grant to the signed-in member; safe errors.
- **Accessibility:** range buttons with `aria-pressed`; status lines in `aria-live` regions.

## Data integrity (ADR-006)

Read-only. Values are shown as stored; statistics are computed on read and labelled; nothing is
written.

## Design / approach

`apps/web/src/features/dashboard/`: `series.ts` (pure: chart rows with gap breaks, range statistics,
freshness), `useStreamMinutes.ts` (initial range plus 60 s refresh, cancellation, connection state),
`TimeChart.tsx` (uPlot loaded in the browser only), `StreamDashboard.tsx`; page
`apps/web/src/app/app/stream/page.tsx`.

## Acceptance criteria (verifiable)

- [x] CA1: `series.test.ts` — gap rows break lines; absent quantities stay absent; mean and Poisson
  uncertainty from raw counts; environmental means are averages, not sums; freshness thresholds.
- [x] CA2: `next build` lists `/app/stream` as a static route.
- [x] CA3: in a real browser against the emulators (desktop 1366 px and phone 390 px), the page shows
  the mirrored LEOPARD-TEST stream with three charts and no console errors from the page itself
  (2026-11-06, `~/.cache/muonhub-demo/screens/`).
- [x] CA4: component test of `StreamDashboard` with a fake provider (states: ready with statistics,
  charts and labels; stale; empty; access denied; not found; the v5-mirror banner) —
  `StreamDashboard.test.tsx`.
- [x] CA5 (physics part): independent physicist review (agy, 2026-11-06, WARNING, no critical): seven
  findings, each checked against the foundation and applied — the uncorrected notice is always shown
  (the page never corrects counts); the range is aligned to minute starts so coverage counts against
  exactly H × 60 minutes; temperature added to the uncorrected notice; the physics note names Compton
  electrons from ambient gammas and the smaller muon share at altitude; "mean count rate"; no repeated
  ±; timestamps carry their time zone. Design-language review still pending.
- [x] CA6: typecheck · lint · test green.

## Validation in practice

The maintainer opens his stream on a phone and on a computer and compares the last minutes with
`munhub-lab.web.app`.
