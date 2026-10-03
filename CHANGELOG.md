# Changelog

All notable changes to MuonHub are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) with the pre-release scheme of ADR-008
(`6.0.0-alpha.<milestone>.<iteration>.<fix>`).

## [Unreleased]

> Each pull request adds fragments under [`changelog.d/`](changelog.d/); they are compiled here when
> a milestone is released. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## First v6 attempt — unreleased work (June–July 2026, superseded by the v6 rebuild)

> Compiled from the `changelog.d/` fragments of the first v6 attempt. Kept as history; names and
> paths are as they were at the time (MunHub Lab, `planning/`, `docs/technical/`, …).

### Added
- AFLEK auto-sync adoption: a generated `.aflek/` snapshot of the kit doctrine (playbooks,
  adapters, templates, tools, personas) now travels with the repo so cloud executors read current
  doctrine without a local kit clone; `aflek-sync` keeps it current and a `SessionStart` hook
  reports drift automatically. Vercel added to the fleet env loader (the roster is now
  Gemini · Cursor · GitHub · Vercel · Claude subagents · Copilot-review).
- The repo is now driven by the one-word **"empieza"** flow (`.aflek/playbooks/start.md`, wired
  from `CLAUDE.md`): selftest → self-update → orient → compose fleet → propose → execute+monitor →
  self-review → one PR → self-improve. The fan-out gate is the kit's generalised
  `.aflek/tools/wave-preflight.ps1` (the project-local copy is removed).
- Agent acquisition core for serial format parsing, per-minute averaged records, local-first
  persistence, and idempotent offline sync queue, with Tauri serial bridge scaffolding marked for
  manual hardware verification.
- Agent event-science computation with local noise-threshold calibration, EventSummary generation,
  clock-offset measurement, tier-aware SignalRecord gating, and complete-raw auto-stop handling.
- Firebase Auth-backed registration, sign-in, sign-out, password reset, and session observation
  behind the `DataProvider` interface, with web auth screens and protected dashboard routing.
- Blob-backed event-science persistence in `@munhub/data-provider`, with slim EventSummary RTDB
  nodes and gzip-compressed NDJSON SignalRecord objects in Firebase Cloud Storage.
- Contribution guide (`CONTRIBUTING.md`) defining the branch, commit, and pull-request
  conventions, the documentation Definition of Done, and the Semantic Versioning policy
  (`6.0.0` = MunHub Lab 6 launch).
- Changelog-fragment workflow (`changelog.d/`) so parallel pull requests record changes without
  conflicting on a single file.
- The provider-agnostic `DataProvider` interface and its supporting types (`TimeRange`,
  `StationFilter`, `DataChunk`, `ImportReport`, …) in `@munhub/data-provider` (spec S04) — the
  keystone that lets the app run on Firebase or Supabase without changes, and the engine of the
  admin export/import migration. Typed entirely against `@munhub/shared`; no backend SDK.
- Event and storage retention contracts in `@munhub/shared`, including storage tiers, signal
  records, event summaries, noise calibration metadata, session provenance, quotas, and pure storage
  estimate helpers.
- `FirebaseProvider` (spec 0007): the first concrete `DataProvider`, over the munhub-1 Realtime
  Database. One factory (`createFirebaseProvider`) serves two SDK targets — the firebase modular
  client SDK (web) and `firebase-admin` (agent/tooling/server) — sharing all serialization and
  zod-boundary validation, with the backend SDK confined to `packages/data-provider` (D4/guardrail
  6). Incremental realtime listeners (`limitToLast` + `child_added`, never `once('value')`),
  minute writes idempotent on `(detector, ts)` keyed by zero-padded epoch-ms, a `/detector_index`
  for O(1) detector→station resolution, and memory-bounded streaming `exportAll`/`importAll` with
  per-chunk validation and quarantine. Ships a deny-by-default Phase A ruleset
  (`infra/firebase/database.rules.json`) and Firebase-Emulator integration + rules tests
  (`pnpm test:emulator`); the default `pnpm test` needs no emulator. Unblocks insights-v0 (0006),
  the station dashboards, and the v5→v6 migration engine.
- Fleet command charter (`planning/20-FLEET-COMMAND-AND-ADJUTANT.md`) defining the CEO → Adjutant →
  supervisor → worker structure and the Adjutant's orchestration authority (D46).
- Fleet dispatch hardening: an executable wave-preflight gate (`infra/fleet/wave-preflight.ps1`)
  that blocks a fan-out unless lanes are disjoint, no work package touches an orchestrator-owned
  high-contention file, every routed executor is reachable, and the PR queue is dependency-clear.
  `load-fleet-env.sh` now sets `GEMINI_CLI_TRUST_WORKSPACE` so dispatched Gemini workers don't
  stall on the trust prompt, and documents that the Cursor REST API requires Bearer (not Basic) auth.
- Fleet kit implementation plan (`fleet/IMPLEMENTATION-PLAN.md`): design decisions (FD-log),
  target repository skeleton, nine build work packages with routing, and bootstrap procedure —
  plus the first kit artifacts: the work-package format, the canonical `AGENTS.md` template,
  and the run-a-wave / bootstrap-new-project playbooks.
- spec 0006 "Insights v0": per-station corrected-rate chart (dead-time + barometric β) with
  robust median/IQR baseline, √N error bands, and 3σ anomaly flags — client-side from
  `@munhub/physics`, no backend, ships in F3 before the ML layer.
- `@munhub/physics` scientific core (spec 0005): non-paralyzable dead-time correction (per-hardware
  τ_DT and recorded `dt` percent), station-local barometric β by log-linear regression with applied
  correction, Poisson counting statistics with robust median/IQR baselines, amplitude histogram
  with Landau MPV estimation, and rate→flux — all pure functions with numeric tests against the
  theoretical-foundation reference values and a ≥80% coverage hard-gate.
- Project audit and reconstruction plan (`docs/audit/2026-06-12-STATE-OF-PROJECT.md`): findings,
  external research record (agent-tooling landscape, ECC), maintainer decision queue, and ten
  routed work packages; refreshed `docs/STATUS.md`; seed charter for the provider-agnostic
  fleet kit (`fleet/`).
- Public landing network map with city-aggregated detector bubbles, city-level active-now counts,
  and a privacy boundary that keeps exact station coordinates out of rendered map data.
- Public live detector demo that reuses the physics-backed corrected-rate chart for charged-particle
  / MIP-type rate data.
- Canonical slim Firebase minute storage in `@munhub/data-provider`, with derived fields recomputed
  on read and deterministic realtime retention capped to the newest records.
- Domain contracts in `@munhub/shared` (spec S03): Zod schemas with inferred TypeScript types for
  `Institution`, `User`, `Station`, `Detector`, `Session`, `MinuteRecord`, and `RealtimeRecord`,
  plus shared enums and constants. Schemas are the single source of truth (runtime validation and
  types stay in lock-step) and enforce the data invariants (averages-not-sums, `sn ≤ sm ≤ sx`,
  dead-time `0..100`, explicit station visibility).
- Station detail dashboards now show detector corrected-rate charts, amplitude spectra, and
  statistical insights from `DataProvider` records and `@munhub/physics` corrections.
- The web app now surfaces a clear backend-not-configured state when Firebase public
  environment variables are missing.
- Station creation and detector registration flows for authenticated owners, with shared
  calibration defaults, explicit visibility selection, optional metadata reminders, and
  non-blocking device-token consistency advisories.
- Observatory Dark design token foundation in `@munhub/ui`: full CSS custom property set (dark
  default + light mirror, per `DESIGN-LANGUAGE.md` §1–§3), Tailwind v4 `@theme` mapping semantic
  tokens to utility classes (`bg-surface`, `text-secondary`, `rounded-md`, etc.).
- Primitive set in `@munhub/ui`: `ThemeProvider` (dark/light toggle, `localStorage` persist,
  `prefers-reduced-motion` aware), `Button` (primary / secondary / ghost variants; all states),
  `Card` (title + body; empty / loading / error states), `Stat` KPI tile (Geist Mono
  `tabular-nums` readout; loading / error states). All exported from `packages/ui/src/index.ts`.
- `apps/web` Next.js App Router shell with `output: "export"` (static build → `out/` for Firebase
  Hosting, Phase A). Real `next build` / `next dev` scripts replace stubs.
- Root layout: Geist Sans (UI) + Geist Mono (numbers) via `next/font`, Observatory Dark tokens
  global stylesheet, `ThemeProvider` wrapping the app, `<html data-theme="dark">` default.
- `SiteHeader`: MunHub wordmark, nav placeholders, working light/dark toggle.
- `/` route: calm on-brand landing with real scientific cosmic-ray copy (no lorem ipsum, no
  particle animation — design session deferred per `LANDING-CONCEPT.md`).
- `/dashboard` route: `Card` + `Stat` primitives with realistic USFQ station sample readouts;
  interactive empty / loading / error state demo satisfying FR8 and §0 requirement.

### Changed
- ADR-002 accepted: Tauri as primary local-agent framework (signed auto-updater, React UI,
  Go as documented headless fallback); pending human question removed.
- AFLEK reviewer personas instantiated in `.claude/agents/` (code, security,
  silent-failure, docs) with MunHub specializations — completing the two-reviewer ensemble.
- Pre-AFLEK orchestration documents (`planning/18`, `planning/20`) superseded by tombstones
  mapping each section to its AFLEK replacement; live references across docs and CI updated.
- `AGENTS.md` and `CLAUDE.md` rewritten in English for the v6 monorepo: single git policy (D32),
  a documentation matrix mapping each change type to the docs it must update, and a session
  hand-off rule; v5 behavioral knowledge preserved in `docs/technical/V5-LEGACY-REFERENCE.md`.
- MunHub now consumes the fleet kit as its first adopter: `FLEET-VERSION` pins kit v0.1.0
  (`alexanderkholodov1/fleet`) and the `fleet/` incubation folder is removed — the kit repo is
  the single source for fleet doctrine, templates, personas, adapters, and playbooks.
- `planning/01-ARCHITECTURE.md`, `02-DATA-MODEL.md`, `03-AGENTS-AND-SDD.md`,
  `05-REDUNDANCY-AND-SECURITY.md`, and `06-AI-DESIGN.md` translated to English (WP-01 wave 1).
planning/07, 08, 09, 10 and RED-CLARA-RESOURCE-TIERS translated to English (WP-01 wave 2)
- planning/11–15 translated to English (WP-01 wave 3)
planning/16,17,19 translated to English (WP-01 wave 4)
planning/00-MASTER-PLAN and THEORETICAL-FOUNDATION translated to English (WP-01 wave 5)
- `docs/research/THEORETICAL-FOUNDATION.md`: geomagnetic cutoff rigidity for the Ecuadorian
  Andes corrected from the overstated "14.0–16.8 GV (highest on the planet)" to the IGRF-based
  value **≈12–13 GV** with the accurate qualifier "among the highest on Earth"; the global
  maximum (≈17 GV, Doi Inthanon, Thailand) is now noted for context. CosmicWatch v2/v3X dead
  times (50 ms / 400 µs, arXiv:2508.12111) and the barometric β table (−0.085 to −0.24 %/hPa)
  were verified against primary sources and confirmed correct — no numerical changes. Three
  citations added to §13: Gerontidou et al. 2021 (world cutoff-rigidity grid), PSNM/Banglieng
  et al. (Thailand ≈17 GV reference), Maghrabi et al. 2023 (KAAU β value).
- Spec numbering unified to the `specs/NNNN-*` folder canon: the backlog now uses canonical
  four-digit spec numbers, with a legacy S-number mapping table at the bottom of
  `planning/04-BACKLOG.md`.
- Removed the Firebase auto-deploy from `main`; production (munhub-lab.web.app) is served from the
  `v5-production` branch, and `main` (v6) no longer redeploys the live site.

### Fixed
- Agent minute aggregation preserves event and coincidence rates as counts per minute while keeping
  detector measurement fields time-averaged.
- Complete-raw capture auto-stop now anchors to the first raw reading timestamp when no capture
  start timestamp is provided.
- README geomagnetic cutoff-rigidity wording aligned with the scientific-honesty standard
  ("among the highest on Earth"); exact figures to be pinned with citations (audit WP-04).

#### Earlier unreleased entries (June 2026)

##### Added
- **README** centered on the platform's scientific value proposition, for an international audience.
- Contribution guide (`CONTRIBUTING.md`) and changelog-fragment workflow (`changelog.d/`).
- **Technical documentation:** `docs/technical/` index, `ARCHITECTURE.md` (with a C4 system-context
  diagram), `DATA-MODEL.md`.
- **Preliminary user manual:** `docs/user-manual/` — the institution → station → detector → session
  mental model and a glossary.
- **Engineering standards** doc: `docs/technical/ENGINEERING-STANDARDS.md` (Clean Architecture,
  SOLID, pragmatic TDD, C4, future-proofing, and the verdicts on evaluated practices).
- This **CHANGELOG**.
- **Design language** "Observatory Dark" (`docs/design/DESIGN-LANGUAGE.md`) and the landing concept.
- **Platform strategy** (`planning/19`): Firebase-max services map and integrations verdict.
- **Decisions** D36–D43 registered in the master plan.

##### Changed
- Versioning set to a pre-release scheme: root `package.json` → `6.0.0-alpha.1`.
- Master-plan "golden rule" updated to the D32 branch + PR + protected-`main` workflow.
- `AGENTS.md`: status line refreshed; documentation-update guardrail added.

## [6.0.0-alpha.1] — 2026-06-08

The first tagged checkpoint of the v6 reconstruction: foundations and engineering workflow in place.

### Added
- **Monorepo scaffold** (S01): pnpm + Turborepo, TypeScript strict, ESLint/Prettier/Vitest, eight
  package/app/service stubs that build, MIT `LICENSE`, `.env.example`.
- **CI quality gate** (S02): GitHub Actions running build · test · lint · typecheck plus a
  `gitleaks` secret scan on every pull request.
- **Protected `main`** with required checks; branch + PR workflow (D32).
- **Multi-provider agent fleet** orchestration (`planning/18`): routing, defense-in-depth review,
  per-provider instruction shims, `CODEOWNERS`, PR template, fleet secret loader.

### Notes
- The v5 application remains in `public/` as a historical reference only.

[Unreleased]: https://github.com/alexanderkholodov1/MuonHub/commits/main
[6.0.0-alpha.1]: https://github.com/alexanderkholodov1/MuonHub/releases/tag/v6.0.0-alpha
