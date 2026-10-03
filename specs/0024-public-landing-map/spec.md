# 0024 — Public landing: detector map (city-aggregated) + live demo

> **Superseded (2026-10-03):** first v6 attempt, kept as a historical record. The v6 rebuild
> replaces this work — see [`specs/README.md`](../README.md) and [`docs/product/ROADMAP.md`](../../docs/product/ROADMAP.md).

- **Status:** done
- **Responsible:** Adjutant (spec) → Cursor (implementation, Claude model) → Gemini (cross-provider review, D35) → Adjutant (verification + macro + PR)
- **Depends on:** 0007 (`DataProvider.listStations`/`getMinuteRecords`/`subscribeRealtime`), 0008 (`@munhub/ui` + landing shell), 0018 (dashboard chart components + physics). Branches from a linear `main`.
- **Phase:** F3 · **Epic:** EPIC-6 · **Backlog:** 0024 (detector map) + 0025 (live demo). The outreach face of the platform.

## Context
The platform works end-to-end (auth → station/detector → agent → dashboard) but has no public
face. This milestone makes the **public landing** demonstrative: a **detector map** that shows the
network's reach **aggregated by city** (D20 — never the exact site), and a **live demo** of a
public detector so a visitor sees real cosmic-ray science immediately. The particle-field hero is
still deferred to the design session — this is the calm, on-brand structured landing + map + demo.

## Functional requirements

### Detector map (0024) — privacy-first
- **FR1 — MapLibre map** on the public landing, populated from public stations via
  `DataProvider.listStations({ visibility: "public" })`. Add MapLibre GL (verify the version exists
  before pinning); themed to Observatory Dark; static-export compatible (client-side only).
- **FR2 — City aggregation (D20, privacy-critical):** group public stations **by city** and render
  **one bubble per city at the city centroid**, sized/numbered by how many detectors that city has.
  **NEVER render or expose a station's exact latitude/longitude** — the map must not leak precise
  locations. Derive the city marker position from a city centroid (not a station coordinate); if a
  centroid is unavailable, jitter/round so no exact site is recoverable. This privacy boundary is a
  hard requirement (Gemini must verify it).
- **FR3 — Active-now indicator:** each city bubble shows how many of its detectors are **active now**
  (recent data / `status`), with a clear active/inactive visual. Looks intentional even with 1 city.
- **FR4 — Bubble interaction:** clicking a city bubble shows a small panel (city, country, detector
  count, active count) — **city-level only**, no address, no exact coords, no owner identity.

### Live demo (0025)
- **FR5 — Live demo of a public detector:** a section showing a real-time / recent chart of a
  selected **public** detector — reuse the corrected-rate chart from the 0018 dashboard
  (`@munhub/physics` corrections, honest D9 labeling: "charged-particle / MIP-type rate", never
  "muons"). Pick a public detector (e.g. the first public station's detector) via the provider.
- **FR6 — States:** if there are no public stations/detectors yet, the map shows a clear
  "no public stations yet" state and the demo shows an empty/"waiting for data" state — never a
  blank or a crash.

## Non-functional
- Strict TS, no `any`. `@munhub/ui` tokens only; §0 anti-AI-look checklist; WCAG AA. No `firebase/*`
  in `apps/web` (guardrail 6 — provider only). Honor `prefers-reduced-motion`. Static export must
  still build (`output: "export"`); MapLibre runs client-side.
- **Privacy (D20) is non-negotiable:** no exact station coordinates in the DOM, network payload the
  client renders, or tooltips — city aggregation only. Reuse `@munhub/physics`/the dashboard chart;
  no inline correction math; no "muon" mislabel for single-SiPM.

## Acceptance criteria
1. The landing renders a MapLibre map with **one bubble per city**, sized/numbered by detector
   count, with active-now indication; with ≥1 public station it shows real data, else the empty state.
2. **No exact station latitude/longitude is exposed** anywhere the client renders (grep the built
   output + review): bubbles sit at city centroids, panels show city-level info only.
3. The live-demo section renders the corrected-rate chart for a public detector with honest D9
   labeling, or a clear empty state when there is no public data.
4. `apps/web` imports no `firebase/*`; corrections come from `@munhub/physics`.
5. `pnpm build·test·lint·typecheck` green; static export still emits the landing; new pure helpers
   (e.g. city aggregation) unit-tested.

## Out of scope
- The particle-field hero (design session), full educational sections (0026), the full comparison/
  network views (0020/0057), embed/share of a public chart (0073). Owner identity / private station
  exposure (never).

## Documentation (D42)
- `docs/technical/ARCHITECTURE.md` (public landing + city-aggregated map + privacy boundary),
  spec status, `docs/STATUS.md` (Adjutant), `changelog.d/public-landing-map.added.md`.
