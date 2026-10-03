# Decisions

This folder is the single place where MuonHub records **why** the project is built the way it is.

## How decisions are recorded

- Every decision that shapes the architecture, the data, the process, or the scope is an
  **Architecture Decision Record (ADR)** in [`adr/`](adr/), named `NNN-short-slug.md`.
- ADRs follow the Nygard format: **Status · Date · Context · Decision · Consequences ·
  Alternatives considered**.
- Statuses:
  - **Proposed** — written down, not yet approved by the maintainer.
  - **Accepted** — approved by the maintainer; binding for every contributor and agent.
  - **Amended** — still in force, but parts were changed by a later ADR (named in its status).
  - **Superseded** — replaced by a later ADR (named in its status); kept as history.
- Only the maintainer accepts a decision. An agent that believes a decision should change writes a
  **Proposed** ADR and raises it in the conversation; it never edits an accepted decision silently.
- Accepted ADRs are not rewritten. A change is a new ADR, plus a status line on the old one.

## ADR index

| ADR | Title | Status |
|---|---|---|
| — | ADR-001 was never written | — |
| [002](adr/002-local-agent-framework.md) | Local agent framework (Tauri) | Superseded by ADR-007 |
| [003](adr/003-data-storage-and-event-model.md) | Data storage tiers, event model, dynamic capacity | Amended by ADR-005 and ADR-006 |
| [004](adr/004-terminology-and-domain-model.md) | Terminology and domain model | Accepted (2026-10-03); wording of rule 1 pending confirmation |
| [005](adr/005-firebase-only-architecture-and-free-tier-budget.md) | Firebase-only architecture and free-tier budget | Accepted (2026-10-03); public live demo (§6), job list, and App Check token lifetime Proposed |
| [006](adr/006-data-integrity-raw-canonical-derived.md) | Data integrity: raw, canonical, derived | Accepted (2026-10-03); wording of rules 7 and 9 pending confirmation |
| [007](adr/007-agent-runtime-headless-daemon.md) | Agent runtime: headless daemon | Accepted (2026-10-03) |
| [008](adr/008-versioning-and-milestone-pr-policy.md) | Versioning and milestone PR policy | Accepted (2026-10-03); pre-scheme checkpoint note pending confirmation |
| [009](adr/009-security-baseline.md) | Security baseline | Accepted in principle ("close every security hole", 2026-10-02); specific rules Proposed until confirmed |

## Historical decision log (D1–D46)

The first reconstruction attempt recorded 46 decisions in its master plan
([`docs/archive/planning/00-MASTER-PLAN.md`](../archive/planning/00-MASTER-PLAN.md) §1). They are not
re-numbered; this table gives the **status of each one today** (2026-10-03), after the v6 reset
session ([session record](../audit/2026-10-02-V6-RESET-SESSION-RECORD.md)).

- **Active** — still in force as written.
- **Amended** — still in force with the change described.
- **Superseded** — replaced; follow the named ADR.
- **Retired** — no longer applies.
- **Active (review in M1)** — not revisited yet; to be confirmed while planning M1.

| ID | Decision | Status today | Current meaning |
|---|---|---|---|
| D1 | Frontend: React + Next.js + TypeScript | Active | Web app in Next.js/TypeScript, built as a static export (no server rendering; see ADR-005). |
| D2 | Backend target: self-hosted Supabase + TimescaleDB (Red Clara) | Superseded by ADR-005 | No Red Clara or Supabase in the foreseeable future; Firebase only. |
| D3 | Backend bridge: Firebase `munhub-1` | Superseded by ADR-005 | v6 runs on the new project `muonhub`; `munhub-1` stays the frozen v5 production project. |
| D4 | Provider-agnostic `DataProvider` layer | Amended by ADR-005 | The boundary stays (backend SDKs only inside the data-provider package); the Supabase phase is retired. |
| D5 | Detector reading + offline: installable Tauri agent | Superseded by ADR-007 | The agent (serial + local SQLite + offline sync) stays; it becomes a headless Node.js/TypeScript daemon. |
| D6 | Monorepo with pnpm + Turborepo | Active | Unchanged. |
| D7 | Target hardware: mostly single-SiPM | Active | Still the honesty constraint for single-SiPM devices; the platform now targets any device type (ADR-004, Bring Your Own Detector). |
| D8 | Multi-tenant: institutions → users → stations, plus independent users | Active (review in M1) | Tenancy model to be confirmed in the M1 data model, using ADR-004 vocabulary. |
| D9 | Honest particle classification by phases (physics first, ML later) | Active | Unchanged. |
| D10 | Three-layer redundancy: local SQLite + primary cloud + cold backups | Amended by ADR-005 | Layer 3 is a private, encrypted backup repository (approved; built in M4). No Cloudflare. |
| D11 | External data: NMDB, NOAA SWPC, NASA DONKI, Dst/Kp | Active | Planned for M4, run as scheduled jobs; open-data references (e.g. HiSPARC, GMDN, Pierre Auger) added as candidates. |
| D12 | Own AI: classical ML first, scalable later | Deferred (placement after 6.0.0 is Proposed) | No server compute exists on the free plan (ADR-005); revisit when ML is planned. |
| D13 | Specs in `/specs` + GitHub issues | Amended (M0 plan, 2026-10-03) | Specs stay in `specs/`; first-attempt specs 0001–0077 are records; new specs continue from 0083; the backlog lives in `docs/product/`. |
| D14 | Code license: MIT | Active | Unchanged. |
| D15 | Toolkit: Tailwind + shadcn/ui + Plotly + MapLibre | Amended (maintainer, 2026-10-02) | uPlot is the primary chart library; Plotly only lazy-loaded for spectrum/fit views (session record §1). |
| D16 | Cold storage: Cloudflare R2 | Retired | No Cloudflare; backups go to the private repository (ADR-005). |
| D17 | Languages: ES + EN + PT-BR | Active | English is the source locale. |
| D18 | Hosting: Firebase Hosting (free plan) + Next.js static export | Amended by ADR-005 | Site `muonhub.web.app` on project `muonhub`; no later server-rendered phase. |
| D19 | Data license: CC-BY 4.0 | Active | Unchanged. |
| D20 | Landing map aggregated by city | Amended (maintainer, 2026-10-02) | Exact coordinates are stored privately; each owner chooses the public display precision (exact / approximate / city / country / hidden), enforced by security rules (ADR-009). |
| D21 | Entity model: Station → Detector(s) | Superseded by ADR-004 | Device, device type, station, assembly, stream, session, calibration, recipe, view. |
| D22 | Visibility chosen explicitly, no default; optional embargo | Active | Unchanged. |
| D23 | Maximize configurability | Active | Reinforced: MuonHub is a scientific tool; every analysis parameter is user-controllable. |
| D24 | Three visibilities + per-station owner/editor/viewer | Active (review in M1) | Enforcement per ADR-009; detailed rules in the M1 data model. |
| D25 | Identity: unique email + username + name; share by email/username | Active (review in M1) | To be confirmed in the M1 data model. |
| D26 | Core always free; only entitlement hooks, no billing in v6 | Active | The Bring Your Own DataBase idea (users connect their own storage, possibly on request or paid later) would need a new decision before it changes this. |
| D27 | Station networks | Active | Unchanged. |
| D28 | English in all code | Active | Unchanged. |
| D29 | Document language: hybrid | Amended (M0 plan, 2026-10-03) | All new content is English; archived historical documents in `docs/archive/` are exempt from translation. |
| D30 | One checkpoint commit per milestone by the maintainer | Superseded by D32 | — |
| D31 | Ingestion: installable agent as the standard path; Web Serial as an optional demo | Amended by ADR-007 | The standard path is the headless daemon agent, signed in with the user's MuonHub account; the optional Web Serial demo idea remains. |
| D32 | Feature branches + PR + CI; protected `main`; only the maintainer merges | Amended by ADR-008 | One PR per milestone, opened only when the milestone is complete; many versioned commits inside. |
| D33 | Multi-provider agent fleet | Retired (maintainer, 2026-10-02) | No other AI providers for now; one Claude Code session (the Adjutant) working with parallel subagents. |
| D34 | Defense-in-depth quality gates | Amended | CI (build, test, lint, typecheck, emulator tests, secret scan) plus independent reviewer subagents (code, security, silent-failure, docs); Bugbot and Copilot review are not used. |
| D35 | Cross-review by a different provider | Amended | The author is never the only reviewer; independent reviewer subagents provide the second view. |
| D36 | Design language "Observatory Dark" | Active | `docs/design/DESIGN-LANGUAGE.md`. |
| D37 | Firebase-complete by default (Red Clara optional) | Superseded by ADR-005 | Firebase free plan only, indefinitely; Cloud Storage and Cloud Functions are not available on that plan. |
| D38 | Integration philosophy (docs-as-code; Storybook, monitoring, CodeQL, Playwright, DOI) | Active (review in M1) | Each tool is confirmed when its milestone is planned; free tools only. |
| D39 | Firebase Auth + roles via custom claims | Active | Reinforced by ADR-009: roles are set only by a trusted script, never from the browser. |
| D40 | Clean/hexagonal architecture + SOLID | Active | Unchanged. |
| D41 | Pragmatic TDD | Active | Reinforced: tests run against real security rules with client identities, the real static export, and captured serial data. |
| D42 | Documentation standards; docs are part of done | Active | ADRs now live in `docs/decisions/adr/`. |
| D43 | Mixture-of-experts in spirit only | Active (ML part) | The fleet-routing part retired with D33. |
| D44 | Commit/PR style: state what the change delivers | Active | Unchanged. |
| D45 | Versioning: SemVer, `6.0.0` = launch | Superseded by ADR-008 | `6.0.0-alpha.<milestone>.<iteration>.<fix>` → beta → rc → `6.0.0`. |
| D46 | Command structure: maintainer → Adjutant → supervisors → workers | Amended (maintainer, 2026-10-02/03) | Maintainer → Adjutant (one Claude Code session) → parallel subagents. The maintainer reads only the chat: every step is explained and approved there before it is built, and nothing lives only in the chat (ADR-008). |
