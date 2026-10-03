# MuonHub v6 — Architecture

> **Status:** target architecture of the v6 rebuild, as decided in ADR-004 to ADR-009
> ([`docs/decisions/`](../decisions/)). The code on `main` is still the first v6 attempt; milestones
> M1 (core + agent) and M2 (web) replace it. Detailed data contracts are specified in M1. The
> first-attempt architecture is kept in [`docs/archive/first-attempt/`](../archive/first-attempt/).

---

## 1. System context (C4 level 1)

```
                 ┌────────────────────────────── Firebase project `muonhub` (Spark, no cost) ─┐
 Device ─serial─▶ Agent ──sync──▶│  Realtime Database   Firestore   Authentication   Hosting   │
 (CosmicWatch,    (headless       │  (live + series)     (metadata,  (accounts)       (web app) │
  other types)     daemon, SQLite)│                       summaries)  App Check · Cloud Messaging│
                                  └──────────────▲─────────────────────▲──────────────────────────┘
                                                 │                     │
                       Signed-in users ──────────┤                     ├──── Anonymous visitors
                       (owners, collaborators)   │                     │     (public pages, live page)
                                                 │
                       Scheduled jobs (GitHub Actions) — backups to a private vault repository,
                       alerts, usage measurement, external-data ingestion (from M4)
```

External references (read-only, from M4): neutron monitors (NMDB), space-weather services, other open
cosmic-ray datasets.

---

## 2. Containers (C4 level 2)

| Container | Technology | Responsibility |
|---|---|---|
| **Agent** (`apps/agent`) | Node.js 24 daemon (systemd on Linux), TypeScript, `serialport`, SQLite | Reads devices 24/7; keeps **all raw data locally**; builds canonical per-minute records; publishes live data; syncs when online; executes event-level recipes; local web panel on `localhost`; raw-line tee for remote observation; format capture tool. ADR-007. |
| **Web app** (`apps/web`) | Next.js static export on Firebase Hosting, Tailwind, uPlot (Plotly lazy for spectra), MapLibre | Public site (landing, science, live page, network map), dashboards, comparison and calibration tools, administration. |
| **Data-access layer** (`packages/data-provider`) | TypeScript; the **only** place that uses Firebase SDKs | Interfaces + Firebase implementation for metadata, series, live data, and auth. |
| **Contracts** (`packages/shared`) | zod schemas | The shapes of every boundary (device types, streams, records, calibrations, recipes, views). |
| **Physics** (`packages/physics`) | Pure TypeScript, numerically tested | Corrections, statistics, spectra, coincidence analysis, comparison statistics. |
| **Design system** (`packages/ui`) | React + Tailwind tokens | "Observatory Dark" components. |
| **Firebase** | Realtime Database (us-central1), Firestore (nam5), Authentication, Hosting, App Check, Cloud Messaging, Remote Config | Storage, identity, delivery. No Cloud Storage, no Cloud Functions (not available on Spark). ADR-005. |
| **Scheduled jobs** (from M4) | GitHub Actions cron + least-privilege service account | Backups (encrypted, private vault repository), alerts, usage measurement, external data. |

---

## 3. Principles

1. **Raw is immutable; everything else is derived** (ADR-006). Layer 0 raw (agent, local) → layer 1
   canonical (reproducible from raw, versioned parser) → layer 2 derived (recipe-versioned views,
   computed on read or materialised only on explicit request, always labelled).
2. **The agent is the source of truth for raw data.** The cloud holds canonical per-minute records,
   summaries, live windows, and metadata. Full raw upload to the cloud is an admin-gated option.
3. **Free-tier budget is a design input** (ADR-005): long time ranges read rollups; bundles stay
   lean; *(proposed, ADR-005 §6)* anonymous visitors do not hold persistent database connections.
4. **One SDK boundary.** Only `packages/data-provider` talks to Firebase.
5. **Deny by default** (ADR-009). Public data is served from dedicated projections without personal
   data.
6. **Pure core.** `packages/physics` and `packages/shared` have no I/O and are tested first.

---

## 4. Dependency rule

```
apps (web, agent)  ──▶  data-provider  ──▶  shared
        │                                      ▲
        └──────────────▶  physics  ────────────┘
        └──────────────▶  ui
```

Dependencies point inward to the pure core (`shared`, `physics`). Nothing in the core imports a
framework or an SDK.

---

## 5. What is decided later

- The detailed Realtime Database / Firestore layout, security rules, and indexes — specified in M1.
- The public live page mechanism — proposed in ADR-005, measured in M1 before it is built in M2.
- The staging environment (a dedicated project vs. preview channels plus the emulator; preview
  channels still use the production databases) — proposed in the M1 plan.
