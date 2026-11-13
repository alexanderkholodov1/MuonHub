# 0092 — Public landing (first part of the public site)

- **Status:** in-progress (built 2026-11-13 at the maintainer's request: "por lo menos haz el landing
  page … quisiera que lo despliegues en una URL de pruebas de Firebase"; he delegated the design
  session to the brigadista)
- **Milestone:** M2 — Web platform (`6.0.0-alpha.2.x`), step 6 (first part)
- **Owner:** written and implemented by the MuonHub brigadista
- **Depends on:** spec 0088 (foundation, i18n, design tokens); spec 0091 (network map);
  [`PUBLIC-SITE-PLAN.md`](../../docs/product/PUBLIC-SITE-PLAN.md) §1;
  [`LANDING-CONCEPT.md`](../../docs/design/LANDING-CONCEPT.md); DESIGN-LANGUAGE §0 and §7;
  THEORETICAL-FOUNDATION §0, §2, §8E, §10

## Context

The start page was a title and two sign-in buttons. The maintainer's requirement for the public site
is the opposite: explain MuonHub in seconds and show, without an account, what a public station
captures. The detector at the LEOPARD lab (USFQ) is running now; its v5 public profile exposes its
individual events (`realtime`, the last ≈ 12 minutes) and its minutes. The v6 agent that will publish
v6's own public window (ADR-005 §6) is not installed yet (M1 steps 9–11).

## Functional requirements

- **FR1 — Hero (`/`, no sign-in), revised 2026-11-13:** a night sky in both themes with the header on
  it. A 3-D globe (three.js, loaded after first paint): land as dots (Natural Earth 1:110m), a violet
  atmosphere, the detectors at their site, and each real detection drawn as a particle falling onto
  the site at its replay time (detection + a fixed delay of about 15 s), from a direction drawn from
  I(θ) ∝ cos²θ; a gold pulse on arrival. The caption says the direction is illustrative. Drag turns
  the planet; it drifts back home. The first version's flat sky and pointer lens were dropped at the
  maintainer's word.
- **FR2 — munhub-lab's readout:** a running count of the minute being replayed, ticking with the
  particles; the last complete minute N ± √N, SiPM average (mV), temperature and pressure, as
  munhub-lab shows them for LEOPARD-TEST; the source's state (live, quiet, unavailable). Nothing is
  simulated: when the detector is quiet no particles fall. The hero fits a 1366 × 650 first screen.
- **FR2b — Every munhub-lab detector:** the public profiles of v5 (munhub-lab's rule: every profile
  not private), duplicates under one name merged, live first; name, state or last data date, number
  of sessions. v5 records no positions: the globe shows them at USFQ, and the page says so.
- **FR3a — The detector, right now (third version, 2026-11-13):** the whole landing is a night sky;
  cyan, gold and violet appear together. A live strip of the last minute's particles as bars (height =
  SiPM pulse size, log scale; small cyan, medium violet, large gold); munhub-lab's four charts —
  charged particles per minute with its ±√N band, SiPM mean, temperature, pressure — over 1, 6 or 24
  hours (bins of 1, 5, 15 minutes; mean per minute with √ΣN / n; gaps break the line); the
  pulse-height spectrum of the latest 1,000 events; each munhub-lab detector with a sparkline of its
  last recorded hour and a 2026 timeline of when each recorded; an animated diagram from cosmic ray to
  screen; cutoff rigidity as bars on one scale.
- **FR3 — The last hour:** counts per minute with ±√N bars, the hour's mean and the band ±√mean
  that chance alone fills; mean ± √ΣN / minutes, minutes recorded of 60 (gaps are not zeros),
  pressure and detector temperature; a plain explanation of Poisson noise and of why real changes
  need hours and corrections; the honest-label note (uncorrected counts, charged particles of every
  kind, no single count identified as a muon).
- **FR4 — What MuonHub is:** detector → agent → open data; why measure at the equator (cutoff
  rigidity ≈ 12–13 GV vs ≈ 1 GV near the poles; altitude ≈ 2,400 m); the network (one station today)
  with links to `/network` and `/signup`. Sign-in stays in the header only.
- **FR5 — Network page:** `/network` lists the bridge station with its live state and a link to the
  landing's live section, next to the map; the bridge entry steps aside once v6 publishes a station
  of the same name.

## Non-functional requirements

- **Live source (temporary bridge):** the visitor's browser reads, read-only, only
  `profiles/leopard_test/realtime` and `profiles/leopard_test/sessions/<session>/minutes` of the v5
  project over REST — never a profile's root, which carries personal fields — and, for the detector
  list (every two minutes), the profile keys and each profile's `visibility`, `name`, `meta/name`,
  `latest/ts` and session keys with their last minute. Events every 10 s,
  minutes every 60 s, only while the page is visible; about 3 KB per request. Replaced by v6's public
  window when the agent runs at the lab.
- **Free tier:** no chart library on the landing (SVG chart); three.js and the land points (≈ 19 KB
  compressed) load after the first paint; nothing read from Firebase v6 on the landing.
- **Accessibility:** WCAG 2.2 AA with axe in both themes and viewports; the canvas is decorative
  (`aria-hidden`), every number is in text; reduced motion draws a still image redrawn when data
  arrives.
- **Design language:** Observatory Dark tokens; one hero motion; mono tabular numbers; two accents
  (cyan data, amber "now").

## Acceptance criteria (verifiable)

- [x] CA1: `landing.test.ts` — parsing skips malformed entries; mean ± √ΣN / n and √mean; status
  live/quiet at 3 minutes; replay delay bounds; lens image at (r + √(r² + 4R²)) / 2; zenith sampling
  cos θ = (1 − u)^¼; tracks cross the detector.
- [x] CA2: end-to-end (desktop and phone), with the live source answered by `e2e/live-source.ts`:
  the landing shows the live state, the readout, the hour's chart and 60 of 60 minutes; the hero's
  actions lead to the data and the network, not to sign-in; only the two public paths are requested.
- [x] CA3: the hero keeps the dark palette in the light theme (computed colours checked).
- [x] CA4: axe finds no violation on `/` and `/network` in both themes and viewports.
- [x] CA5: deployed to a Hosting preview channel of `muonhub` and checked in a browser at 1366 and
  390 px with the real detector: <https://muonhub--landing-jhk8q708.web.app> (commit `a600ab7`,
  2026-11-13, expires 2026-12-13); no console errors, no horizontal scroll.
