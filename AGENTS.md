# AGENTS.md — Agent entry point (START HERE)

> Every agent (any provider, any model) working on MuonHub reads this file **in full** before
> touching anything. It is the binding contract. `CLAUDE.md` adds Claude-Code-specific notes only;
> if they ever disagree, this file wins.

---

## What MuonHub is

**MuonHub** is an open-science platform for acquiring, storing, visualizing, comparing, and
analysing data from cosmic-ray detectors (CosmicWatch-class and other devices), built to grow into a
multi-university research network across Latin America. It started at the USFQ physics laboratory
(Quito, Ecuador).

**Current state: v6 rebuild (pre-alpha).** The first v6 attempt (June 2026) is being rebuilt
milestone by milestone; its code stays in place until each milestone replaces it. Live state:
[`docs/STATUS.md`](docs/STATUS.md) · plan: [`docs/product/ROADMAP.md`](docs/product/ROADMAP.md) ·
decisions: [`docs/decisions/`](docs/decisions/).

**v5 is frozen.** The previous version runs in production from the `v5-production` branch (Firebase
project `munhub-1`, `munhub-lab.web.app`) with a real detector attached. Never modify that branch,
that project, or its data. v6 lives entirely in the Firebase project `muonhub`.

---

## How we work with the maintainer (non-negotiable)

The **maintainer** (Alexander Kholodov) sets direction, approves decisions, and is the only person
who merges. The **Adjutant** is the agent session he talks to; it plans, delegates to subagents,
reviews, integrates, and reports.

1. **The maintainer reads only the chat.** Whatever is not explained there, he does not know — and
   what he does not know must not be built. Explain in plain language; avoid unexplained jargon.
2. **Consult before building.** Every milestone's complete step plan (template:
   [`docs/process/templates/milestone-plan.md`](docs/process/templates/milestone-plan.md)) is
   presented in the chat and approved **before** execution. New decisions are proposed, never taken
   silently.
3. **Nothing lives only in the chat.** Decisions, findings, and proposals are written down — in this
   repository, or in the git-ignored `private/` folder when they must not be public (e.g. security
   findings about live systems).
4. **Agent memory features are not used** for this project (shared workstation account). State lives
   in the repository.
5. **Say how you know.** Label claims **[verified]** (checked first-hand: code read, command run,
   official docs) or **[reported]** (from a subagent or secondary source, not re-checked). Never relay
   a subagent's claim as fact without checking it.
6. **Investigation standard.** Before proposing or rejecting a tool, provider, or capability, read the
   official documentation and verify the current reality. Do not conclude from stale memory.
7. **Parallel subagents are welcome** for independent work, with disjoint file boundaries. The author
   of a change is never its only reviewer — use the reviewer subagents in
   [`.claude/agents/`](.claude/agents/).

Full process: [`docs/process/WORKFLOW.md`](docs/process/WORKFLOW.md).

---

## Terminology (ADR-004 — use these words exactly)

| Term | Meaning |
|---|---|
| **Device** | Always the **physical** hardware unit (e.g. "CosmicWatch #3"). |
| **Device type** | The definition of a kind of hardware: output format, columns, units, channels, default geometry. Shared through Bring Your Own Detector. |
| **Station** | The place and setup where devices are installed: location, privacy, public/private. |
| **Assembly** | The physical arrangement of devices in a station (stacking, separation, tilt). |
| **Stream** | **The space in MuonHub where data lives.** One device at one station produces one stream. |
| **Session** | A continuous recording period inside a stream. |
| **Calibration** | A versioned parameter set of a device, with a validity start. |
| **Recipe** | A reusable processing sequence (calibration, filters, corrections). |
| **View** | A recipe applied to a stream. The **raw view** always exists and is never altered. |
| **Agent** | MuonHub's software next to the devices (PC or Raspberry Pi) that reads them. |

Data belongs to **streams**, never to a "detector". Comparisons are made between **views**.

---

## Guardrails (non-negotiable)

1. **Git and PR policy (ADR-008).** Work on a branch (`chore/*`, `feat/*`, `fix/*`, `docs/*`,
   `spec/NNNN-*`). Commit often (Conventional Commits, English, with the agent trailer) and push the
   branch so work is never only local. A milestone has **one PR, opened only when the milestone is
   planned, tested, validated in real practice, and corrected**. Never commit to `main`, never merge,
   never force-push a shared branch. Versions: `6.0.0-alpha.<milestone>.<iteration>.<fix>`, lockstep
   across all packages.
2. **No code without a spec.** Implementation follows a spec in `specs/NNNN-*/` (new specs start at
   0083; template: [`docs/process/templates/spec.md`](docs/process/templates/spec.md)), approved as
   part of the milestone plan.
3. **Scientific honesty.** Nothing may contradict
   [`docs/science/THEORETICAL-FOUNDATION.md`](docs/science/THEORETICAL-FOUNDATION.md). Single-SiPM
   devices measure a **charged-particle / MIP-type rate** — never call individual events "muons".
   Muon language is valid only for aggregate inference or coincidence-mode hardware. The brand name
   "MuonHub" is not a measurement label.
4. **Data integrity (ADR-006 — the maintainer's rule).** Filtering, calibrating, discriminating, and
   classifying are allowed and important, and are applied **on top of stored data**. It is
   **forbidden to overwrite data and store it in an altered form as if it were pure.** Storing a
   filtered dataset is allowed only as an explicit, labelled setting whose calibration the user
   defines. Raw data is immutable; derived data carries its provenance (which raw data, which recipe
   version). Per-minute values are **time-averages, never sums**; statistical uncertainties come from
   raw counts (√N); a gap is never recorded as zero. Validate every boundary with `zod`.
5. **Free tier only (ADR-005).** MuonHub runs on the Firebase Spark (no-cost) plan indefinitely: no
   paid services, no credit cards, no Cloudflare. Design against the quotas (100 simultaneous RTDB
   connections, 10 GB/month RTDB download, 1 GB RTDB storage, Firestore daily operation limits,
   Hosting transfer). Never spread load across several projects to exceed limits — Google's terms
   forbid it.
6. **Provider boundary.** Backend SDKs (Firebase client/admin) are used only inside
   `packages/data-provider`. Apps and services go through its interfaces.
7. **Security baseline (ADR-009).** Deny by default; validate every field; owner-only immutable
   fields; public data only through dedicated projections without personal data; negative tests with
   real client identities, including anonymous reads; no admin keys on detector machines; safe error
   messages.
8. **English everywhere** for new content: code, comments, commits, docs, i18n keys (English is the
   UI source locale; es and pt-BR are translations). `docs/archive/` keeps historical documents as
   they were.
9. **Documentation is part of done.** A change that alters behavior, structure, or policy updates its
   documentation in the same PR:

   | If your change touches… | Update in the same PR |
   |---|---|
   | User-visible behavior | the relevant `docs/` page · `docs/user-manual/` · spec status · changelog fragment |
   | Architecture, packages, stack | `docs/architecture/` · README structure/stack · `CLAUDE.md` commands |
   | Data contracts or schema | the data-model document of the current milestone · migration notes |
   | Physics or scientific wording | `docs/science/THEORETICAL-FOUNDATION.md` (physicist-persona review) |
   | UI / design | conformance with `docs/design/DESIGN-LANGUAGE.md` · screenshots in the PR |
   | Process or agent policy | `AGENTS.md`, `CLAUDE.md`, `docs/process/` — they must never drift |
   | Decisions | a new or amended ADR in `docs/decisions/` |
   | Milestone state | `docs/STATUS.md` |
   | Anything | a `changelog.d/<slug>.<category>.md` fragment |

10. **Commit and PR style.** State what the change delivers, for a reader of the history; never narrate
    the process or frame a change as a reaction to review. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## Where things are

| Need | Go to |
|---|---|
| Current state, active milestone | [`docs/STATUS.md`](docs/STATUS.md) |
| Vision, roadmap, backlog, public site plan | [`docs/product/`](docs/product/) |
| Decisions (ADRs, historical D1–D46 log) | [`docs/decisions/`](docs/decisions/) |
| Architecture | [`docs/architecture/`](docs/architecture/) |
| Physics, serial formats, research notes | [`docs/science/`](docs/science/) |
| Environments, Firebase setup, remote access | [`docs/operations/`](docs/operations/) |
| Workflow, templates, engineering standards | [`docs/process/`](docs/process/) |
| Design language | [`docs/design/`](docs/design/) |
| Audits and session records | [`docs/audit/`](docs/audit/) |
| Historical planning, first-attempt docs, v5 reference | [`docs/archive/`](docs/archive/) |

---

## Keys and secrets

`private/` is git-ignored. It holds service-account keys and private operational notes. **Never**
commit, print, or paste its contents; read a key only to use it, and only for actions the maintainer
authorised. Production reads of a live project require explicit maintainer authorisation. Public
configuration shapes live in `.env.example` (never real values).
