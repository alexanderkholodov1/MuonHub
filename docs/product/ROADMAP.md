# MuonHub v6 — Roadmap

> Status: approved by the maintainer on 2026-10-03 (milestone structure). Items marked
> **Proposed** are not yet approved. Detailed items: [`BACKLOG.md`](BACKLOG.md).

## Rules of the road

- **Six milestones, one pull request each.** A milestone's PR opens only when everything in it is
  planned, tested (unit and integration), **validated in real practice with real hardware**, and
  corrected along the way. Inside each PR there are many commits carrying minor versions
  (ADR-008).
- **Plan first.** Before a milestone starts, its complete step-by-step plan is shown to the
  maintainer in the chat and approved; nothing is built that the maintainer has not seen explained
  (ADR-008).
- **Versions:** `6.0.0-alpha.<milestone>.<iteration>.<fix>` during development, then
  `6.0.0-beta.N` → `6.0.0-rc.N` → **`6.0.0`**, then normal SemVer.
- **Nothing lives only in a chat:** every decision and finding is written to this repository (or to
  the git-ignored `private/` when it must not be public).

## Milestones

### M0 — Foundation · `6.0.0-alpha.0.x`

**Goal:** a clean, coherent base that every later milestone can trust.

- Archive the first-attempt spec branches as tags; keep only `main`, `v5-production`, and the
  active work branch.
- Remove the v5 copy and the root v5 Firebase files from `main`; point Firebase tooling at the
  `muonhub` project.
- Rename the product to MuonHub everywhere (`@muonhub/*`), keeping historical records intact.
- Fold the AFLEK fleet tooling into the repository's own process docs; remove the other AI
  providers' configuration.
- Reorganize the documentation (product, decisions, science, architecture, operations, process,
  archive); write the new decisions (ADR-004 … ADR-009) and the decision log for D1–D46.
- Write the vision, roadmap, backlog, and public-site plan; rewrite the root documents.
- Write the Firebase setup guide the maintainer follows to configure the project himself.

**Validation before the PR opens:** CI green, documentation links verified, independent review.

### M1 — Core + Agent · `6.0.0-alpha.1.x`

**Goal:** trustworthy data from a real detector into the `muonhub` project, end to end, without a
web interface yet.

- Domain contracts v2 (devices, device types, stations, assemblies, streams, sessions,
  calibrations, recipes, views; multichannel events and sampled streams designed now for the
  muograph and the seismic sensor).
- Physics corrected (see the audit findings in the backlog).
- Synthetic data generator, tier 1, usable as a **virtual detector**.
- Data layer v2 on Firestore + Realtime Database; security rules with negative tests.
- Agent as a headless daemon (ADR-007): SQLite, durable sync, raw-line mirror, format-capture tool.
- Measure whether short REST requests count toward the Realtime Database connection limit (decides
  the public live design for M2).

**Validation before the PR opens:** **72 hours with the real detector** writing to `muonhub`,
including USB disconnections and network cuts, plus the virtual detector.

### M2 — Web platform · `6.0.0-alpha.2.x`

**Goal:** people use MuonHub on phones and computers.

- Accounts, stations, devices, and streams management; sharing.
- Live dashboard (mobile-first), honest labelling.
- Network map with the owner-chosen public location precision; public live demo for public
  stations; the public site ([`PUBLIC-SITE-PLAN.md`](PUBLIC-SITE-PLAN.md)).
- Deployment to `muonhub.web.app`.

**Validation before the PR opens:** real use on a phone and on a computer with the real detector.

### M3 — Science · `6.0.0-alpha.3.x`

**Goal:** the deterministic scientific toolkit, fully controlled by the user.

- Comparison between streams and views; stacked-device coincidences.
- Geometry and assemblies (area, thickness, material, orientation, stacking).
- Versioned calibration; recipes and views (pure vs filtered).

**Validation before the PR opens:** stacked CosmicWatch devices (or simulated ones) — known results
recovered.

### M4 — Open platform · `6.0.0-alpha.4.x` (moving to beta is **Proposed**)

**Goal:** anyone can bring a detector; the platform operates itself safely.

- Bring Your Own Detector: configuration terminal and a reviewed catalogue of device types.
- Operations: encrypted backups to a private vault repository, alerts (push notifications), usage
  and quota monitor.
- External and open data (space weather, neutron monitors, other networks).
- Offline collection (e.g. Raspberry Pi) with precise timestamps.

**Validation before the PR opens:** a new detector configured from scratch; a backup actually
restored.

### M5 — Migration + launch · `6.0.0-beta.x` → `6.0.0-rc.x` → **`6.0.0`** (stages **Proposed**)

**Goal:** v5 users and data move to v6; MuonHub 6 launches.

- v5 → v6 data migration.
- Internationalization (English source; Spanish, Brazilian Portuguese), user manual, DOI.

**Validation before the PR opens (Proposed):** a full migration dry run whose counts reconcile with
the sources; real users signing in to v6 and finding their history.

## After 6.0.0 (6.x)

- **Seismic channel (exploratory):** connect the seismic sensor and test for correlation with
  pre-registered, controlled analyses.
- **Muography:** study → simulation → demonstrator. The multichannel data model is designed in M1
  so the muograph does not force a rewrite.
- Other candidates (Proposed): LLM assistance, machine learning, station networks, public API — see
  the backlog.
