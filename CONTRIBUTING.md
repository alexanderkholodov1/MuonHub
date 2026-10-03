# Contributing to MuonHub

MuonHub is built with Spec-Driven Development in a typed monorepo. This guide defines how changes are
proposed, written, described, versioned, and documented. It applies to **every contributor —
human or automated agent** — and complements [`AGENTS.md`](AGENTS.md).

## Workflow at a glance
1. Work is organised in milestones ([`docs/product/ROADMAP.md`](docs/product/ROADMAP.md)). Each
   milestone's step plan is approved by the maintainer before execution
   ([`docs/process/WORKFLOW.md`](docs/process/WORKFLOW.md)).
2. Implementation follows a spec in [`specs/`](specs/) (new specs start at 0083).
3. Work on a branch, commit often, push the branch, and keep documentation in sync.
4. Open **one pull request per milestone**, only when the milestone is planned, tested, validated in
   real practice, and corrected. CI must pass; the maintainer merges into the protected `main`.

## Branches
One branch per milestone, named `<type>/m<n>-<slug>` (e.g. `chore/m0-foundation`,
`feat/m1-core-agent`), with many commits (ADR-008).

## Commit messages
- [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`
  (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, …), in **English**, imperative mood.
- The body explains **what** changed and **why it matters**, in product/engineering terms.
- Commits that mark a version step carry it in the subject, e.g. `(6.0.0-alpha.1.4)`.

## Pull request descriptions — the standard

A PR title and body are **permanent project history**, read by collaborators, future maintainers,
and the public. Write them as a professional record of **what the change delivers and why**.

**Do**
- State the change and the value it adds, neutrally and concretely.
- Describe it from the product's / codebase's point of view (features, structure, behavior).
- Fill in the PR template (`.github/pull_request_template.md`): milestone, approved plan, validation
  evidence, guardrails, known limitations.

**Don't**
- Narrate the authoring process, the options weighed, or the reasoning that led here — that belongs
  in discussion, not in the permanent record.
- Frame the change as a reaction to review ("as requested", "addresses the feedback", "now
  without X", "fixed the issue where it was too …"). Describe the *result*, not the back-and-forth.
- Apologize, editorialize, or explain what something "used to be". The history shows the diff.

**Examples**

| Instead of | Write |
|---|---|
| "Rewrote the README to be confident and selling instead of apologetic." | "Reframe the README around the platform's scientific value proposition and broaden it for an international audience." |
| "Analyzed the proposed practices and decided which to adopt." | "Add engineering-standards documentation defining the architecture and quality practices." |
| "Fixed the docs as requested; removed the disclaimers." | "Update the user manual to lead with the core concepts and terminology." |

The goal: a reader six months from now learns **what the project gained**, not how the change was
negotiated.

## Documentation is part of every change (Definition of Done)
A change is not done until its documentation is updated **in the same PR**:
- Touch a feature, the stack, the architecture, or the roadmap → update the README and the relevant
  `docs/` page (`product/`, `architecture/`, `science/`, `operations/`, `user-manual/`, `design/`)
  and the spec. The full matrix is in [`AGENTS.md`](AGENTS.md) (guardrail 9).
- **Always** add a changelog entry (see below).
- Update [`docs/STATUS.md`](docs/STATUS.md) when a milestone or spec changes state.

## Changelog
We follow [Keep a Changelog](https://keepachangelog.com/). To keep parallel PRs from colliding on a
single file, **each PR adds a small fragment** under [`changelog.d/`](changelog.d/) instead of
editing `CHANGELOG.md` directly. Fragments are compiled into `CHANGELOG.md` at release time. See
[`changelog.d/README.md`](changelog.d/README.md) for the format.

## Versioning
[Semantic Versioning](https://semver.org/) with pre-release identifiers (ADR-008):

- During the rebuild: **`6.0.0-alpha.<milestone>.<iteration>.<fix>`** (e.g. `6.0.0-alpha.1.4.2`),
  lockstep across every package. Then `6.0.0-beta.N` → `6.0.0-rc.N` → **`6.0.0`**, the launch of
  MuonHub 6.
- After launch: **`6.0.x`** = backward-compatible fixes; **`6.x.0`** = backward-compatible features;
  **`7.0.0`** = a breaking change to public contracts (schema, API, the `DataProvider` interface).
- Tags are created when a milestone PR is merged.

## Quality gates
Every PR runs CI (typecheck · lint · build · test, the Firebase emulator tests, and a secret scan)
and is reviewed by reviewer subagents (`.claude/agents/`) — the author is never the only reviewer —
before the maintainer merges. Live state: [`docs/STATUS.md`](docs/STATUS.md).
