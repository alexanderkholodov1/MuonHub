<!-- MuonHub — Milestone pull request. A PR opens only when its milestone is planned, tested,
     validated in real practice, and corrected (ADR-008). Fill every section. -->

## Milestone
- **Milestone:** M? — <name> (see `docs/product/ROADMAP.md`)
- **Version at PR time:** `6.0.0-alpha.?.?.?`
- **Approved step plan:** `docs/product/plans/M<n>-<slug>.md`
- **Specs delivered:** `specs/NNNN-…`

## What this milestone delivers
<!-- What the project gains, in product/engineering terms (CONTRIBUTING.md). -->

## Validation
- [ ] `pnpm typecheck && pnpm lint && pnpm build && pnpm test` green locally
- [ ] Firebase emulator tests green (`pnpm --filter @muonhub/data-provider test:emulator`)
- [ ] Real-practice validation done (describe: hardware, duration, conditions, results)
- [ ] Reviewer subagents run (author ≠ reviewer): code-reviewer · security-reviewer (rules/auth) ·
      silent-failure-hunter · docs-auditor · physicist (science) — findings resolved or recorded
<!-- Paste evidence: outputs, measurements, screenshots. -->

## Guardrails (AGENTS.md)
- [ ] Data integrity: raw data never overwritten; derived data labelled with provenance (ADR-006)
- [ ] Scientific honesty: single-SiPM = charged-particle / MIP-type rate, never "muons"
- [ ] Free tier only; quota impact assessed (ADR-005)
- [ ] Backend SDKs only inside `packages/data-provider`
- [ ] Security baseline respected; no secrets in code or logs (ADR-009)
- [ ] English everywhere; terminology per ADR-004
- [ ] Docs updated per the AGENTS.md matrix; `docs/STATUS.md` updated; changelog fragment added

## Known limitations and follow-ups
<!-- Deferred work, open questions, anything reviewers should scrutinize. -->

---
> Only the maintainer merges to `main`. No tool-attribution lines in this description.
