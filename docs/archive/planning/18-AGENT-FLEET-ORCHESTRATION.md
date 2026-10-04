# 18 — Agent fleet orchestration [SUPERSEDED by AFLEK]

> **Superseded (2026-06-13).** This document designed MunHub's original multi-provider fleet,
> including local parallel execution of provider CLIs — a doctrine retired after it degraded
> the operator's machine and hid feedback (audit 2026-06-12, defect 9 / WP-07). The system it
> described was generalized, corrected, and extracted into the **AFLEK kit**
> (<https://github.com/alexanderkholodov1/AFLEK>), which MunHub consumes pinned via
> `FLEET-VERSION`. The original Spanish text is preserved in git history
> (`git log -- planning/18-AGENT-FLEET-ORCHESTRATION.md`).

What replaced each section:

| This document covered | Now lives in |
|---|---|
| Provider inventory & routing matrix | AFLEK `adapters/` + `doctrine/DOCTRINE.md` rule 7 |
| Execution model (local CLIs) | **retired** — AFLEK doctrine rule 1 (cloud-first) |
| Defense-in-depth quality gates (§6) | AFLEK doctrine rule 7; live state in `docs/STATUS.md` (quality-gates table) |
| Reviewer personas (Layer C) | AFLEK `personas/`, instantiated in `.claude/agents/` |
| Wave/lane scheduling | AFLEK `playbooks/run-a-wave.md` + `templates/work-package.md` |
| MunHub-specific roster & lanes | `docs/STATUS.md` (fleet roster table) |

Binding agent rules: `AGENTS.md`. Historical references to "planning/18 §N" in specs,
changelogs, and the audit remain valid against the git history.
