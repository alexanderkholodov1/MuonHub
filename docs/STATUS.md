# MuonHub — Status

_Last updated: 2026-11-06 · version `6.0.0-alpha.1.7` · branch `feat/m1-core-agent`_

## Milestones (plan: [`product/ROADMAP.md`](product/ROADMAP.md))

| Milestone | Scope | State |
|---|---|---|
| **M0 Foundation** | Cleanup, rename to MuonHub, documentation structure, decisions (ADR-004…009), roadmap and backlog | ✅ merged (PR [#57](https://github.com/alexanderkholodov1/MuonHub/pull/57), tag `v6.0.0-alpha.0.4.3`) |
| **M1 Core + Agent** | Contracts v2, physics fixes, simulator, data layer v2, rules with negative tests, headless agent | 🔄 steps 1–7 of 12 done; steps 8, 9 and 11 need the maintainer — plan approved 2026-10-04 ([`product/plans/M1-core-agent.md`](product/plans/M1-core-agent.md)) |
| M2 Web platform | Accounts, stations and devices, live dashboard, public site and live page | ⏳ |
| M3 Science | Comparison, coincidences, geometry and assemblies, calibration, views | ⏳ |
| M4 Open platform | Bring Your Own Detector, operations (backups, alerts, quotas), external data, offline collection | ⏳ |
| *Proposed M5* | Seismic channel — before `6.0.0` (maintainer decision 2026-11-05; placement Proposed) | ⏳ |
| *Proposed M6* | Muography — before `6.0.0` (maintainer decision 2026-11-05; placement Proposed) | ⏳ |
| M5 Migration + launch (*Proposed M7*) | v5 → v6 migration, i18n, manual, DOI → `6.0.0` | ⏳ |

## M1 progress

| Step | State | Version / note |
|---|---|---|
| 1 Tooling and upgrades | ✅ | `6.0.0-alpha.1.1`, `.1.1.1` |
| 2 Specs 0083–0087 | ✅ approved 2026-10-07 | `6.0.0-alpha.1.2` |
| 3 Contracts v2 | ✅ | `6.0.0-alpha.1.3` |
| 4 Physics · 5 Simulator | ✅ physicist review applied | `6.0.0-alpha.1.4`, `.1.5` |
| 6 Data layer v2 and rules v2 | ✅ security and silent-failure reviews applied; nothing deployed | `6.0.0-alpha.1.6` |
| 7 Agent daemon | ✅ security and silent-failure reviews applied | `6.0.0-alpha.1.7` |
| 8 Firebase setup and first deploy | ⏳ **maintainer:** set up `muonhub` per [`operations/FIREBASE-SETUP.md`](operations/FIREBASE-SETUP.md) and create `muonhub-dev` (decision A); then the v2 rules are deployed with his go-ahead | — |
| 9 Site access and format capture | ⏳ **maintainer on site:** Tailscale on the university PC ([`operations/REMOTE-ACCESS.md`](operations/REMOTE-ACCESS.md)); then a ~10-minute capture | — |
| 10 Measurements | ⏳ needs `muonhub-dev` (step 8) | — |
| 11 Install and 72-hour validation | ⏳ needs steps 8–9 and sudo on the university PC (decision H) | — |
| 12 Review and close, PR #2 | ⏳ | — |

Details of each step: the execution log at the end of the M1 plan.

## Quality gates

| Gate | State |
|---|---|
| CI on GitHub (typecheck · lint · build · test, emulator tests, gitleaks) | ✅ green on `68d93bc` (step 7, 2026-10-12) **[verified]** |
| Unit and emulator tests | 389 unit + 372 emulator tests at step 7 **[reported]** (M1 execution log) |

## Open questions for the maintainer

**New (2026-11-06):**
1. **Placement of the seismic channel and muography** before `6.0.0`: two milestones after M4
   (proposed M5 Seismic, M6 Muography; Migration + launch becomes M7) — see
   [`product/ROADMAP.md`](product/ROADMAP.md). The renumbering is done once this is approved.
2. **The two new instruments:** does the seismic sensor exist today (model, where)? Does the
   muograph exist, is it being built, or is it planned (channels, geometry)?
3. **Muography validation:** if the muograph hardware is not ready, may M6 be validated with the
   virtual muograph?

**Open, decided later:**
1. Public live demo mechanism (ADR-005 §6, Proposed) — decided by the M1 step-10 measurement.
2. Real contact address for the website (the first-attempt landing shows an unverified
   `contact@munhub.usfq.edu.ec`).
3. The first station's barometric reference: its barometer reads ≈ 768 hPa (≈ 2.4 km), not the
   ≈ 730 hPa of central Quito; P₀ will be the station's own long-term mean (B-M1-08, B-M1-35).
4. Whether a recipient must accept an ownership transfer (M2 spec).

**Resolved:** staging environment — a separate free project `muonhub-dev` (M1 decision A,
2026-10-04); ADR-004 rule 1, ADR-006 rules 7–9, the ADR-008 pre-scheme note and ADR-009 (2026-10-04,
[`audit/2026-10-04-SESSION-RECORD.md`](audit/2026-10-04-SESSION-RECORD.md)).

## Environment

See [`operations/ENVIRONMENTS.md`](operations/ENVIRONMENTS.md). Firebase services for `muonhub` are
set up by the maintainer following [`operations/FIREBASE-SETUP.md`](operations/FIREBASE-SETUP.md)
(M1 step 8). Latest session: [`audit/2026-11-06-SESSION-RECORD.md`](audit/2026-11-06-SESSION-RECORD.md).
