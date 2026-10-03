# AGENTS.md — Agent entry point (START HERE)

> If you are an agent (any provider, any model) picking up work on MuonHub v6.0: **read this file
> first, in full, before touching anything.** It is the binding entry contract. Provider shims
> (`GEMINI.md`, `.cursor/rules/00-agents.mdc`, `.github/copilot-instructions.md`, `CLAUDE.md`)
> are pointers to this document.

---

## What this is

**MuonHub** is the complete reconstruction of a web platform for acquiring, storing,
visualizing, and analyzing data from cosmic-ray detectors (CosmicWatch-class / muon detectors),
built to become a multi-university research network across Latin America.

**Current state:** 🚧 **Pre-alpha — active reconstruction.** Planning is complete; **F0 done**
(monorepo, CI, protected `main`, fleet infrastructure); **F1 in progress** (scaffold, shared
contracts, and the `DataProvider` interface are merged; the physics package is next). The v5.0
code (vanilla JS + Firebase) remains in `public/` as a historical reference; v6.0 is built fresh
in the monorepo.
Do not edit `public/` except to consult proven behavior
(`docs/technical/V5-LEGACY-REFERENCE.md`). Live state: `docs/STATUS.md`.

**Key vocabulary (D21):** a **Station** is the registered profile/site (location, metadata,
visibility — what appears on the map). A **Detector** is the physical CosmicWatch device inside a
station (device token, calibration, firmware). Data belongs **to a detector**. "Detector" ALWAYS
means the physical device; never use it for the profile.

**Command structure (D46; generalized into the AFLEK kit):** the **maintainer** (Alexander Kholodov) sets the
vision, approves decisions, and is the only one who merges. The **Adjutant** (the orchestrator
session the maintainer talks to directly) plans waves, routes work, reviews, integrates, and
reports. **Supervisor agents** own an area; **worker agents** execute specs in their lane. If you
are a worker or supervisor: follow your spec and these rules; cross-cutting or directional
decisions go through the Adjutant and the maintainer.

**Investigation standard (standing order).** When you investigate, propose, or evaluate a tool,
provider, or capability — or before concluding something "can't be done" — read the official
docs / landing page and verify the CURRENT reality FIRST, then act. Do not conclude from shallow
probing, stale memory, or assumption, and do not build a workaround when the real tool already
exists. Names and capabilities change (e.g. "Twitter" is now "X"); confirm the present reality
before relying on it.

---

## Required reading order

1. `planning/00-MASTER-PLAN.md` — vision, the decision log (D1–D46), phases, index.
2. `planning/01-ARCHITECTURE.md` — architecture, agnostic data layer, principles.
3. `planning/02-DATA-MODEL.md` — schema, metadata, v5→v6 migration.
4. `planning/03-AGENTS-AND-SDD.md` — your role, the Spec-Driven cycle, the spec template.
5. `planning/04-BACKLOG.md` — epics → specs with acceptance criteria.
6. `docs/research/THEORETICAL-FOUNDATION.md` — **the official scientific basis** (never
   contradict it).
7. As your task requires: `05` (security), `06` (AI/ML), `07` (external APIs), `08` (risks),
   `09` (detector lifecycle), `10` (operations/governance), `11` (permissions/roles),
   `12` (support/notifications), `13` (monetization/entitlements), `14` (station networks),
   `15` (admin console), `RED-CLARA-RESOURCE-TIERS.md`. Fleet operation: the AFLEK kit
   (pinned in `FLEET-VERSION`); `planning/18`/`20` are superseded tombstones.

> Some `planning/` documents are still being translated to English (tracked in
> `docs/audit/2026-06-12-STATE-OF-PROJECT.md`). Their content remains authoritative while the
> translation lands; all **new** repo content must be in English.

---

## Guardrails (non-negotiable)

1. **Git policy — D32.** Work on a **feature branch** (`spec/NNNN-*`, `feat/*`, `fix/*`,
   `docs/*`, `chore/*`), one worktree per task. At each milestone: commit (Conventional Commits,
   **English**, with an agent trailer), push **your branch**, open or update the **PR** with a
   Stage Report (`planning/03 §4bis`) → then STOP for review. 🔒 **NEVER** commit or push to
   **`main`**, never merge — **only the maintainer merges** (final human gate). Without green CI
   a PR is not mergeable. Do not start the next milestone while the previous PR isn't ready for
   review.
2. **No code without a spec.** Every implementation references a spec in `specs/NNNN-*/`. If it
   doesn't exist, write the spec first (template in `planning/03`) → human gate → then build.
3. **Respect decisions D1–D46.** If you believe a decision should change, PROPOSE it (PR
   comment, issue, or Stage Report); never change it unilaterally.
4. **Scientific honesty.** Nothing may contradict `THEORETICAL-FOUNDATION.md`. Never label
   individual events as "muons" on single-SiPM detectors — use "charged-particle / MIP-type
   rate". Muon language is valid only for aggregate inference or coincidence-mode hardware.
5. **Data integrity.** Per-minute values are **time-averages, never sums**: averaging preserves
   rate semantics, so records of different completeness stay comparable across detectors and
   sessions; statistical uncertainties are then derived from raw counts (√N, foundation §10).
   No event filtering. Validate all boundary data with `zod`.
6. **Provider-agnostic data layer.** Never call the Firebase/Supabase SDK directly from apps or
   services; everything goes through `DataProvider` (`packages/data-provider`).
7. **Stay in your lane.** Edit only the package(s) of your assignment. The shared contracts
   (`packages/shared`, `packages/data-provider` interface) are orchestrator-owned; cross-package
   changes route through the Adjutant.
8. **Leave a trace.** Update your spec's status and the related GitHub issue; add a
   `changelog.d/` fragment; never leave project state only in a chat.
9. **English everywhere (D28/D29).** Identifiers, comments, commit messages, i18n keys, DB
   schema, API names, documentation — all in English. English is the UI source locale; es/pt-BR
   are translations. The repository is public: no Spanish (or any other language) in any new
   content.
10. **Documentation is part of "done" (D42).** A PR that changes behavior, structure, or policy
    without updating its documentation is incomplete. Use this matrix:

    | If your change touches… | Update in the SAME PR |
    |---|---|
    | User-visible behavior / a feature | relevant `docs/technical/` page · `docs/user-manual/` · spec status · `changelog.d/` fragment |
    | Architecture, packages, stack | `docs/technical/ARCHITECTURE.md` · README structure/stack blocks · `CLAUDE.md` commands if they changed |
    | Schema or shared contracts | `docs/technical/DATA-MODEL.md` · migration notes (`planning/16`) |
    | Physics, corrections, scientific wording | `docs/research/THEORETICAL-FOUNDATION.md` (requires physicist-persona review) |
    | UI / design | conformance with `docs/design/DESIGN-LANGUAGE.md` §0 checklist · screenshots in the PR |
    | Process or agent policy | `AGENTS.md` **and** all provider shims (`GEMINI.md`, `.cursor/rules/00-agents.mdc`, `.github/copilot-instructions.md`, `CLAUDE.md`) — they must never drift |
    | Spec/phase state | `docs/STATUS.md` (orchestrator-owned — coordinate, don't edit in parallel) |
    | Anything | a `changelog.d/<slug>.<category>.md` fragment (`changelog.d/README.md`) |

11. **Commit and PR style (D44, see `CONTRIBUTING.md`).** Titles and descriptions state **what
    the change delivers**, in product/engineering terms, for a human reading the history. Never
    narrate the process, the options considered, or frame a change as a reaction to a correction
    ("as requested", "now without X", "fixed the issue where…"). No apologies, no deliberation:
    the history records what the project gained; the negotiation stays in the chat. SemVer:
    `6.0.0` = the MuonHub 6 launch (D45).

---

## The first vertical slice (MVP) — Phase 1 goal

Before building features in breadth, achieve **one end-to-end vertical slice** on the new stack
with the real USFQ detector:

```
USFQ Station (1 physical Detector) → agent (reads serial + local SQLite)
   → DataProvider(Firebase munhub-1) → station dashboard shows, LIVE:
     charged-particle rate + pressure, dead-time and barometric corrected (local β),
     and the amplitude spectrum.
```

**"MVP achieved" means:** an authenticated user creates a station + detector, connects the
detector through the agent, and watches the corrected rate and spectrum update live, with data
persisted in `munhub-1` and backed up locally. This validates the whole chain (D1–D23) before
scaling.

---

## How to pick your first task

1. Open `planning/04-BACKLOG.md` and follow the **critical path** (EPIC-0 → 1 → 2 → 3 → …).
2. Take the highest-priority spec **with no open dependencies**.
3. No spec in `specs/` yet? Write it using the `planning/03` template → request human approval →
   implement. Worked examples: `specs/0001-monorepo-scaffold/`, `specs/0003-shared-contracts/`.
4. Verify against the acceptance criteria and tests, update the spec status, then follow
   guardrail 1: branch → commit → push → PR with Stage Report → stop.

> Note: GitHub issues #3–#18 predate the D32 policy and still say "no auto-commits — stop for
> the maintainer to commit". **D32 supersedes that text**: you commit and push your branch and
> open a PR; only merging is reserved for the maintainer.

---

## Keys and secrets

`private/` (service accounts for the old `munra-1` and new `munhub-1` projects, fleet API keys)
is gitignored. **Never** commit, read aloud, or print its contents. Production configuration
travels via environment variables (`.env.example` documents the shape; never real values).
