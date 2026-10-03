# v6 reset — session record (2026-10-02)

> **What this is:** the durable record of the 2026-10-02 planning session between the maintainer
> and the Adjutant (Claude Code). It captures the maintainer's decisions, the product requirements
> stated in the session, the verified audit findings on the v6 code, the research results, and the
> topics still open. **No implementation work started**; milestone H0 waits for the maintainer.
>
> **Rule for every future session:** agent memory features must not be used for this project.
> Anything an agent needs to remember lives in this repository. The maintainer reads only the chat:
> nothing is built before it has been explained there in detail and approved.
>
> Status labels used below: **[verified]** = checked first-hand by reading code or running it;
> **[reported]** = from a reviewer/research subagent, not yet re-checked first-hand.

---

## 1. Decisions confirmed by the maintainer

| # | Decision |
|---|---|
| 1 | **New Firebase project `muonhub` hosts all of v6** (RTDB `muonhub-default-rtdb`, us-central1; Hosting `muonhub.web.app`). |
| 2 | **v5 stays where it is** — project `munhub-1`, site `munhub-lab.web.app`, deployed from the `v5-production` branch — and **is not modified any more**. A real detector is writing to it right now. |
| 3 | **Firebase free tier (Spark) only, indefinitely.** No Red Clara in the foreseeable future, no Cloudflare, no paid services. Consumption must be optimised to stay inside the free quotas. |
| 4 | Use **RTDB + Firestore** and the other free Firebase products (App Check, FCM, Remote Config, Analytics, …). **Firestore location: `nam5`** (confirmed; irreversible). The maintainer prefers to configure services through the web console where possible (to be confirmed, see §8). |
| 5 | **Rename the product to "MuonHub" everywhere.** The README keeps the version-history table (v1–v4 *MuNRa*, v5 *MunHub / MunHub Lab*, v6 *MuonHub*) with improved descriptions. |
| 6 | **Remove `public/` (the v5 copy) from `main`** — v5 lives in its own branch. |
| 7 | **Branches:** keep only `main`, `v5-production`, and the active work branch. `spec/0078`–`spec/0082` are archived as tags after their ideas are rescued into the new specs. The `preserved/status-pill-fix` lessons are rescued for v6 (§4.6); v5 itself is not patched. |
| 8 | **Versioning:** `6.0.0-alpha.<milestone>.<iteration>.<fix>` → `6.0.0-beta.N` → `6.0.0-rc.N` → **`6.0.0`**, then normal SemVer. Valid SemVer; sorts correctly (the desktop/agent updater relies on that). |
| 9 | **Charts:** uPlot as the primary library; Plotly only lazy-loaded for spectrum/fit views. |
| 10 | **Rebuild rather than patch** (maintainer's leaning; every part must be justified in detail). |
| 11 | **No other AI providers for now.** Gemini/Cursor/Copilot configuration is removed after rescuing its lessons; AFLEK is restructured into the repo's own process docs, not blindly deleted. |
| 12 | **Parallel subagents are welcome** (explicitly endorsed). The old fleet note "don't run several agents at once on the laptop" is withdrawn. |
| 13 | **PR policy:** about 5–6 large PRs for the whole of v6. A PR opens only when its milestone is fully planned, tested (unit/integration), validated in real practice with real hardware, and corrected along the way. Each PR contains many commits carrying the minor versions of §1.8. |
| 14 | **AGENTS.md data-integrity guardrail is rewritten** with the maintainer's formulation (§2). |
| 15 | The agent as a **headless daemon** (instead of Tauri) is liked but **not yet decided** — the maintainer wants it argued against Tauri (§8). |

## 2. Data principles (maintainer's formulation)

- Filtering, calibrating, discriminating, and classifying are **allowed and important**.
- What is forbidden is **overwriting data and storing it in an altered form after filtering** as if
  it were pure. Any processing is applied **on top of stored data**.
- Storing a filtered/altered dataset is possible only as an **explicit, special setting**: the user
  chooses it knowingly and defines the calibration they need; the result is labelled as derived.
- **One device's data can feed several analysis views** (e.g. one pure, one filtered) so they can be
  compared.
- **Realtime** (individual events) is ephemeral in the cloud and is not stored; the stored cloud
  data is the per-minute record. **Uploading the complete raw stream to the cloud** must exist as an
  option, **gated by admin authorisation** (it consumes a lot of space). The agent always keeps raw
  data locally.
- **Idea — Bring Your Own DataBase (BYODB):** a user connects their own storage accounts to keep raw
  data. Start as a PoC; later possibly on request or as a paid feature (note: D26 says no billing in
  v6 — this needs a future decision). Motivation: otherwise scientific raw data is lost.

Proposed architecture (presented in session, accepted in principle): layer 0 raw (immutable) →
layer 1 canonical (deterministic, reproducible, versioned parser) → layer 2 derived (versioned
recipe; computed on read, or materialised only on explicit request with provenance and a visible
"derived" label). Event-level recipes run in the agent, where the raw data lives, and upload labelled
derived series.

## 3. Product requirements stated in the session

1. **Public live demo is mandatory:** live data of stations marked **public** must be viewable by
   anonymous visitors on the landing page (it may be limited in some way). The design must still
   respect the RTDB limit of 100 simultaneous connections. *(The Adjutant's earlier proposal "live
   only for signed-in users" contradicted this requirement and is withdrawn.)*
2. **Location:** exact coordinates are stored. What is abstracted is the **public display**, at the
   owner's choice (exact / approximate / city / country / hidden), enforced by security rules — not
   only by the UI.
3. **Security:** close every hole; deny by default; negative tests with real client identities;
   no admin keys on detector machines.
4. **Calibration:** fully user-controllable and versioned, for any detector type; automatic routines
   only propose. Calibration can be managed from MuonHub.
5. **Bring Your Own Detector:** users configure their own detector types on the platform and share
   them; official approval and labels (needs review, has errors, …) with GitHub-like feedback to the
   author; a configuration terminal that auto-detects columns/headers, then a human maps them; LLM
   assistance later, after PoCs.
6. **Detector geometry and assemblies (strongly endorsed):** active area, thickness, material,
   orientation; stacked assemblies; per-area normalisation; coincidence acceptance; fair comparison of
   different hardware (small CosmicWatch cells vs the older educational detector's larger paddles).
   2D schematic first, 3D later if it proves useful.
7. **Comparison between detectors and between views, including stacked coincidences** (3–4
   CosmicWatch units are coming) — **a v6 priority**, deterministic and visual before any ML/LLM,
   fully configurable.
8. **Synthetic data generator** to test coincidence and comparison tooling (tiered: TypeScript
   analytic generator → EcoMug/CRY → PUMAS/Geant4 offline).
9. **Open data** from detectors worldwide as references; simulate when none exists.
10. **Offline collection (e.g. Raspberry Pi)** with precise real timestamps, inserted later.
11. **Seismic sensor:** connect it and test for correlation (exploratory, scientifically honest).
12. **Muograph (~20 channels):** later in v6; explore feasibility first; design the multichannel
    data model now.
13. **Port sniffing / raw tee** and format discovery from captured output. The models of the two new
    detectors are unknown and must be determined from their data output.
14. **Terminology must be redesigned:** clearly separate the physical device from the space where its
    data lives in MuonHub; retire v5 vocabulary ("profile"). "Device profile" was rejected.

## 4. Audit findings on the current v6 code

All quality gates pass (build, typecheck, lint, 145 tests) **[verified by running]**, yet the
defects below exist because the tests use the rules-bypassing admin target, run web code in Node,
and use tiny fixtures.

### 4.1 Data layer and rules
- **Editing a station erases its science history** — `upsertStation` uses `set()` on the whole node
  that nests detectors/minutes/sessions **[verified]**.
- **Stations with detectors cannot be read** — `StationSchema` is `.strict()` and rejects the nested
  `detectors` key; such stations vanish from lists **[verified]**.
- **Export/backup loses data** — paging uses `limitToLast(500)` + `startAt(lastKey)`; only the newest
  ~500 minutes per detector are exported **[verified]**.
- **Station listing is denied for every client** — no `.read` at `/stations`; RTDB rules are not
  filters **[verified]**.
- **Realtime pruning downloads the full 5,000-record window for every new event once the cap is
  reached** — at the observed ~2.4 events/s this is tens of GB per day against a 10 GB/month quota
  **[verified]**; the 8-minute time retention is not implemented **[reported]**.
- Editors can take over or delete a station; users can write `role: "admin"` to their own profile;
  no `.validate` rules; `detector_index` can be hijacked; storage rules open to any signed-in user;
  invalid records silently dropped on read; same-millisecond realtime events overwrite each other
  **[reported]**.

### 4.2 Web
- **Firebase config never reaches the browser** — dynamic `process.env[name]` is not inlined by Next
  **[verified by running a sentinel build]**.
- **`/stations/<id>` deep links fail on static hosting** **[reported; mechanism verified in code]**.
- **Detector form crashes** — detached `crypto.randomUUID` call (`Illegal invocation`) **[verified]**.
- Exact coordinates and full station records are downloaded by anonymous visitors **[reported]**;
  "Landau spectrum" built from per-minute min/avg/max **[reported]**; login loses `?next=` and lands
  on a sample page with fake data **[reported]**; Plotly colours from CSS variables **[reported,
  unverified]**.

### 4.3 Agent and physics
- **Noise auto-calibration classifies ~all real events as noise** and drops them at the source
  **[verified by running, subagent]** — a violation of §2.
- **CosmicWatch dead time is cumulative but parsed as an instantaneous percentage** **[verified]**.
- **β minimum of 168 points** (hours of a week, not minutes) **[verified]**; per-minute ≥3σ anomaly
  flags contradict the foundation's hour-scale persistence requirement **[reported]**.
- **The minute aggregator throws (discarding the whole minute) when pressure, temperature, or dead
  time is missing** **[verified]**. Irrelevant for the current CosmicWatch (it reports pressure);
  blocking for any detector without a barometer. *(Correction: an earlier session statement that
  "0 hPa is stored" was wrong.)*
- Rust serial reader stops silently on USB disconnect; concatenated records lose events; event
  counting semantics differ across formats; gaps become zero-count summaries; `Math.max(...)` crash
  at high event counts; manual calibration overwritten hourly; offline queue swallows errors
  **[reported]**.
- The agent has no SQLite, no UI, no wiring end to end, and no packaging **[verified]**.

### 4.4 Tooling
- `packageManager: pnpm@11.5.2` (needs Node ≥ 22.13) vs `engines.node >=20`; `clean` leaves
  `tsbuildinfo` so a clean build emits nothing; Turbo does not cache `apps/web/out`; TypeScript and
  vitest unpinned in packages; weak ESLint (its "English-only" rule does not do that); stub packages
  whose gates cannot fail **[reported, partly verified]**.
- Dependencies one major behind: Next 16, React 19, zod 4, ESLint 10, vitest 5, maplibre 6
  (TypeScript 7 to be evaluated) **[reported]**.

### 4.5 Repository hygiene
- Root `firebase.json` / `database.rules.json` on `main` are v5 files while `.firebaserc` defaults
  to `munhub-1` — a bare `firebase deploy` could overwrite production rules **[verified]**.
- AFLEK tooling is PowerShell; `pwsh` is not installed on the development machine, so the
  SessionStart hook and all `.ps1` tools cannot run here **[verified]**.
- `docs/STATUS.md`, spec status lines, `planning/04-BACKLOG.md` (Spanish, numbering diverged), and
  `planning/16` are stale **[verified]**.

### 4.6 Lessons rescued
- **From `preserved/status-pill-fix`:** separate "database connection" (`.info/connected`) from "data
  freshness"; recompute status on a timer (otherwise it freezes); "no data" and "stale" are explicit
  states; after a reboot the uploader's session may not be restored and writes are rejected silently
  — the v6 agent must persist its session, detect rejected writes, and surface them.
- **From the previous multi-provider fleet:** cross-provider review found a real physics bug (keep
  "author ≠ reviewer", now with Claude reviewer subagents); split big work into small batches; verify
  before concluding something is unavailable.
- **v5 mobile bug** (realtime not visible on phones, visible with "desktop site"): v5 is not touched;
  hypothesis (unverified): layout-dependent at ≤ 768 px. v6: mobile-first layout and automated
  mobile-viewport tests.

## 5. Firebase inspection (read-only, authorised by the maintainer)

**`muonhub` (v6) — clean slate:** RTDB default instance active in us-central1 and empty; Hosting
site `muonhub` exists; **no web app registered; Firestore not created (API not enabled);
Authentication not initialised.**

**`munhub-1` (v5 production) — structure only:** RTDB root `profiles` (10) and `users` (5); 7 Auth
accounts. Profiles carry `name, ownerEmail, ownerUid, ownerName, meta, visibility, sessions`, some
`sharedWith` and `latest`; the live one holds a `realtime` window of ~1,727 events over ~12 minutes
(≈ 2.4 events/s). Two profiles are fragments (only `latest`, or only `sessions`) — migration
quarantine cases. Profile nodes carry owner identity fields; the v6 migration must keep all
personal data out of every publicly readable path. Session/minute volume (deeper levels) not yet
measured.

## 6. Research results (condensed; sources in the session)

- **Firebase on Spark (2026):** RTDB (1 GB, 10 GB/month download, 100 simultaneous connections, one
  instance), Firestore (1 GiB, 50k reads / 20k writes / 20k deletes per day), Hosting (~360 MB/day,
  multiple sites, preview channels), Auth (50k MAU; email limits), App Check, FCM, Remote Config,
  Analytics and AI Logic (Gemini free tier; content may be used by Google) are free. **Not
  available:** Cloud Storage (Blaze required since 2026-02-03), Cloud Functions, App Hosting,
  Extensions; Data Connect only as a 3-month trial.
- **Scheduled jobs without billing:** GitHub Actions cron (public repos free; ≥ 5-minute granularity;
  schedules pause after 60 days without repository activity).
- **Backups without exposing private data:** release assets in a separate **private** repository
  (≤ 2 GiB per file; whether they count against any quota is unverified), encrypted with `age`;
  public-repo artifacts are downloadable by anyone.
- **Agent runtime:** Node 24 daemon + `serialport` 13 (prebuilt for linux x64/arm64, Windows, macOS)
  + `node:sqlite` (release candidate; `better-sqlite3` fallback); Bun is unusable with `serialport`
  (open N-API event-loop bug); Go is the fallback; Tauri is a GUI framework with signing/notarisation
  overhead and a Rust toolchain. Tailscale SSH server works on Linux/macOS, not Windows.
- **gh `slow_down` on WSL:** known clock-drift bug, fixed in gh 2.87; Ubuntu ships 2.45 → install gh
  from the official repository (maintainer will do it).
- **Open data:** HiSPARC (event-level, multi-detector), NMDB (Mexico City as closest analogue), GMDN,
  Pierre Auger scalers (CC BY-SA 4.0), LAGO (nodes at USFQ, EPN, ESPOCH; measured data not public),
  QuarkNet, EEE; no curated CosmicWatch public dataset found.
- **Simulation:** Guan/Gaisser analytic flux (TS generator), EcoMug, CRY (tables at 0, 2100,
  11300 m only), PUMAS (LGPLv3), Geant4, CORSIKA 8 (heavy).
- **Muography:** transmission method (open sky, then target) is standard; ~20 channels ≈ 2 X/Y planes
  of 5+5 strips → coarse demonstrator feasible (buildings/hills); volcano scale needs m² and months.
  References: MuTe (Colombia), Peru UNI/CONIDA, Copahue, Teotihuacan, Sakurajima, ScanPyramids,
  SAKURA/OSECHI (low-cost). None found in Ecuador (unverified absence).
- **Seismic ↔ cosmic rays:** CREDO (Homola et al., 2023) reports a global-only correlation with a
  ~15-day lag; not established; treat as exploratory with pre-registered analysis and controls; also
  use the seismometer as a systematics channel. Typical data: 100 samples/s, miniSEED/FDSN, ObsPy.
- **Offline timestamps:** DS3231 RTC (±2 ppm ≈ ±0.17 s/day) for rates; GPS PPS + chrony (~µs) for
  cross-machine coincidences; USB adds ms-level jitter unless the device timestamps events.
  CosmicWatch hardware coincidence window: ~30 µs per the v2 paper; a 2026 preprint says 0.1 s —
  to verify against the v3X manual.

## 7. Environment facts

- Detector machine: **Ubuntu at the university**, no Tailscale yet (the maintainer installs it on
  site). Which v5 reader holds the serial port (Chrome Web Serial or the Python bridge) is unknown;
  pausing it for a capture is acceptable.
- Development machine: Windows + WSL2. git identity configured; **push not possible yet** (no
  credentials until gh is upgraded and authenticated). No `pwsh`, Rust, or Java installed (Java is
  only needed by the Firebase emulator, which runs in CI).
- Keys present in `private/` (gitignored): service accounts for `muonhub` and `munhub-1`. The v5
  cold dump of `munra-1` is not on this machine.

## 8. Open topics for the next session

1. **Terminology/glossary** separating the physical device from its data space in MuonHub (and the
   names for formats, calibrations, recipes, views).
2. **Daemon vs Tauri** — argue the agent runtime in full.
3. **Private backup repository** — argue costs/benefits in more depth.
4. **Public live demo within free limits** — design anonymous live viewing of public stations.
5. **Firebase setup method** — confirm what "configure from the web where possible" means (Firebase
   web console vs CLI/API) and do it together.
6. **Milestone plan re-cut** into ~5–6 PRs with many versioned commits inside (§1.13).
7. **H0 file-by-file list** (moves, archives, removals, rename) shown for approval before execution.
8. **Raw-upload option** (admin-gated) and the **BYODB** PoC.
9. Measure v5 session/minute volume in `munhub-1` (read-only) for migration planning.
