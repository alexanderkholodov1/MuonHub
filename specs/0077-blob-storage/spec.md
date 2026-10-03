# 0077 — Blob storage for signals + EventSummary persistence (provider)

> **Superseded (2026-10-03):** first v6 attempt, kept as a historical record. The v6 rebuild
> replaces this work — see [`specs/README.md`](../README.md) and [`docs/product/ROADMAP.md`](../../docs/product/ROADMAP.md).

- **Status:** implemented
- **Responsible:** Adjutant (spec) → Cursor (impl) → independent review (Gemini — re-probe first; Cursor review-only if down) → Adjutant (verify + macro + PR)
- **Depends on:** 0075 (`SignalRecord`, `EventSummary`), 0007 (FirebaseProvider), 0076 (the agent produces them). Branches from `main`.
- **Phase:** F2/F3 · **Epic:** EPIC-2/9 · **Source:** ADR-003 §6 (raw as compressed blobs; the real 1 GB fix).

## Context
The agent now computes `EventSummary`s and above-noise `SignalRecord`s (0076) but cannot persist
them. ADR-003 §6: **individual signals + complete-raw are stored as compressed blobs** in object
storage (not per-event DB nodes — that is what filled munra-1), and **EventSummary** is a small
queryable record. This milestone adds that to the `DataProvider`.

## Functional requirements

### Contract (`packages/data-provider`, orchestrator-owned)
Extend the `DataProvider` interface (+ in-memory mock + FirebaseProvider):
- **FR1 — EventSummary persistence** (small, queryable; RTDB-backed for now, keyed by interval):
  - `putEventSummary(summary: EventSummary): Promise<void>` — validate with the shared schema; store
    at `/stations/{sid}/detectors/{detId}/eventSummaries/{paddedIntervalStartTs}` (resolved via the
    existing `/detector_index`).
  - `getEventSummaries(detectorId: string, range: TimeRange): Promise<EventSummary[]>` — ordered by
    interval start, like `getMinuteRecords`.
- **FR2 — Signal blobs** (compressed, in object storage — the 1 GB fix):
  - `putSignalBlob(ref: SignalBlobRef, signals: SignalRecord[]): Promise<void>` — serialize the batch
    as **gzip-compressed NDJSON** and upload to **Firebase Cloud Storage** at a deterministic path
    `signals/{detectorId}/{sessionId}/{paddedIntervalStartTs}.ndjson.gz`. `SignalBlobRef =
    { detectorId, sessionId, intervalStartTs }`.
  - `listSignalBlobs(detectorId: string, range: TimeRange): Promise<SignalBlobRef[]>` and
    `getSignalBlob(ref: SignalBlobRef): Promise<SignalRecord[]>` (download + gunzip + parse, each
    record validated with `SignalRecordSchema`; corrupt records quarantined/skipped, not coerced).
  - `SignalBlobRef` lives in `packages/data-provider` types.

### FirebaseProvider implementation
- Add the **Firebase Cloud Storage** SDK behind the package boundary (client: `firebase/storage`;
  admin: `firebase-admin/storage`) — like the existing client/admin split; **never imported outside
  `packages/data-provider`** (guardrail 6). Gzip via the platform (`node:zlib` admin /
  `CompressionStream` client) — verify any new dep version exists before pinning.
- EventSummary stored as a slim RTDB node (no redundant interval key in the value where the padded
  key already encodes it, per the 0074 slimming spirit).

## Non-functional
- Strict TS, no `any`. Backend SDKs only in `packages/data-provider`. Validate every boundary with
  the shared schemas (guardrail 4/5: no scientific value altered; corrupt blob records quarantined).
- **Emulator tests:** add the **Storage emulator** to `infra/firebase/firebase.json` and the
  `test:emulator` run; cover: EventSummary put/range-get round-trip; signal-blob put → list → get
  round-trip (gzip → ungzip lossless); a corrupt record in a blob is skipped not coerced. Default
  `pnpm test` stays emulator-free.

## Acceptance criteria
1. `putEventSummary`/`getEventSummaries` round-trip on the emulator; range query returns the
   in-range summaries in interval order; stored node is slim.
2. `putSignalBlob` writes a single gzip-compressed NDJSON object to Cloud Storage; `getSignalBlob`
   returns the identical `SignalRecord[]` (lossless); `listSignalBlobs` returns the in-range refs.
3. A corrupt line in a blob is skipped (quarantined), never coerced; valid records still returned.
4. No backend SDK imported outside `packages/data-provider`; the public surface stays the
   `DataProvider` interface + types.
5. `pnpm build·test·lint·typecheck` green; the data-provider emulator job (now incl. Storage) green.

## Out of scope (later)
- The agent UPLOADING via these methods (wiring 0076 → provider) — a thin follow-up.
- Firestore-backed EventSummary (optimization), cold archive to R2, admin console, migration,
  federation, retention/TTL enforcement.

## Documentation (D42)
- `docs/technical/DATA-MODEL.md` (blob layout + EventSummary node), `docs/technical/ARCHITECTURE.md`
  (Cloud Storage in the provider), spec status, `docs/STATUS.md` (Adjutant),
  `changelog.d/blob-storage.added.md`.
