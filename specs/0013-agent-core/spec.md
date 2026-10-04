# 0013 — Agent acquisition core: serial parsing + per-minute aggregation + offline sync queue

> **Superseded (2026-10-03):** first v6 attempt, kept as a historical record. The v6 rebuild
> replaces this work — see [`specs/README.md`](../README.md) and [`docs/product/ROADMAP.md`](../../docs/product/ROADMAP.md).

- **Status:** done
- **Responsible:** Adjutant (spec) → Cursor (implementation, Claude model) → Gemini (cross-provider review, D35) → Adjutant (verification + macro + PR)
- **Depends on:** 0003 (`MinuteRecord`/`RealtimeRecord` schemas + constants), 0007 (`DataProvider.pushMinuteRecord`/`pushRealtimeRecord`). Branches from a linear `main`.
- **Phase:** F2 · **Epic:** EPIC-4 · **Backlog:** 0013 (multiplatform serial parsing) + 0014 (local SQLite backup) + 0015 (offline sync queue). Closes the MVP data path: detector → agent → provider → dashboard.
- **Reference:** `docs/technical/SERIAL-FORMATS.md` (the 4 wire formats) and the v5 reference in `public/`.

## Context
The dashboard (0018) can show science but nothing feeds it. This milestone builds the **agent's
acquisition core** — the pure, testable logic that turns a detector's serial stream into validated
records, persists them locally before upload (offline-first), and syncs them idempotently through
the `DataProvider`. The **Tauri desktop shell + the OS serial port binding are scaffolded but their
real-hardware run is a manual verification** (the operator's physical detector); CI validates the
TS core.

**Data-integrity is the point here (guardrail 5):** measurement fields are **time-averages, never
sums**; event and coincidence fields are per-minute rates (counts per minute); no event filtering;
validate at the boundary with zod.

## Functional requirements

### Parsing (0013) — pure, tested
- **FR1 — Four-format line parser** (`apps/agent/src/parsers/`): detect and parse the **4 serial
  formats** documented in `SERIAL-FORMATS.md` (CosmicWatch standard, JSON, key=value, CSV) exactly
  as v5 did. A format-detection function + one parser per format → a normalized raw reading
  (timestamp, event/amplitude/temp/pressure/deadtime fields as available). Unit tests with **real
  sample lines per format** (taken from `SERIAL-FORMATS.md` / `public/` reference).
- **FR2 — Robustness:** malformed/partial lines are skipped (logged), never crash the reader and
  never silently corrupt a record. Garbage in → skipped, not coerced.

### Per-minute aggregation — the data-integrity core
- **FR3 — Minute aggregator** (`apps/agent/src/aggregate.ts`): fold raw readings within a minute
  window into a `MinuteRecord` where `ec` and `cc` are event rates (total counts divided by the
  window length in minutes) while measurement fields (`sm`, `tp`, `pr`, `dt`) are time-averages.
  Validate the produced record with the shared `MinuteRecordSchema`. No event filtering. Unit tests
  assert rate scaling for event-driven readings and averaging for measurement fields so records of
  partial completeness stay comparable.

### Local backup + offline sync queue (0014/0015)
- **FR4 — Local-first persistence:** a `LocalStore` abstraction persists each record **before** any
  upload attempt (capa-1 redundancy). For testability, define the store behind an interface with an
  **in-memory implementation fully unit-tested**; the SQLite-backed implementation (Tauri) sits
  behind the same interface (its disk binding is manual-verified). No record is uploaded before it
  is locally durable.
- **FR5 — Offline sync queue:** records queue locally when offline and flush to
  `DataProvider.pushMinuteRecord` on reconnect; **idempotent on `(detectorId, ts)`** (re-flushing
  the same record must not duplicate); resumable; order by `ts`. Unit tests cover: offline→queue,
  reconnect→flush, duplicate suppression, resume after partial flush.

### Tauri shell + serial binding (scaffold; hardware = manual)
- **FR6 — Serial bridge scaffold:** a thin Tauri command surface (`src-tauri`) to enumerate serial
  ports and stream lines from a selected port into the parser, plus a minimal UI to pick a port and
  show the live read. This wires the core to real hardware. **The full Tauri build/packaging (0016)
  and real-serial verification are out of CI scope** — the build script may stay a stub; the serial
  read is verified manually by the operator with the physical detector. Clearly mark this boundary.

## Non-functional
- Strict TS, no `any`. The TS core (`parsers/`, `aggregate.ts`, the queue/store) is **pure and
  runs under the existing vitest/lint/typecheck** so CI validates it without Tauri/Rust.
- Guardrail 5: averages never sums; no filtering; zod at the boundary. Guardrail 6: data goes
  through `DataProvider` (already an agent dependency), no direct backend SDK.
- No "muon" labeling (data is raw counts here).

## Acceptance criteria
1. Each of the 4 formats parses real sample lines correctly; format auto-detection picks the right
   parser; malformed lines are skipped without crashing (unit tests).
2. The minute aggregator produces a schema-valid `MinuteRecord` whose `ec`/`cc` values are
   count-per-minute rates and whose measurement fields are **averages, not sums** (a test with N
   event readings asserts `ec = N` for a one-minute bucket, and that doubling the event count
   doubles `ec` while environment fields remain averaged).
3. The sync queue: queues offline, flushes on reconnect, suppresses duplicates by `(detectorId,ts)`,
   and resumes after a partial flush (unit tests, using the in-memory store + a fake provider).
4. Records are persisted to the local store **before** an upload attempt.
5. `pnpm build·test·lint·typecheck` green (the agent's TS core is fully tested); coverage of the
   parser/aggregate/queue logic is meaningful.
6. The Tauri serial scaffold compiles/structurally exists; its real-hardware run is documented as a
   manual step (not a CI gate).

## Out of scope
- Installers/packaging (0016), Web Serial demo (0017), the full Tauri UI, real-hardware CI.

## Documentation (D42)
- `docs/technical/SERIAL-FORMATS.md` (confirm/refresh the parsed formats), `docs/technical/ARCHITECTURE.md`
  (agent acquisition core + offline-first), spec status, `docs/STATUS.md` (Adjutant),
  `changelog.d/agent-core.added.md`. Note the manual hardware-verification step in the agent docs.
