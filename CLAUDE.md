# CLAUDE.md

Claude Code notes for this repository. **The binding contract is [`AGENTS.md`](AGENTS.md) — read it
in full first.** If this file and `AGENTS.md` ever disagree, `AGENTS.md` wins.

## Starting a session

1. Read `AGENTS.md`, then [`docs/STATUS.md`](docs/STATUS.md) (active milestone, open questions) and
   the latest session record in [`docs/audit/`](docs/audit/).
2. When the maintainer says **"empieza" / "start"**: identify the next step of the active milestone in
   `docs/STATUS.md` and [`docs/product/ROADMAP.md`](docs/product/ROADMAP.md). If the milestone has no
   approved step plan yet, write one with
   [`docs/process/templates/milestone-plan.md`](docs/process/templates/milestone-plan.md) and present
   it in the chat for approval **before** executing anything.
3. Do not use Claude memory features for this project; persist state in the repository (or in the
   git-ignored `private/` folder for sensitive notes).

## Commands

```bash
pnpm install        # bootstrap the workspace (Node >= 22.13, pnpm 11 via corepack)
pnpm build          # build all packages (Turborepo)
pnpm test           # vitest suites
pnpm lint           # eslint
pnpm typecheck      # strict TypeScript across the workspace
pnpm --filter @muonhub/shared test                   # single-package run
pnpm --filter @muonhub/data-provider test:emulator   # Firebase emulator tests (needs Java 21)
```

CI runs `typecheck · lint · build · test`, the emulator tests, and gitleaks on every PR; `main` is
protected and only the maintainer merges.

## Monorepo map

```
apps/web               Next.js static export — public site, dashboards (rebuilt in M2)
apps/agent             device agent (rebuilt in M1 as a headless Node daemon — ADR-007)
packages/shared        zod contracts and inferred types
packages/physics       pure scientific functions (no I/O; numeric tests mandatory)
packages/data-provider DataProvider interface + Firebase implementation (the only SDK boundary)
packages/ui            design system "Observatory Dark"
infra/firebase         Firebase config, security rules, emulator settings (project `muonhub`)
specs/                 specifications (0001–0077: first attempt, superseded; new specs from 0083)
docs/                  product, decisions, architecture, science, operations, process, archive
```

## Reviewer subagents

`.claude/agents/` holds `code-reviewer`, `security-reviewer`, `silent-failure-hunter`, and
`docs-auditor`. Use them before a milestone PR opens; the author is never the only reviewer.
