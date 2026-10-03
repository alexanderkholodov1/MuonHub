# NNNN — {{Title}}

<!--
  TEMPLATE NOTES — delete this block when instantiating as `specs/NNNN-slug/spec.md`.
  - NNNN: zero-padded sequence. The `specs/` folders are the canonical numbering; v6 rebuild specs
    continue from 0083. Do not keep a second numbering scheme anywhere else.
  - A spec is the contract for one coherent piece of a milestone. A milestone usually has several.
  - Acceptance criteria must be mechanically checkable (a command, a test name, a grep, an observed
    result in real practice) — never an adjective.
  - Use the domain terminology from ADR-004 exactly: Device, Device type, Station, Assembly,
    Stream, Session, Calibration, Recipe, View, Agent. Data belongs to a Stream, never to a "detector".
  - Status values: draft → approved → in-progress → done → superseded.
-->

- **Status:** draft
- **Milestone:** M<n> — <milestone name> (version range `6.0.0-alpha.<n>.x`)
- **Owner:** <Adjutant / lane — who writes it, who implements it, who reviews it>
- **Depends on:** <specs, ADRs, merged milestones>

## Context

<!-- Why this exists: the user need or decision it serves (link the ADR). What it deliberately is
     NOT. One paragraph each. -->

## Functional requirements

- FR1:
- FR2:

## Non-functional requirements

<!-- Strict typing, purity (e.g. "no I/O in this package"), performance, accessibility. -->
- **Free-tier budget (ADR-005):** <expected impact on RTDB connections / downloads / storage,
  Firestore reads/writes, Hosting transfer — or "none">.
- **Security (ADR-009):** <rules, authentication, secrets, untrusted input — or "none">.

## Data integrity (ADR-006)

<!-- Which layer this touches: raw (immutable), canonical (deterministic, versioned), derived
     (recipe + provenance). Confirm that no stored data is ever replaced by an altered version and
     that every derived value records how it was produced. Write "not applicable" if so. -->

## Design / approach

<!-- Files/packages to create or touch and their responsibilities. Concrete enough that the
     implementer never has to invent structure. -->

## Acceptance criteria (verifiable)

- [ ] CA1:
- [ ] CA2:
- [ ] CA-N: typecheck · lint · build · test green (and emulator tests where relevant)
- [ ] CA-N+1: only the files/packages this spec lists are touched

## Validation in practice

<!-- What real hardware, real use, or real data proves this works beyond the tests — and how the
     result is recorded (for example "72 h run of the CosmicWatch at USFQ with a 1 h network cut:
     no gaps, no duplicates"). -->

## Out of scope

<!-- Adjacent work someone will be tempted to do here, and the spec or milestone that owns it. -->

## Tasks

- [ ] T1:
- [ ] T2:
- [ ] T-N: update the affected documentation (documentation matrix in `AGENTS.md`)
- [ ] T-N+1: changelog fragment in `changelog.d/`
