<!-- MuonHub — Pull Request. Fill every section. PRs that skip this are not reviewable. -->

## Spec & scope
- **Spec:** specs/NNNN-<slug>/spec.md
- **Issue:** #
- **Phase / Epic:** F? · EPIC-?
- **Lane (package(s) touched):**
- **Authoring agent / provider:**

## What changed & why
<!-- One paragraph. What this PR delivers and the reasoning. -->

## Acceptance criteria (copy from the spec, check what is met)
- [ ] CA1:
- [ ] CA2:
- [ ] CA3:

## Tests & evidence
- [ ] Unit/integration tests added or updated
- [ ] Numeric tests vs. THEORETICAL-FOUNDATION values (physics PRs only)
- [ ] `pnpm build && pnpm test && pnpm lint && pnpm typecheck` green locally
<!-- Paste relevant output / coverage notes. -->

## Self-review checklist (D28 / D32 / D42 / D44 / guardrails)
- [ ] All code in **English** (identifiers, comments, commits, i18n keys)
- [ ] **Docs updated** in this PR (README/roadmap/stack, `docs/`, this spec) — D42
- [ ] **Changelog fragment** added in `changelog.d/` — D42
- [ ] This description states **what the change delivers** (no process narration / "as requested" / apologies) — D44
- [ ] Stayed in lane — did **not** edit shared contracts unless this is a contracts spec
- [ ] No direct Firebase/Supabase SDK calls outside `packages/data-provider`
- [ ] No `private/` access, no secrets in code or logs
- [ ] Scientific honesty respected (no "muons" for single-SiPM)
- [ ] Branch is `spec/NNNN-*` (or `chore/*`/`feat/*`); **not** targeting a direct push to main

## Risks / follow-ups
<!-- Known limitations, anything reviewers should scrutinize, deferred work. -->

---
> Reviewers: CI + Cursor Bugbot + Copilot review run automatically. Claude personas
> (Physicist / Security / Architect) review per CODEOWNERS. **Only Alexander merges to `main`.**
