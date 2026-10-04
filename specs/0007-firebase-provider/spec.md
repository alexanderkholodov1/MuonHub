# 0007 — FirebaseProvider (concrete DataProvider over munhub-1)

> **Superseded (2026-10-03):** first v6 attempt, kept as a historical record. The v6 rebuild
> replaces this work — see [`specs/README.md`](../README.md) and [`docs/product/ROADMAP.md`](../../docs/product/ROADMAP.md).

- **Status:** ready for implementation
- **Responsible:** Adjutant (spec) → Sonnet executor (implementation) → cross-provider review (D35)
- **Depends on:** 0003 (shared contracts + zod schemas), 0004 (`DataProvider` interface),
  0005 (physics — derived fields are computed upstream, not here). All merged.
- **Phase:** F1 → unblocks F2/F3 · **Epic:** EPIC-2 · **Backlog:** 0006 (FirebaseProvider)
- **Scientific basis:** none directly (this is the I/O layer); it must never transform or filter
  scientific values — it persists and returns them verbatim (guardrail 4/5: no event filtering).

## Context

`packages/data-provider` ships only the `DataProvider` **interface** today. Nothing can read or
write real data until a concrete implementation exists. This spec delivers `FirebaseProvider` —
the Phase A backend over the **munhub-1** Realtime Database — which is the single piece that
unblocks the entire downstream chain: insights-v0 (0006, explicitly blocked on "the data must be
reachable first"), the station dashboards (EPIC-5), the v5→v6 migration (0007/0008 backlog), and
the MVP vertical slice.

This is the **keystone of provider-agnosticism (D4, guardrail 6):** callers depend only on the
interface; this is the first proof that a backend is swappable. A future `SupabaseProvider` is a
sibling implementation, not a change to callers, and the same `exportAll`/`importAll` pair is the
engine of the admin migration tool.

## RTDB node layout (Phase A — munhub-1)

Follows `planning/02-DATA-MODEL.md §5`, with one **reconciliation pinned here** (see below):

```
/users/{uid}
/institutions/{id}
/stations/{id}                         → owner_uid, institution_id, visibility, …, shares/{uid}
  └─ detectors/{detId}                 → device_token, hardware_model, hw_version, calibration, …
       ├─ sessions/{sid}               → started_at, ended_at, source_file_hash   (metadata only)
       ├─ minutes/{ts}                 → MinuteRecord            (ts = epoch-ms key, ordered)
       ├─ realtime/{ts}                → RealtimeRecord          (.indexOn by key; capped window)
       └─ latest                       → MinuteRecord            (denormalized most-recent)
/detector_index/{detId}                → stationId               (O(1) detector→station resolution)
```

**Reconciliation (proposed, confirm at PR review — guardrail 3):** the `DataProvider` interface
addresses minute/realtime series by `(detectorId, tsRange)`, never by session. The Phase A sketch
nested `minutes` under `sessions/{sid}/minutes/{ts}`, which would force a fan-out scan across all
sessions for every range query. This spec stores the **queryable minute series directly under the
detector** (`/stations/{sid}/detectors/{detId}/minutes/{ts}`), keyed by epoch-ms; `sessions/{sid}`
retains session metadata (boundaries, source hash) but is **not** the parent of the series. This
is a minor refinement of the §5 sketch that makes it consistent with the already-merged interface;
it is proposed here (not applied to the data-model doc unilaterally) and the PR updates
`docs/technical/DATA-MODEL.md` once accepted.

**`/detector_index`** is the denormalization that lets the by-id interface methods
(`getDetector(id)`, `getMinuteRecords(detectorId, …)`, `pushMinuteRecord(detectorId, …)`, etc.)
resolve a detector to its station path in one read instead of scanning `/stations`. It is written
transactionally alongside `upsertDetector`.

## Functional requirements

- **FR1 — Construction & SDK boundary.** Export `createFirebaseProvider(config)` returning a
  `DataProvider`. The package supports **two SDK targets behind the same class**:
  - **client** (`firebase/database`, `firebase/auth`) for the browser/web app — config from the
    `NEXT_PUBLIC_FIREBASE_*` env shape (`.env.example`);
  - **admin** (`firebase-admin`) for the Tauri agent / migration tooling / server — service
    account from env (never the file in `private/` committed anywhere).
  The two share all serialization/validation logic; only the RTDB ref/auth handles differ. Pick
  the target explicitly via config (`{ target: "client" | "admin", … }`); no runtime guessing.
- **FR2 — Entity CRUD.** Implement every interface method against the node layout above:
  institutions, stations (with `StationFilter`), detectors (writing `/detector_index`), sessions.
  `listStations(filter)` applies `visibility`, `institutionId`, `ownerUid`, `country` server-side
  where RTDB allows (`.indexOn` / `orderByChild`) and the remainder client-side; document which is
  which. `bbox` filtering is client-side (RTDB has no geoquery) and must be noted as such.
- **FR3 — Time-series.** `getMinuteRecords(detectorId, range)` queries
  `minutes` with `orderByKey().startAt(fromTs).endAt(toTs)` (keys are zero-padded epoch-ms so
  lexical = numeric ordering — pin the padding width in a shared helper). `pushMinuteRecord` is
  **idempotent on (detectorId, ts)**: writing the same ts overwrites identically, never
  duplicates, and updates `latest` only if ts ≥ current latest ts. `getLatest` reads `latest`.
- **FR4 — Realtime (incremental, NEVER `once('value')` on the whole node).** `subscribeRealtime`
  uses `limitToLast(N)` + `child_added` (or equivalent incremental listener) so a late subscriber
  does not re-download history and a live one receives only new events (guardrail in backlog 0006:
  "listeners incrementales, no once('value')"). The returned `Unsubscribe` is idempotent and
  detaches the listener. `pushRealtimeRecord` appends under `realtime/{ts}` and is subject to the
  retention cap (old keys pruned best-effort; hard pruning is a separate ops concern).
- **FR5 — Streaming export/import.** `exportAll(options)` is an `AsyncIterable<DataChunk>` that
  pages through RTDB by key ranges and **yields chunks without holding the dataset in memory**
  (the ~1GB migration constraint, backlog 0007). Honour `detectorIds`, `includeRealtime`,
  `sinceTs`. `importAll(chunks)` validates **every** chunk with its `@munhub/shared` zod schema at
  the boundary (guardrail 4); invalid chunks are **quarantined** (counted, not thrown), stations
  missing mandatory metadata increment `stationsWithoutMetadata`, and the run is **idempotent &
  resumable** by natural key. Returns a complete `ImportReport`.
- **FR6 — Validation at every boundary (guardrail 4/6).** Reads parse RTDB payloads through the
  shared zod schemas before returning typed entities; a malformed stored record is surfaced
  (logged + skipped on reads, quarantined on import), never silently coerced. Writes validate
  before touching the network. No scientific value is altered, rounded, or filtered in transit.
- **FR7 — `getCurrentUser`.** client target: maps `firebase/auth` current user → the `User`
  entity (reading `/users/{uid}`). admin target: returns `null` (no session) unless a uid is
  supplied via config — document the asymmetry.

## Security rules (minimal, deny-by-default — scoped subset of backlog 0008)

Ship `infra/firebase/database.rules.json` with a **deny-by-default** baseline sufficient to test
this provider end-to-end — not the full 0008 ruleset:

- root `.read`/`.write` = `false`; grant per-node.
- `/stations/{id}`: readable when `visibility` ∈ {`public`,`unlisted`} **or** the requester is
  owner / in `shares` / institution admin / global admin; writable only by owner/editor/admin.
- detector subtree inherits station read; `minutes`/`realtime` writable by owner/editor (the agent
  writes as an editor identity).
- `.indexOn` for the keys the queries above rely on.
- A **rules test suite** (`@firebase/rules-unit-testing`) covering at least: anonymous can read a
  public station and cannot read a private one; a non-owner cannot write; an editor can push
  minutes. These are the negative tests guardrail 4/security require.

> The full role×visibility matrix, institution lifecycle, and audit rules remain backlog 0008.

## Non-functional

- Strict TypeScript, no `any`. ESM. New deps: `firebase` and/or `firebase-admin`,
  `@firebase/rules-unit-testing` (dev) — added only to `packages/data-provider`, never pulled into
  apps/services directly (guardrail 6: the SDK lives **only** here).
- **Tests run against the Firebase Emulator Suite** (RTDB + Auth), wired into vitest so CI needs no
  live project and no secrets. Provide the emulator config + an npm script; CI starts the emulator
  for this package's test job. No test ever touches munhub-1.
- Coverage target ≥ 80% on the new code (matches the 0005 gate).
- Provider-agnostic doctrine: nothing here leaks a Firebase type across the package boundary; the
  public surface is exactly `DataProvider` + `createFirebaseProvider`'s config type.

## Acceptance criteria

1. `createFirebaseProvider` returns a `DataProvider`; the existing `provider.test.ts` contract test
   still passes unchanged.
2. Against the emulator: full CRUD round-trips for institution/station/detector/session; a written
   detector appears in `/detector_index`; `getMinuteRecords` returns exactly the in-range records
   in ts order; `pushMinuteRecord` twice on the same ts yields one record and a correct `latest`.
3. `subscribeRealtime` delivers only events appended **after** subscription for a node that already
   has history (proves no `once('value')` re-download); `unsubscribe()` called twice does not throw
   and stops delivery.
4. `exportAll` → `importAll` round-trips a seeded dataset on the emulator with
   `imported == seeded`, `quarantined == 0`; injecting a schema-invalid chunk increments
   `quarantined` without aborting the run; re-running `importAll` is idempotent (no duplicates).
5. Rules tests pass: public read allowed, private read denied to anon, non-owner write denied,
   editor minute push allowed.
6. `pnpm --filter @munhub/data-provider build test lint typecheck` green; coverage ≥ 80%.

## Out of scope (explicit)

- The full 0008 security-rule matrix, institution lifecycle, audit log.
- The actual v5→v6 migration run (backlog 0007) — this delivers the `importAll` **engine** and its
  tests, not the munra-1 dump transform.
- Any UI. Auth flows beyond `getCurrentUser` mapping (registration/login = backlog 0009).
- `SupabaseProvider` (Phase B).

## Documentation (part of "done" — D42)

- `docs/technical/DATA-MODEL.md`: record the minutes-under-detector reconciliation + `/detector_index`.
- `docs/technical/ARCHITECTURE.md`: note FirebaseProvider as the first concrete DataProvider; SDK
  boundary (client vs admin) confined to this package.
- `specs/0006-insights-v0/spec.md`: update the dependency line (FirebaseProvider now exists).
- `docs/STATUS.md`: F1 / specs-in-flight (orchestrator-owned — Adjutant edits at consolidation).
- `changelog.d/firebase-provider.added.md`.
