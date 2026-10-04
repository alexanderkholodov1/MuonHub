# MuonHub — Status

_Last updated: 2026-10-04 · version `6.0.0-alpha.0.4.3` (tag) · branch `feat/m1-core-agent`_

## Milestones (plan: [`product/ROADMAP.md`](product/ROADMAP.md))

| Milestone | Scope | State |
|---|---|---|
| **M0 Foundation** | Cleanup, rename to MuonHub, documentation structure, decisions (ADR-004…009), roadmap and backlog | ✅ merged (PR [#57](https://github.com/alexanderkholodov1/MuonHub/pull/57), tag `v6.0.0-alpha.0.4.3`) |
| **M1 Core + Agent** | Contracts v2, physics fixes, simulator, data layer v2, rules with negative tests, headless agent | 🔄 in progress — plan approved 2026-10-04 ([`product/plans/M1-core-agent.md`](product/plans/M1-core-agent.md)) |
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
- [x] Maintainer confirmed the pending items (2026-10-04).
- [x] Pull request opened: [#57](https://github.com/alexanderkholodov1/MuonHub/pull/57).
- [x] Merged by the maintainer on 2026-10-04; tagged `v6.0.0-alpha.0.4.3`.

## Quality gates

| Gate | State |
|---|---|
| typecheck · lint · build · test (145 tests) | ✅ green locally after the rename |
| Firebase emulator tests | ✅ 19/20 locally; ⚠️ the realtime-cap test exceeds its 20 s timeout on the development machine (≈12 s in CI) — a symptom of the first-attempt realtime pruning design, replaced in M1 |
| CI on GitHub | runs on PR [#57](https://github.com/alexanderkholodov1/MuonHub/pull/57) |

## Open questions for the maintainer

**Resolved on 2026-10-04:** ADR-004 rule 1, ADR-006 rules 7–9 (partial minutes are discarded, as in
v5), ADR-008 pre-scheme note, and ADR-009 (owners can share and transfer ownership; nobody grants
themselves rights) — see [`audit/2026-10-04-SESSION-RECORD.md`](audit/2026-10-04-SESSION-RECORD.md).

**Open, decided later:**
1. Public live demo mechanism (ADR-005 §6, Proposed) — measured in M1.
2. Real contact address for the website (the first-attempt landing shows an unverified
   `contact@munhub.usfq.edu.ec`).
3. Staging environment (dedicated project vs. preview channels plus emulator) — proposed in the M1
   plan.
4. The first station's barometric reference: its barometer reads ≈ 768 hPa (≈ 2.4 km), not the
   ≈ 730 hPa of central Quito; P₀ will be the station's own long-term mean (B-M1-08, B-M1-35).
5. Whether a recipient must accept an ownership transfer (M2 spec).

## Environment

See [`operations/ENVIRONMENTS.md`](operations/ENVIRONMENTS.md). Firebase services for `muonhub` are
set up by the maintainer at the start of M1 following
[`operations/FIREBASE-SETUP.md`](operations/FIREBASE-SETUP.md).
