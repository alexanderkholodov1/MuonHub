# 0003 — Shared contracts: domain types and Zod schemas

> **Superseded (2026-10-03):** first v6 attempt, kept as a historical record. The v6 rebuild
> replaces this work — see [`specs/README.md`](../README.md) and [`docs/product/ROADMAP.md`](../../docs/product/ROADMAP.md).

- **Status:** in-progress
- **Responsible:** Adjutant (Opus) — decisive contract spec
- **Depends on:** 0001 (scaffold); D4, D7, D9, D21, D23 (master plan); `planning/02-DATA-MODEL.md`
- **Phase:** F1 · **Epic:** EPIC-1 · **Backlog:** S03

## Context
`packages/shared` is the single source of truth for the domain model. Every other package (web,
agent, data-provider, physics, api, ai) consumes these types and schemas. Because validation and
types must never drift, schemas are authored in **Zod** and the TypeScript types are **inferred**
from them (`z.infer`) — one definition, enforced at runtime and compile time.

This spec encodes the canonical v6 entities from `planning/02-DATA-MODEL.md` (two-level model,
D21) and the non-negotiable data invariants (D9 honesty, averages-never-sums).

## Functional requirements
- FR1: Zod schemas + inferred types for the core entities: `Institution`, `User`, `Station`,
  `Detector` (+ `Calibration`), `Session`, `MinuteRecord`, `RealtimeRecord`.
- FR2: Shared enums: `Visibility`, `StationPlacement`, `StationType`, `Role`, `HardwareVersion`,
  `DetectorStatus`, `Language`.
- FR3: Field-level validation: geographic ranges (lat/lon), non-negative counts, dead-time `0..100`,
  SiPM ordering (`sn ≤ sm ≤ sx`), required `visibility` with **no default** (D22).
- FR4: Derived minute fields (`ec_dt`, `ec_corr`, `flux`) are **optional** (computed later by
  `@munhub/physics`), never required on ingest.
- FR5: Constants module: enum value lists, retention/limit constants, field metadata.
- FR6: A typed `parse`/`safeParse` surface re-exported for consumers; barrel `index.ts`.

## Non-functional
- No I/O dependencies (pure, D-architecture). 100% type coverage; `any` forbidden.
- Schemas authored once (Zod) → types inferred. Strict object schemas (reject unknown keys) for
  write paths.

## Design / approach
- `src/schemas/enums.ts` — `z.enum` for every closed vocabulary.
- `src/schemas/{institution,user,station,detector,session,records}.ts` — entity schemas + inferred types.
- Invariants via `.refine()` (e.g., SiPM ordering, embargo date) where shape rules are insufficient.
- `src/constants.ts` — values ported/reconciled from v5 (`REALTIME_LIMIT`, `GAP_THRESHOLD_MS`, …)
  and the enum value arrays.
- `src/index.ts` — barrel export. Types inferred with `z.infer`; no hand-written duplicates.

## Acceptance criteria (verifiable)
- [ ] CA1: schemas + inferred types exist for all FR1 entities and FR2 enums.
- [ ] CA2: invalid inputs are rejected (bad lat/lon, negative counts, dead-time > 100, `sn > sx`,
  missing `visibility`, unknown keys on strict schemas) — covered by tests.
- [ ] CA3: valid canonical records parse successfully; derived fields optional.
- [ ] CA4: `pnpm build && pnpm test && pnpm lint && pnpm typecheck` green.
- [ ] CA5: only `@munhub/shared` is touched; no I/O imports.

## Out of scope
- i18n message catalogs (later spec). The `DataProvider` interface (S04). Physics formulas (S06).

## Tasks
- [x] T1: enums + constants.
- [x] T2: entity schemas (institution, user, station, detector, session, records) + inferred types.
- [x] T3: invariant refinements + tests (valid/invalid).
- [x] T4: barrel export; build/test/lint/typecheck green.
- [x] T5: update affected docs (`docs/technical/DATA-MODEL.md` note, this spec) — D42.
- [x] T6: changelog fragment in `changelog.d/` — D42.
