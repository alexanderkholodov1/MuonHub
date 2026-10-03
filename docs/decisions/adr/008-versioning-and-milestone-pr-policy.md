# ADR-008 — Versioning and milestone PR policy

- **Status:** Accepted
- **Date:** 2026-10-03 (versioning agreed on 2026-10-02)
- **Supersedes:** D45. **Amends:** D32, D46.

## Context

- **What D45 said:** SemVer, with `6.0.0` as the launch and pre-releases `6.0.0-alpha/beta/rc.N`.
- **What the maintainer wanted:** to use all digits during development, with `-alpha`/`-beta`
  meaning "not official yet", and call the finished product `6.0.0`.
- **Why the obvious scheme fails:** bumping minor or patch numbers during development (e.g.
  `6.3.0-beta`) and then releasing `6.0.0` makes versions go *backwards*. SemVer orders
  `6.3.0-beta` above `6.0.0`, and tools that compare versions — package managers, and the agent's
  updater — would treat the final release as older.
- **The maintainer's PR policy:** few, large PRs — about 5–6 for the whole of v6. Each opens only
  when its milestone is fully planned, tested (unit and integration), **validated in real practice
  with real hardware**, and corrected along the way. Each contains many commits with minor
  versions.
- **The maintainer's process rule:** he reads only the chat. The complete step plan of each
  milestone is shown there and approved before execution, and nothing lives only in the chat.

## Decision

### Version format
- **During v6 development:** `6.0.0-alpha.<milestone>.<iteration>.<fix>`.
  - Example: `6.0.0-alpha.2.3.1` = milestone 2, iteration 3, fix 1.
  - This is valid SemVer: numeric pre-release identifiers compare numerically, so the order is
    always correct.
- **Then:** `6.0.0-beta.N` → `6.0.0-rc.N` → **`6.0.0`**.
- **After the launch:** normal SemVer — `6.0.x` fixes, `6.x.0` compatible features, `7.0.0` for a
  public contract break.
- **Lockstep:** the root package and every workspace package (`apps/*`, `packages/*`) carry the
  same version. Other places that carry it: `MUONHUB_VERSION` in `packages/shared/src/index.ts`
  (same value) and the README badge (milestone level, e.g. `6.0.0-alpha.0`).
- **Pre-scheme checkpoint:** the June 2026 checkpoint was labelled `6.0.0-alpha.1` (git tag
  `v6.0.0-alpha`) before this scheme existed. Under SemVer precedence it sorts above every
  `6.0.0-alpha.0.x`. No distributed artifact or updater consumes it, so it has no practical effect;
  `CHANGELOG.md` marks it as pre-scheme. *(Handling proposed by the Adjutant on 2026-10-03 —
  pending maintainer confirmation.)*
- **Commits that change the version** carry it in their subject, e.g.
  `chore: … (6.0.0-alpha.0.2)`.
- **Tags:** a milestone is tagged `v<version>` when the maintainer merges its PR.

### Milestones and PRs

| Milestone | PR | Scope (summary) |
|---|---|---|
| M0 Foundation | 1 | Cleanup, MuonHub rename, documentation structure, decisions, roadmap and backlog |
| M1 Core + Agent | 2 | Contracts v2, corrected physics, synthetic generator tier 1, data layer v2 (Firestore + RTDB), rules with negative tests, headless agent; validated with 72 h on the real detector |
| M2 Web platform | 3 | Accounts, stations/devices/streams, live dashboard (also mobile), public map with privacy levels, public live demo, deployment to `muonhub.web.app` |
| M3 Science | 4 | Comparison, stacked coincidences, geometry and assemblies, versioned calibration, views |
| M4 Open platform | 5 | Bring Your Own Detector, operations (backups, alerts, usage monitor), external and open data, offline collection |
| M5 Migration + launch | 6 | v5 → v6 migration, i18n, manual, DOI → `6.0.0` |

After `6.0.0`, in 6.x releases: the seismic channel, and muography (study → simulation →
demonstrator).

### Rules
1. **One branch and one PR per milestone.** The branch is pushed regularly as a backup. The PR is
   opened **only when the milestone is complete**: planned, tested, validated in real practice,
   reviewed (author ≠ reviewer, via independent reviewer subagents), with docs and changelog
   updated.
2. **The maintainer approves the full step plan of each milestone in the chat before execution.**
   Any deviation found during execution is reported in the chat before it is acted on.
3. **Only the maintainer merges**, and `main` stays protected (D32).
4. **Nothing lives only in the chat:**
   - decisions, findings, and proposals are written to the repository;
   - anything that must stay private goes in the git-ignored `private/` folder;
   - agent memory features are not used for this project.

## Consequences

- PRs are large, so each milestone's PR description carries a structured report: what was
  delivered, the tests, the real-world validation evidence, the review outcome, and known issues.
- CI runs on pull requests to `main`. Until a milestone PR is open, the same gates are run locally,
  and the results are reported in the chat.
- `CHANGELOG.md` gets one section per merged milestone, compiled from the `changelog.d/` fragments.

## Alternatives considered

- **Bumping minor/patch numbers during development and renaming the final release `6.0.0`:**
  rejected, because versions would go backwards.
- **One PR per spec**, the first attempt's cadence: rejected by the maintainer. It accumulated
  half-finished work.
- **`0.x` versions before the launch:** rejected; the product line is v6.
