# MunHub Lab v6.0 — Detailed architecture

> Depends on: [`00-MASTER-PLAN.md`](00-MASTER-PLAN.md) (decisions D1–D17).
> Mandatory reading for every implementation agent.

---

## 1. Architecture principles

1. **Provider-agnostic data:** the app never talks directly to Firebase/Supabase. Everything
   goes through `packages/data-provider`. Switching backends = swapping an implementation,
   not the app.
2. **Offline-first at the edge:** the detector never loses data. The local agent persists
   before synchronizing.
3. **Scientific integrity by contract:** the invariants (averages never sums, no event
   filtering) are validated with schemas (`zod`) in `packages/shared`, not by convention.
4. **Shared types, one source of truth:** models, schema, and constants live in
   `packages/shared` and are consumed by web, agent, api, and ai.
5. **Secure by default:** deny-by-default RLS/rules; secrets outside the repo; data
   redundancy as a requirement, not an option.
6. **Spec-Driven:** no code without a spec in `/specs` with acceptance criteria.
7. **Processing at the edge:** maximize transformation/aggregation/pre-computation on the
   detector PC (Tauri agent) — per-minute averages, features, validation — to **offload the
   server**. The cloud/server is reserved for ML and global processes (multi-detector
   correlation, network aggregates). This reduces server load and bandwidth.
8. **Maximum configurability (D23):** prefer the informative, configurable, and adjustable.
   Store **every metadata field possible**; expose advanced settings (calibration, thresholds,
   device token, etc.) **without obstructing the basic flow** — pattern: sensible defaults +
   optional override + "reset to defaults" button.

---

## 2. Component view

```
packages/shared          → TS types, zod schemas, constants, i18n keys, pure utilities
packages/physics         → pure scientific computations (barometric correction, flux,
                           spectra, normal ranges). No I/O dependencies. Testable.
packages/data-provider   → DataProvider interface + FirebaseProvider + SupabaseProvider
packages/ui              → design system (Tailwind + shadcn/ui) + chart components (Plotly)

apps/web (Next.js)       → public landing, dashboards (detector/account/institution/admin),
                           external-correlation pages. SSR for landing/SEO.
apps/agent (Tauri)       → cross-platform serial reading + local SQLite + sync queue

services/api             → (Phase B) backend/edge functions: ingest, aggregations, jobs
services/ai              → (design now) ML pipeline in Python (anomalies, forecasting…)

infra/                   → docker-compose (Supabase+TimescaleDB), IaC, deployment scripts
```

### Allowed dependencies
- `web`, `agent`, `api`, `ai` → may depend on `shared`, `data-provider`, `physics`.
- `web` → additionally `ui`.
- `physics` and `shared` → depend on **nothing** with I/O (pure, testable in isolation).
- `data-provider` → depends only on `shared`.

---

## 3. The agnostic data layer (keystone)

`packages/data-provider` exposes a single interface. The app consumes it without knowing the
backend. **This interface is also the foundation of the admin migration tool** (export from one
provider → import into another).

```ts
// packages/data-provider/src/types.ts  (sketch, not final)
export interface DataProvider {
  // --- Auth & tenancy ---
  getCurrentUser(): Promise<User | null>;
  // --- Stations (profile/site) ---
  listStations(filter?: StationFilter): Promise<Station[]>;
  getStation(id: string): Promise<Station>;
  upsertStation(s: Station): Promise<void>;
  // --- Detectors (physical device, under a station) ---
  listDetectors(stationId: string): Promise<Detector[]>;
  upsertDetector(d: Detector): Promise<void>;
  // --- Data (per detector) ---
  getMinuteRecords(detectorId: string, range: TimeRange): Promise<MinuteRecord[]>;
  subscribeRealtime(detectorId: string, cb: (r: RealtimeRecord) => void): Unsubscribe;
  getLatest(detectorId: string): Promise<MinuteRecord | null>;
  pushMinuteRecord(detectorId: string, rec: MinuteRecord): Promise<void>;   // agent/ingest
  pushRealtimeRecord(detectorId: string, rec: RealtimeRecord): Promise<void>;
  // --- Institutions / admin ---
  upsertInstitution(i: Institution): Promise<void>;
  exportAll(opts: ExportOptions): AsyncIterable<DataChunk>;   // migration (streaming)
  importAll(chunks: AsyncIterable<DataChunk>): Promise<ImportReport>;
}

export class FirebaseProvider implements DataProvider { /* Phase A */ }
export class SupabaseProvider implements DataProvider { /* Phase B */ }
```

> **Inherited v5.0 rule (do NOT break):** use incremental listeners
> (`child_added/changed/removed`), never `once('value')` over whole sessions — it causes a
> bandwidth regression. The `FirebaseProvider` must respect this.

### Migration between providers (admin, F5)
`exportAll()` (streaming, paginated) from the source provider → `importAll()` into the target,
with a **schema adapter** and a validation report (`zod`). Also supports **importing an external
DB from file** (mapped to the v6 schema via adapters in `packages/shared`).

---

## 4. Offline-first acquisition architecture (Tauri agent)

```
serial (USB) ─▶ parser (4 formats: CosmicWatch/JSON/KV/CSV)
            ─▶ immediate write to local SQLite (layer 1, edge source of truth)
            ─▶ sync queue: marks unconfirmed records
            ─▶ uploader: DataProvider.pushMinuteRecord/​pushRealtime with retries
                          • exponential backoff when there is no network
                          • idempotency by (detectorId, ts) → prevents duplicates
                          • on reconnect, uploads what is ahead of the cloud and reconciles
```

- **Idempotency:** natural key `(detectorId, ts_minute)`. Resending the same minute does not
  duplicate. Reconciliation compares local vs cloud timestamps and uploads only what is missing.
- **The parser and formats are ported from v5.0 `serial-reader.js`** (logic proven with real
  hardware), rewritten in Rust/TS inside the agent. Do NOT reinvent format detection; preserve
  the validated behavior.

### Standardized INGEST in the Agent; VISUALIZATION is always web (D31)
- **View/analyze:** always on the web (the Station tab reads from the DB). This does not change.
- **STANDARD path — Agent (our own app, built with Tauri):** one-click installation; runs in
  the background; **starts on PC boot, survives restarts**; local SQLite backup + offline sync +
  cross-platform + auto-update. It is the only way to guarantee **no data loss** (priority #1)
  on a 24/7 detector. **Requires no Python.** Login = **MunHub account** (the same one used on
  the web); **no second account or external service** — Tauri is only the toolkit our app is
  compiled with.
- **Optional DEMO mode — Browser (Web Serial):** an install-free shortcut (Chromium only) for
  quick tests, with a **clear notice**: *"in this mode data is saved only while connected and
  with the tab open; for continuous monitoring install the Agent."* It is not the main path.
- A serial port is **exclusive** (a single reader at a time): one path per detector.

---

## 5. Data redundancy — 3 layers (priority #1)

| Layer | What | Where | Frequency |
|------|-----|-------|-----------|
| 1 | Local backup | SQLite on each detector PC (agent) | Real time |
| 2 | Primary DB | Firebase munhub-1 (Phase A) → Supabase/Postgres (Phase B) | Real time |
| 3 | Cold backup | Cloudflare R2 (compressed dumps) | Scheduled job (daily/weekly) |

- The cold-backup job (F5) uses `DataProvider.exportAll()` → compressed file + checksum
  → uploads to R2 with rotating retention. Restorable via `importAll()`.
- **Future evolution:** active Postgres replica (primary+replica) once Red Clara servers are
  available (not in F1–F5).

---

## 6. Security and multi-tenancy

- **Auth:** Firebase Auth (Phase A) → Supabase Auth (Phase B), both behind the `DataProvider`.
- **Roles:** read from DB (`users/{uid}.role`: `admin | institution_admin | user | guest`),
  never hardcoded. The first admin is configured manually.
- **Hybrid tenancy:** `institution → users → detectors` + independent users
  (nullable institution_id). See `02-DATA-MODEL.md`.
- **Rules (deny-by-default):**
  - Public detector → readable by anyone.
  - Private detector → owner, shared users, its institution's admin, global admin.
  - A user reads/writes only their own account.
  - In Phase B this translates to **Postgres RLS** (row-level policies).
- **Secrets:** `private/` and `.env` outside the repo (`.gitignore`); `.env.example` documents
  variables without values. Service accounts injected via environment in production.

---

## 7. Phase A (Firebase) vs Phase B (Supabase) — what changes

| Aspect | Phase A (bridge) | Phase B (own server) |
|---------|-----------------|--------------------------|
| DB | Firebase Realtime DB (munhub-1) | Postgres + TimescaleDB |
| Auth | Firebase Auth | Supabase Auth |
| Realtime | Firebase listeners | Supabase Realtime / WS |
| Storage | Firebase Storage | Supabase Storage |
| Rules | `database.rules.json` | Postgres RLS |
| Hosting | **Firebase Hosting (Spark, free) + Next.js static export** | Red Clara server (Docker, full SSR) |
| What does NOT change | **the whole app**: it lives on top of `DataProvider`. Only the implementation + adapted schema change. |

> **Phase A hosting (D18) — billing-proof.** Next.js with `output: 'export'` (SSG at build →
> landing SEO; dynamic data via the Firebase client SDK). Served on Firebase Hosting
> **Spark plan (free)**, which **blocks on quota overrun, never bills**. **Avoid App
> Hosting/Blaze** unless genuinely needed; if Blaze is enabled, configure **budget alerts +
> quotas**. A custom domain connects to Firebase Hosting for free whenever decided. Phase B
> (Red Clara) enables request-time SSR; the app does not change (it lives on the Next router).

---

## 8. CI/CD and quality

- **Monorepo:** pnpm workspaces + Turborepo (build/test/lint cached per package).
- **GitHub Actions:** lint + typecheck + tests on every PR; deploy on merge to `main`.
- **Quality:** strict TypeScript, ESLint + Prettier, tests (Vitest) — at minimum in
  `packages/physics` (scientific computations) and `packages/data-provider` (contracts).
- **Code language = English (D28):** identifiers, comments, commits, DB schema, API names,
  and i18n keys in English (source locale). Consider a lint/CI rule that flags non-English
  text in code. es/pt-BR are UI translations only.
- **Scientific tests:** `packages/physics` with verifiable reference cases (e.g. barometric
  correction against known values from the theoretical report).

---

## 9. Key ADRs (short register)

> Format: context → decision → consequence. The major ones are already in the D1–D17 table of
> the master plan; recorded here are the ones that need more nuance. Each new ADR goes into a
> file at `docs/technical/adr/NNN-title.md` when implemented.

- **ADR-001 Agnostic data layer** → enables Firebase↔Supabase and IS the migration tool.
  Consequence: every feature must be written against the interface, never against the SDK.
- **ADR-002 Tauri agent as the trusted edge** → solves cross-platform serial + offline +
  local backup. Consequence: the serial parser is shared, critical logic; it is ported, not
  blindly rewritten.
- **ADR-003 Plotly for scientific charts** → log scale, error bars, export. Consequence:
  components wrapped in `packages/ui` for consistent styling and i18n.
- **ADR-004 Mandatory metadata with backward compatibility** → old data is imported without
  metadata and completion is requested without blocking. See `02-DATA-MODEL.md`.

---

## 10. What is PRESERVED from v5.0 (do not reinvent)

- Detection of the 4 serial formats (CosmicWatch/JSON/KV/CSV) — proven with real hardware.
- The "averages never sums" invariant + no event filtering.
- Incremental listeners (not `once('value')`).
- Gap detection (≥2 min breaks the line) and realtime auto-expiry (>8 min).
- Per-minute field schema: `ec, cc, sm, sx, sn, tp, pr, d`.
