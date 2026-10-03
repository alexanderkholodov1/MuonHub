# 0074 — Storage record slimming + realtime cap enforcement (storage optimization, M1)

> **Superseded (2026-10-03):** first v6 attempt, kept as a historical record. The v6 rebuild
> replaces this work — see [`specs/README.md`](../README.md) and [`docs/product/ROADMAP.md`](../../docs/product/ROADMAP.md).

- **Status:** implemented
- **Responsible:** Adjutant (spec) → Cursor (impl) → Gemini (D35) → Adjutant (verify + macro + PR)
- **Depends on:** 0003 (schemas), 0007 (FirebaseProvider serializer + realtime cap). Branches from `main`.
- **Phase:** F3 · **Epic:** Storage federation (M1) · **Source:** storage strategy 2026-06-14. Non-migration; the canonical **slim record format** here is what the future v5→v6 migration also writes.

## Context
The munra-1 1GB (which broke the old system) is dominated by **verbose minute records**, not
realtime junk. Each v5 record carried `ts_iso` (redundant ISO string), a `ts` field duplicating the
node key, and derived/raw bloat. v6 must store the **minimum canonical bytes** per record; derived
fields are **recomputed via `@munhub/physics` on read** (the dashboard/insights already do this), so
they must **never** be persisted. This ~halves per-record size → ~2× effective capacity, and defines
the slim format the migration will use.

## Functional requirements
- **FR1 — Slim minute serialization:** `serializeMinuteRecord` stores **only** the canonical raw
  fields — `ec, cc, sm, sx, sn, tp, pr, dt` — and **omits**:
  - **`ts`** (the RTDB node key is the zero-padded ts; `deserializeMinuteRecord` already reconstructs
    it from the key),
  - **derived fields `ecDt`, `ecCorr`, `flux`** (recomputed on read via `@munhub/physics`; never stored),
  - any `ts_iso`/legacy extras.
  Round-trip must be lossless for the canonical fields. Reads stay schema-valid (`MinuteRecordSchema`).
- **FR2 — Realtime cap actually enforced:** replace the best-effort throttled prune with a robust
  bound so `realtime/{ts}` can never grow unbounded (the v5 leak). Keep at most `REALTIME_CAP`
  newest records: on push, prune the oldest beyond the cap deterministically (a bounded query for the
  oldest keys, not a full-node scan on the hot path). Document the retention guarantee.
- **FR3 — Canonical slim format helper:** expose a single documented definition of the slim stored
  shape (the field set + the "derived never stored, ts is the key" rule) in `packages/data-provider`
  so the migration tooling and any future provider reuse exactly the same format.

## Non-functional
- Strict TS, no `any`. The backend SDK stays only in `packages/data-provider` (guardrail 6). No
  scientific value altered — slimming only drops **redundant/derivable** fields, never raw data
  (guardrail 4/5: no filtering, averages preserved).
- Emulator tests cover the round-trip and the realtime cap; default `pnpm test` stays emulator-free.

## Acceptance criteria
1. A written minute record contains only `ec,cc,sm,sx,sn,tp,pr,dt` (no `ts`, no `ecDt/ecCorr/flux`,
   no `ts_iso`); reading it back yields a schema-valid `MinuteRecord` with `ts` reconstructed from
   the key and identical raw values (emulator round-trip test).
2. A measured byte-size assertion shows the slim serialized record is materially smaller than the
   full record (e.g. a unit test comparing JSON byte length with vs without the dropped fields).
3. Pushing more than `REALTIME_CAP` realtime records leaves at most `REALTIME_CAP` stored (emulator
   test); pruning does not scan the whole node on the hot path.
4. `pnpm build·test·lint·typecheck` green; the data-provider emulator job green; the existing
   provider contract + dashboard read path still pass (derived fields recomputed, not read).

## Out of scope
- The federation layer / second backend / admin console (M2–M4), the migration run (M6), R2 (M6).

## Documentation (D42)
- `docs/technical/DATA-MODEL.md` (slim stored format + "derived recomputed, ts is the key" + realtime
  retention), spec status, `docs/STATUS.md` (Adjutant), `changelog.d/record-slimming.added.md`.
