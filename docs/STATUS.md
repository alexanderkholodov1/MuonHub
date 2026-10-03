# MuonHub — Status

_Last updated: 2026-10-03 · version `6.0.0-alpha.0.x` · branch `chore/m0-foundation`_

## Milestones (plan: [`product/ROADMAP.md`](product/ROADMAP.md))

| Milestone | Scope | State |
|---|---|---|
| **M0 Foundation** | Cleanup, rename to MuonHub, documentation structure, decisions (ADR-004…009), roadmap and backlog | 🔄 in progress |
| M1 Core + Agent | Contracts v2, physics fixes, simulator, data layer v2, rules with negative tests, headless agent | ⏳ step plan to be presented for approval |
| M2 Web platform | Accounts, stations and devices, live dashboard, public site and live page | ⏳ |
| M3 Science | Comparison, coincidences, geometry and assemblies, calibration, views | ⏳ |
| M4 Open platform | Bring Your Own Detector, operations (backups, alerts, quotas), external data, offline collection | ⏳ |
| M5 Migration + launch | v5 → v6 migration, i18n, manual, DOI → `6.0.0` | ⏳ |

## M0 progress (plan: [`product/plans/M0-foundation.md`](product/plans/M0-foundation.md))

- [x] Archived spec branches 0078–0082 and the status-pill branch as `archive/*` tags; branches closed.
- [x] Removed the v5 copy, fleet tooling, other AI-provider shims, and empty service stubs
      (`6.0.0-alpha.0.1`).
- [x] Renamed the product to MuonHub, package scope `@muonhub/*` (`6.0.0-alpha.0.2`).
- [x] Reorganized documentation (`6.0.0-alpha.0.3`).
- [x] New documentation: decisions, product, architecture, science, operations, process, root
      documents (`6.0.0-alpha.0.4`).
- [x] Independent review: docs-auditor, code-reviewer, fact-check, physicist; findings fixed
      (`6.0.0-alpha.0.4.x`).
- [ ] Maintainer confirms the pending items below → PR #1.

## Quality gates

| Gate | State |
|---|---|
| typecheck · lint · build · test (145 tests) | ✅ green locally after the rename |
| Firebase emulator tests | ✅ 19/20 locally; ⚠️ the realtime-cap test exceeds its 20 s timeout on the development machine (≈12 s in CI) — a symptom of the first-attempt realtime pruning design, replaced in M1 |
| CI on GitHub | runs when the milestone PR opens |

## Open questions for the maintainer

**To confirm before PR #1 (wording proposed by the Adjutant):**
1. ADR-004 rule 1 — "detector" keeps only its general scientific sense and never names a data space.
2. ADR-006 rule 7 — missing is not zero: an absent quantity (e.g. no barometer) is recorded as absent;
   a recording gap is never a run of zero counts; a partial minute is marked partial.
3. ADR-006 rule 9 — raw timestamps are kept; corrected timestamps are derived, with a record of time
   quality (source, offset, drift).
4. ADR-008 — the June 2026 checkpoint `6.0.0-alpha.1` predates the scheme and sorts above
   `6.0.0-alpha.0.x`; it is marked pre-scheme (no artifact consumes it).
5. ADR-009 — the specific security rules (accepted in principle: "close every security hole").
6. ADR-006 rule 8 precision (physicist review) — intensive quantities are time averages; per-event
   values are summarised as mean/min/max with N; counts are events per interval with their covered
   live time; cumulative counters (e.g. dead time) are stored as increments, never averaged. Once
   confirmed, `AGENTS.md` guardrail 4 and the code-reviewer checklist use the same wording.

**Open, decided later:**
7. Public live demo mechanism (ADR-005 §6, Proposed) — measured in M1.
8. Real contact address for the website (the first-attempt landing shows an unverified
   `contact@munhub.usfq.edu.ec`).
9. Staging environment (dedicated project vs. preview channels plus emulator) — proposed in the M1
   plan.
10. The first station's barometric reference: its barometer reads ≈ 768 hPa (≈ 2.4 km), not the
    ≈ 730 hPa of central Quito; P₀ will be the station's own long-term mean (B-M1-08, B-M1-35).

## Environment

See [`operations/ENVIRONMENTS.md`](operations/ENVIRONMENTS.md). Firebase services for `muonhub` are
set up by the maintainer at the start of M1 following
[`operations/FIREBASE-SETUP.md`](operations/FIREBASE-SETUP.md).
