# MunHub Lab v6.0 — Reconstruction Master Plan

> **Status:** Layer 1 (foundational decisions) CLOSED. Living document.
> **Purpose:** High-level source of truth for the full reconstruction of MunHub.
> Oriented toward agentic development (Spec-Driven Development). Agents read this
> document + `/specs` before acting and do NOT deviate from what is agreed here.
> **Golden rule (D32):** agents commit and push **feature branches** and open **PRs**
> (Conventional Commits, English); **green CI mandatory**; **only Alexander merges to `main`**
> (final human gate). No agent touches `main` or `private/`. See `18-AGENT-FLEET-ORCHESTRATION.md`.

---

## 0. Context and motivation

MunHub Lab is a web platform for acquisition, storage, visualization, and
real-time analysis of data from cosmic-ray detectors (CosmicWatch / muon detectors).
Born as Alexander Kholodov's contribution to Dennis Cazar's research at the
LEOPARD laboratory (USFQ), within the EL-BONGO / Erasmus+ CBHE project. Aimed at becoming
an **international multi-university network in Latin America**.

**v5.0 problems motivating the reconstruction:**
- Non-professional architecture: ~9,700 lines of Vanilla JS in 12 IIFEs, no build, no
  types, no tests, no layer separation. Monolithic logic (serial 1641 lines,
  auth 1563, charts 1098).
- Firebase Realtime DB **saturated and blocked** (1 GB limit on the free plan).
- No public landing, no explicit scientific basis, poor visualization, no comparison
  with external events, no real offline mode, insufficient metadata for meaningful statistics.
- Serial reading dependent on manual Python scripts in Firefox/Safari.

**v6.0 vision:** professional platform, modular, scalable to multiple countries, with solid
scientific foundation, data redundancy as priority #1, deployable both in the cloud
(Firebase bridge) and on own server (Red Clara, Supabase self-hosted), prepared for
an own AI, and built with an auditable agentic workflow.

---

## 1. Foundational decisions (CLOSED)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | **Frontend** | React + Next.js + TypeScript | SSR for landing/SEO + map, larger ecosystem of charts/scientific libraries, larger talent base for multi-university collaboration. |
| D2 | **Backend/DB target** | Supabase self-hosted + TimescaleDB | Self-hostable Postgres on Red Clara, with auth/RLS, realtime and storage. No lock-in. TimescaleDB for scientific time series. |
| D3 | **Backend/DB bridge** | Firebase `munhub-1` (fresh project) | Red Clara has not yet provisioned resources. Deploy NOW on new Firebase and migrate later. Service account in `private/` (NEVER commit). |
| D4 | **Data layer** | Agnostic `DataProvider` (FirebaseProvider \| SupabaseProvider) | Enables Phase A (Firebase) → Phase B (Supabase) without rewriting the app. **This layer IS the admin migration/import tool.** |
| D5 | **Detector reading + offline** | Installable local agent (Tauri) | Reads serial on any OS without manual Python + local SQLite backup + offline sync queue. Resolves serial + redundancy + offline. |
| D6 | **Code structure** | Monorepo (pnpm + Turborepo) | Shared types/schema, single source of truth, ideal for agentic coordination. |
| D7 | **Target hardware** | Mostly 1 SiPM (individual) | Physical constraint: muon vs electron cannot be cleanly separated with a thin scintillator. Science is based on rate, amplitude spectrum and coincidence where available. |
| D8 | **Multi-tenant** | Hybrid: Institution → Users → Detectors, + independent users | Flexibility for universities and for standalone researchers/students. |
| D9 | **Particle classification** | By phases: honest (physics) → ML | Phase 1 rigorous (amplitude + coincidence + declared uncertainty). Phase 2 ML when data is available. Do not overpromise. |
| D10 | **Data redundancy (priority #1)** | 3 layers: local SQLite + primary cloud DB + automatic cold backups | Local on each detector PC + primary cloud + periodic dumps to cheap cold storage. |
| D11 | **External APIs** | NMDB + NOAA SWPC + NASA DONKI + Dst/Kp | Scientific correlation with space weather. NMDB is the most comparable (neutron monitors ↔ muons, Forbush decreases). |
| D12 | **AI** | Classical ML first, designed to scale to DL | Anomalies, barometric correction, forecasting, Forbush, insights, "normal values", self-heal/retraining. DL if GPU is available later. Design only now. |
| D13 | **Backlog/specs** | Specs in `/specs` (Markdown, SDD) + GitHub Issues/Projects | Specs versioned alongside code (agents read them); Issues for tracking/assignment. |
| D14 | **License** | MIT | Permissive and simple; maximum adoption by universities/enthusiasts; open science. |
| D15 | **Frontend toolkit** | Tailwind + shadcn/ui + **Plotly** + **MapLibre** | Plotly for scientific charts (log, error bars, export); shadcn/ui accessible; MapLibre free vector maps (OSM). |
| D16 | **Cold storage (layer 3)** | Cloudflare R2 | S3-compatible, 10 GB free, no egress; automatic dumps; migratable to Red Clara. |
| D17 | **Languages (i18n)** | ES + EN + PT-BR | Covers almost all of LatAm + international science + Brazil. |
| D18 | **Phase A hosting** | Firebase Hosting (Spark/free) + Next.js **static export** | Billing-proof (Spark blocks, does not charge); modern (React/Tailwind/shadcn); data via client SDK; own domain free when decided. App Hosting/Blaze avoided due to billing risk. Phase B: full SSR on Red Clara. |
| D19 | **Data license** | CC-BY 4.0 (public data) | Open science with mandatory attribution. Distinct from MIT (code). |
| D20 | **Landing map** | Aggregation by **city** (scaled/numbered bubbles) | Demonstrative purpose (reach/coverage), not precise location. Visually attractive even with few detectors. |
| D21 | **Entity model** | Two levels: **Station** (profile/site) → **Detector(s)** (physical device) | Resolves the name collision; data belongs to detectors; supports device token and future coincidence. |
| D22 | **Visibility** | **Mandatory** choice when creating a station, **no default**; optional embargo | User decides explicitly; any option is respected. |
| D23 | **Configurability** | Maximize the informative / configurable / adjustable | Save all possible metadata; advanced settings available without cluttering the basic flow. Guiding principle. |
| D24 | **Visibility and permissions** | 3 visibilities (Public/Institution/Private) + per-station permissions (owner/editor/viewer) | `editor` can write data from another machine; resolves shared editing. See `11`. |
| D25 | **Identity and sharing** | Account with unique email + username + name; share by email/username showing name+institution | Reliable and privacy-respecting selection. See `11`. |
| D26 | **Monetization** | Core always free; only hooks (entitlements+metering), **no billing in v6** | Open-science mission; sustainability via grants/donations. See `13`. |
| D27 | **Station networks** | Group stations into networks/arrays for joint analysis | Simultaneous events = high confidence; geographic studies. See `14`. |
| D28 | **Code language** | **English** throughout the code (identifiers, comments, commits, schema, API, i18n keys) | International standard; English is the UI *source locale*; es/pt-BR are translations. Avoids patchy translation. |
| D29 | **Document language** | Hybrid: **new specs, scientific report and user/technical docs in English**; internal `planning/` may remain in Spanish until repo is opened | Internationalization where it matters (code-facing and public), without retranslating everything now. Pending tasks: translate `THEORETICAL-FOUNDATION.md` and `specs/0001` to English. |
| D30 | **Checkpoint per milestone** | Milestone = **substantial deliverable = 1 Alexander commit** (not per file, not infinitely without saving). Agent delivers + Stage Report and **stops**; Alexander reviews, commits, authorizes continuation. Size to one session; working tree = safety net | Token control + ability to return to successful stages. Issues ≠ checkpoints (those are commits). See `03 §4bis`. |
| D31 | **Data ingestion** | **Installable agent (ours, built with Tauri) = the single STANDARD path**; Web Serial only as **optional demo with notice** of "data not saved offline". Visualization always web. Login = MunHub account (no second account, no external service) | Fulfills priority #1: no data loss on a 24/7 detector (offline/restart). |
| D32 | **Commits/push (revised)** | **Feature-branch + PR + CI, `main` protected.** Agents commit/push branches and open PRs (Conventional Commits, English); **only Alexander merges**. Fleet token without bypass. Replaces the previous rule "agents never commit" | Control moves from "type each commit" (fragile) to "automated gates + protected `main` + single human merger": more efficient and more secure. See `18 §8`. |
| D33 | **Multi-provider fleet** | Claude Opus orchestrates and integrates; routing by matrix (Sonnet/Haiku/Gemini/Cursor/Copilot); `AGENTS.md` = universal brief with shims; spec = unit; worktree+package = lane; contracts-first; waves of disjoint lanes | Maximize throughput and leverage subscriptions (Gemini/Cursor/Copilot) saving Claude quota. See `18 §2–§3`. |
| D34 | **Defense-in-depth quality** | Automated gates per PR (CI build/test/lint/typecheck + coverage + gitleaks + Bugbot + Copilot review) + DoD per spec + phase gate + completeness auditor + MVP E2E | Use the fleet to verify quality at each step/stage and final completeness. See `18 §6`. |
| D35 | **Cross-review** | The author is never the sole reviewer; a **different provider** reviews; Claude personas (Physicist/Security/Architect) on relevant PRs | Each model has different blind spots; the *ensemble* catches more than self-review. See `18 §6 Layer B/C`. |
| D36 | **Design language** | **"Observatory Dark"**: scientific instrument (not generic SaaS), dark by default (+ light), data as hero, 1 cyan accent + amber, Geist + tabular mono, body ≥16px, 8-pt grid, **anti-AI-face doctrine**. Generation with v0 (Vercel), Cursor integration, Claude art direction | Outstanding design comes from a defined system + human taste, not from "make it pretty". Avoids AI *tells* (small text, etc.). See `docs/design/DESIGN-LANGUAGE.md`. |
| D37 | **Firebase-complete by default** | The product runs fully and indefinitely on free Firebase; Red Clara/Supabase = optional upgrade, never a requirement. All Firebase services (Auth, Storage, FCM, Functions) behind our interfaces | Autonomy: we do not depend on Red Clara provisioning. Spark blocks, does not charge. See `19`. |
| D38 | **Integration philosophy** | Docs-as-code + docs site; **no Notion**; n8n/Slack/Discord deferred to ops/community; invest in Storybook + monitoring (Sentry) + CodeQL + Playwright + DOI | A calling card impresses through coherence, not *kitchen-sink*. Each integration must earn its maintenance cost. See `19`. |
| D39 | **Auth (Phase A)** | **Firebase Auth** + roles via **custom claims** (admin/user/guest), behind an `AuthProvider` | Replaces v5 hand-crafted auth; roles without extra reads; Supabase Auth maps 1:1 in Phase B. See `19`. |
| D40 | **Clean architecture + SOLID** | **Clean/Hexagonal**: dependencies inward; `shared`+`physics` = pure domain; `data-provider` = adapters; apps/services = details. **SOLID** as standard (DIP = keystone). Design patterns applied with judgment | Form + discipline that provide portability and maintainability; "future-proof" with **YAGNI/KISS** as counterweight. See `docs/technical/ENGINEERING-STANDARDS.md`. |
| D41 | **Pragmatic TDD** | Test-first where correctness **is** the product (`physics`, `shared` schemas); test-after / E2E for UI and integration | Guarantees science without dogma. Coverage = hard gate from S06. |
| D42 | **Documentation standards** | **C4** (Context+Container now), **ADRs**, **Conventional Commits + SemVer**, **Keep a Changelog**; **documentation is part of "done"** (every PR updates docs + `CHANGELOG`) | Project memory + calling-card quality; nothing is built without leaving a readable trace. |
| D43 | **MoE — spirit only** | Literal Mixture-of-Experts (DL) does **not** apply to our classical ML; its idea (routing to experts) already lives in the **agent fleet** and the ML **champion-challenger ensemble** | Adopt the useful concept without unnecessary machinery (no GPU, no need). See `ENGINEERING-STANDARDS.md`. |
| D44 | **Commit/PR style** | Title and description state **what the change delivers** (product/engineering), for a human reader of the history; **prohibited**: narrating process, options considered, or framing as a response to correction ("as requested", "now without X"); no apologies. Deliberation goes in chat, not in Git | The public history is a calling card; it must read professionally and timelessly, not like an AI↔human dialogue. See `CONTRIBUTING.md`. |
| D45 | **Versioning** | SemVer; **`6.0.0` = MunHub Lab 6 launch**. Pre-launch `6.0.0-alpha/beta/rc.N`; post-launch `6.0.x` (fixes), `6.x.0` (compatible features), `7.0.0` (public contract break) | Clear and predictable standard for the entire team/fleet. See `CONTRIBUTING.md`. |
| D46 | **Command and Adjutant role** | **CEO** (Alexander) → **Adjutant/Manager** (the most advanced model he talks to directly: orchestrates the fleet, full-picture perspective, proactive, reports and consults) → **supervisors** by area → **workers**. The Adjutant distributes load by each agent/provider's strength and reports | Permanent role (beyond a single chat) that turns vision into excellent execution and preserves culture. See `planning/20` + memory `adjutant-role`. |

---

## 2. Target architecture (high level)

```
                         ┌─────────────────────────────────────────┐
   [Detector USB] ──────▶│  LOCAL AGENT (Tauri, cross-platform)     │
                         │  • Reads serial (all OS)                 │
                         │  • Local SQLite backup (layer 1)         │
                         │  • Offline sync queue → retries          │
                         └───────────────────┬─────────────────────┘
                                             │ (HTTPS/WSS, authenticated)
                                             ▼
                         ┌─────────────────────────────────────────┐
                         │     AGNOSTIC DATA LAYER (D4)             │
                         │  DataProvider ──┬── FirebaseProvider     │  Phase A
                         │                 └── SupabaseProvider     │  Phase B
                         └───────────────────┬─────────────────────┘
                                             ▼
              ┌──────────────────────────────────────────────────────┐
              │  Primary DB (layer 2)    +   Cold backups (layer 3)   │
              │  Firebase munhub-1  →  Supabase/Postgres+TimescaleDB  │
              └───────────────────┬──────────────────────────────────┘
                                  ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │                    WEB (Next.js, React, TS)                       │
   │  • Public landing (detector map, live demo, education)            │
   │  • Detector dashboard (charts, stats, spectra, classification)    │
   │  • Account / institution dashboard                                │
   │  • System administrator dashboard (DB, migration, users)          │
   │  • Correlation pages with external APIs (space weather)           │
   └──────────────────────────────────────────────────────────────────┘
                                  ▲
   ┌──────────────────────────────┴───────────────────────────────────┐
   │   SERVICES (Phase B, Red Clara server)                            │
   │  • api/  backend services / edge functions                        │
   │  • ai/   ML pipeline (Python): anomalies, forecasting, insights   │
   │  • ingestion of external APIs (NMDB, NOAA SWPC, DONKI, Dst/Kp)    │
   └──────────────────────────────────────────────────────────────────┘
```

### Monorepo layout (proposed)

```
munhub/
├─ apps/
│  ├─ web/              # Next.js: landing + dashboards + admin
│  └─ agent/            # Tauri: serial + local SQLite + offline sync
├─ services/
│  ├─ api/              # (Phase B) backend / edge functions
│  └─ ai/              # (design now) ML pipeline in Python
├─ packages/
│  ├─ shared/           # types, schema, constants, validation (zod)
│  ├─ data-provider/    # agnostic layer D4 (Firebase | Supabase)
│  ├─ ui/               # design system / reusable components
│  └─ physics/          # scientific calculations (barometric correction, flux, spectra)
├─ specs/               # Spec-Driven Development: one folder per feature
├─ docs/
│  ├─ user/             # user manual + FAQ
│  ├─ technical/        # architecture, deployment, ADRs
│  ├─ research/         # scientific foundation (base theoretical report)
│  └─ paper/            # article draft (low priority)
├─ infra/               # docker, IaC, deployment configs (Red Clara)
└─ .github/             # CI/CD, issue/PR templates
```

---

## 3. Data model (guidelines; detail in dedicated spec)

**Entities (two-level model, D21):** `institutions`, `users`, `stations` (profile/site),
`detectors` (physical device, under a station), `sessions`, `minute_records` (time
series, **per detector**), `realtime_records`, `external_events` (APIs), `ai_insights`.
Detail in `02-DATA-MODEL.md`.

**MANDATORY metadata:**
- **Station (site):** name, **lat/lon/altitude (manual)**, city, country, placement,
  `type` (single/coincidence), timezone, **visibility (no default, D22)**, institution (if applicable).
- **Detector (device):** model, firmware, `hw_version` (defines τ_DT), # SiPM, `device_token`
  (auto-generated), `calibration` (defaults per hw + optional advanced editing).

**Maximum backward compatibility:** v5 stations/users without metadata are imported as-is
(+ 1 detector created with defaults); **non-intrusive notification** to complete them. Mandatory
only for new registrations.

**Scientific invariant (inherited, NOT negotiable):** all per-minute values are
**averages, never sums** (`ec`, `cc`, `sm/sx/sn`, `tp`, `pr`, `dt`). No event filtering.

---

## 4. Phased roadmap

| Phase | Name | Outcome | Backend |
|-------|------|---------|---------|
| **F0** | Planning (CURRENT) | Specs, physics research, architecture, ADRs, backlog | — |
| **F1** | Foundations | Monorepo + `data-provider` + `shared` schema + auth/multi-tenant + v5→v6 data migration | Firebase munhub-1 |
| **F2** | Acquisition and visualization core | Tauri agent (serial+SQLite+sync) + reconstructed dashboards (many more charts, spectra, stats, comparison) | Firebase |
| **F3** | Public landing | Map of active detectors, live public-detector demo, educational/info sections | Firebase |
| **F4** | External correlation | NMDB/NOAA/DONKI/Dst-Kp ingestion + correlation views with terrestrial/solar events | Firebase |
| **F5** | Advanced admin | Dedicated page: DB management, **provider migration**, external DB import/conversion, user/role management, cold backups | Firebase |
| **F6** | Migration to own server | Self-hosted Supabase + TimescaleDB deployment on Red Clara; DataProvider switch | → Supabase |
| **F7** | AI | ML pipeline deployment (anomalies, forecasting, insights, self-heal) | Supabase + ai/ |
| **F8** | Documentation + paper | User manual/FAQ, complete technical docs, scientific article base | — |

> Backward compatibility and **data security/redundancy** are cross-cutting across
> all phases, not a separate phase.

---

## 5. Agent roster and Spec-Driven flow (summary; detail in Layer 4)

- 🔬 **Research physicist** — theoretical foundation, what is measurable with 1 SiPM, statistical validity.
- 🏗️ **Architect** — system design, schema, ADRs, coherence review.
- 💻 **Frontend / Backend / Local-agent Dev** — implementation per specs.
- 🗄️ **Data/DB engineer** — migration, redundancy, time-series.
- 🤖 **ML engineer** — own model design + resource plan.
- 🔐 **Security** — auth, RLS, data integrity and redundancy.
- 📖 **Documentation** — manuals + paper.
- 🧭 **Orchestrator** — keeps agents in their lane (specs as contract).

**SDD flow:** Idea → Spec (`/specs/NNN-feature/`) with requirements + acceptance criteria
→ human review → atomic tasks → implementation → verification against criteria.

---

## 6. Planning deliverables (status)

- [x] `00-MASTER-PLAN.md` (this document)
- [x] `research/PHYSICS-DEEP-RESEARCH-PROMPT.md` → executed; results in
  `research/DEEP-RESEARCH-RESULTS.md` (temporary, discardable after distilling)
- [x] `01-ARCHITECTURE.md` — detailed architecture + key ADRs
- [x] `02-DATA-MODEL.md` — complete schema + metadata + v5→v6 migration
- [x] `03-AGENTS-AND-SDD.md` — roster, agent base prompts, spec templates
- [x] `04-BACKLOG.md` — epics → specs → tasks with acceptance criteria
- [x] `05-REDUNDANCY-AND-SECURITY.md` — 3-layer design + auth/RLS
- [x] `06-AI-DESIGN.md` — own model design (planning only)
- [x] `07-EXTERNAL-APIS.md` — NMDB/NOAA/DONKI/Dst-Kp contracts
- [x] `RED-CLARA-RESOURCE-TIERS.md` — 3 resource tiers to request (after fixing architecture+AI)
- [x] `docs/research/THEORETICAL-FOUNDATION.md` — final theoretical report (official scientific basis)
- [x] `08-RISKS-AND-ASSUMPTIONS.md` — risks, assumptions, mitigations
- [x] `09-DETECTOR-LIFECYCLE.md` — registration, auth, calibration by device, maintenance
- [x] `10-OPERATIONS-AND-GOVERNANCE.md` — observability/ops + data governance
- [x] `/AGENTS.md` (root) — **agent entry point** + MVP vertical-slice definition
- [x] `specs/0001-monorepo-scaffold/spec.md` — example spec (SDD pattern)
- [x] `11-PERMISSIONS-SHARING-ROLES.md` — visibility, roles, sharing
- [x] `12-SUPPORT-NOTIFICATIONS-EMAIL.md` — tickets, notification center, email
- [x] `13-MONETIZATION-AND-ENTITLEMENTS.md` — posture + hooks (no billing in v6)
- [x] `14-STATION-NETWORKS.md` — station networks for joint analysis
- [x] `15-ADMIN-CONSOLE.md` — full admin console (audit log, announcements, onboarding…)
- [x] `16-DEPLOYMENT-AND-CUTOVER.md` — actual deployment state + safe cutover (GATED)
- [x] `17-ACADEMIC-POSITIONING-AND-GOVERNANCE.md` — ORCID, attribution, DOI, open science, legal
- [x] `docs/technical/SERIAL-FORMATS.md` · `docs/technical/adr/002-local-agent-framework.md`

---

## 7. Still-PENDING decisions (next rounds with the human)

**Resolved:** essential polished landing (F3); Phase A hosting (D18); data license (D19);
city-level map (D20); Station+Detector model (D21); mandatory visibility (D22);
configurability (D23); auth (user+token, reinforcement in Phase B); calibration (defaults +
optional advanced); auto-update (automatic in background); embargo (optional).

**Pending (non-blocking):**
1. **Definitive domain** (decide with advisor; prototype on `munhub-lab.web.app`, own
   domain connectable for free when decided).
2. **Fine branding** (logo, palette) — adjusted when building the landing (F3).

---

## 8. Operational security notes

- **Keys in `private/` (both in `.gitignore`, NEVER commit; in prod via env/secret):**
  - `munra-1-firebase-adminsdk-*.json` → **old v5** project (1 GB DB saturated/blocked) =
    **source** of the v5→v6 migration.
  - `munhub-1-firebase-adminsdk-*.json` → **new v6** project = **destination** (Phase A).
- All sensitive config (Firebase keys, future Supabase) lives in `.env` (not versioned)
  and is documented in `.env.example` (without real values).
