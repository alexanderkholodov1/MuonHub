# MuonHub — Status dashboard

> Living quality/progress board, updated by the orchestrator at the close of each wave.
> Source of truth for "where are we" across the agent fleet. The system that produces these
> numbers is the AFLEK kit (pinned in `FLEET-VERSION`).

_Last updated: 2026-06-14 (MVP code path merged: #42–#47 — detector→agent→provider→dashboard.
**Public landing + city-aggregated detector map #48** in CI (F3 begins). Fleet runs Cursor (impl)
+ Gemini (D35) under a live detached monitor; D35 has already caught a physics bug and verified D20
location privacy pre-merge.)_

## Phase progress
| Phase | Scope | Status |
|---|---|---|
| **F0** | Safety net: CI, branch protection, fleet infra | ✅ done (PR #19 merged) |
| **F1** | Foundations: scaffold, contracts, physics, web/agent skeleton | 🟡 in progress (scaffold ✅; contracts ✅; interface ✅; physics ✅; FirebaseProvider #42, web/ui skeleton #43, **auth #44** all review-clean; agent skeleton next) |
| **Design** | Design Language "Observatory Dark" (D36) → feeds all UI specs | ✅ merged (PR #20); landing design session pending |
| **Docs** | README v6, technical docs, standards, fleet charter | ✅ merged (PRs #21–#23) |
| **Audit** | Project audit + English agent entry points + reconstruction work packages | ✅ merged (PR #26; see `docs/audit/2026-06-12-STATE-OF-PROJECT.md`) |
| **Fleet** | Fleet kit extraction (WP-10/FWP-01…09) + MuonHub adoption (FWP-08) | ✅ kit v0.1 built at `alexanderkholodov1/fleet`; adoption = this PR |
| F2 | Migration munra-1 → munhub-1 | ⏳ |
| F3 | Public landing + live demo | ⏳ |
| F4+ | Ecosystem, AI, networks, admin… | ⏳ |

## Specs in flight
| Spec folder | Title | Implementer | Status | PR |
|---|---|---|---|---|
| `specs/0001-monorepo-scaffold` | Monorepo scaffold | Claude | ✅ merged | on `main` |
| `specs/0002-ci-cd` | CI quality gate | Claude | ✅ merged | PR #19 |
| `specs/0003-shared-contracts` | Shared types + zod contracts | Claude | ✅ merged | PR #24 |
| `specs/0004-data-provider-interface` | DataProvider interface | Claude | ✅ merged | PR #25 |
| `specs/0005-physics` | dead-time, β regression, spectrum, Poisson stats | Adjutant (spec + implementation) | ✅ merged | PR #31 |
| `specs/0006-insights-v0` | per-station corrected rate + statistical baseline | Adjutant (spec) | ✅ merged (in 0018) | PR #46 |
| `specs/0007-firebase-provider` | concrete FirebaseProvider over munhub-1 | Adjutant (spec) + Sonnet (impl) | ✅ merged | PR #42 |
| `specs/0008-web-ui-skeleton` | web shell + Observatory Dark UI foundation | Adjutant (spec) + Sonnet/Cursor (impl) | ✅ merged | PR #43 |
| `specs/0009-auth` | Firebase Auth behind DataProvider + auth UI | Adjutant (spec) + Cursor (impl) | ✅ merged | PR #44 |
| `specs/0011-station-detector` | Create Station + Detector management | Adjutant (spec) + Cursor (impl) | ✅ merged | PR #45 |
| `specs/0018-station-dashboard` | corrected rate + spectrum + insights (impl 0006) | Adjutant (spec) + Cursor (impl) | ✅ merged | PR #46 |
| `specs/0013-agent-core` | serial parsing + per-minute aggregation + offline sync queue | Adjutant (spec) + Cursor (impl) | ✅ merged | PR #47 |
| `specs/0024-public-landing-map` | public landing: city-aggregated detector map + live demo | Adjutant (spec) + Cursor (impl) | ✅ merged | PR #48 |
| `specs/0074-record-slimming` | storage record slimming + realtime cap (federation M1) | Adjutant (spec) + Cursor (impl) | ✅ merged | PR #49 |
| `specs/0075-event-storage-contract` | event & storage data contract (ADR-003) | Adjutant (spec) + Cursor (impl) | ✅ merged | PR #50 |
| `specs/0076-agent-event-science` | agent: noise calibration + EventSummary + NTP clock sync | Adjutant (spec) + Cursor (impl) | ✅ merged | PR #51 |
| `specs/0077-blob-storage` | provider: signal blobs (gzip NDJSON, Cloud Storage) + EventSummary persistence | Adjutant (spec) + Cursor (impl) | 🔍 verifying (CI) | PR #52 |

> ⚠️ **Numbering note:** the `specs/NNNN-*` folders are canonical. The backlog renumbering
> (WP-03) is in PR #29 (old S-number → NNNN mapping table at the bottom of
> `planning/04-BACKLOG.md`); GitHub issues #3–#18 still carry old numbers until WP-02 re-issues
> them.

## Quality gates (defense-in-depth — AFLEK doctrine 7)
| Gate | Mechanism | State |
|---|---|---|
| CI: build/test/lint/typecheck | GitHub Actions `ci.yml` | ✅ active |
| Secret scan | gitleaks | ✅ active |
| `main` protection | PR + both CI checks required; no force-push/delete | ✅ active |
| Coverage hard-gate (≥80%) | vitest coverage (`@muonhub/physics`) | 🔍 active in PR #31 |
| Auto PR review #1 | Copilot review | ⏳ enable on repo (free on Education plan) |
| Auto PR review #2 | Claude reviewer personas (`.claude/agents/`) | ✅ installed (WP-08) — replaces Cursor Bugbot |
| Cross-provider review | author ≠ reviewer (D35) | ⏳ from F1 wave 2 |

## MVP end-to-end checklist (AGENTS.md vertical slice)
- [ ] Auth: user signs in
- [ ] Station + Detector created
- [ ] Agent reads serial + local SQLite backup
- [ ] Data persisted via DataProvider (munhub-1)
- [ ] Dashboard shows live dead-time + barometric-corrected rate
- [ ] Amplitude (Landau) spectrum renders

## Fleet roster (current doctrine: cloud-first — see audit WP-07)
| Provider | Role | Notes |
|---|---|---|
| Claude (Adjutant session) | Orchestrator / architect / reviewer | cloud sessions preferred over local fan-out |
| Claude Sonnet / Haiku | Implementers (cloud subagents / web sessions) | |
| Cursor Cloud Agents + Bugbot | Parallel UI waves + PR review | Pro window expires ~early July — front-load |
| Gemini CLI | Volume implementation / docs / translation | free tier; run in cloud or off-hours |
| Copilot (Education) | Issue → PR agent + second auto-review | |

## Maintainer action queue
1. Review/merge the F1-W3 wave: PR #31 (physics — critical path), PR #29 (spec renumbering),
   PR #30 (planning translation wave 1). #30 is independent; #29 and #31 touch disjoint files.
2. Decide ADR-002 (Tauri vs Go for the local agent) — recommendation: Tauri.
4. Enable **Copilot code review** on the repo (free on Education). Cursor **Bugbot stays off**
   (usage-billed); Claude reviewer personas (WP-08) take its slot in the review ensemble.
5. See `docs/audit/2026-06-12-STATE-OF-PROJECT.md` §Decisions for the full decision queue.
