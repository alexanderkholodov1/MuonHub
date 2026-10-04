# 0002 — CI quality gate (build/test/lint/typecheck + secret scan)

> **Superseded (2026-10-03):** first v6 attempt, kept as a historical record. The v6 rebuild
> replaces this work — see [`specs/README.md`](../README.md) and [`docs/product/ROADMAP.md`](../../docs/product/ROADMAP.md).

- **Status:** implemented (2026-06-07)
- **Responsible agent:** Software architect
- **Depends on:** 0001 (monorepo scaffold); D32, D34 (planning/18)
- **Phase:** F1 · **Epic:** EPIC-0 · **Backlog:** S02

> Part of "Phase 0 — safety net" before the multi-provider fleet is unleashed. The CI gate is
> what lets agents push branches safely: nothing merges to `main` without it passing.

## Context
Under D32, agents commit + push feature branches and open PRs; **only Alexander merges to a
protected `main`**. The automated quality gate (this spec) is the precondition that makes that
safe and scalable: every PR is verified before a human ever looks at it.

## Functional requirements
- FR1: A GitHub Actions workflow `ci.yml` runs on every `pull_request` (and push) to `main`.
- FR2: It runs, as blocking steps: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`
  across the whole Turborepo workspace, on Node 22 + pnpm with cache.
- FR3: A `gitleaks` secret-scan job runs on every PR (blocking), with `.gitleaks.toml` allowlisting
  `private/`, the lockfile, and the public Firebase web apiKey.
- FR4: The workflow uses `--frozen-lockfile` so the lockfile is authoritative.
- FR5: Concurrency cancels superseded runs on the same ref.

## Non-functional
- Coverage thresholds are **reported but not blocking yet** (no production code exists). They
  become a **hard gate from S06** (physics) onward, per planning/18 §6 Layer A.
- The existing `firebase-deploy.yml` is unchanged and independent.

## Design / approach
- `pnpm/action-setup@v4` + `actions/setup-node@v4` (`cache: pnpm`).
- Two jobs: `verify` (build/test/lint/typecheck) and `secret-scan` (gitleaks).
- Branch protection on `main` (Alexander, or via `gh api`) requires the `verify` and `secret-scan`
  checks + a PR; direct pushes to `main` are forbidden.

## Acceptance criteria (verifiable)
- [x] CA1: `ci.yml` present; triggers on PR + push to `main`.
- [x] CA2: blocking steps = typecheck, lint, build, test (workspace-wide).
- [x] CA3: gitleaks job present with `.gitleaks.toml` allowlist.
- [x] CA4: branch protection on `main` active — requires PR + both CI checks; force-push/deletion
  disabled; `enforce_admins=false` so the maintainer keeps override and the non-admin fleet token
  cannot push/merge to `main`.
- [x] CA5: workflow uses frozen lockfile + pnpm cache + concurrency cancel.

## Out of scope
- Coverage hard-gate (lands with S06). Deploy pipeline (separate, already exists).

## Tasks
- [x] T1: author `ci.yml` (verify + secret-scan).
- [x] T2: author `.gitleaks.toml` allowlist.
- [x] T3: spec + acceptance.
- [x] T4: branch protection on `main` enabled via `gh api` (PR + checks required, no force-push/delete).
