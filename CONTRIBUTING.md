# Contributing to MuonHub

MuonHub is built with Spec-Driven Development in a typed monorepo. This guide defines how changes are
proposed, written, described, versioned, and documented. It applies to **every contributor —
human or automated agent** — and complements [`AGENTS.md`](AGENTS.md).

## Workflow at a glance
1. Work from a spec in [`specs/`](specs/) (write one first if it doesn't exist).
2. Create a branch, make the change, keep documentation in sync.
3. Open a pull request; CI must pass; the maintainer merges into the protected `main`.

## Branches
`spec/NNNN-slug` · `feat/slug` · `fix/slug` · `docs/slug` · `chore/slug`. One unit of work per branch.

## Commit messages
- [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`
  (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, …), in **English**, imperative mood.
- The body explains **what** changed and **why it matters**, in product/engineering terms.

## Pull request descriptions — the standard

A PR title and body are **permanent project history**, read by collaborators, future maintainers,
and the public. Write them as a professional record of **what the change delivers and why**.

**Do**
- State the change and the value it adds, neutrally and concretely.
- Describe it from the product's / codebase's point of view (features, structure, behavior).
- Fill in the PR template: spec reference, acceptance criteria, tests, risks.

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
  `docs/` page (`technical/`, `user-manual/`, `design/`) and the spec.
- **Always** add a changelog entry (see below).
- Update [`docs/STATUS.md`](docs/STATUS.md) when a spec/phase changes state (orchestrator-owned to
  avoid contention — coordinate rather than edit it in parallel feature PRs).

## Changelog
We follow [Keep a Changelog](https://keepachangelog.com/). To keep parallel PRs from colliding on a
single file, **each PR adds a small fragment** under [`changelog.d/`](changelog.d/) instead of
editing `CHANGELOG.md` directly. Fragments are compiled into `CHANGELOG.md` at release time. See
[`changelog.d/README.md`](changelog.d/README.md) for the format.

## Versioning
[Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

- **`6.0.0`** is the launch of **MuonHub 6** — the platform described in [`planning/`](planning/).
- Pre-launch builds are `6.0.0-alpha.N` (current) → `6.0.0-beta.N` → `6.0.0-rc.N`.
- After launch: **`6.0.x`** = backward-compatible fixes; **`6.x.0`** = backward-compatible features;
  **`7.0.0`** = a breaking change to public contracts (schema, API, the `DataProvider` interface).
- The version lives in the root `package.json`; tagged releases get a `CHANGELOG` section and a DOI.

## Quality gates
Every PR runs CI (build · test · lint · typecheck) and a secret scan, and is reviewed before the
maintainer merges. Gate design: the AFLEK kit (doctrine rule 7); live state: [`docs/STATUS.md`](docs/STATUS.md).
