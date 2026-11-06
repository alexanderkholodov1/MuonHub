# Milestone plan — M2 Web platform

- **Status:** **Proposed**, 2026-11-06. Steps 1–4 (no visual or product decisions in them) started
  the same night at the maintainer's instruction — "Avanza la construccion de MuonHub por favor, lo
  que mas puedes" — before this plan's formal approval; anything he changes here is applied to them.
- **Goal:** people use MuonHub on phones and computers: they create an account, register their
  stations, devices and streams, share them, and watch their stream's data live and over time, with
  honest labels. Public visitors see the network map and, once its mechanism is measured, a public
  live page.
- **Pull request:** #3 of 8 · **Branch:** `feat/m2-web-platform` (from the M1 branch; its PR opens
  after M1 merges) · **Versions:** `6.0.0-alpha.2.x`
- **Depends on:** M1 contracts v2 and data layer v2 (done); M1 merged before the PR; Authentication
  enabled in the console (Email/Password, Google); the M1 step-10 measurement for the public live
  page (ADR-005 §6); a design session with the maintainer for the public site's visual layer.
- **Backlog items:** B-M2-01 … B-M2-16 ([`../BACKLOG.md`](../BACKLOG.md)).

## Steps

| # | Step | What changes | Detail |
|---|---|---|---|
| 1 | Web foundation | new `apps/web` | Next.js 16 static export, React 19, Tailwind 4 with the `packages/ui` tokens; routes without dynamic `[id]` segments (query parameters instead), clean URLs, a real 404; feature folders; data hooks with cancellation and visible errors over `DataProviderV2`; the public configuration validated once (literal `NEXT_PUBLIC_*` reads, a full-page error when it is missing); English source strings ready for translation; unit tests (Vitest, Testing Library); CI jobs. Spec 0088. (B-M2-01, 02, 15) |
| 2 | Accounts | `apps/web/src/features/auth` | Sign-up with a unique username, sign-in (email and password; Google once enabled), password reset, email verification, sign-out; `?next=` honoured; safe error messages. Spec 0088. (B-M2-03) |
| 3 | Stations, devices, streams; sharing | `features/stations`, `features/devices`, `features/streams`, `features/sharing` | Create and edit stations with an explicit visibility choice and the owner's public location precision; devices with geometry; streams; members (owner, editor, viewer) shared by username; ownership transfer with an in-app notice. Spec 0089. (B-M2-04, 05) |
| 4 | Live dashboard | `features/dashboard` | Per-minute series from the Realtime Database with uPlot, day summaries for long ranges, the live window; the rate labelled as measured (charged-particle / MIP-type rate; corrected only where a correction was applied); a compact device-health panel; connection and data freshness shown separately, with "no data" and "stale" states. Spec 0090. (B-M2-06, 07, 08) |
| 5 | Network map | `features/map` | MapLibre map built only from public projections: no exact coordinates or personal data for anonymous visitors; "active now" from the latest data. Spec 0091. (B-M2-11) |
| 6 | Public site and public live page | `app/(public)` | After the design session: landing, live, science, about, join, data, docs, privacy, terms, contact ([`../PUBLIC-SITE-PLAN.md`](../PUBLIC-SITE-PLAN.md)); the public live page uses the mechanism the M1 step-10 measurement selects. Spec 0092. (B-M2-09, 10) |
| 7 | Hardening | web, rules | App Check in monitoring mode, then enforced after a monitoring period; accessibility pass (ARIA, focus, no nested interactive elements, no theme flash); end-to-end tests with Playwright on phone and desktop viewports against the emulators. (B-M2-12, 13, 14) |
| 8 | Deployment | `muonhub` Hosting | First deployment to `muonhub.web.app`, only with the maintainer's go-ahead at that moment; previews on `muonhub-dev` if that project exists. (B-M2-16) |
| 9 | Validation and close | — | Real use on a phone and a computer with the real detector; reviewers; Stage Report; PR #3. |

## How it is executed

- Step 1 first (everything depends on it), then 2, 3 and 4 in parallel on disjoint feature folders,
  then 5; step 6 waits for the design session; 7 and 8 at the end.
- Implementation goes to Codex workers through the fleet queue, each on its own git worktree and
  branch with a self-contained brief; the brigadista writes the specs, reviews every result, and
  integrates into `feat/m2-web-platform`. Each step ends in a versioned commit (`6.0.0-alpha.2.<n>`).

## How it is validated

- **Tests:** unit and component tests for every feature; the data hooks against the in-memory
  provider; end-to-end flows (sign-up → station → device → stream → dashboard) against the emulators
  with the v2 rules; the anonymous user never reads private data.
- **Real practice (exit criterion):** the maintainer uses MuonHub on a phone and a computer with the
  real detector's stream (after M1's real-data run).
- **Reviewers:** code, security (auth flows, rules use), silent-failure (data hooks, subscriptions),
  docs, design-language conformance, physicist (labels and units on the dashboard).

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Next.js static export forbids dynamic segments for unknown ids | certain | query-parameter routes (`/app/station?id=…`), decided in spec 0088 |
| Next 16 / React 19 changes against the first attempt's code | medium | the first attempt is reference only; new code is written for the new versions |
| Beacon has 3.3 GB of RAM for builds | medium | one build at a time; heavy end-to-end runs in CI |
| Realtime Database's 100 simultaneous connections | known | signed-in dashboards subscribe only while visible; the public page waits for the measurement |

## Out of scope

Comparison, coincidences, calibration UI, assembly editor (M3); Bring Your Own Detector terminal,
notifications, backups, usage monitor (M4); seismic (M5); muography (M6); translations, manual,
migration from v5 (M7).

## Needs the maintainer's approval

1. **This plan,** and that steps 1–4 continue without waiting (recommended: they contain no visual or
   product decisions).
2. **Library versions:** Next.js 16.4, React 19.3, Tailwind 4.3, uPlot 1.6, MapLibre 6.16 — the
   current releases (M1 decision D moved Next, React and MapLibre to M2). Firebase SDK stays at
   12.14.0 as pinned in M1.
3. **Authentication in the console** (Email/Password now; Google when the web needs it).
4. **A design session** for the public site before step 6.
5. **The real contact address** for the site.
