# M0 — Foundation: approved step plan and execution log

- **Approved by the maintainer:** 2026-10-03 (in the chat; recorded in
  [`../../audit/2026-10-03-SESSION-RECORD.md`](../../audit/2026-10-03-SESSION-RECORD.md))
- **Branch:** `chore/m0-foundation` · **Versions:** `6.0.0-alpha.0.1` → `6.0.0-alpha.0.x`
- **Goal:** a clean, coherent base that every later milestone can trust. No product code changes
  except the mechanical rename and the removal of empty stubs.

## Approved steps

| # | Step | What changes |
|---|---|---|
| 1 | Remove v5 from `main` | Delete `public/` (17 files), root `firebase.json` and `database.rules.json`; `.firebaserc` targets `muonhub`. v5 stays intact on `v5-production`. |
| 2 | Archive branches | Tags `archive/spec-0078…0082` and `archive/status-pill-fix`; delete those 6 remote branches. Keep `main`, `v5-production`, and the work branch. Rescue their best ideas into the backlog. |
| 3 | Rename to MuonHub | `@munhub/*` → `@muonhub/*`, strings, storage keys, config. Not renamed: real v5 project names (`munhub-1`, `munhub-lab`), history table, changelog history. |
| 4 | AFLEK and other AI providers | Rescue principles and templates into `docs/process/`; keep `.claude/agents/`. Delete `.aflek/`, `FLEET-VERSION`, `infra/fleet/`, the PowerShell hook, `GEMINI.md`, `.cursor/`, `.github/copilot-instructions.md`. |
| 5 | Dead stubs | Delete `services/api`, `services/ai`, `apps/web/src/stub.ts`. |
| 6 | New documentation | `docs/product/`, `docs/decisions/`, `docs/science/`, `docs/architecture/`, `docs/operations/`, `docs/process/`. |
| 7 | Archive | `planning/` and the v5 reference move intact to `docs/archive/`; the archive is not translated. |
| 8 | New ADRs | 004 terminology · 005 Firebase-only and free-tier budget (incl. public live demo) · 006 data integrity · 007 agent daemon (supersedes 002) · 008 versioning and PR policy · 009 security baseline; 003 amended. |
| 9 | Root documents | Rewrite `README.md`, `AGENTS.md`, `docs/STATUS.md`; slim `CLAUDE.md`; update `CONTRIBUTING.md`. |
| 10 | Old specs | Kept as a record, marked superseded; new specs start at 0083. |

Execution: the rename first (sequential), then parallel subagents in disjoint folders, then review
(docs-auditor, code-reviewer, fact-check, physicist), CI-equivalent gates, link check, and a search
for the old name.

## Execution log

| Version | Commit subject | Notes |
|---|---|---|
| — | archive tags pushed, 6 remote branches deleted | tags verified on the remote before deleting [verified by running] |
| 6.0.0-alpha.0.1 | remove the v5 copy, fleet tooling, and empty service stubs | 79 files; lockfile regenerated |
| 6.0.0-alpha.0.2 | rename the product to MuonHub | 93 files; 145 tests green; emulator 19/20 (see STATUS) |
| 6.0.0-alpha.0.3 | reorganize documentation (moves only) | 32 renames, history preserved |
| 6.0.0-alpha.0.4 | v6 rebuild foundation — decisions, product plan, operations, process | 4 parallel writing lanes |
| 6.0.0-alpha.0.4.1 | align M0 documentation after independent review | docs-auditor, code-reviewer, fact-check |
| 6.0.0-alpha.0.4.2 | apply the physicist review to the science and backlog documents | physicist review and verification |
| 6.0.0-alpha.0.4.3 | record the maintainer's confirmations | partial minutes discarded (as in v5); ownership transfer by owners; pending wording confirmed |

## Additions made during execution (reported in the chat)

- `.claude/settings.local.json` (personal permissions) untracked and git-ignored.
- `.env.example` reduced to the variables the code reads (Supabase and unused entries removed).
- A `physicist` reviewer added to `.claude/agents/` (the rules required a physicist review that no
  agent could run); the other reviewers' project sections filled in.
- The first station's altitude corrected from its barometer (≈ 768 hPa → about 2.4 km in a tropical atmosphere,
  not central Quito's 2,850 m).
- First-attempt changelog fragments compiled into a historical section of `CHANGELOG.md`.
- The maintainer's confirmations of 2026-10-04 are recorded in
  [`../../audit/2026-10-04-SESSION-RECORD.md`](../../audit/2026-10-04-SESSION-RECORD.md).
- `docs/process/WORKFLOW.md` §4: proposals that change established behavior must say so and cite the
  current behavior.
