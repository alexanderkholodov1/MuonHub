# 0083 — Domain contracts and data model v2

- **Status:** done (2026-10-07, `6.0.0-alpha.1.3`)
- **Milestone:** M1 — Core + Agent (version range `6.0.0-alpha.1.x`)
- **Owner:** Adjutant (spec and implementation of `packages/shared`); data-layer implementation in
  spec 0084/step 6; reviewers: physicist (data semantics), security-reviewer (personal data, rules
  surface), code-reviewer.
- **Depends on:** ADR-004 (terminology), ADR-005 (Firebase-only, free-tier budget), ADR-006 (data
  integrity), ADR-009 (security baseline); backlog B-M1-01…07, 14, 16, 19, 36.

## Context

The first-attempt contracts nest every time series under the station node and use a "detector"
entity that is both the device and its data. That layout caused the three critical audit defects
(editing a station erases its history; stations with devices cannot be read; exports lose all but
~500 minutes) and cannot express device types, streams, calibrations, views, multichannel devices, or
time provenance. This spec defines the v2 domain contracts (zod 4, in `packages/shared`) and the
storage layout in Firebase (Firestore + Realtime Database). It does **not** implement the data layer
(step 6) or the security rules (spec 0084), but it fixes the shapes and paths they must use.

**Established behavior kept (WORKFLOW §4):** per-minute records exist only for **complete minutes**
(partial first/last minutes discarded, as in v5 — ADR-006 rule 7); intensive quantities are time
averages, never sums; realtime is a short ephemeral window (v5 keeps 8 minutes); the per-minute
record keeps v5's quantities (event count, coincidences, amplitude mean/min/max, temperature,
pressure, dead time) so v5 data can be migrated in M5.

**Changes from established behavior (labelled):** (1) dead time is stored as the increment of the
device's cumulative counter (live time), not as an average of the raw column (ADR-006 rule 8, change
from v5); (2) a quantity a device does not report is **absent**, never 0; (3) series live under
streams, not under stations or profiles.

## Functional requirements

### Contracts (`packages/shared`, zod 4)

- **FR1 — Identity:** `User` (uid, displayName, username — unique, lowercase; email kept private,
  never in public projections), `Institution` (optional grouping).
- **FR2 — Station:** id, ownerUid, name, `location` { lat, lon, altitudeM, city, countryCode }
  (exact, private), `publicPrecision` (`exact` | `approximate` | `city` | `country` | `hidden`),
  `visibility` (`public` | `institution` | `private`, **required, no default** — D22), optional
  institutionId, timezone, createdAt, updatedAt.
- **FR3 — Sharing and ownership:** station members { uid → `editor` | `viewer` }; an immutable
  `OwnershipTransfer` record (id `{stationId}_{nonce}`, stationId, from, to, createdAt) — the
  station carries the `transferId` of its last transfer; the acceptance flow is decided in M2
  (B-M2-05). *(Proposed, deferred to M2: shared ownership / co-owners — M1 models a single owner plus
  editors and viewers.)*
- **FR3b — Agent identity (Proposed — decision for the maintainer at the spec gate):** recommended, a
  dedicated per-machine account added to the station as an **editor** (revocable by the owner
  removing the membership); alternative, the owner's own account. See spec 0084 FR23.
- **FR4 — Device type** (declarative, Bring Your Own Detector foundation): id, version, name,
  `status` (`builtin` | `draft` | `community` | `review` | `verified`), channels, transport
  { baud, lineTerminator, encoding }, parser { kind: `columns` | `json` | `keyValue`, field map →
  canonical quantity + unit, header detection }, `timeSource` (host | device ms | device s, rollover
  width), `counterSemantics` (one line per event | event id | cumulative count), `deadTimeSemantics`
  (`cumulative` with unit | `perEvent` | `percent` | `none`), default calibration, default geometry.
  Built-ins: CosmicWatch v2, CosmicWatch v3X (official column order), and the MuNRa variant (column
  meanings from `docs/science/SERIAL-FORMATS.md`; dead-time unit marked unverified until the step-9
  capture).
- **FR5 — Device:** id, ownerUid, `stationId` (the station it is installed in; rules authorize by
  it), deviceType { id, version }, label/serial, `geometry` { activeAreaCm2, thicknessCm, material,
  orientation } (B-M1-07), `saturation` { value, unit } (device units — mV or ADC counts), status.
- **FR6 — Assembly:** stationId, members [{ deviceId, position { x, y, z } cm, tiltDeg }] — stored in
  M1, edited in M3.
- **FR7 — Stream:** id **`<ownerUid>_<random>`** (binds the id to the station owner so nobody can
  claim another user's stream — spec 0084), stationId, deviceId (a device of the same station and
  owner), createdAt, status. One device at one station = one stream; moving the device creates a new
  stream.
- **FR8 — Session:** streamId, id, startedAt, endedAt?, `endReason` (`stop` | `reset` | `usbLoss` |
  `powerLoss` | `configChange` | `storageError` | `clockStep` | `unknown`), agentVersion, deviceType version, calibration version,
  `timeProvenance` { source `ntp` | `rtc` | `gps` | `none`, offsetMs, driftPpm?, measuredAt },
  counters (complete minutes, discarded partial minutes, quarantined lines, event-id gaps).
- **FR9 — Calibration:** deviceId, version, validFrom, parameters, each with `origin` (`default` |
  `suggested` | `manual` | `imported`), uncertainty, and `locked`. In M1 only `default` and `manual`
  are written; the calibration UI is M3.
- **FR10 — Minute record v2 (canonical, complete minutes only):** `ts` (minute start, UTC ms, a
  multiple of 60 000), sessionId, `n` (events in the minute, integer ≥ 0), `coincidences?` (integer,
  only for coincidence-capable devices), `amplitude?` { mean, min, max, unit } (per-event values
  summarised, ADR-006 rule 8; **absent when n = 0**), `temperatureC?` and `pressureHpa?` (time
  averages; **absent** when not reported), `quality` { eventIdGaps, clockAnomalies }.
  **Dead time and live time — one definition shared with spec 0085:** when the device type reports a
  cumulative dead-time counter, `deadMs` = D(last line of this minute) − D(last line of the previous
  minute) and `liveMs` = 60 000 · (1 − deadMs / Δt_device), where Δt_device is the device-clock span
  between the same two lines; `liveSource: "counter"`. A counter decrease (reset) inside a minute
  invalidates that minute (it is discarded like a partial minute and counted). When no counter
  exists: `liveSource: "tau"` (live time from a declared τ, spec 0085) or `liveSource: "nominal"`
  with `liveMs` omitted — consumers treat `nominal` as **uncorrected** (never as zero dead time).
  A record is rejected if it is not a complete minute or if any value violates its range.
- **FR11 — Day summary:** per stream and UTC day, one entry **only for hours that contain at least
  one complete minute** { hourStart, completeMinutes, n, liveMs? and liveSource, coincidences?,
  pressureHpa mean? with pressureMinutes, temperatureC mean? with temperatureMinutes, amplitude
  histogram with the device type's fixed bins plus a separate saturation count (saturated events are
  never also counted in the last regular bin) }. A missing hour is a gap and must never read as
  n = 0. One document per stream-day (see FR15).
- **FR12 — Live window and status:** live events { t (host ms), amplitude } kept for 10 minutes and
  pruned by time; stream status { lastSeenAt, agentOnline, lastMinuteTs, rawRatePerMin (n of the last
  complete minute, uncorrected) }.
- **FR13 — Multichannel and sampled data (designed now, stored later):** `ChannelEvent` { channel,
  t, amplitude } for multichannel devices (muograph); `SampleBlock` { channel, startTs, rateHz,
  values[] } for sampled devices (seismometer). M1 defines and tests the types; no cloud storage for
  them in M1.
- **FR14 — Raw line (agent-local contract):** { deviceId, hostTs (wall ms), monotonicNs, text, bytes
  length } — the layer-0 record stored only in the agent's SQLite (cloud raw upload is admin-gated,
  M4).

### Storage layout (implemented in step 6; rules in spec 0084)

- **FR15 — Firestore (metadata, catalogue, summaries):**
  `users/{uid}` · `usernames/{username}` · `stations/{stationId}` ·
  `stations/{stationId}/members/{uid}` · `ownershipTransfers/{id}` · `deviceTypes/{id}` (versions as
  subcollection) · `devices/{deviceId}` · `devices/{deviceId}/calibrations/{version}` ·
  `assemblies/{stationId}` · `streams/{streamId}` · `streams/{streamId}/sessions/{sessionId}` ·
  `streams/{streamId}/days/{YYYY-MM-DD}` · `publicStations/{stationId}` (projection: name, location
  rounded to the owner's public precision, device count, active flag — **no personal data**; written
  in the same batch as any change of the station's name, location, or precision, and deleted when
  the station leaves `public`) · `admins/{uid}` (written only by admins; the first by a trusted
  script) · `audit/{id}` (append-only, defined action types only).
- **FR16 — Realtime Database (high-rate data), flat:** `minutes/{streamId}/{ts}` (compact
  serialized minute record; write-once; never readable anonymously — public charts use day
  summaries) · `live/{streamId}/events/{pushKey}` · `status/{streamId}` · `statusPublic/{streamId}`
  (`lastSeenAt`, `agentOnline` only, for public stations) · `stationAccess/{stationId}` and
  `streamStation/{streamId}` (the authorization mirror of spec 0084 FR15, because RTDB rules cannot
  read Firestore). No series is ever nested under a station. *(Public showcase path for anonymous live viewing: Proposed, decided
  after the step-10 measurement — ADR-005 §6.)*
- **FR17 — Compact serialization** for RTDB minute records (short keys, absent fields omitted) with a
  lossless round trip to the domain type; documented key table.
- **FR18 — No Cloud Storage:** the signal-blob contract of the first attempt is not carried over.

## Non-functional requirements

- **Strict typing:** zod 4 schemas, types inferred with `z.infer`; no `any`; every schema has an
  explicit version field where documents are persisted (`schemaVersion: 2`).
- **Free-tier budget (ADR-005):** RTDB storage ≈ one compact minute record per stream-minute
  (estimate: ≈ 100–150 bytes → ≈ 50–80 MB per stream-year; measured in step 10); Firestore writes ≈
  24 day-summary updates + a few session/status updates per stream-day; dashboards read one
  day-summary document per day of range.
- **Security (ADR-009):** personal data (email, exact location) only in owner-readable documents;
  `publicStations` holds only owner-approved precision; field shapes here are what rules validate.

## Data integrity (ADR-006)

Layer 0 (raw lines) stays in the agent. Layer 1 is the minute record, day summary, and session
metadata — deterministic from layer 0 and versioned (agentVersion, deviceType version). Derived data
(views, recipes) is out of scope for M1 contracts except the calibration record. Nothing stored is
replaced by an altered version: minute records are written once per (stream, minute); a recomputed
minute (e.g. after a parser fix) is written under a new session/version, never silently overwritten.

## Design / approach

- `packages/shared/src/v2/` with one module per entity; `index.ts` exports v2 as the package API.
- **Upgrade zod 3 → 4** in this step (moved here from step 1, reported to the maintainer).
- **First-attempt contracts (Proposed — decision at the spec gate):** the first-attempt web app
  (`apps/web`) and first-attempt provider depend on the v1 schemas. Two options:
  - **(a)** keep v1 under a `@muonhub/shared/legacy` subpath until M2 removes it, adapting imports
    mechanically; everything keeps building;
  - **(b) Recommended:** move the first-attempt web app to `legacy/web-first-attempt/` outside the
    workspace build (kept as reference for M2, deleted when M2 ends), and replace v1 contracts,
    provider, and agent core directly. Nothing deployable is lost (v6 has never been deployed), and no
    effort is spent keeping soon-replaced code compiling.
- Documentation: new `docs/architecture/DATA-MODEL.md` (entities, paths, compact key table, budget
  estimates, v5 → v6 field mapping for M5).

## Acceptance criteria (verifiable)

- [ ] CA1: every FR1–FR14 entity has a zod 4 schema and an exported inferred type; tests cover valid
  and invalid examples for each.
- [ ] CA2: `MinuteRecord` rejects `ts` not on a minute boundary, `liveMs` outside (0, 60 000],
  non-integer or negative `n`, `amplitude` present when n = 0, `liveMs` present with
  `liveSource: "nominal"`; accepts a record with no `pressureHpa`/`temperatureC`; tests assert an
  absent pressure is never coerced to 0 and a missing hour in a day summary never reads as n = 0.
- [ ] CA3: the compact RTDB serializer round-trips 10 000 generated minute records losslessly
  (property test).
- [ ] CA4: `Station` has no default visibility (a schema test fails without it); `publicStations`
  projection type contains no email, uid list, or exact coordinates.
- [ ] CA5: built-in device types (CosmicWatch v2, v3X, MuNRa) validate against the `DeviceType`
  schema; the MuNRa dead-time unit is flagged unverified.
- [ ] CA6: `docs/architecture/DATA-MODEL.md` lists every Firestore path and RTDB path of FR15–FR16
  and the v5 → v6 field mapping.
- [ ] CA7: typecheck · lint · build · test · format:check green.
- [ ] CA8: only `packages/shared`, docs, and (per the approved option) the legacy move are touched.

## Validation in practice

The contracts are exercised end to end by the 72-hour run (step 11): every minute record, day
summary, session, and status document written by the agent validates against these schemas (zero
schema rejections outside deliberately malformed test input).

## Out of scope

Data-layer implementation and rules (step 6, spec 0084); recipes and views beyond the calibration
record (M3); Bring Your Own Detector editor and catalogue workflow (M4); cloud storage of raw lines,
multichannel events, or sampled data (M4/6.x); migration tooling (M5).

## Tasks

- [x] T1: upgrade zod to 4 in the catalog; write v2 schemas with tests first.
- [x] T2: compact serializer + property test.
- [x] T3: built-in device types.
- [x] T4: apply the approved legacy option.
- [x] T5: `docs/architecture/DATA-MODEL.md`; update `docs/architecture/ARCHITECTURE.md` links.
- [x] T6: changelog fragment in `changelog.d/`.
