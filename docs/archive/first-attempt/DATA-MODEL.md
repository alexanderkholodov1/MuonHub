# MunHub Lab — Data model (technical overview)

> Public, English distillation of [`planning/02-DATA-MODEL.md`](../../planning/02-DATA-MODEL.md).
> The authoritative, validated definitions live in **`packages/shared`** as Zod schemas with
> inferred TypeScript types (implemented in spec S03) — schemas are the single source of truth, so
> runtime validation and compile-time types can never drift.
> Event retention, signal storage, and quota contracts follow
> [`ADR-003`](./adr/003-data-storage-and-event-model.md).

## 1. Vocabulary (the two-level model)

The word "detector" used to mean both a physical device and a user profile. v6 separates them:

| Term | What it is |
|---|---|
| **Institution** | A university/organization grouping users and stations. |
| **User** | A person's account. |
| **Station** | The registered **profile / site**: location, metadata, visibility. This is what appears on the map and has an owner. |
| **Detector** | The physical **CosmicWatch device** inside a station: device token, firmware, calibration. **Data belongs to a detector.** |
| **Session** | One data-taking run of a detector. |

> "Detector" now always means the physical device. "Station" is the profile/site.

## 2. Relationships

```
Institution 1 ─ N User         (a user may also be independent — no institution)
Institution 1 ─ N Station
User        1 ─ N Station      (owner; plus shares for collaboration)
Station     1 ─ N Detector     (usually 1; ≥2 enables a coincidence telescope)
Detector    1 ─ N Session
Detector    1 ─ N MinuteRecord (time series, indefinite retention)
Detector    1 ─ N RealtimeRecord (short window, expires)
Detector    1 ─ N EventSummary (compact interval science)
Detector    1 ─ N SignalBlob (compressed above-noise signal batches)
```

Data (sessions, minute records, realtime) hangs off the **detector**, because calibration is
per-device. For the 99% case (one detector per station) the UI presents this transparently; the
station view aggregates its detectors.

## 2.1 User profile created by auth

Spec 0009 adds account creation behind `DataProvider.register`. The provider first creates the
Firebase Auth account, then writes `/users/{uid}` with the canonical shared `User` shape:

| Field | Source |
|---|---|
| `uid` | Firebase Auth user id |
| `email` | registration email |
| `username` | provider-derived stable username seed from email + uid |
| `displayName` | registration form |
| `role` | `"user"` by default |
| `institutionId` | `null` for independent users until membership flows land |
| `language` | selected registration language (`en`, `es`, `pt-BR`) |
| `emailVerified` | Firebase Auth email verification state |
| `mlTrainingOptOut`, `directoryOptIn` | `false` by default |
| `createdAt` | provider write time in epoch milliseconds |

## 3. Minute record (the scientific core)

Stored indefinitely. **All values are averages, never sums** — a data-integrity requirement.

| Field | Unit | Meaning |
|---|---|---|
| `ts` | epoch ms | start of the minute |
| `ec` | counts/min | event rate (charged particles) |
| `cc` | counts/min | coincidences/min (meaningful only for coincidence stations) |
| `sm` / `sx` / `sn` | mV | SiPM amplitude average / max / min |
| `tp` | °C | temperature |
| `pr` | hPa | atmospheric pressure |
| `dt` | % | dead time |
| *derived (in `packages/physics`)* | | |
| `ec_dt` | counts/min | dead-time corrected: `R / (1 − R·τ_DT)` |
| `ec_corr` | counts/min | barometric corrected (over `ec_dt`), **local β by regression** |
| `flux` | 1/cm²/min | if an effective area is configured |

**Corrections pipeline (mandatory order):** raw → dead-time → barometric (local β) → thermal.

### 3.1 Firebase slim storage format

The public `MinuteRecord` shape is schema-validated with `ts` plus the raw observables above and
optional derived fields. Firebase RTDB stores the long-lived minute series in a slimmer canonical
form at `minutes/{ts}`:

- the RTDB child key is the zero-padded epoch-ms `ts`;
- the stored value contains only `ec`, `cc`, `sm`, `sx`, `sn`, `tp`, `pr`, `dt`;
- `ts`, `ts_iso`, and other legacy extras are not stored in the value;
- derived fields (`ecDt`, `ecCorr`, `flux`) are never stored and are recomputed from the raw record
  via `@munhub/physics` when needed.

The reusable definition lives in `@munhub/data-provider` as
`CANONICAL_SLIM_MINUTE_RECORD_FIELDS` and `CANONICAL_SLIM_MINUTE_RECORD_RULES`, so migration tooling
and provider writes use the same field set. The denormalized `latest` node stores `ts` plus the same
raw observables because it has no timestamp child key; it still omits all derived fields.

> Reconciled from v5: canonical dead-time is `dt` (not `d`); pressure in hPa; `cc` = coincidences,
> never "muons" (see scientific note below).

## 4. Event and storage retention model

[`ADR-003`](./adr/003-data-storage-and-event-model.md) replaces the legacy unbounded per-event
database nodes with explicit, per-detector retention axes:

| Axis | Contract field | Meaning |
|---|---|---|
| Minute summaries | `storageTier.minuteSummaries` | Retains the slim per-minute scientific series. Defaults to on. |
| Individual signals | `storageTier.individualSignals` | Retains compressed blob intervals of above-noise `SignalRecord` entries: `ts`, `sipmMv`, optional ADC channels, coincidence flag, dead time, temperature, and pressure. |
| Realtime live | `storageTier.realtimeMode` | `none`, `local-only`, or `cloud-volatile`; cloud-volatile data is short-lived operational live-view data, not indefinite science storage. |
| Complete raw | `storageTier.completeRaw` | Optional bounded capture of every console line, including sub-threshold noise, with `autoStopMinutes` for heavy recordings. |

The recommended tier is minute summaries on, individual signals on, realtime `local-only`, and
complete raw off. The shared contract rejects a configuration with all retention and realtime axes
disabled.

`EventSummary` is the compact interval science product produced at the edge, independent of raw
retention: detector/session ids, interval start/end, signal and threshold/tail/coincidence counts,
the active noise threshold, optional MPV, and an amplitude histogram. The default summary interval is
one hour (`3_600_000` ms). Firebase Phase A stores each summary as a slim RTDB node at
`/stations/{stationId}/detectors/{detectorId}/eventSummaries/{paddedIntervalStartTs}`. The padded
key carries `intervalStartTs`, the detector path carries `detectorId`, and the stored value contains
only the remaining schema fields (`sessionId`, `intervalEndTs`, counts, threshold, optional `mpvMv`,
and `histogram`).

Individual above-noise `SignalRecord` entries are not stored as database children. The provider writes
one gzip-compressed NDJSON object per detector/session/interval at
`signals/{detectorId}/{sessionId}/{paddedIntervalStartTs}.ndjson.gz` in Firebase Cloud Storage. Each
line is a schema-valid `SignalRecord`; reads gunzip the object and validate each line independently,
quarantining corrupt lines by skipping them rather than coercing scientific values.

Noise calibration is versioned on detector calibration metadata through the active
`noiseCalibration` (`thresholdMv`, `method`, `calibratedAt`) plus optional ordered
`noiseCalibrationHistory`. Session provenance stores the homogeneous storage tier plus optional
agent version, clock offset (`trueTime - machineTime`), and calibration reference.

Storage quota contracts are pure limits: `detectorMaxBytes`, `accountMaxBytes`, and the default
detector quota of `100 * 1024 * 1024` bytes. Provisioning, admission control, and placement are
later provider/admin responsibilities.

**Realtime record (cloud-volatile live view).** Per-event: `ts`, `sipm_mv`, `temp`, `deadtime`, …
Short retention (8-minute sliding window; capped at 5000 records in Firebase). Powers the 1m/5m
chart views; auto-expires. `FirebaseProvider` enforces the cap after writes by retaining the newest
5000 zero-padded timestamp keys and pruning older keys with bounded ordered queries, so
`realtime/{ts}` does not grow without bound (spec 0074).

## 5. Required metadata (highlights)

- **Station:** name, owner, **visibility** (public/institution/private — *explicit choice, no
  default*), latitude/longitude/altitude (manual entry), city, country, placement
  (ground/indoor/basement/…), type (single/coincidence), timezone. More metadata is always better.
- **Detector:** auto-generated device token (non-blocking), hardware model & firmware version,
  `hw_version` (defines τ_DT — v2 ≈ 50 ms, v3X ≈ 400 µs), SiPM count, calibration (sensible
  defaults by hardware + optional advanced override).

## 5.1 Station and detector creation

Spec 0011 adds authenticated owner flows for creating station profiles/sites and registering the
physical detectors under them:

| Step | Source of truth | Persistence path |
|---|---|---|
| Create station | `StationSchema` validates mandatory metadata; `ownerUid` is always the signed-in user. Visibility has no default and must be chosen explicitly. | `DataProvider.upsertStation` writes `/stations/{id}`. |
| Register detector | `DetectorSchema` validates device metadata. The web app auto-generates `deviceToken` and applies `defaultCalibration(hwVersion)` before saving. | `DataProvider.upsertDetector` writes `/stations/{stationId}/detectors/{detId}` and `/detector_index/{detId}`. |
| Edit station metadata | The same `StationSchema` validates updates while preserving owner, sharing, and creation metadata. | `DataProvider.upsertStation` overwrites the station record. |

Optional station fields (`floor`, `shielding`, `orientation`, `notes`) are non-blocking: missing
values show a completion reminder so migrated or partially known stations can still be used.
Multiple detectors under a station are allowed for coincidence setups; if saved detectors carry
different device tokens, the UI shows a non-blocking consistency advisory instead of blocking the
workflow.

Calibration defaults are pure shared logic in `@munhub/shared`:

| `hwVersion` | `adcToMv` | `saturationMv` | `triggerAdcMin` |
|---|---:|---:|---:|
| `v2` | `[4.8876, 0]` | `5000` | `50` |
| `v3X` | `[0.8059, 0]` | `3300` | `120` |
| `unknown` | `[1, 0]` | `3300` | `0` |

## 6. Scientific note on `cc` / "muons"

A single SiPM cannot distinguish muon/electron/gamma (all minimum-ionizing, ~2 MeV). Therefore:

- **Single-detector station:** the primary metric is the **charged-particle / MIP-type rate**, with
  the **amplitude (Landau) spectrum** — *not* "muons".
- **Coincidence station (≥2 detectors):** `cc` is a genuine muon selection (>99% purity).

UI labels and tooltips take their exact wording from
[`../research/THEORETICAL-FOUNDATION.md`](../research/THEORETICAL-FOUNDATION.md).

## 7. Backends

- **Phase A — Firebase Realtime Database + Cloud Storage (munhub-1), via `FirebaseProvider` (spec
  0007 + 0077):**

  ```
  /users/{uid}                         → email, username, displayName, role, language, …
  /institutions/{id}
  /stations/{id}                         → ownerUid, visibility, shares/{uid}, …
    └─ detectors/{detId}
         ├─ sessions/{sid}               (session metadata only)
         ├─ minutes/{ts}                 (MinuteRecord; ts = zero-padded epoch-ms key, ordered)
         ├─ realtime/{ts}                (RealtimeRecord; capped sliding window)
         ├─ eventSummaries/{ts}          (EventSummary; slim value, ordered by interval start)
         └─ latest                       (denormalized most-recent MinuteRecord)
  /detector_index/{detId}                → stationId   (O(1) detector→station resolution)

  Cloud Storage objects:
  signals/{detId}/{sessionId}/{ts}.ndjson.gz
  ```

  Two reconciliations the provider pins versus the earlier sketch: (1) the queryable **minute
  series is stored directly under the detector** (`…/detectors/{detId}/minutes/{ts}`), not under
  `sessions/{sid}`, so range queries by `(detectorId, ts)` need no cross-session scan — `sessions`
  keeps run metadata only; (2) **`/detector_index`** denormalizes detector→station so the by-id
  interface methods resolve in one read. Deny-by-default rules live in
  `infra/firebase/database.rules.json` (the legacy v5 ruleset at the repo root `database.rules.json`
  is separate and untouched). Stored field names are the camelCase schema keys.
- **Phase B — Postgres + TimescaleDB:** hypertables for `minute_records` / `realtime_records`,
  continuous aggregates for long-range charts, row-level security mirroring Phase A rules.
