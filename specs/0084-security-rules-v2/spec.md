# 0084 — Security rules v2 (Firestore + Realtime Database) and the rules test matrix

- **Status:** draft
- **Milestone:** M1 — Core + Agent (version range `6.0.0-alpha.1.x`)
- **Owner:** Adjutant (spec and implementation in `infra/firebase/` and the emulator tests in
  `packages/data-provider`); reviewer: **security-reviewer (mandatory)**, code-reviewer.
- **Depends on:** spec 0083 (paths FR15–FR16, entity shapes), ADR-005, ADR-006, ADR-009 (rules 1–4,
  including the maintainer's correction of 2026-10-04); backlog B-M1-17, B-M1-18.

## Context

The first-attempt rules (`infra/firebase/database.rules.json`) have no field validation, let an
editor take over or delete a station, let users write their own role, expose full station records
(and exact coordinates) to anonymous readers, and block every client list query (rules are not
filters). They were only tested with the admin target, which bypasses rules. This spec replaces them
with rules for both databases of the v2 layout and a test matrix that exercises every path and every
query with real client identities. It does **not** deploy anything by itself: the first deploy to
`muonhub` happens in plan step 8, after green tests and the maintainer's go-ahead.

## Functional requirements

### General

- **FR1 — Deny by default** in both databases; every allowed path is listed explicitly.
- **FR2 — Validate every field** on write: type, range, allowed keys (no unexpected keys), required
  keys, `schemaVersion == 2`; shapes follow spec 0083.
- **FR3 — Immutable fields:** `createdAt`, document ids, `stationId`/`deviceId` links of a stream, and
  `ownerUid` (changed only through FR8).
- **FR4 — Nobody grants themselves rights:** no rule lets a user write their own membership, role, or
  admin entry, or change `ownerUid`, except the flows in FR7–FR9.
- **FR5 — Personal data is never public:** email and exact location are readable only by the owner,
  members, and admins; anonymous users read only `publicStations/*`, public device-type entries, and
  the public showcase path (FR16, Proposed).

### Firestore (`infra/firebase/firestore.rules`)

- **FR6 — `users/{uid}`:** read/write only by that user (and admins read); `email` never copied to
  other documents. `usernames/{username}`: create-once by the claiming user (`uid == auth.uid`) **and
  only in a batch where `getAfter(users/{auth.uid}).data.username == username`** (one name per user);
  readable by signed-in users (for sharing by username), never updatable; delete only by the owner of
  the name, together with clearing the username in the user document.
- **FR7 — `stations/{stationId}`:** create by a signed-in user with `ownerUid == auth.uid` and an
  explicit `visibility` (no default); read by owner, members, admins, and (for `visibility ==
  institution`) members of the institution — *(institution membership check: Proposed, may be
  deferred to M2 if no institution exists yet)*; update metadata by owner and editors **except**
  `ownerUid`, `visibility`, and `publicPrecision`, which only the owner changes; delete only by the
  owner. List queries must be constrained (`where ownerUid == auth.uid`, or through `members`).
- **FR8 — Sharing and ownership transfer:** `stations/{id}/members/{uid}` written only by the owner
  (role `editor` | `viewer`); a member can delete their own membership (leave). A collection-group
  rule `match /{path=**}/members/{uid}` allows reading a membership only when `uid == auth.uid`
  (so "stations I belong to" is a constrained collection-group query).
  **Transfer:** the transfer id is `{stationId}_{nonce}`. The current owner creates
  `ownershipTransfers/{stationId}_{nonce}` = `{stationId, from: auth.uid, to, createdAt}` and, in the
  same batch, updates the station with `ownerUid: to` and `transferId: "{stationId}_{nonce}"`. The
  station update is allowed only if `getAfter(ownershipTransfers/$(transferId))` has
  `from == resource.data.ownerUid`, `to == request.resource.data.ownerUid`, `stationId == stationId`,
  and `exists(users/$(to))`. Transfer documents are **immutable** (no update, no delete) — they are
  the auditable record required by ADR-009 rule 3. The same batch updates the RTDB mirror first
  (FR15) so the new owner can claim it. *(Whether the recipient must accept first is decided in M2 —
  Proposed default for M1: the owner's write completes it and the recipient is notified.)* After the
  transfer the former owner loses owner rights.
  *(Proposed, deferred to M2: shared ownership / co-owners, which ADR-009 allows, is not modelled in
  M1 — only a single owner plus editors and viewers.)*
- **FR9 — `admins/{uid}`:** readable by admins; written only by admins; the first admin is created
  by a trusted Admin-SDK script (documented in `docs/operations/`). Rules check `exists(admins/$uid)`.
- **FR10 — `deviceTypes/{id}`:** built-in and `verified` types readable by everyone; `draft`
  readable/writable only by the author; status changes to `review`/`verified` only by admins (BYOD
  workflow proper is M4).
- **FR11 — `devices/{id}`, `devices/{id}/calibrations/{v}`, `assemblies/{stationId}`,
  `streams/{id}`, `streams/{id}/sessions/{sid}`:** owner/editor of the linked station write (devices
  carry `stationId`, spec 0083 FR5, so the check is one `get()`); members and admins read. **Stream
  ids are `<ownerUid>_<random>`:** a stream create is allowed only when the id prefix equals the
  station's `ownerUid`, the referenced device's `stationId` equals the stream's station, and the
  device belongs to the station owner. Calibrations are append-only (a new version is a new document; no update/delete).
  Sessions: created and closed (set `endedAt` once) by owner/editor; fields otherwise immutable.
- **FR12 — `streams/{id}/days/{date}`:** written by owner/editor (the agent identity, FR23);
  readable by members and admins, and by anyone when the station is public *(Proposed: public day
  summaries are the **only** anonymously readable series, so M2 charts need no personal data and raw
  minute ranges cannot be scraped)*. Rule cost: stream → station → membership is up to 3 `get()`
  calls per evaluation; the data layer reads day summaries in batches to keep this within the
  50k reads/day budget.
- **FR13 — `publicStations/{id}`:** readable by anyone; written only by the station owner (or admin)
  and validated to contain only the projection fields of 0083 (no email, no member list, location
  rounded to the station's `publicPrecision` — checked with `math.floor` against
  `getAfter(stations/$(id))` — or absent when `hidden`). **Consistency:** any station update that
  changes `location`, `publicPrecision`, or `name` must update the projection in the same batch
  (checked with `getAfter`); editors therefore cannot change `location` alone (owner-only, like
  `publicPrecision`). When `visibility` leaves `public`, the batch must delete the projection
  (`!existsAfter(publicStations/$(id))`).
- **FR14 — `audit/{id}`:** create-only (append), by a signed-in user for their own actions
  (`actorUid == auth.uid`, server timestamp), **only for a defined list of action types**
  (membership change, visibility change, transfer, admin change, device-type status change) with a
  bounded payload; no update, no delete; readable by admins.

### Realtime Database (`infra/firebase/database.rules.json`)

- **FR15 — Station access mirror (Proposed):** RTDB rules cannot read Firestore, so a small mirror
  per **station** authorizes RTDB access: `stationAccess/{stationId}` = `{ownerUid, editors: {uid:
  true}, viewers: {uid: true}, public: bool, pendingOwner?}` and `streamStation/{streamId}` =
  stationId (create-once). Rules:
  - `streamStation/$streamId` create-once only when `$streamId.beginsWith(auth.uid + '_')` and
    `stationAccess/{stationId}.ownerUid == auth.uid` — nobody can claim another user's stream id.
  - `stationAccess/$stationId` create-once by `ownerUid == auth.uid`; updated only by its owner;
    `pendingOwner` set by the owner during a transfer, and the new owner may then write
    `ownerUid := auth.uid` when `pendingOwner == auth.uid` (clearing `pendingOwner`).
  - **Update mirror first:** removing a member or downgrading visibility updates the mirror *before*
    Firestore (the data layer does it in that order), so a desync can only leave rights *removed*,
    never granted; transfers set `pendingOwner` in the mirror in the same operation as FR8.
  - A transfer is one write per station (not per stream).
- **FR16 — `minutes/{streamId}/{ts}`:** write-once (`!data.exists()`), only by the owner or an
  editor of the stream's station (via `streamStation` → `stationAccess`), key equal to the record's
  `ts`, `ts` a multiple of 60 000 and `ts <= now + 120000` (no future minutes), `liveMs` in
  (0, 60000] when present, `n` integer ≥ 0, only the compact keys of 0083 FR17; read by the owner,
  editors, and viewers of the station. **No anonymous reads of minutes** (public charts use day
  summaries, FR12). **No `.write` rule exists at `minutes/$streamId` or any ancestor** — RTDB rules
  cascade, and a parent grant would bypass write-once. No update, no delete by clients.
- **FR17 — `live/{streamId}/events/{key}`:** create by owner/editor with `{t, a}` validated and
  `t` within `now ± 60000` (entries cannot escape pruning); delete (pruning) by owner/editor only for
  entries older than 10 minutes (`t < now - 600000`); read by the station's owner, editors, and
  viewers. **Public showcase path:** Proposed, defined after the step-10
  measurement (ADR-005 §6).
- **FR18 — `status/{streamId}` and `statusPublic/{streamId}`:** `status` written by owner/editor with
  validated fields, read by the station's owner, editors, and viewers. Because RTDB cannot filter
  fields on read, the public part lives in a separate node `statusPublic/{streamId}` = `{lastSeenAt,
  agentOnline}` written by owner/editor and readable by anyone when `stationAccess.public == true`
  *(Proposed)*.
- **FR19 — No other RTDB path is readable or writable** (the first-attempt `stations`, `users`,
  `detector_index` nodes are gone).

### Agent identity

- **FR23 — Which account the agent uses (decision for the maintainer at the spec gate — Proposed):**
  - **Recommended:** a dedicated per-machine account (e.g. `agent-usfq-lab@…`), added to the station
    as an **editor**. If the machine is compromised, the attacker cannot transfer, delete, or change
    visibility, and the owner revokes the agent by removing its membership (and the mirror entry).
  - **Alternative:** the owner's own account (simpler; a compromised machine controls the whole
    account, and a leaked refresh token can only be revoked by changing the password).
  - Either way only the refresh token is stored on the machine, never the password (spec 0087).

### Tests and configuration

- **FR20 — Emulator test matrix** (`@firebase/rules-unit-testing`, Auth + Firestore + RTDB
  emulators): identities **anonymous, signed-in stranger, viewer, editor, owner, admin, former owner
  after transfer, removed editor**; for every path above: read, create, update, delete, and every
  list query the agent performs (and those M2 is known to need: my stations, memberships
  (collection group), public stations, day summaries, minutes range). Includes negative tests:
  self-membership, self-admin, a second username for the same user, editor changing
  `ownerUid`/`visibility`/`location`/members, claiming a stream id with another user's prefix,
  creating a stream for a device of another owner, overwriting a minute, writing a partial or future
  minute, live entries outside `now ± 60s`, writing unknown keys, reading personal fields or minutes
  anonymously, former owner and removed editor writing minutes, a transfer without a matching
  transfer document, updating or deleting a transfer document, a station leaving `public` without
  deleting its projection, a projection with exact coordinates, audit entries with an undefined
  action type.
- **FR21 — `infra/firebase/firebase.json`:** add `firestore.rules` and `firestore.indexes.json`, the
  Firestore emulator; remove the `storage` block (no Cloud Storage, ADR-005).
- **FR22 — CI:** the emulator job runs Auth, Firestore, and RTDB emulators and the full matrix.

## Non-functional requirements

- **Free-tier budget (ADR-005):** each `get()`/`exists()` in a Firestore rule counts as a read; the
  worst path (day summaries: stream → station → membership) costs up to 3, documented with the
  expected daily total. RTDB rules read only the small `streamStation` and `stationAccess` nodes. No
  rule requires a collection scan. No anonymous access to minute series (scraping and download-quota
  protection until App Check in M2).
- **Security (ADR-009):** this spec *is* the security surface; every rule has at least one negative
  test.

## Data integrity (ADR-006)

Rules enforce write-once canonical minute records (no client can overwrite or delete layer-1
history), append-only calibrations and audit, and complete-minute validation (partial minutes are
never stored, as in v5). Nothing a client can do replaces stored data with an altered version.

## Design / approach

- `infra/firebase/firestore.rules`, `infra/firebase/firestore.indexes.json` (composite indexes for
  the constrained queries), `infra/firebase/database.rules.json` (rewritten), `firebase.json`.
- Tests in `packages/data-provider/src/rules/*.emulator.test.ts`, one file per collection, sharing a
  fixture builder that seeds data with rules disabled.
- `docs/operations/` gains the trusted first-admin script procedure and the deploy procedure (deploy
  only from `infra/firebase/`, only after green tests, only with the maintainer's go-ahead).

## Acceptance criteria (verifiable)

- [ ] CA1: the matrix covers 7 identities × every path in FR6–FR18 × {read, create, update, delete}
  plus every listed query; the test count and the matrix table are in the test README.
- [ ] CA2: all negative tests of FR20 exist and pass (`assertFails`); all intended allows pass
  (`assertSucceeds`).
- [ ] CA3: a minute record write with `ts % 60000 != 0`, `liveMs > 60000`, an extra key, or to an
  existing key fails.
- [ ] CA4: an anonymous read of `stations/*`, `users/*`, `members`, or `minutes` of a private stream
  fails; an anonymous read of `publicStations/*` succeeds and the fixture proves no email/exact
  coordinates are present.
- [ ] CA5: after an ownership transfer (and the new owner claiming `pendingOwner`), the former
  owner's writes to the station, members, mirror, and minutes fail; the new owner's succeed; a
  removed editor's minute writes fail.
- [ ] CA5b: a user cannot create `streamStation/{id}` unless the id starts with their uid and they
  own the station; transfer documents cannot be updated or deleted.
- [ ] CA6: `firebase.json` has no `storage` block; emulator job green in CI.
- [ ] CA7: typecheck · lint · build · test · format:check green; security-reviewer findings resolved.
- [ ] CA8: only `infra/firebase/`, the rules tests, CI config, and `docs/operations/` are touched.

## Validation in practice

Step 8 deploys the rules to `muonhub` (with the maintainer's go-ahead); during the 72-hour run
(step 11) the agent's writes succeed with zero rule rejections, and manual probes from a second
account and an anonymous client confirm the denials of CA4–CA5 against the real project.

## Out of scope

The M2 web queries beyond those listed; institution management UI; BYOD review workflow (M4); the
public showcase rules (after the step-10 measurement); App Check enforcement (M2).

## Tasks

- [ ] T1: write `firestore.rules`, `firestore.indexes.json`, `database.rules.json`; update
  `firebase.json`.
- [ ] T2: fixture builder and the test matrix (tests first for each path).
- [ ] T3: CI emulator job with Auth + Firestore + RTDB.
- [ ] T4: first-admin script procedure and deploy procedure in `docs/operations/`.
- [ ] T5: security-reviewer pass; fix findings.
- [ ] T6: update `docs/architecture/DATA-MODEL.md` (authorization column) and the changelog
  fragment.
