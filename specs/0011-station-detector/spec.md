# 0011 — Create Station + Detector management (onboarding the user's site & device)

> **Superseded (2026-10-03):** first v6 attempt, kept as a historical record. The v6 rebuild
> replaces this work — see [`specs/README.md`](../README.md) and [`docs/product/ROADMAP.md`](../../docs/product/ROADMAP.md).

- **Status:** ready for implementation
- **Responsible:** Adjutant (spec) → Cursor (implementation, Claude model) → Gemini (cross-provider review, D35) → Adjutant (verification + macro + PR)
- **Depends on:** 0003 (`Station`/`Detector`/`Calibration` schemas), 0007 (FirebaseProvider `upsertStation`/`upsertDetector`/`listDetectors`), 0008 (`@munhub/ui`), 0009 (auth — the owner is the signed-in user). Branches from a linear `main`.
- **Phase:** F1 · **Epic:** EPIC-3 · **Backlog:** 0011 (station creation) + 0012 (detector management). Bundled: a user naturally creates a station **and** registers its first detector in one onboarding flow — the MVP step after auth.

## Context
An authenticated user has no way to register their site or device yet. This milestone delivers the
**Create Station** flow (mandatory metadata, visibility with **no default** per D22) and **Detector
management** under a station (auto `device_token`, calibration defaults by `hw_version`, advanced
edit). It is the step before live data: after this, a station+detector exist to attach the agent to.

**Vocabulary (D21):** a **Station** is the registered site/profile (location, visibility — what
appears on the map). A **Detector** is the physical CosmicWatch device inside it. Data belongs to
the detector. Never use "detector" for the profile.

## Functional requirements

### Station creation (0011)
- **FR1 — Create flow** at `/stations/new` (protected; owner = current user). A form built from
  `@munhub/ui` collecting the mandatory `Station` metadata (DATA-MODEL §5 / the `StationSchema`):
  name, **visibility (public/institution/private — an explicit choice, NO pre-selected default,
  D22)**, latitude/longitude/altitude (manual entry), city, country, placement, type
  (single/coincidence), timezone; optional: floor, shielding, orientation, notes.
- **FR2 — Validation:** validate with the shared `StationSchema` (zod) at submit; surface
  field-level errors; the form cannot submit without visibility chosen and the mandatory fields.
  `ownerUid` is the authenticated user (never user-supplied). Persist via `DataProvider.upsertStation`.
- **FR3 — Non-intrusive metadata reminder:** a station missing optional-but-desirable metadata
  shows a **non-blocking** notice prompting completion (compat with future v5-migrated stations
  that arrive without full metadata) — never a blocking modal.
- **FR4 — Station list / detail:** `/stations` lists the user's stations (via `listStations({ ownerUid })`);
  `/stations/[id]` shows the station with its detectors and an "edit metadata" action.

### Detector management (0012)
- **FR5 — Register detector** under a station: hardware model, firmware version, `hw_version`
  (v2/v3X/unknown), `sipm_count`. A **`device_token` is auto-generated** and **does not block**
  registration. Calibration defaults are applied **by `hw_version`** (sensible per-hardware values);
  advanced calibration (adcToMv, saturationMv, triggerAdcMin) is an optional collapsible section
  with a **"reset to defaults"** action. Persist via `DataProvider.upsertDetector` (writes
  `/detector_index`).
- **FR6 — ≥1 detector per station;** the create-station flow offers to register the first detector
  immediately (the common single-detector case), and the station detail page can add more.
- **FR7 — Consistency notice:** if a detector is saved with a `device_token` different from one
  already registered under the station, show a **non-blocking advisory** recommending a new
  station/detector (do not hard-block — advisory only, per backlog 0012 CA).

### Provider/contract
- Station and Detector CRUD use the existing `DataProvider` methods; **no new backend SDK usage in
  `apps/web`** (guardrail 6 — go through the provider/`useAuth`). If a calibration-defaults helper
  is needed, put pure logic in `@munhub/shared` (e.g. `defaultCalibration(hwVersion)`), not inline
  in the app.

## Non-functional
- Strict TS, no `any`. `@munhub/ui` tokens only (no raw hex); §0 anti-AI-look checklist on every
  screen; WCAG AA; loading/empty/error/success states on each form and list.
- Visibility has **no default** (D22) — enforce in the form (nothing pre-checked) and in validation.
- Scientific honesty in copy (station `type` help text, etc.); no "muon" labeling of single-SiPM.
- Calibration defaults live in `@munhub/shared` (pure, tested), consumed by the form.

## Acceptance criteria
1. An authenticated user creates a station: the form requires visibility (no default) + the
   mandatory metadata; invalid input shows field errors; on submit the station persists with
   `ownerUid` = the current user and appears in `/stations`.
2. Registering a detector auto-generates a `device_token` (non-blocking), applies calibration
   defaults by `hw_version`, and the detector is reachable via `getDetector`/`listDetectors`
   (proves `/detector_index`).
3. The advanced calibration section edits values and "reset to defaults" restores the per-hardware
   defaults.
4. A second detector with a different `device_token` under the same station triggers the
   non-blocking consistency advisory.
5. A station missing optional metadata shows the non-blocking completion reminder (not a blocker).
6. `apps/web` imports no `firebase/*` (grep). `pnpm build·test·lint·typecheck` green across the
   workspace; new pure logic in `@munhub/shared` has unit tests.

## Out of scope
- Roles/permissions/sharing matrix (0010), institution membership, station networks (0056),
  the agent connection + live data (EPIC-4/5), the public map (0024), deletion/transfer (admin).

## Documentation (D42)
- `docs/technical/DATA-MODEL.md` (station/detector creation, calibration defaults), spec status,
  `docs/STATUS.md` (Adjutant), `changelog.d/station-detector.added.md`.
