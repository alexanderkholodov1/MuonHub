# CLAUDE.md

This file orients Claude Code in this repository. **The binding contract for all agents is
[`AGENTS.md`](AGENTS.md) — read it in full before changing anything.** This page only adds
Claude-Code-specific operational notes; if the two ever disagree, `AGENTS.md` wins.

## Starting work — the one word

When the maintainer says **"empieza" / "procedemos con la implementación" / "start"**, run
[`.aflek/playbooks/start.md`](.aflek/playbooks/start.md) top to bottom — this repo is managed by
the AFLEK fleet (Adjutant: `alexanderkholodov1/adjutant-AFLEK`). The flow is: selftest
(`pwsh .aflek/tools/aflek-selftest.ps1 -Project .`) → self-update (`aflek-sync`) → orient (next
milestone from `docs/STATUS.md`) → compose the fleet → **propose the role distribution for the
maintainer's approval** → execute under live monitoring (`fleet-status.ps1`) → self-review →
**one** PR only when truly done → self-improve. Autonomous except the one approval gate; never
open a PR for partial or unverified work — keep going on the same branch. One-time per machine:
`AFLEK_KIT` points at the kit clone (see `.aflek/playbooks/sync-and-update.md`).

## What this repository is

**MuonHub** (pre-alpha): ground-up reconstruction of a cosmic-ray detector monitoring
platform (CosmicWatch-class hardware) as a typed pnpm/Turborepo monorepo. The legacy v5 app
(vanilla JS + Firebase) lives in `public/` as a **read-only behavioral reference** — see
`docs/technical/V5-LEGACY-REFERENCE.md`. Do not edit `public/` except to consult it.

Live project state: `docs/STATUS.md` · plan and decision log (D1–D46): `planning/00-MASTER-PLAN.md`
· backlog: `planning/04-BACKLOG.md` · specs in flight: `specs/`.

## Commands

```bash
pnpm install        # bootstrap workspace (Node ≥ 20, pnpm ≥ 9)
pnpm build          # build all packages (Turborepo)
pnpm test           # vitest suites
pnpm lint           # eslint
pnpm typecheck      # strict TS across the workspace
pnpm --filter @muonhub/shared test   # single-package runs
firebase deploy --only hosting      # legacy v5 only (public/)
```

CI runs `build · test · lint · typecheck` + gitleaks on every PR; `main` is protected.

## Monorepo map

```
apps/web              Next.js (static export, Phase A): landing, dashboards, admin
apps/agent            Tauri: serial reading, SQLite local backup, offline sync queue
services/api          backend/edge functions (Phase B)
services/ai           ML pipeline: anomaly/Forbush detection, barometric β (Phase B)
packages/shared       zod schemas + inferred types — THE contracts (Claude-owned lane)
packages/physics      pure scientific corrections (no I/O; numeric tests mandatory)
packages/data-provider DataProvider interface + Firebase/Supabase implementations
packages/ui           design system — "Observatory Dark" (docs/design/DESIGN-LANGUAGE.md)
```

## Non-negotiables (full versions in AGENTS.md)

1. **Git (D32):** work on a feature branch (`spec/NNNN-*`, `docs/*`, `chore/*`), commit
   (Conventional Commits, English) and push the branch. Never commit to `main`, never merge —
   only the maintainer merges.
2. **No code without a spec** in `specs/NNNN-*/`.
3. **Scientific honesty:** single-SiPM events are "charged-particle / MIP-type" rate, never
   "muons"; nothing may contradict `docs/research/THEORETICAL-FOUNDATION.md`.
4. **Data integrity:** per-minute values are time-averages (never sums); no event filtering;
   validate at boundaries with zod.
5. **Provider-agnostic data:** never call a Firebase/Supabase SDK outside
   `packages/data-provider`.
6. **English only** across the repo — code, comments, commits, docs.
7. **Docs are part of done (D42):** every behavior/structure change updates the affected docs and
   adds a `changelog.d/` fragment **in the same PR** — use the documentation matrix in
   `AGENTS.md` to know exactly which files.
8. **Commit/PR style (D44):** describe what the change delivers; never narrate process or frame
   the change as a reaction to review/correction. See `CONTRIBUTING.md`.

## Session hand-off

Work must never live only in a chat. Before ending a session: push the branch, open/update the PR
with a Stage Report, and update `docs/STATUS.md` if a spec or phase changed state
(orchestrator-owned — coordinate rather than edit in parallel). Audit reports and cross-session
plans live in `docs/audit/`.
