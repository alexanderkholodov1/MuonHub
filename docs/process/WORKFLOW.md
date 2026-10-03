# How work happens

> The working agreement between the maintainer and the agents that build MuonHub. It applies to every
> session. The binding entry contract is [`AGENTS.md`](../../AGENTS.md); this page explains the flow
> in detail. Decisions referenced here live in [`docs/decisions/`](../decisions/README.md).

## 1. The maintainer reads only the chat

- **If it was not explained in the chat, the maintainer does not know it — and it must not be
  built.** Every decision, finding, risk, and plan is presented in the chat first, in plain
  language, with enough detail to judge it.
- **Consult first.** Propose; do not decide silently. When a choice matters, give a recommendation
  and the reason, then wait for approval.
- **Explain plainly.** No unexplained jargon. If a concept is technical, say what it means and why it
  matters for MuonHub.
- **Be honest about mistakes.** When something said earlier was wrong, correct it explicitly.

## 2. Milestones

v6 is built in about six milestones, one pull request each (ADR-008).

1. **Plan.** Before any execution, the agent presents the milestone's **complete step plan** in the
   chat ([`templates/milestone-plan.md`](templates/milestone-plan.md)): every step, what changes,
   how it is executed, how it is validated, and what needs approval.
2. **Approve.** The maintainer approves or adjusts it. Nothing is executed before that.
3. **Execute.** Work happens on one milestone branch with **many small commits**, each carrying the
   version it produces (ADR-008). The branch is pushed regularly as a backup. Progress is reported in
   the chat as it happens.
4. **Validate.** Tests first (unit, integration, emulator), then **real practice**: real hardware,
   real use, real devices. Problems found along the way are fixed on the same branch.
5. **Review.** Reviewer subagents check the work (§5); every finding is resolved or explicitly
   accepted.
6. **Pull request — only at the end.** The PR opens only when the milestone is fully planned,
   tested, validated in practice, reviewed, and documented. Its description is a Stage Report
   ([`templates/stage-report.md`](templates/stage-report.md)). CI must be green.
7. **Merge.** Only the maintainer merges into `main`. The next milestone starts from the merged
   result — never on top of half-finished work.

### Branches, commits, versions

- Branch names: `<type>/<milestone>-<slug>` — for example `chore/m0-foundation`,
  `feat/m1-core-agent`. Types follow Conventional Commits (`feat`, `fix`, `docs`, `chore`, …).
- Commits: [Conventional Commits](https://www.conventionalcommits.org/), in **English**, imperative
  mood, describing what the change delivers ([`CONTRIBUTING.md`](../../CONTRIBUTING.md)). A commit
  that moves the version states it at the end of the subject, e.g.
  `chore: rename the product to MuonHub (6.0.0-alpha.0.2)`.
- Agent commits end with a `Co-Authored-By:` trailer naming the model.
- Versions: `6.0.0-alpha.<milestone>.<iteration>.<fix>`, all packages in lockstep (ADR-008).

## 3. Nothing lives only in the chat

- Every decision, finding, proposal, and plan is written down **in this repository** — session
  records and audits in [`docs/audit/`](../audit/), decisions in `docs/decisions/`, plans in
  `docs/product/`.
- Information that must not be public (for example an active security issue in a live system) goes
  to **`private/`**, which is git-ignored and never pushed.
- **Agent memory features are not used** for this project. Anything an agent must remember is in the
  repository (or in `private/`).
- Before a session ends: commit, push the branch, and record what is open.

## 4. Evidence and honesty

- **Verification labels.** Every claim that matters carries one:
  - **[verified]** — checked first-hand (code read, document read, data inspected);
  - **[verified by running]** — confirmed by executing it;
  - **[reported]** — from a subagent or secondary source, not yet re-checked.

  A **[reported]** claim is never presented as fact.
- **Investigation standard.** When investigating a tool, provider, or capability — or before
  concluding something "cannot be done" — read the official documentation and verify the current
  reality first. Names, prices, and limits change. Do not build a workaround when the real tool
  already exists.
- **Production is read-only** unless the maintainer explicitly authorises otherwise, and the v5
  production project is not modified at all.

## 5. Quality gates

- **CI is the referee:** typecheck · lint · build · test, the Firebase emulator tests, and the
  gitleaks secret scan must pass. Nothing merges on red.
- **Author ≠ reviewer.** Work is reviewed by a different agent than the one that wrote it. The
  reviewer subagents live in [`.claude/agents/`](../../.claude/agents/):

  | Reviewer | Use it for |
  |---|---|
  | `code-reviewer` | correctness and regressions in a diff |
  | `security-reviewer` | **mandatory** for anything touching rules, authentication, keys, endpoints, or dependencies |
  | `silent-failure-hunter` | swallowed errors, dead listeners, bad fallbacks |
  | `docs-auditor` | documentation drift and missing doc updates |

- **Parallel subagents are welcome** — research, reviews, and disjoint lanes of work run
  concurrently. Lanes are kept disjoint (separate folders or packages) so they never edit the same
  files.
- **Docs are part of done.** A change that alters behaviour, structure, or policy updates its
  documentation in the same pull request and adds a changelog fragment under
  [`changelog.d/`](../../changelog.d/README.md). `AGENTS.md` holds the documentation matrix (which
  files to update for which kind of change).

## 6. Principles

Rescued from the earlier fleet doctrine and still in force:

- **The pull request is the deliverable**; a chat message is not.
- **CI is the referee**; no "works on my machine".
- **No chat-dependent state**: a fresh session must be able to continue from the repository alone.
- **Author ≠ reviewer**: different eyes catch different mistakes. Cross-review once found a real
  physics bug.
- **Small batches**: large work is split into small, checkable steps.
- **Verify before concluding something is unavailable**: probe the real thing, read the real docs.
