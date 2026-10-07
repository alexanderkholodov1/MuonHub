# MuonHub v6 — Data model (contracts v2)

> **Status:** contracts implemented in `packages/shared/src/v2/` (spec 0083, M1 step 3), exported as
> the `v2` namespace of `@muonhub/shared`. The data layer that reads and writes these paths is M1
> step 6; the security rules are spec 0084. Terminology: ADR-004. Integrity rules: ADR-006.

## 1. Principles

- **Layer 0 — raw lines** stay in the agent's local SQLite (`RawLine`), never modified; cloud raw
  upload is an admin-gated option (M4).
- **Layer 1 — canonical records** (minute records, day summaries, sessions) are deterministic from
  layer 0 and versioned (agent version, device-type version). Minute records are written once per
  (stream, minute); a recomputation is written under a new session/version, never over the old one.
- **Only complete minutes** become minute records — partial first/last minutes are discarded, as in
  v5; a dead-time counter reset inside a minute invalidates that minute. Both are counted in the
  session (`discardedPartialMinutes`).
- **Missing is not zero:** a quantity a device does not report is absent; an hour with no complete
  minute is absent from its day summary (a gap), never an entry with n = 0.
- **Series belong to streams**, never to stations: series are never nested under a station node.
- Every persisted document carries `schemaVersion: 2`.

## 2. Entities

| Entity | Schema | Notes |
|---|---|---|
| User | `UserSchema` | email private (owner-readable only) |
| Username claim | `UsernameClaimSchema` | one username per user |
| Institution | `InstitutionSchema` | optional grouping |
| Station | `StationSchema` | exact `location` private; `visibility` required, no default; `publicPrecision` |
| Station member | `StationMemberSchema` | `editor` / `viewer` |
| Ownership transfer | `OwnershipTransferSchema` | id `{stationId}_{nonce}`, immutable |
| Public station | `PublicStationSchema` | projection for anonymous visitors; fields follow the precision; no personal data |
| Device type | `DeviceTypeSchema` | declarative format definition; built-ins `cosmicwatch-v2`, `cosmicwatch-v3x`, `munra` |
| Device | `DeviceSchema` | physical unit; carries `stationId`, geometry, saturation with unit |
| Assembly | `AssemblySchema` | positions/tilt of a station's devices (edited in M3) |
| Calibration | `CalibrationSchema` | versioned, append-only; each parameter has origin, uncertainty, lock |
| Stream | `StreamSchema` | id `<ownerUid>_<random>` |
| Session | `SessionSchema` | end reasons incl. `storageError`, `clockStep`; time provenance; counters |
| Minute record | `MinuteRecordSchema` | complete minutes only (§4) |
| Day summary | `DaySummarySchema` | one document per stream-day; hours present only with data |
| Live event / status | `LiveEventSchema`, `StreamStatusSchema`, `StreamStatusPublicSchema` | |
| Channel event / sample block | `ChannelEventSchema`, `SampleBlockSchema` | muograph / seismometer; not stored in M1 |
| Raw line | `RawLineSchema` | agent-local only |
| Access mirror | `StationAccessSchema`, `StreamStationSchema` | RTDB authorization mirror (spec 0084) |
| Admin, audit | `AdminEntrySchema`, `AuditEntrySchema` | audit append-only, defined action types |

## 3. Paths

### Firestore

| Path | Content |
|---|---|
| `users/{uid}` | User |
| `usernames/{username}` | Username claim |
| `stations/{stationId}` | Station |
| `stations/{stationId}/members/{uid}` | Station member |
| `ownershipTransfers/{stationId}_{nonce}` | Ownership transfer (immutable) |
| `deviceTypes/{id}` (+ versions subcollection) | Device type |
| `devices/{deviceId}` | Device |
| `devices/{deviceId}/calibrations/{version}` | Calibration (append-only) |
| `assemblies/{stationId}` | Assembly |
| `streams/{streamId}` | Stream |
| `streams/{streamId}/sessions/{sessionId}` | Session |
| `streams/{streamId}/days/{YYYY-MM-DD}` | Day summary |
| `publicStations/{stationId}` | Public station projection |
| `admins/{uid}` | Admin entry |
| `audit/{id}` | Audit entry |

### Realtime Database (flat)

| Path | Content |
|---|---|
| `minutes/{streamId}/{ts13}` | Compact minute record (§5), write-once |
| `live/{streamId}/events/{pushKey}` | Live event, kept 10 minutes, pruned by time |
| `status/{streamId}` | Stream status |
| `statusPublic/{streamId}` | Public status (`lastSeenAt`, `agentOnline`) |
| `stationAccess/{stationId}` | Access mirror |
| `streamStation/{streamId}` | Station id of the stream, create-once |

The public live "showcase" path is pending the M1 step-10 measurement (ADR-005 §6). No Cloud Storage.

## 4. Minute record and live time

| Field | Meaning |
|---|---|
| `ts` | start of the UTC minute (multiple of 60 000 ms) |
| `sessionId` | session that produced it |
| `n` | events in the minute (one line per event; event ids are used only for gap detection) |
| `coincidences?` | coincidence-flagged events (coincidence-capable devices only) |
| `amplitude?` | `{ mean, min, max, unit }` of the per-event amplitudes; absent when n = 0 |
| `liveSource` | `counter` · `tau` · `nominal` |
| `liveMs?` | live time; present for `counter` and `tau`, absent for `nominal` (uncorrected) |
| `deadMs?` | dead-time counter increment (only for `counter`) |
| `temperatureC?`, `pressureHpa?` | time averages; absent when not reported |
| `quality` | `{ eventIdGaps, clockAnomalies }` |

Live time with a cumulative counter (shared with spec 0085):
`deadMs = D(last line of this minute) − D(last line of the previous minute)` and
`liveMs = 60 000 · (1 − deadMs / Δt_device)`, where `Δt_device` is the device-clock span between the
same two lines.

## 5. Compact RTDB key table

| Key | Field | Key | Field |
|---|---|---|---|
| `v` | schemaVersion (2) | `lm` | liveMs |
| `s` | sessionId | `dm` | deadMs |
| `n` | n | `t` | temperatureC |
| `c` | coincidences | `p` | pressureHpa |
| `am`, `an`, `ax` | amplitude mean, min, max | `qg` | quality.eventIdGaps |
| `au` | amplitude unit | `qc` | quality.clockAnomalies |
| `l` | liveSource (`c` / `t` / `n`) | | |

The record key is `ts` zero-padded to 13 digits, so lexicographic order is time order. Absent fields
are omitted. The round trip is lossless (property test over 10 000 generated records).

## 6. Budget estimates (to be measured in M1 step 10)

| Item | Estimate |
|---|---|
| Compact minute record | ≈ 100–150 bytes → ≈ 50–80 MB per stream-year in RTDB (1 GB total on Spark) |
| Day summary | 1 Firestore document per stream-day, ≈ 24 updates/day |
| Sessions and status | a few Firestore writes per stream-day; status heartbeats in RTDB |
| Dashboard reads | one day-summary read per day of range; minutes only for short ranges |

## 7. v5 → v6 field mapping (for the M5 migration)

| v5 (`profiles/{id}/sessions/{sid}/minutes/{ts}`) | v6 minute record | Notes |
|---|---|---|
| `ts` | `ts` | v5 minute starts; only complete minutes were saved in v5 too |
| `ec` (events in the minute) | `n` | count per minute |
| `cc` (coincident events) | `coincidences` | only when the device has the flag |
| `sm` / `sn` / `sx` (SiPM mV) | `amplitude.mean` / `.min` / `.max`, unit `mV` | absent when `ec = 0` |
| `tp` (°C, average) | `temperatureC` | |
| `pr` (Pa, average) | `pressureHpa` = `pr / 100` | |
| `d` / `dt` (average of the raw dead-time column) | — | not convertible to a counter increment; migrated minutes get `liveSource: "nominal"` (uncorrected) unless the raw lines exist |
| `profiles/{id}` | station + device + stream | v5 profiles are split per ADR-004 |
| `realtime/{ts}` | not migrated | ephemeral by design |
