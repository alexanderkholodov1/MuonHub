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

## M0 progress

- [x] Archived spec branches 0078–0082 and the status-pill branch as `archive/*` tags; branches closed.
- [x] Removed the v5 copy, fleet tooling, other AI-provider shims, and empty service stubs
      (`6.0.0-alpha.0.1`).
- [x] Renamed the product to MuonHub, package scope `@muonhub/*` (`6.0.0-alpha.0.2`).
- [x] Reorganized documentation (`6.0.0-alpha.0.3`).
- [ ] New documentation content: decisions, product, science, operations, process, root documents.
- [ ] Review (reviewer subagents), link check, gates, PR #1.

## Quality gates

| Gate | State |
|---|---|
| typecheck · lint · build · test (145 tests) | ✅ green locally after the rename |
| Firebase emulator tests | ✅ 19/20 locally; ⚠️ the realtime-cap test exceeds its 20 s timeout on the development machine (≈12 s in CI) — a symptom of the first-attempt realtime pruning design, replaced in M1 |
| CI on GitHub | runs when the milestone PR opens |

## Open questions for the maintainer

1. Real contact address for the website (the first-attempt landing shows an unverified
   `contact@munhub.usfq.edu.ec`).
2. Staging environment for M1/M2 (dedicated project vs. preview channels) — to be proposed in the M1
   plan.

## Environment

See [`operations/ENVIRONMENTS.md`](operations/ENVIRONMENTS.md). Firebase services for `muonhub` are
set up by the maintainer at the start of M1 following
[`operations/FIREBASE-SETUP.md`](operations/FIREBASE-SETUP.md).
