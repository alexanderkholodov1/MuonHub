<div align="center">

# MuonHub

### Turning cosmic-ray detectors across Latin America into one open, living observatory.

<img src="https://img.shields.io/badge/status-building%20v6-5BD6A0" alt="Status: building v6">
<img src="https://img.shields.io/badge/version-6.0.0--alpha.1-4CC9F0" alt="Version">
<img src="https://img.shields.io/badge/license-MIT-3FB950" alt="License: MIT">
<img src="https://img.shields.io/badge/data-CC--BY%204.0-3FB950" alt="Data: CC-BY 4.0">
<img src="https://img.shields.io/badge/i18n-EN%20%7C%20ES%20%7C%20PT--BR-9AA4B2" alt="Languages">
<img src="https://img.shields.io/badge/architecture-clean%20%C2%B7%20provider--agnostic-C792EA" alt="Architecture">

</div>

---

**MuonHub is the platform that lets any university, lab, or student connect a particle detector
and turn it into a node of a continental scientific network** — recording the cosmic radiation that
rains on the Andes every second, correcting it to research grade, visualizing it live, and
correlating it with the activity of the Sun. One detector is an experiment. A hundred, synchronized
and open, are an observatory that **has never existed in this region before.**

---

> ### 🚀 Live production vs. this branch
> - **The platform running in production today is the stable v5 app**, served at
>   **[munhub-lab.web.app](https://munhub-lab.web.app)** from the **[`v5-production`](https://github.com/alexanderkholodov1/MuonHub/tree/v5-production)**
>   branch. Fixes for the live site are applied there.
> - **`main` is the in-progress v6 reconstruction** described below. It does **not** auto-deploy —
>   the production site is never redeployed from `main`. v6 will ship to its own URL when ready.

---

## 🌌 Why this matters to science

Cosmic rays are messengers from the galaxy and from solar storms. Measuring them well, in the right
place, is genuinely valuable — and **Ecuador sits in one of the best places on Earth to do it.**

- **One of the cleanest galactic signals on Earth.** Ecuador lies under **some of the highest
  geomagnetic cutoff rigidities on the planet**. Only the most energetic, purely *galactic*
  cosmic rays make it through the magnetic shield — the local noise that contaminates
  high-latitude stations is filtered out by the Earth itself.
- **A continental network, not a lonely detector.** When stations from different cities and
  altitudes measure *at the same time*, a simultaneous dip becomes a confirmed scientific event —
  a **Forbush decrease**, the fingerprint of a solar storm sweeping past Earth. MuonHub is built to
  catch exactly that, and to correlate it with neutron monitors (NMDB) and space-weather feeds
  (NOAA, NASA).
- **Research-grade by construction.** Every rate is corrected for detector **dead time** and for
  **local atmospheric pressure** (a β coefficient measured per station, not assumed). MuonHub
  reports the observables the physics actually supports — the **charged-particle flux** and the
  **Landau amplitude spectrum** — so the data is trustworthy enough to publish and cite.
- **Open by principle.** Public data under CC-BY, a reproducible correction pipeline, and a path to
  a DOI per release. Science that anyone can verify, reuse, and build on.

**The bottom line for a researcher:** an instrument-grade, real-time, openly shared cosmic-ray
network — with per-station calibration and built-in space-weather correlation.

---

## 🛰️ What it does

| | |
|---|---|
| **Never loses data** | An installable agent reads the detector, backs up to local SQLite, and syncs when online — surviving reboots and outages. |
| **Live, corrected science** | Real-time charged-particle rate and pressure, dead-time and barometric corrected, plus the amplitude spectrum — as the detector breathes. |
| **A real network** | Institutions → stations → detectors, with public/shared/private visibility, station networks, and joint multi-station analysis. |
| **Space-weather aware** | Correlation with NMDB neutron monitors, NOAA SWPC, NASA DONKI, and geomagnetic indices. |
| **Built to grow** | Its own ML layer (anomaly & Forbush detection, barometric regression) is designed in from day one. |

---

## ⚙️ Engineering, built to a standard

- **Clean, provider-agnostic architecture.** The app never talks to a database directly; it talks to
  a `DataProvider` interface. The same product runs on a **free cloud tier today** and on a
  **self-hosted server tomorrow** by swapping one implementation — **zero vendor lock-in.**
- **Typed monorepo.** TypeScript (strict) across shared contracts, a pure scientific core, the data
  layer, the design system, the web app, and the device agent — one source of truth.
- **Offline-first at the edge.** Heavy work runs on the detector's machine, keeping the platform
  light enough to run indefinitely on free infrastructure.
- **Quality-gated.** Every change ships through a pull request that must pass CI (build · test ·
  lint · typecheck), secret scanning, and cross-review before it can touch a protected `main`.
- **Spec-driven & documented.** No code without a spec; a design system ("Observatory Dark"); a
  living changelog; full internationalization (EN · ES · PT-BR).

```
[USB detector] ──serial──▶ agent (Tauri)              web (Next.js)
                           ├ reads + validates         ├ public landing
                           ├ per-minute averages        ├ station dashboards
                           ├ SQLite local backup        └ admin console
                           └ offline sync queue ─┐           ▲
                                                 ▼            │
                                    data-provider (agnostic) ─┘
                                                 ▲
        ┌──────────── pure core (no I/O, fully tested) ───────┐
        shared (contracts)   physics (corrections, spectra)   ui (design system)
```

---

## 📦 Repository structure

```
apps/web            Next.js — landing, dashboards, admin (static export, Phase A)
apps/agent          Tauri — serial reading, SQLite backup, sync queue
services/api        Backend / edge functions (Phase B)
services/ai         ML pipeline — anomaly & Forbush detection, barometric β (Phase B)
packages/shared     Types, zod schemas, constants, i18n keys — the contracts
packages/physics    Pure scientific calculations (no I/O, fully testable)
packages/data-provider  DataProvider interface + Firebase/Supabase implementations
packages/ui         Design system (Tailwind + shadcn/ui + Plotly) — "Observatory Dark"
specs/              Spec-Driven Development — one spec per unit of work
docs/               Technical docs, user manual, design language, scientific foundation
planning/           Master plan, architecture, data model, decision log
infra/              CI, fleet tooling, deployment
```

## 🧰 Tech stack

**TypeScript** (strict) · **pnpm + Turborepo** · **Next.js · Tailwind · shadcn/ui · Plotly ·
MapLibre** · **Tauri + SQLite** · **Firebase** (Phase A) → **Supabase + TimescaleDB** (Phase B) ·
**Cloudflare R2** · **Vitest · ESLint · gitleaks · GitHub Actions**

---

## 🚀 Getting started (development)

> Requires Node ≥ 20 and pnpm ≥ 9.

```bash
pnpm install
pnpm build       # build all packages (Turborepo)
pnpm test        # run the test suites
pnpm lint        # lint
pnpm typecheck   # strict type checking
```

## 🗺️ Roadmap

The plan of reconstruction is being executed phase by phase, each gated by tests
and review.

| Phase | Scope | Status |
|---|---|---|
| **F0** | Engineering foundation: CI, protected `main`, multi-agent workflow | ✅ done |
| **F1** | Core: typed contracts, scientific engine, app skeletons | 🔄 in progress |
| **F2** | Migrate the full historical dataset into v6 | ⏳ |
| **F3** | Public landing + live demo | ⏳ |
| **F4+** | Network features, space-weather correlation, ML layer, admin console | ⏳ |

Live progress: [`docs/STATUS.md`](docs/STATUS.md) · full plan: [`planning/`](planning/).

---

## 📚 Documentation

| | |
|---|---|
| [Technical docs](docs/technical/) | Architecture (C4), data model, serial formats, engineering standards |
| [User manual](docs/user-manual/) | Concepts & terminology — institutions, stations, detectors, sessions |
| [Design language](docs/design/DESIGN-LANGUAGE.md) | "Observatory Dark" visual system |
| [Scientific foundation](docs/research/THEORETICAL-FOUNDATION.md) | The physics MuonHub is built on |
| [Changelog](CHANGELOG.md) | Every notable change, release by release |
| [How it's built](AGENTS.md) | Spec-driven, multi-agent development workflow |

---

## 👤 Author & acknowledgments

Created and led by **Alexander Kholodov** (researcher, USFQ), under the supervision of **Dennis
Cazar**, in the **LEOPARD** laboratory at Universidad San Francisco de Quito, within the
**EL-BONGO / Erasmus+ CBHE** project. Detector firmware: **MuNRa** (CosmicWatch-derived).

## 📄 License & citation

Code under the [MIT License](LICENSE); data under **CC-BY 4.0**. A `CITATION.cff` and a Zenodo DOI
accompany tagged releases.

---

<div align="center">
<sub>Built in the Andes, under one of the cleanest cosmic-ray skies on Earth. 🏔️</sub>
</div>
