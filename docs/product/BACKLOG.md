# MuonHub v6 — Backlog

> Status: living document · Last updated: 2026-10-03 (milestone M0)
> Milestones: [`ROADMAP.md`](ROADMAP.md). Items are `B-<milestone>-NN`; a spec gets a number
> (from **0083** upward) only when it is written. Every item names its source: an approved
> requirement or decision (session records), a **[verified]** finding, a **[reported]** finding
> (re-checked when its spec is written), or a proposal. **Proposed** marks items or milestone
> placements the maintainer has not approved yet.
>
> Sources: session record [`../audit/2026-10-02-V6-RESET-SESSION-RECORD.md`](../audit/2026-10-02-V6-RESET-SESSION-RECORD.md)
> (§3 requirements, §4 audit findings, Appendix A), the archived first-attempt spec branches
> (tags `archive/spec-0078…0082`, `archive/status-pill-fix`), and the archived backlog
> [`../archive/planning/04-BACKLOG.md`](../archive/planning/04-BACKLOG.md) (mapping table at the end).

---

## M0 — Foundation (this milestone's PR)

| ID | Item |
|---|---|
| B-M0-01 | Archive the first-attempt spec branches (`spec/0078…0082`, `preserved/status-pill-fix`) as tags; keep only `main`, `v5-production`, and the active work branch. |
| B-M0-02 | Remove the v5 copy (`public/`) and the root v5 Firebase files; Firebase tooling points at `muonhub`. |
| B-M0-03 | Rename the product to MuonHub (`@muonhub/*`), keeping historical records and the real v5 project names. |
| B-M0-04 | Fold AFLEK into `docs/process/` (principles, spec and Stage Report templates); keep the `.claude/agents` reviewers; remove the Gemini, Cursor, and Copilot configuration. |
| B-M0-05 | Reorganize `docs/` (product, decisions, science, architecture, operations, process, archive). |
| B-M0-06 | Decision records ADR-004 … ADR-009 and a decision log marking D1–D46 as active, amended, or superseded. |
| B-M0-07 | Rewrite `README.md` (with the version-history table), `AGENTS.md` (the maintainer's data-integrity formulation), `CLAUDE.md`, `CONTRIBUTING.md`, and `docs/STATUS.md`. |
| B-M0-08 | Product documents: vision, roadmap, backlog, public-site plan. |
| B-M0-09 | Operations guides: Firebase setup for the maintainer to perform himself; remote access to the agent machine. |
| B-M0-10 | Mark the first-attempt specs as superseded; record the first-attempt changelog fragments as history. |

---

## M1 — Core + Agent

### Domain and data integrity

| ID | Item | Source |
|---|---|---|
| B-M1-01 | **Domain contracts v2** in `packages/shared` using the ADR-004 vocabulary: device, device type, station, assembly, stream, session, calibration, recipe, view. Data belongs to streams. | ADR-004 |
| B-M1-02 | **Per-minute record v2:** pressure, temperature, and dead time are optional — a device without a barometer must never lose minutes (today the aggregator discards the whole minute). Explicit units (dead-time semantics, τ in µs, pressure in hPa); a missing value is "absent", never 0. | Audit §4.3 [verified] |
| B-M1-03 | **Calibration defaults reconciled** with the theoretical foundation §3 per device type (today `saturationMv` 5000/3300 and `triggerAdcMin` 50/120 contradict ~180–200 mV and ADC > 30); unknown hardware gets **no dead-time correction** — its rate is labelled uncorrected (at ≈ 2.4 s⁻¹ an assumed 50 ms would inflate a true ≈ 0.4 ms device's rate by ≈ 14 % and can make the correction negative or infinite). | Code: `packages/shared/src/calibration.ts`, `constants.ts` [verified] |
| B-M1-04 | **Multichannel events and sampled streams** in the contracts, so the muograph (~20 channels) and the seismic sensor (~100 samples/s) fit without a rewrite. | Session record §3.11–12 |
| B-M1-05 | **Data layers (ADR-006):** raw (immutable) → canonical (deterministic, versioned parser) → derived (versioned recipe, provenance, "derived" label when materialized). | ADR-006 |
| B-M1-06 | **Time quality as provenance:** each session records its time source (NTP, RTC, GPS, none), offset, and drift; raw times are kept and corrected times are derived. | Session record A.7.6 |
| B-M1-07 | **Geometry fields** on devices (active area, thickness, material, orientation) so per-area normalization works from day one; the assembly editor comes in M3. | Session record A.7.2 |

### Physics (all fixes need numeric tests)

| ID | Item | Source |
|---|---|---|
| B-M1-08 | **Barometric β:** fit hourly bins with the detector temperature as a covariate; σ_β corrected for autocorrelation; apply β only if \|β\|/σ_β ≥ 3 (for one 25 cm² device at ≈ 2.4 s⁻¹ this needs roughly 1–2 months; one week is only a floor — today's code accepts 168 minute points); minimum pressure range, sign/range checks, outlier exclusion. At the equator most pressure variance is the 12-hour tide; because it is locked to solar time it is confounded with the 12-hour harmonics of temperature and SiPM gain and with the semidiurnal anisotropy. The reference pressure P₀ is the station's own long-term mean over the fit period. | Audit §4.3 [verified]; physicist review 2026-10-03 [reported] |
| B-M1-09 | **Anomalies only over hour-scale windows with ≥ 3σ persistence** (foundation §10), never per minute. | Audit §4.3 [reported] |
| B-M1-10 | **Dead time from measured live time:** official CosmicWatch firmware reports cumulative dead time (meaning and unit on the MuNRa firmware still unverified — check on a raw capture that the column only increases). Per interval: dead fraction = (D_end − D_start)/(t_end − t_start) between the lines bounding the interval — never a mean of per-line ratios; a decrease is a reset and starts a new session; live fraction = 1 − dead fraction. Uncertainty: σ(R_true) = √N / T_live (non-paralyzable dead time makes counts sub-Poisson); add R²σ_τ/(1−Rτ)² in quadrature (R = measured rate) only when τ is assumed rather than measured; interval durations come from the device clock. | Audit §4.3 [verified]; physicist review 2026-10-03 [reported] |
| B-M1-11 | **Amplitude spectrum and MPV:** spectrum only from event-level amplitudes (never per-minute min/avg/max); fixed binning per device type, saturation flag, MPV fit with uncertainty; no `Math.max(...array)` on large arrays. | Audit §4.2, §4.3 |
| B-M1-12 | **Noise calibration as a suggestion only:** it proposes a threshold; nothing is filtered at ingest. | Audit §4.3 [verified by running]; ADR-006 |

### Synthetic data

| ID | Item | Source |
|---|---|---|
| B-M1-13 | **Synthetic generator, tier 1** (`@muonhub/simulator`): Poisson events, angular distribution, altitude/pressure modulation, Landau-like amplitudes, noise, dead time, N devices in a geometry with true coincidences, clock drift/jitter, gaps, resets, Forbush-like dips; output in any device-type format → test fixtures and a **virtual detector** that feeds the agent end to end. | Session record A.7.4 |

### Data layer and security

| ID | Item | Source |
|---|---|---|
| B-M1-14 | **Data layer v2:** Firestore for metadata, catalogue, summaries, calibrations, notifications, audit log; a flat Realtime Database for live data and per-minute series. Series are never nested under a station node (root cause of: editing a station erases its history; stations with devices unreadable; exports losing all but ~500 minutes). | Audit §4.1 [verified] |
| B-M1-15 | **Provider hygiene:** split by responsibility; pagination/cursors on range reads; an error channel on subscriptions; separate create vs metadata-update operations; invalid records surfaced as quarantine counts, never silently dropped. | Audit §4.1 |
| B-M1-16 | **Realtime retention by time** without re-downloading the window (today every new event downloads the full 5,000-record window once full); unique keys so same-millisecond events never overwrite each other. | Audit §4.1 [verified] |
| B-M1-17 | **Security rules v2 (ADR-009):** deny by default; validation on every field; rights change only through authorized flows (owners share or transfer ownership; nobody grants themselves rights); no self-assigned roles; editors cannot take over, delete, or reshare; no collection-level public reads; public projections without personal data; exact coordinates readable only by owner, collaborators, and admins. | Audit §4.1 |
| B-M1-18 | **Negative rules tests** with real client identities (anonymous, other user, viewer, editor, owner, admin) in the emulator, for every collection and every query the apps perform. | Audit §4.1 |
| B-M1-19 | **No Cloud Storage:** remove the signal-blob API from the provider (Spark has no Cloud Storage since 2026-02-03). | Session record §6 |

### Agent (ADR-007)

| ID | Item | Source |
|---|---|---|
| B-M1-20 | **Headless daemon:** Node 24 TypeScript service under systemd (restart on failure, starts without a login), stable serial device names, local web panel reachable through an SSH tunnel; signs in with the user's account (no admin keys on agent machines). | ADR-007 |
| B-M1-21 | **Session persistence and rejected-write detection:** after a reboot the agent restores its session; rejected writes are detected and shown, never silent. | `archive/status-pill-fix` lessons |
| B-M1-22 | **Robust serial ingest:** framing tolerant to CRLF, partial lines, and concatenated records; configurable baud; reconnect after USB unplug (no silent stop); device-time rollover and resets (a reset starts a new session); event-ID gap detection; counting by readings, never by summing event IDs; units from the device type, never guessed from key names. | Audit §4.3 |
| B-M1-23 | **Device types as declarative definitions** (Bring Your Own Detector foundation): CosmicWatch v2 and v3X built in; explicit selection per device; auto-detection only proposes. | Session record §3.5 |
| B-M1-24 | **SQLite local store and durable outbox** for every output kind, keyed by (stream, kind, timestamp): written locally before any upload; transient vs permanent errors; backoff; failures surfaced. Tier-aware routing matrix and per-kind flush counts. | Audit §4.3; `archive/spec-0078` |
| B-M1-25 | **Session controller:** pure-TS owner of serial source → parser → aggregation → event science → outbox; idempotent start/stop; live status (rate, queue depth, last sync, active calibration, clock offset); connectivity drives flushing with no loss across online/offline transitions. | `archive/spec-0079` |
| B-M1-26 | **Raw mirror and capture tool:** every raw line is teed to a rotating log and a local socket so the port can be observed remotely without stopping acquisition; `muonhub-agent capture` (baud scan, hex dump, column statistics, proposed device type, fixture capture) identifies the two unknown detectors from their output. | Session record §3.13 |
| B-M1-27 | **Clock offset** measured (NTP) and stored in session provenance; timestamps taken at read time in the agent. | Agent/physics review 2026-10-02 [reported] |
| B-M1-28 | **Fully local operation:** the agent records and shows data with no network and no account yet; it syncs when it can. | Archived backlog 0071 |
| B-M1-29 | **Public live window (Proposed, ADR-005):** for public streams only, the agent maintains a compact last-~10-minute window with public-safe fields; measure whether short REST requests count toward the 100-connection limit. | ADR-005 |

### Tooling and environment

| ID | Item | Source |
|---|---|---|
| B-M1-30 | **Tooling consistency:** Node requirement (pnpm 11 needs Node ≥ 22.13), `clean` removes `tsbuildinfo`, Turbo caches `apps/web/out` and declares its inputs, TypeScript and vitest pinned per package, ESLint recommended rules plus a real English-only identifier rule, Prettier check in CI. | Audit §4.4 |
| B-M1-31 | **Dependency upgrades:** Next 16, React 19, zod 4, ESLint 10, vitest 5, maplibre 6; evaluate TypeScript 7. | Audit §4.4 [reported] |
| B-M1-32 | **Remove the Tauri/Rust shell** (superseded by the daemon). | ADR-007 |
| B-M1-33 | **Firebase project setup by the maintainer** following `docs/operations/` (Authentication providers, Firestore in `nam5`, web app registration, App Check in monitor mode). | Session record A.1 |
| B-M1-34 | **Detector-site access:** Tailscale on the Ubuntu agent machine at the university (maintainer, on site); identify which v5 reader holds the serial port; short capture pauses are acceptable. | Session record §7 |
| B-M1-35 | **Theoretical-foundation amendments** (physicist-reviewed, pre-existing issues): §4 — `dt` becomes the measured dead fraction f = Δdead/Δt with R/(1−f), the τ model only as a fallback; §10 — the minute-noise example (N ≈ 3600/min, ~1.6 %) does not fit a 25 cm² device at ≈ 2.4 s⁻¹ (≈ 145 counts/min: ≈ 8 % per minute, ≈ 1 % per hour, ≈ 12 h for 100k counts); §0/§8D — altitude-dependent factors per station (≈ 4–7× hadronic factor at 768 hPa instead of 5–9× at 730 hPa); **§8A sign error** — the linear form must be `ln(I/I₀) = β(P−P₀)` (marked in the document); §0 item 4 repeats the 1.6 %/min figure; §10 "N ≥ 100k → < 0.3 %" is 0.32 %; §8A table labels (Jeddah, 21.5° N, is not equatorial; Marambio, 64° S, is not the South Pole). | Physicist review 2026-10-03 [reported] |
| B-M1-36 | **Only complete minutes are recorded:** the first minute after a start and the last minute before a cut are discarded, as in v5 (ADR-003 §5, SERIAL-FORMATS §4, ADR-006 rule 7). The first-attempt aggregator does not discard them and reports a partial minute as a full-minute rate. | Agent review 2026-10-02 [reported]; maintainer 2026-10-04 |

**M1 validation:** 72 hours with the real detector writing to `muonhub`, with USB disconnections and
network cuts, plus the virtual detector.

---

## M2 — Web platform

| ID | Item | Source |
|---|---|---|
| B-M2-01 | **Web structure:** feature folders; data hooks with cancellation, caching, and errors; static-export-safe routes (no dynamic `[id]` shell that 404s on hosting); hosting config with clean URLs and a real 404 page. | Audit §4.2 |
| B-M2-02 | **Configuration reaches the browser:** literal `NEXT_PUBLIC_*` reads validated once; a clear full-page error when configuration is missing. | Audit §4.2 [verified by running] |
| B-M2-03 | **Accounts:** sign-up, sign-in (email/password and Google), password reset, email verification; login honours `?next=`; no sample pages with fake data; safe error messages (no raw backend errors). | Audit §4.2; archived 0009, 0065 |
| B-M2-04 | **Stations, devices, streams management:** explicit visibility choice with no default; owner-chosen public location precision (exact / approximate / city / country / hidden); no crash on device creation (detached `randomUUID`); device-token warning only on a real mismatch; collaborators can open shared stations. | Audit §4.2; session record §3.2 |
| B-M2-05 | **Sharing, roles, and ownership transfer:** owner / editor / viewer per station; share by email or username showing name and institution; unique usernames; the owner can **transfer or share ownership** easily, and the recipient is notified by email (in-app notice until transactional email exists; whether the recipient must accept is decided in the spec). | Archived 0010; D24, D25; maintainer 2026-10-04 |
| B-M2-06 | **Live dashboard (mobile-first):** corrected rate (labelled as dead-time + barometric corrected); a compact device-health panel (dead time is health, not a hero chart); incremental fetching; rollups for long ranges; uPlot (Plotly only lazy-loaded for spectrum and fits); chart colors resolved from design tokens. | Audit §4.2; archived 0018, 0019 |
| B-M2-07 | **Status truthfulness:** database connection and data freshness shown separately; status recomputed on a timer; explicit "no data" and "stale" states. | `archive/status-pill-fix` lessons |
| B-M2-08 | **Honest labelling audit:** charged-particle / MIP-type rate on single-SiPM devices; no promises of unimplemented features (e.g. "Forbush alerts"). | Audit §4.2; archived 0021 |
| B-M2-09 | **Public site** per [`PUBLIC-SITE-PLAN.md`](PUBLIC-SITE-PLAN.md), with a design session for the visual layer. | Session (2026-10-03) |
| B-M2-10 | **Public live demo** of public stations for anonymous visitors, within the 100-connection limit (mechanism decided from the M1 measurement). | Session record §3.1 |
| B-M2-11 | **Network map from public projections only:** no exact coordinates or personal data reach anonymous visitors; "active now" from the latest data time, not from registration status; unknown locations hidden, not placed at random. | Audit §4.2; archived 0024 |
| B-M2-12 | **App Check enforced** (after a monitoring period); Analytics optional with a privacy notice. | Products approved: session record §1.4; monitor-then-enforce approach: A.1 (Proposed) |
| B-M2-13 | **Accessibility and polish:** form ARIA wiring, no nested interactive elements, no theme flash, mobile navigation. | Audit §4.2 |
| B-M2-14 | **End-to-end tests** (Playwright) including phone viewports and deep links. | Audit §4.6 (v5 mobile lesson) |
| B-M2-15 | **i18n-ready strings** from the start (English source); full translations in M5. | Archived 0023 |
| B-M2-16 | **First deployment** to `muonhub.web.app` (staging approach: see Open questions). | Roadmap |

**M2 validation:** real use on a phone and on a computer with the real detector.

---

## M3 — Science

| ID | Item | Source |
|---|---|---|
| B-M3-01 | **Geometry and assemblies:** per-device area, thickness, material, orientation; station assemblies (stacking, separation, offsets, tilt); flux per cm²; expected accidentals; a 2D side-view schematic editor (3D evaluated later). | Session record A.7.2 |
| B-M3-02 | **Comparison toolkit:** alignment (common bins, live-time weighting, gaps ≠ zeros); selectable normalization (live time, area, own baseline, corrected or not); overlay, ratio, difference, A-vs-B scatter, Bland–Altman, spectrum and diurnal overlays, rolling correlation; Pearson/Spearman with autocorrelation, lagged cross-correlation, χ² compatibility within Poisson; a reproducible card of parameters and versions with every result. | Session record A.7.3 |
| B-M3-03 | **Spectrum and statistics panels:** log-y spectrum with fit overlay and interval selector; baseline, z-scores, rolling statistics, data quality (dead-time %, coverage). | `archive/spec-0080` |
| B-M3-04 | **Coincidences:** (a) hardware coincidence — verify the CosmicWatch v3X window first; (b) software coincidence on one machine — window scan (plateau vs accidentals), accidental estimate 2·τ_c·R₁·R₂ (τ_c = coincidence half-window; not the dead time), net rate ± error, delay histogram — host USB-serial latency can exceed 10 ms, so the window is set from the delay histogram; (c) across machines only with GPS-grade time. Muon language only for coincidence data or aggregate inference (foundation §5). | Session record A.7.3 |
| B-M3-05 | **Known-answer validation** with the synthetic generator: the analyses recover planted coincidences and dips. | Session record A.7.4 |
| B-M3-06 | **Calibration:** versioned per device, source per parameter (default / automatic / manual / imported), uncertainty, lock, validity date; automatic routines propose (noise histogram, MPV fit, β regression with residuals) and the user accepts or edits; applied on read; managed from MuonHub. | Session record §3.4, A.7.9 |
| B-M3-07 | **Recipes and views:** several views of one stream (e.g. pure vs filtered) compared side by side; event-level recipes run in the agent over its local history and upload labelled derived series; explicit, labelled materialization only on request. | ADR-006 |
| B-M3-08 | **Export** (CSV, JSON, images) of views and comparison results with their parameter cards. | Archived 0022 |

**M3 validation:** stacked CosmicWatch devices (or simulated ones) — known results recovered.

---

## M4 — Open platform

| ID | Item | Source |
|---|---|---|
| B-M4-01 | **Configuration terminal:** a live agent stream or an uploaded sample → auto-detected delimiter, headers, types, monotonic columns, value ranges → a person maps each column to a standard quantity with units (or a custom one) → validation against the sample → publish. LLM assistance later. | Session record §3.5, A.7.1 |
| B-M4-02 | **Device-type catalogue:** lifecycle Draft → Community → Under review → Verified/Official; labels (needs review, open reports, deprecated); feedback threads to the author; versioned and forkable; official approval by admins. | Session record §3.5 |
| B-M4-03 | **Friendly installer for Windows and macOS users** of the agent daemon. | ADR-007 |
| B-M4-04 | **Scheduled jobs on GitHub Actions** (job list Proposed, confirmed when M4 is planned): device-silence alerts, usage measurement, admin-role assignment script, periodic integrity checks; push notifications (FCM) and an in-app notification centre. | Session record A.4; archived 0039, 0052 |
| B-M4-05 | **Backups to a private vault repository:** encrypted release assets written with a token restricted to the vault; a restore drill. Verify first whether private-repository release assets count against any quota. | Approved 2026-10-03 |
| B-M4-06 | **Usage and quota monitor** with a deterministic runway projection, admit-control, thresholds, and capacity notifications. | `archive/spec-0082`; session record A.2 |
| B-M4-07 | **External data:** an `ExternalDataSource` interface; NMDB, NOAA SWPC, NASA DONKI (and Dst/Kp) adapters; untrusted input validated and never coerced; correlation physics (resampling, Pearson/Spearman, lagged cross-correlation, deterministic Forbush-decrease detector) with numeric tests; overlays on charts. | `archive/spec-0081`; archived 0027–0030 |
| B-M4-08 | **Open data references:** HiSPARC, NMDB (Mexico City as the closest analogue), GMDN, Pierre Auger scalers; licences and citations honoured. | Session record A.7.5 |
| B-M4-09 | **Offline collection** (e.g. Raspberry Pi): RTC as a minimum, GPS PPS recommended; sealed session bundles (data, manifest, checksums, clock log) uploaded later without duplicates and with their true timestamps. | Session record §3.10, A.7.6 |
| B-M4-10 | **Raw cloud upload, admin-authorized** (it consumes a lot of space). Placement in M4 is **Proposed**. | Session record §2 |
| B-M4-11 | **Bring Your Own DataBase — PoC (Proposed):** users connect their own storage for raw data. | Session record §2 |
| B-M4-12 | **Admin area (Proposed scope):** device-type approvals, user roles, station/device reassignment, destructive confirmations with soft delete, append-only audit log, announcements, feature flags (Remote Config). "View as user" deferred pending a security design. | Archived 0031, 0035, 0059–0063 |
| B-M4-13 | **Historical data import (Proposed placement):** CSV/ZIP files into a stream, deduplicated by key, invalid rows quarantined. | Archived 0034, 0070 |

**M4 validation:** a new detector configured from scratch; a backup actually restored.

---

## M5 — Migration + launch

| ID | Item | Source |
|---|---|---|
| B-M5-01 | **v5 → v6 migration tool:** read-only from the live v5 project (`munhub-1`) and the `munra-1` cold dump; streaming, idempotent, resumable, quarantine report; v5 profiles → stations + streams; fragment profiles quarantined; personal data only into protected paths; spectrum recovered only where event amplitudes exist. | Session record §5; archived 0007 |
| B-M5-02 | **Cutover:** the agent machine switches from the v5 reader to the agent; v5 stays on its own site and project. | Session (2026-10-02) |
| B-M5-03 | **Translations** (Spanish, Brazilian Portuguese) and locale-aware units. | Archived 0023, 0073 |
| B-M5-04 | **User manual and FAQ** (English first, then Spanish and Portuguese); technical documentation complete. | Archived 0047, 0048, 0055 |
| B-M5-05 | **Academic artifacts:** `CITATION.cff`, Zenodo DOI for the release, a published MuonHub dataset with a DOI (CC-BY 4.0). | Archived 0050, 0069; session record §6 |
| B-M5-06 | **Release `6.0.0`:** compiled changelog and launch checklist. | ADR-008 |

---

## After 6.0.0 (6.x)

| ID | Item | Source |
|---|---|---|
| B-P-01 | **Seismic channel (exploratory):** raw data stays local; per-minute features and an event catalogue are uploaded; pre-registered analysis with controls; the seismometer also serves as a systematics channel. | Session record §3.11, A.7.7 |
| B-P-02 | **Muography:** study → simulation (EcoMug/PUMAS) → demonstrator; track reconstruction, angular rate maps, transmission maps. | Session record §3.12, A.7.8 |
| B-P-03 | **LLM assistance** (device-type mapping, analysis help) after proofs of concept. | Session record §3.5 |
| B-P-04 | **Machine learning** on top of the deterministic base, with per-station consent (Proposed). | Archived 0044–0046, 0066 |
| B-P-05 | **Station networks** and simultaneous-event detection (Proposed). | Archived 0056, 0058 |
| B-P-06 | **3D device visualization** — evaluate its use first. | Session record §3.6 |
| B-P-07 | **Public read-only API and embeddable charts** (Proposed). | Archived 0068, 0073 |
| B-P-08 | **Web Serial demo mode** (try without installing the agent) (Proposed). | Archived 0017 |

---

## Open questions

1. **Contact address:** the current landing page shows `contact@munhub.usfq.edu.ec`, which is
   unverified and likely invented. The real address is needed before M2 ships.
2. **Bring Your Own DataBase:** scope of the PoC, and whether it could ever become paid (decision D26
   says no billing in v6).
3. **Raw cloud upload (admin-gated):** milestone placement and the quota it may use.
4. **Staging environment:** a second Hosting site inside `muonhub` would share the production
   databases (inference), so a real staging environment needs a separate project or the emulator;
   decide in the M1 plan.
5. **Public live mechanism:** depends on whether short REST requests count toward the Realtime
   Database connection limit — measured in M1.
6. **v5 cold dump:** the `munra-1` dump is not on the development machine; its location is needed for
   M5.
7. **Agent machine:** which v5 reader holds the serial port (Chrome Web Serial or the Python
   bridge).
8. **New detectors:** their models are unknown and must be determined from their output (capture
   tool, B-M1-26); whether any device accepts configuration commands over serial.
9. **CosmicWatch coincidence window:** ~30 µs (v2 paper) vs 0.1 s (2026 preprint) — verify against the
   v3X documentation.

---

## Mapping of the archived backlog

Archived backlog: [`../archive/planning/04-BACKLOG.md`](../archive/planning/04-BACKLOG.md). Its
canonical numbers (its own mapping table) differ from the first-attempt spec folders for 0006–0008
(folders 0006 insights-v0, 0007 firebase-provider, 0008 web-ui-skeleton).

| Old | Item (translated) | Now |
|---|---|---|
| 0001 | Monorepo scaffold | Kept (exists) |
| 0002 | CI/CD | Kept; hosting deploy → B-M2-16 |
| 0003 | Shared types and zod contracts | M1 · B-M1-01 |
| 0004 | DataProvider interface | M1 · B-M1-14, B-M1-15 |
| 0005 | Physics package | M1 · B-M1-08…12 |
| 0006 | FirebaseProvider | M1 · B-M1-14 |
| 0007 | v5 → v6 migration | M5 · B-M5-01 |
| 0008 | `munhub-1` config (rules, keys, indexes) | Superseded by the `muonhub` project → B-M1-17, B-M1-33 |
| 0009 | Auth | M2 · B-M2-03 |
| 0010 | Roles, tenancy, permissions | M1 rules (B-M1-17) + M2 sharing (B-M2-05) |
| 0011 | Station creation + metadata onboarding | M2 · B-M2-04 |
| 0012 | Detector management under a station | M2 · B-M2-04 (now devices + streams) |
| 0013 | Multiplatform serial reading | M1 · B-M1-22 |
| 0014 | Local SQLite backup | M1 · B-M1-24 |
| 0015 | Offline sync queue + idempotency | M1 · B-M1-24, B-M1-25 |
| 0016 | Packaging / installers | M1 (Linux daemon, B-M1-20) + M4 (B-M4-03) |
| 0017 | Web Serial demo mode | After 6.0 · B-P-08 (Proposed) |
| 0018 | Station dashboard | M2 · B-M2-06 |
| 0019 | More charts and statistics | M2 · B-M2-06 + M3 · B-M3-02, B-M3-03 |
| 0020 | Comparison and contrast | M3 · B-M3-02 |
| 0021 | Honest particle labelling | M2 · B-M2-08 |
| 0022 | Multi-format export | M3 · B-M3-08 |
| 0023 | i18n, theming, accessibility | M2 (B-M2-13, B-M2-15) + M5 (B-M5-03) |
| 0024 | Detector map (city aggregation) | M2 · B-M2-11 (owner-chosen precision) |
| 0025 | Live demo of a public detector | M2 · B-M2-10 |
| 0026 | Educational sections | M2 · B-M2-09 |
| 0027 | NMDB ingestion | M4 · B-M4-07 |
| 0028 | NOAA SWPC ingestion | M4 · B-M4-07 |
| 0029 | NASA DONKI + Dst/Kp ingestion | M4 · B-M4-07 |
| 0030 | Correlation views | M4 · B-M4-07 |
| 0031 | Dedicated admin page | M4 · B-M4-12 (Proposed) |
| 0032 | Database management, runtime provider switching | Dropped — single Firebase project (ADR-005) |
| 0033 | Provider migration tool | Dropped — no second provider; export/import kept for backups and migration |
| 0034 | External database file import | M4 · B-M4-13 (Proposed) |
| 0035 | User/role/institution management | M4 · B-M4-12 (Proposed) |
| 0036 | Cold backups to Cloudflare R2 | Replaced by the private vault (B-M4-05); no Cloudflare |
| 0037 | Restore from cold backup | M4 · B-M4-05 |
| 0038 | Security audit | M1 · B-M1-17, B-M1-18 and every PR (ADR-009) |
| 0039 | Periodic integrity verification | M4 · B-M4-04 |
| 0040 | SupabaseProvider | Dropped — Firebase indefinitely (ADR-005) |
| 0041 | Postgres + TimescaleDB schema | Dropped — same reason |
| 0042 | Row-level security | Dropped — same reason |
| 0043 | Docker deployment on Red Clara | Dropped — no Red Clara |
| 0044 | AI design document | Archived (planning document) |
| 0045 | ML pipeline | After 6.0 · B-P-04 (Proposed) |
| 0046 | `ai_insights` contract + UI | After 6.0 · B-P-04 (Proposed) |
| 0047 | User manual + FAQ | M5 · B-M5-04 |
| 0048 | Technical documentation | Every PR (docs are part of done) + M5 · B-M5-04 |
| 0049 | Scientific article base | After 6.0 (Proposed) |
| 0050 | Academic and community artifacts | M5 · B-M5-05 |
| 0051 | Red Clara resource tiers | Dropped — no Red Clara |
| 0052 | Notification centre | M4 · B-M4-04 |
| 0053 | Transactional email | M4 (Proposed; Firebase Auth already sends account emails) |
| 0054 | Ticket system | After 6.0 (Proposed); device-type feedback threads cover part (B-M4-02) |
| 0055 | Public FAQ | M5 · B-M5-04 |
| 0056 | Network CRUD + station linking | After 6.0 · B-P-05 (Proposed) |
| 0057 | Multi-station comparative view | M3 · B-M3-02 |
| 0058 | Simultaneous network event detection | After 6.0 · B-P-05 (Proposed) |
| 0059 | Extended admin page | M4 · B-M4-12 (merged) |
| 0060 | Station/device + institution lifecycle | M4 · B-M4-12 (Proposed) |
| 0061 | Destructive confirmations + soft delete | M4 · B-M4-12 |
| 0062 | Audit log | M4 · B-M4-12 |
| 0063 | Announcements, feature flags, view-as-user | M4 · B-M4-12 (view-as-user deferred) |
| 0064 | Onboarding wizard | M4 · B-M4-01 (Proposed) |
| 0065 | Account lifecycle | M2 · B-M2-03 (verification, reset); account deletion M4 (Proposed) |
| 0066 | ML consent | After 6.0 · B-P-04 |
| 0067 | Entitlements + metering | After 6.0 (Proposed); related to Bring Your Own DataBase |
| 0068 | Public read-only API | After 6.0 · B-P-07 (Proposed) |
| 0069 | Dataset citation + status page | M5 · B-M5-05 (DOI); status page after 6.0 (Proposed) |
| 0070 | Historical data import + ZIP backup | M4 · B-M4-13 (Proposed) |
| 0071 | Fully local agent mode | M1 · B-M1-28 |
| 0072 | Data quality, robustness, concurrency | M1 · B-M1-02, B-M1-16, B-M1-22 + M2 · B-M2-06 (health) |
| 0073 | Localization, versioned Terms, public chart embed | M5 · B-M5-03 (locale, Terms) + after 6.0 · B-P-07 (embed) |
