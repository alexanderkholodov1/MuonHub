# 0089 — Stations, devices, streams, and sharing (web)

- **Status:** implemented (spec 0089 — web stations, devices, streams, sharing; CA1–CA6 covered in `@muonhub/web` tests and build)
- **Milestone:** M2 — Web platform (`6.0.0-alpha.2.x`), step 3
- **Owner:** written by the MuonHub brigadista; implemented by a Codex worker; reviewed by code and
  security reviewers
- **Depends on:** spec 0088 (foundation, accounts); specs 0083 (contracts v2), 0084 (rules v2);
  ADR-004 (terminology), ADR-009 (rights change only through authorized flows)

## Context

Signed-in users must register the place where their hardware runs (station), the hardware itself
(device), and the space where its data lives (stream), and share a station with other people. The
first attempt crashed on device creation, defaulted visibility silently, and placed unknown locations
at random (B-M2-04). All writes go through `DataProviderV2`; the v2 rules already enforce who may do
what — the UI must offer only what the rules allow and explain refusals with safe messages.

## Functional requirements

- **FR1 — Station page** (`/app/station?id=…`): name, location (city and country; exact coordinates
  only to members), visibility, public location precision, the user's role; lists of devices and
  streams with links (`/app/stream?id=…`); loading, empty, error and not-found states.
- **FR2 — Create and edit a station** (`/app/station/new`, edit on the station page for the owner):
  name; location (latitude, longitude, altitude, city, country code — validated with
  `v2.StationSchema`); timezone; **visibility chosen explicitly** (public, institution, private —
  no default selection, the form cannot be submitted without one); **public location precision**
  chosen by the owner (exact, approximate, city, country, hidden). Ids from `newStationId()`.
- **FR3 — Devices** (`/app/device/new?station=…`): label; device type (built-in types from
  `listDeviceTypes()`); geometry (active area cm², thickness cm, material, orientation). Editors and
  owners only.
- **FR4 — Streams** (`/app/stream/new?station=…`): one device of the station; status. Ids from
  `newStreamId()`. Editors and owners only.
- **FR5 — Members** (owner only, on the station page): list members with role; add a member by
  username (`findUidByUsername`; show display name before confirming); change role (editor, viewer);
  remove. A member can leave a station.
- **FR6 — Ownership transfer** (owner only): choose a member, confirm; `transferOwnership`; the new
  owner sees an in-app notice on `/app` until dismissed (email notices come later).
- **FR7 — Rights in the UI follow the role:** viewers see read-only pages; editors manage devices
  and streams; only owners edit the station, members and transfer. The rules remain the authority.

## Non-functional requirements

- **Free-tier budget (ADR-005):** reads on demand only; no realtime subscriptions in this spec.
- **Security (ADR-009):** exact coordinates never rendered to non-members; usernames resolved without
  exposing emails; safe error messages; destructive actions (remove member, transfer) confirmed.
- **Accessibility and design language:** as spec 0088.

## Data integrity (ADR-006)

Not applicable: metadata only; no measurement data is written.

## Design / approach

`apps/web/src/features/stations/` (page, form, members, transfer), `features/devices/`,
`features/streams/`; pages under `apps/web/src/app/app/station/`, `.../station/new/`,
`.../device/new/`, `.../stream/new/` (fixed paths, query parameters). Strings in
`src/i18n/en.ts`.

## Acceptance criteria (verifiable)

- [x] CA1: create station → device → stream with the in-memory provider (component tests); the
  station form cannot be submitted without a visibility choice.
- [x] CA2: a viewer sees no edit, add or remove controls; an editor sees device and stream controls
  only; tested with three identities.
- [x] CA3: add member by username shows the display name and adds the role; an unknown username
  shows a field error; remove and change role work.
- [x] CA4: transfer moves ownership and the recipient sees the notice.
- [x] CA5: exact coordinates are absent from the rendered station page for a non-member.
- [x] CA6: typecheck · lint · build · test green; static routes listed by `next build`.

## Validation in practice

The maintainer creates his station, device and stream on a phone, shares the station with a
colleague as a viewer, and the colleague sees it read-only.
