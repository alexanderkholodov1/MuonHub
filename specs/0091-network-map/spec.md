# 0091 — Network map

- **Status:** in-progress (built 2026-11-06 at the maintainer's instruction, before the M2 plan's
  formal approval)
- **Milestone:** M2 — Web platform (`6.0.0-alpha.2.x`), step 5
- **Owner:** written and implemented by the MuonHub brigadista; reviewed by security (privacy) and
  design-language reviewers
- **Depends on:** spec 0084 (public projections `publicStations/{id}`, readable by anyone, pages of
  at most 100); spec 0088 (foundation); ADR-009 (public data only through projections)

## Context

Visitors and members see where MuonHub's public stations are. The first attempt placed stations with
unknown locations at random and showed "active" from registration status (B-M2-11). The map reads
only the public projection, which already holds exactly what each owner approved: a point only for
`exact` and `approximate` (rounded to 0.1°) precision, city or country otherwise, and never personal
data.

## Functional requirements

- **FR1 — Public route** `/network`, no sign-in.
- **FR2 — Data:** every page of `listPublicStations` (100 per page). Nothing else is read.
- **FR3 — Map** (MapLibre GL, vector tiles from OpenFreeMap — free, no key; production provider is
  an open question): one circle per station **with a point**; approximate points drawn as wider,
  fainter circles; active and idle in two colours; a click shows name, place, device count and state.
  The view fits the points; the map's attribution is kept visible.
- **FR4 — List** of all public stations, including those without a point, with their place at the
  precision the owner chose ("Quito, EC", "EC", or "location hidden"). Stations without a point are
  never placed on the map — not at a city centre, not at random.
- **FR5 — States:** loading, empty ("no public stations yet"), error with retry.

**Known gap (open question):** the projection's `active` flag means "has a device registered as
active" (spec 0084, `countDevices`), not "recorded data recently" as B-M2-11 asks. The page labels it
honestly ("Has an active device") until the projection carries the latest data time. The projection
is refreshed by the owner only, after a device is created or the station is edited.

## Non-functional requirements

- **Free-tier budget (ADR-005):** one projection read per visit (one page for fewer than 100
  stations); tiles come from the tile provider, not Firebase.
- **Security and privacy (ADR-009):** only `PublicStation` fields are rendered; no owner, member or
  stream data is read on this page.
- **Accessibility:** the list carries the same information as the map.

## Data integrity (ADR-006)

Not applicable: read-only display of projections.

## Design / approach

`apps/web/src/features/network/`: `geojson.ts` (pure: projections → GeoJSON features with only the
point stations, and the place text per precision), `usePublicStations.ts`, `NetworkMap.tsx` (MapLibre
loaded in the browser only), `NetworkPage.tsx`; page `apps/web/src/app/network/page.tsx`.

## Acceptance criteria (verifiable)

- [ ] CA1: `geojson.test.ts` — stations without a point produce no feature; feature properties carry
  only projection fields; approximate is marked; the place text follows the precision.
- [ ] CA2: `next build` lists `/network`.
- [ ] CA3: in a real browser against the emulators, a signed-out visitor sees the public stations
  and no console errors from the page.
- [ ] CA4: typecheck · lint · test green.

## Validation in practice

The maintainer opens `/network` signed out on a phone, changes his station's public precision, and
sees the map follow his choice.
