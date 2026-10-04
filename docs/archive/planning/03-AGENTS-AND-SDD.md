# MunHub Lab v6.0 — Agents and Spec-Driven Development

> Depends on: [`00-MASTER-PLAN.md`](00-MASTER-PLAN.md), [`01-ARCHITECTURE.md`](01-ARCHITECTURE.md),
> [`02-DATA-MODEL.md`](02-DATA-MODEL.md).
> Defines HOW the agent fleet builds v6.0 without drifting. This document is the operating
> contract for all agents.

---

## 1. Golden rules (valid for ALL agents)

1. **Branch + PR per stage (D32).** The agent commits/pushes **its feature branch** and opens a
   **PR**; **only Alexander merges to `main`** (never an agent). Work proceeds by **milestones**
   and, on closing one (with docs + changelog fragment, D42), the agent opens the PR with its
   Stage Report and **continues** with the next independent spec without waiting for the merge.
   See §4bis. Never touch `private/`.
2. **No code without a spec.** Every implementation references a spec in `/specs/NNN-*/` with
   acceptance criteria. If it does not exist, the spec is written first.
3. **Respect decisions D1–D45** of the master plan. If an agent believes a decision should
   change, it PROPOSES the change to the orchestrator/human; it never changes it unilaterally.
4. **Scientific honesty.** No overpromising physics (see D7/D9 and the theoretical report).
   The physicist agent has veto power over scientific claims.
5. **Data integrity.** Averages never sums; no event filtering; invariants in
   `packages/shared` validated with `zod`.
6. **Agnostic data layer.** Never call the Firebase/Supabase SDK directly from the app;
   always go through `DataProvider`.
7. **Stay in your lane.** Each agent touches only the packages/folders of its role, except
   under explicit coordination.
8. **Leave a trace.** Every task updates the status in its spec and in the GitHub Issue.

---

## 2. Spec-Driven Development (SDD) cycle

```
1. IDEA / need (from 04-BACKLOG.md)
       ↓
2. SPEC  → /specs/NNN-feature/spec.md   (architect/physicist as appropriate)
       ↓  (human review = gate)
3. PLAN  → atomic tasks + acceptance criteria  (in the same spec)
       ↓
4. BUILD → implementation by the corresponding dev agent
       ↓
5. VERIFY→ checks against acceptance criteria (+ automated tests)
       ↓
6. REVIEW→ human reviews and commits
```

**Human gates:** after the SPEC (step 2) and before the COMMIT (step 6).

### Spec template (`/specs/NNN-feature/spec.md`)

```markdown
# NNN — <Title>
- **Status:** draft | approved | in-progress | done
- **Responsible agent:** <role>
- **Depends on:** <specs/decisions>
- **Phase:** F1..F8

## Context
Why this feature exists; links to decisions (D#) and docs.

## Functional requirements
- FR1 …

## Non-functional requirements
- Performance, security, i18n, accessibility…

## Design / approach
How it is implemented; affected files/packages; contracts.

## Acceptance criteria (verifiable)
- [ ] AC1 …
- [ ] AC2 …

## Out of scope
What it does NOT include (prevents scope creep).

## Tasks
- [ ] T1 … (agent, estimate)
- [ ] T(n-1): update the **affected documentation** (README/roadmap/stack, `docs/technical`,
      `docs/user-manual`, this spec) — D42.
- [ ] T(n): add a **changelog fragment** at `changelog.d/<slug>.<category>.md` — D42.
```

> **Mandatory in EVERY spec** (D42): the last two tasks — affected documentation + changelog
> fragment — are part of "done". A spec without them is incomplete. Commits/PRs follow
> `CONTRIBUTING.md` (D44).

---

## 3. Agent roster (charters)

> Each charter is the base "system prompt" used to invoke that agent. The orchestrator
> instantiates them with the concrete spec as the task.

### 🧭 Orchestrator
- **Mission:** decompose the backlog into specs/tasks, assign to the right agent, watch
  dependencies and coherence with D1–D17, prevent drift, consolidate state.
- **Does:** creates/updates specs and Issues, sequences work, detects conflicts between
  agents, escalates questions to the human.
- **Does not:** implement features, decide science, commit.
- **Inputs:** docs `00`–`07` + Issue state. **Outputs:** sprint plan, assignments.

### 🔬 Research physicist
- **Mission:** guarantee scientific grounding and honesty.
- **Does:** writes/updates `docs/research/THEORETICAL-FOUNDATION.md`; defines formulas
  (barometric correction, flux), "normal" ranges, correct language for UI/landing;
  reviews specs with scientific content; specifies `packages/physics`.
- **Does not:** UI/infra code; stack decisions.
- **Veto:** incorrect scientific claims. **Inputs:** deep research results,
  papers. **Outputs:** theoretical report, physics specs, educational texts.

### 🏗️ Software architect
- **Mission:** architectural integrity and ADRs.
- **Does:** architecture specs, defines contracts (`DataProvider`, `shared`), reviews PRs
  for coupling/layering, writes ADRs in `docs/technical/adr/`.
- **Does not:** science; product features without a spec.

### 💻 Frontend dev (web)
- **Mission:** `apps/web` + `packages/ui`.
- **Does:** landing, dashboards, charts (Plotly), map (MapLibre), i18n (es/en/pt-BR),
  accessibility, `DataProvider` consumption.
- **Does not:** backend/serial logic; touch `data-provider` internals.

### 💻 Backend/Data dev
- **Mission:** `packages/data-provider`, `services/api`, schema and migration.
- **Does:** `FirebaseProvider`/`SupabaseProvider`, rules/RLS, v5→v6 migration, jobs.
- **Does not:** UI; science.

### 💻 Local-agent dev
- **Mission:** `apps/agent` (Tauri).
- **Does:** cross-platform serial reading (ports the 4 v5 formats), local SQLite, offline
  sync queue, idempotency, packaging/installers per OS.
- **Does not:** web UI; cloud backend (only consumes it via `DataProvider`).

### 🗄️ DB/Redundancy engineer
- **Mission:** data robustness and redundancy (priority #1).
- **Does:** TimescaleDB (hypertables, continuous aggregates, retention), cold backups to
  R2, restoration, integrity/checksum verification.
- **Does not:** UI; science.

### 🤖 ML engineer
- **Mission:** design (now) and implement (Phase 7) `services/ai`.
- **Does:** `06-AI-DESIGN.md`, anomaly/forecasting/Forbush pipeline, the `ai_insights`
  contract, resource plan (input for Red Clara tiers), self-heal/retraining.
- **Does not:** deploy AI before a server exists; overpromise (coordinates with the physicist).

### 🔐 Security
- **Mission:** auth, deny-by-default RLS/rules, secret handling, integrity.
- **Does:** reviews rules, keeps `.env`/secrets out of the repo, role model, auditing.
- **Does not:** product features.

### 📖 Documentation
- **Mission:** `docs/user` (manual + FAQ), `docs/technical` (architecture, deployment),
  groundwork for `docs/paper`.
- **Does:** guides understandable by universities and the public; deployment instructions.
- **Does not:** decide architecture/science (documents them after approval).

---

## 4. Coordination and anti-drift

- **Source of truth:** `/planning` (decisions/plan) + `/specs` (contracts) + `/docs`.
- **One spec = one owner.** Cross-package changes are negotiated via the orchestrator.
- **Decision changes (D#):** only the human approves them; recorded as a new ADR.
- **Definition of Done (DoD):** acceptance criteria ✓ + tests ✓ + typecheck/lint ✓ +
  i18n keys ✓ + no direct SDK calls + **affected docs + changelog fragment** (D42) +
  spec marked `done` + **open PR with green CI** (ready for Alexander to merge).
- **Conflicts:** if two agents need the same file, the orchestrator serializes.

---

## 4bis. Milestone protocol — branch + PR (D32, autonomous operation)

Work proceeds **by stages** (milestone = spec / coherent group of specs). Under **D32** the
agent **does not wait** for Alexander to continue:

1. The agent completes the stage to its Definition of Done (including **docs + changelog
   fragment**, D42).
2. **Commits + pushes its feature branch** and **opens a PR** (style per `CONTRIBUTING.md`/D44)
   with the **Stage Report** in the body.
3. **CONTINUES with the next independent spec** (disjoint lane) without waiting for the merge.
   Dependent work is **stacked** on its branch or deferred by the orchestrator (see `18 §8bis`).
4. **Alexander merges green PRs asynchronously**, in batches, when time allows. If changes are
   requested, the agent updates its branch.

> Hard rule: no agent pushes/merges to `main`; **only Alexander merges**. The **PR + green CI**
> is the save point; the working tree and remote branches are the safety net.

### Stage Report template
```
# Stage Report — <milestone / specs>
- Specs completed: S..., S...
- Summary: what was built and why.
- Decisions / deviations vs spec (with justification).
- Files created/modified (list).
- How to verify: commands/steps + expected result (acceptance criteria ✓).
- Problems, risks, and pending items for the next milestone.
- Ready for review and commit.
```

### Granularity and token control
- **One milestone = one coherent, substantial deliverable = ONE PR for Alexander to merge.**
  NOT one PR per file (tedious); NOT entire giant epics (risk of running out of quota midway).
- **Size each milestone to fit in one session.** If quota runs out midway, the **working tree
  keeps the files** (nothing is lost); the agent leaves a "progress so far" report to resume.
- **Issues ≠ checkpoints.** Issues only track tasks; the **save point and rollback are Git
  commits** (rolling back = `git revert`/reset to the previous commit). An Issue may map to a
  milestone, but it is the commit that saves/reverts.
- When starting the next milestone, start **fresh** from the report + the specs (do not reload
  the whole history → fewer tokens).

## 5. How to invoke the fleet (operational)

1. Read `00`–`03` (+ `04-BACKLOG.md`).
2. Take the highest-priority epic/spec that is ready (no open dependencies).
3. If the spec is missing → invoke the architect/physicist to write it → **human gate**.
4. With the spec approved → invoke the dev of the matching role → implement against the criteria.
5. Verify (tests + criteria) → mark the spec → **leave it ready for the human to commit**.
6. Repeat. The orchestrator maintains the board (Issues) and prevents overlaps.
