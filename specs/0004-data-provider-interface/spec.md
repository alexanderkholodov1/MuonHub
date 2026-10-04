# 0004 — DataProvider interface (backend-agnostic data access)

> **Superseded (2026-10-03):** first v6 attempt, kept as a historical record. The v6 rebuild
> replaces this work — see [`specs/README.md`](../README.md) and [`docs/product/ROADMAP.md`](../../docs/product/ROADMAP.md).

- **Status:** in-progress
- **Responsible:** Adjutant (Opus) — keystone abstraction
- **Depends on:** 0003 (shared contracts); D4 (master plan); `planning/01-ARCHITECTURE.md` §3
- **Phase:** F1 · **Epic:** EPIC-1 · **Backlog:** S04

## Context
The `DataProvider` interface is the keystone of the architecture (D4): the app, agent, api, and ai
talk only to this interface, never to a backend SDK. Swapping Firebase (Phase A) for Supabase
(Phase B) means writing a new implementation, not touching callers. The same interface is also the
engine of the admin migration tool (export from one provider → import into another).

This spec defines the **interface and its supporting types only** — no implementation. The
`FirebaseProvider` is S08; the migration tool is S07.

## Functional requirements
- FR1: A `DataProvider` interface covering: auth (`getCurrentUser`), institutions, stations
  (list/get/upsert with filtering), detectors (list/upsert), sessions, minute records
  (read by range, push, latest), realtime (subscribe, push), and export/import for migration.
- FR2: Supporting types: `TimeRange`, `StationFilter`, `Unsubscribe`, `RealtimeCallback`,
  `ExportOptions`, `DataChunk` (tagged union for streaming), `ImportReport`.
- FR3: All entity types come from `@munhub/shared` (no re-definition).
- FR4: Reads/writes are async (`Promise`); realtime uses a subscribe/unsubscribe callback model;
  export/import use `AsyncIterable<DataChunk>` for streaming large datasets (the 1 GB migration).
- FR5: Only `@munhub/shared` is imported — **no** backend SDK anywhere in this package.

## Non-functional
- Pure type/interface module; no runtime behavior. `any` forbidden; strict types.
- Documented so an implementer (S08) and the migration tool (S07) can build against it directly.

## Design / approach
- `src/types.ts` — the supporting types above.
- `src/provider.ts` — the `DataProvider` interface, grouped by concern with doc comments.
- `src/index.ts` — barrel (replaces the stub).
- A type-level conformance test: a mock object typed as `DataProvider` to prove the interface is
  implementable and aligned with the shared contracts.

## Acceptance criteria (verifiable)
- [ ] CA1: `DataProvider` interface + supporting types exported from the package.
- [ ] CA2: every method is typed with `@munhub/shared` types; no backend SDK import present.
- [ ] CA3: a mock conformance test compiles and runs (interface is implementable).
- [ ] CA4: `pnpm build && pnpm test && pnpm lint && pnpm typecheck` green.
- [ ] CA5: only `packages/data-provider` is touched.

## Out of scope
- `FirebaseProvider` / `SupabaseProvider` implementations (S08 / Phase B).
- The migration tool logic (S07). Auth flows / role logic (separate specs).

## Tasks
- [x] T1: supporting types (`types.ts`).
- [x] T2: `DataProvider` interface (`provider.ts`).
- [x] T3: barrel + mock conformance test.
- [x] T4: build/test/lint/typecheck green.
- [x] T5: update affected docs (`docs/technical/ARCHITECTURE.md` note, this spec) — D42.
- [x] T6: changelog fragment — D42.
