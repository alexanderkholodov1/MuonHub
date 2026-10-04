<div align="center">

# MuonHub

### Turning cosmic-ray detectors across Latin America into one open, living observatory.

<img src="https://img.shields.io/badge/status-v6%20rebuild-5BD6A0" alt="Status: v6 rebuild">
<img src="https://img.shields.io/badge/version-6.0.0--alpha.0-4CC9F0" alt="Version">
<img src="https://img.shields.io/badge/license-MIT-3FB950" alt="License: MIT">
<img src="https://img.shields.io/badge/data-CC--BY%204.0-3FB950" alt="Data: CC-BY 4.0">

</div>

---

**MuonHub lets any university, lab, or student connect a particle detector and turn it into a node
of a shared scientific network** — recording the cosmic radiation that reaches the ground every
second, correcting it with documented physics, visualizing it live, and comparing it across devices,
places, and external references such as neutron monitors and space-weather data.

> ### Production vs. this branch
> - **Production today is MuonHub v5**, served at
>   **[munhub-lab.web.app](https://munhub-lab.web.app)** from the
>   [`v5-production`](https://github.com/alexanderkholodov1/MuonHub/tree/v5-production) branch.
>   It is frozen while a detector records with it.
> - **`main` is the v6 rebuild.** v6 will be published at **muonhub.web.app** when its milestones are
>   complete. Nothing on `main` deploys automatically.

---

## Why it matters

- **A strong site for galactic cosmic rays.** The Ecuadorian Andes have a geomagnetic cutoff rigidity
  of about 12–13 GV, among the highest on Earth: low-energy particles are shielded out, so the signal
  is dominated by galactic cosmic rays (see the
  [theoretical foundation](docs/science/THEORETICAL-FOUNDATION.md)).
- **A network, not a lonely detector.** Stations in different cities and altitudes that measure at the
  same time can confirm events that one detector alone cannot — for example a Forbush decrease seen
  in several places and in neutron-monitor data.
- **Honest, reproducible science.** Rates are corrected for detector dead time and local atmospheric
  pressure with documented methods. Single-SiPM detectors report a **charged-particle (MIP-type)
  rate**, not "muons". Raw data is never altered; every filtered or calibrated view records how it was
  produced.
- **Open by principle.** Code under MIT, public data under CC-BY 4.0.

---

## What v6 delivers

| | |
|---|---|
| **Never loses data** | A headless agent next to the detector reads the serial port 24/7, keeps everything in local SQLite, and syncs when online. |
| **Live, corrected science** | Live charged-particle rate, pressure, and amplitude spectrum, with dead-time and barometric corrections. |
| **Bring Your Own Detector** | Configure any device type (columns, units, channels, geometry) and share it with the community, with review states. |
| **Comparison and coincidences** | Deterministic tools to compare streams and processing views, including stacked devices in coincidence. |
| **Controllable calibration** | Versioned calibrations and recipes defined by the user; automatic routines only propose. |
| **Free by design** | Runs entirely on Firebase's no-cost plan, engineered around its quotas. |

Plan and status: [roadmap](docs/product/ROADMAP.md) · [status](docs/STATUS.md).

---

## Repository structure

```
apps/web               Next.js static export — public site and dashboards
apps/agent             Device agent (headless Node.js daemon from milestone M1)
packages/shared        zod contracts and types
packages/physics       Pure scientific functions (no I/O, numerically tested)
packages/data-provider Data-access interface + Firebase implementation
packages/ui            Design system "Observatory Dark"
infra/firebase         Firebase configuration and security rules
specs/                 Specifications (one per unit of work)
docs/                  Product, decisions, architecture, science, operations, process, archive
```

## Tech stack

**TypeScript** (strict) · **pnpm + Turborepo** · **Next.js** (static export) · **Tailwind** ·
**MapLibre** · **uPlot** (charts, from M2) · **Node.js daemon + SQLite** (agent, from M1) ·
**Firebase** (Realtime Database, Firestore, Authentication, Hosting, App Check, Cloud Messaging) ·
**Vitest · ESLint · gitleaks · GitHub Actions**

## Development

Requires Node.js 24 LTS (`.nvmrc`) and pnpm 11 (via corepack).

```bash
pnpm install
pnpm build       # build all packages
pnpm test        # run the test suites
pnpm lint        # lint
pnpm typecheck   # strict type checking
```

---

## History

| Version | Name | What it was |
|---|---|---|
| 1.0 | MuNRa | A Python desktop application that read the detector and stored data in a local SQLite database. |
| 2.0 | MuNRa | The move to a web platform with a shared Firebase database. |
| 3.0 – 3.2 | MuNRa | Accounts with roles, recording sessions, and an administration panel. |
| 4.0 – 4.8 | MuNRa | Reading the detector directly from the browser (Web Serial), security hardening, a modular codebase, translations, fast downsampled charts, shared profiles, and custom time ranges. |
| 5.x | MunHub · MunHub Lab | A full rewrite under a new name: bandwidth-efficient live data, a bridge for browsers without Web Serial, a standalone data terminal, session upload with duplicate detection, migration tools, organizations, and six chart types. Revived in production in 2026 on a new Firebase project. |
| 6.0 | **MuonHub** | A ground-up rebuild as a typed monorepo: a headless agent, Bring Your Own Detector, user-controlled calibration and comparison, and a free-tier-only Firebase architecture. **In progress.** |

---

## Documentation

| | |
|---|---|
| [Agent and contributor contract](AGENTS.md) | How work is done in this repository |
| [Product](docs/product/) | Vision, roadmap, backlog, public site plan |
| [Decisions](docs/decisions/) | Architecture decision records and the historical decision log |
| [Science](docs/science/) | Theoretical foundation, serial formats, research notes |
| [Operations](docs/operations/) | Environments, Firebase setup, remote access |
| [Design language](docs/design/DESIGN-LANGUAGE.md) | The "Observatory Dark" visual system |
| [Changelog](CHANGELOG.md) | Notable changes |

---

## Author and acknowledgments

Created and led by **Alexander Kholodov** (USFQ). The detector is used by **LEOPARD LAB, USFQ**.
Detector firmware: **MuNRa** (derived from CosmicWatch v3X).

## License

Code under the [MIT License](LICENSE); public data under **CC-BY 4.0**. Citation metadata and dataset
DOIs are planned for the launch milestone.

<div align="center">
<sub>Built in the Andes.</sub>
</div>
