# Security rules v2 — emulator test matrix (spec 0084)

These suites test `infra/firebase/firestore.rules` and `infra/firebase/database.rules.json` in the
Auth + Firestore + Realtime Database emulators with **real client identities** — never the
administrative target, which bypasses the rules (ADR-009).

```bash
pnpm --filter @muonhub/data-provider test:emulator   # needs Java 21
```

Every test starts from the same seeded world (`fixtures.ts`, written with rules disabled):

| Station | Visibility | Owner | Editors | Viewers |
|---|---|---|---|---|
| `stPub` | public (approximate precision, with its `publicStations` projection) | `ownerA` | `editorE`, `agentEd` | `viewerV` |
| `stPriv` | private (exact precision) | `ownerA` | `editorE`, `agentEd` | `viewerV` |
| `stOther` | private | `strangerS` | — | — |

Identities: **anonymous**, **signed-in stranger** (`strangerS`, owner of `stOther` only), **viewer**,
**editor**, the **agent's dedicated editor account** (`agentEd`, spec 0084 FR23), **owner**,
**admin** (`adminX`, in `admins/`), **transfer recipient / former owner** and **removed editor**
(built by the flows in `transfer-flow.emulator.test.ts`).

## Matrix

R = read (get), L = list query, C = create, U = update, D = delete. "—" = denied for everyone.
Each allowed cell has an `assertSucceeds` test; every identity not listed has an `assertFails`
test for the same operation (anonymous reads of every path included).

### Firestore

| Path | R / L | C | U | D | Suite |
|---|---|---|---|---|---|
| `users/{uid}` | self, admin (L: admin) | self, with its username claim in the batch | self (immutable uid/createdAt; rename moves the claim) | self, releasing the username claim in the batch | identity |
| `usernames/{name}` | signed-in (L: —) | self, only if the user doc names it after the batch | — | self, only when the user doc no longer names it | identity |
| `admins/{uid}` | admin; a user reads their own entry (L: admin) | admin | admin | admin | identity |
| `audit/{id}` | admin | signed-in, own actorUid, defined action with its fixed `details` shape, matching the target's state after the batch (spec 0084 FR14), server time ±5 min | — | — | identity |
| `stations/{id}` | owner, members, admin (L: `where ownerUid == me`) | signed-in as owner; id `<myUid>_<random>`; public ⇒ projection in batch | owner (not ownerUid/transferId); editor: name/timezone only; transfer: owner + new transfer record | owner; projection deleted in batch | stations |
| `stations/{id}/members/{uid}` | owner, admin; self (collection group `where uid == me`) | owner (never self) | owner | owner; the member (leave) | stations |
| `publicStations/{id}` | **anyone** (L: anyone, `limit <= 100`) | owner/admin, must match the station's precision | same | owner/admin, only when the station is not public | stations |
| `ownershipTransfers/{id}` | from, to, admin (L: `where to == me`) | current owner, in the batch that changes the station owner | — | — | stations, transfer-flow |
| `deviceTypes/{id}` (+ `versions/{v}`) | anyone for builtin/verified (L: `where status in […]`); author and admin for others | author (draft only); admin | author while draft (stays draft); admin | author (draft); admin. Versions: never | devices |
| `devices/{id}` | owner, members, admin (L: `where stationId == X`) | owner/editor; device owned by the station owner | owner/editor of old and new station | owner | devices |
| `devices/{id}/calibrations/{v}` | owner, members, admin | owner/editor (append-only, authorUid = self) | — | — | devices |
| `assemblies/{stationId}` | owner, members, admin | owner/editor | owner/editor | owner | devices |
| `streams/{id}` | owner, members, admin (L: `where stationId == X`) | owner/editor; id `<stationOwnerUid>_<random>`; device of the same station and owner | owner/editor, `status` only | — | streams |
| `streams/{id}/sessions/{sid}` | owner, members, admin (L: ordered by startedAt) | owner/editor | owner/editor: counters grow; endedAt/endReason once | — | streams |
| `streams/{id}/days/{day}` | **anyone for public stations** (L: `limit <= 100`); owner, members, admin (L: by id range) | owner/editor; day ≤ today (UTC) | owner/editor; day ≤ today | — | streams |

### Realtime Database

| Path | Read | Write | Suite |
|---|---|---|---|
| `stationAccess/{stationId}` | owner, pending owner | create-once by its owner, id `<myUid>_<random>`; while no `pendingOwner` exists the owner rewrites keeping ownership and manages `editors`/`viewers`/`public`; the owner sets `pendingOwner` (same value again: allowed) but never clears or re-points it; a member removes itself; only the pending owner clears it, by claiming `ownerUid` with `editors`/`viewers` removed; no delete | rtdb-access, transfer-flow |
| `streamStation/{streamId}` | owner, editors, viewers | `{stationId, since}` create-once by the station owner or an editor, id prefixed with the station owner's uid; `since` within now − 7 days … now + 2 min | rtdb-access |
| `minutes/{streamId}/{ts}` | owner, editors, viewers (range queries by key) — **never anonymous** | create-once by owner/editors; 13-digit key on a whole minute, not in the future, not before the stream's `since`; compact keys only | rtdb-series |
| `live/{streamId}/events/{key}` | owner, editors, viewers | owner/editors: create with `t` within now ± 60 s; delete only entries older than 10 min | rtdb-series |
| `status/{streamId}` | owner, editors, viewers | owner/editors | rtdb-series |
| `statusPublic/{streamId}` | **anyone when the station is public**; owner, editors, viewers | owner/editors (`lastSeenAt`, `agentOnline` only) | rtdb-series |
| anything else (root, first-attempt `stations`, `users`, `detector_index`) | — | — | rtdb-series |

## Counts

**350 tests** in 7 suites (run of 2026-10-12): **220 negative** tests (titles containing "denies",
each asserting `assertFails` with a real identity) and **130 positive** tests (`assertSucceeds`;
several also assert the matching denial for other identities). Loops over identities expand to one
test per identity.

| Suite | Tests |
|---|---|
| `identity.emulator.test.ts` — users, usernames, admins, audit | 54 |
| `stations.emulator.test.ts` — stations, members, projection, transfers | 83 |
| `devices.emulator.test.ts` — device types, devices, calibrations, assemblies | 43 |
| `streams.emulator.test.ts` — streams, sessions, day summaries | 41 |
| `rtdb-access.emulator.test.ts` — stationAccess, streamStation | 41 |
| `rtdb-series.emulator.test.ts` — minutes, live, status, statusPublic, other paths | 73 |
| `transfer-flow.emulator.test.ts` — transfer and removal end to end | 15 |

## Known limits of the rules (enforced elsewhere)

- **Day-summary hour entries:** Firestore evaluates at most 1000 expressions per request, so a
  24-hour document is checked per hour only for its allowed keys. Field types and ranges of hour
  entries are enforced by the data layer's zod schema; the canonical minutes stay write-once.
- **Lists inside documents** (device-type `fields`, assembly `members`, calibration `parameters`)
  are bounded in size but their elements are validated by zod, not by the rules (rules have no
  loops).
- **Admins have no Realtime Database rights** (RTDB rules cannot read Firestore `admins/`).
- **Institution-wide reads** (`visibility == institution`) are deferred to M2: no institution exists
  yet, so such stations are readable by owner, members, and admins only.
- **Audit content:** each entry is checked against its target's state after the batch, which proves
  the stated outcome holds, not that the actor's batch caused it; that part is self-asserted.
- **Cancelling a transfer in the mirror:** RTDB cannot see Firestore, so the owner cannot clear
  `pendingOwner`; an abandoned hand-over is undone by the recipient (claim, then hand back) or by an
  operator with the Admin SDK (spec 0084 FR15).
- **Deleted stations:** the mirror is never deleted; the data layer removes its `editors`/`viewers`
  and sets `public: false` before deleting the Firestore station.
