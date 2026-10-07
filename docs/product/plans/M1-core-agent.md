# Milestone plan — M1 Core + Agent

- **Status:** **Approved** by the maintainer on 2026-10-04, with decisions A–H as recommended below.
  Execution log at the end of this document.
- **Goal:** trustworthy data from the real detector reaches the `muonhub` project end to end, with
  no web interface yet: a headless agent on the university PC reads the CosmicWatch 24/7, keeps all
  raw data locally, writes complete-minute records, hourly summaries, and a live window to Firebase,
  and survives USB unplugs, network cuts, and reboots without losing or duplicating data. Underneath
  it: corrected physics, contracts v2, a data layer v2 with security rules tested against real
  identities, and a synthetic "virtual detector".
- **Pull request:** #2 of ~6 · **Branch:** `feat/m1-core-agent` · **Versions:** `6.0.0-alpha.1.x`
- **Depends on:** M0 merged (PR #57, tag `v6.0.0-alpha.0.4.3`); Firebase setup by the maintainer
  (step 8); site access with Tailscale (step 9).
- **Backlog items:** B-M1-01 … B-M1-36 ([`../BACKLOG.md`](../BACKLOG.md)).

## Steps

| # | Step | What changes | Detail |
|---|---|---|---|
| 1 | Tooling and upgrades | Root and package configs, CI | Node 24 LTS for the whole repository (CI, `engines`, `.nvmrc`); `clean` also removes `tsbuildinfo`; Turbo inputs/outputs fixed; TypeScript and vitest pinned per package; ESLint recommended rules and a real English-only identifier rule; Prettier check in CI; upgrade zod, vitest, ESLint, TypeScript after checking current releases (Next/React/maplibre move with the web in M2); remove the Tauri/Rust shell. (B-M1-30, 31, 32) |
| 2 | Specs — one approval gate | `specs/0083…0087` | 0083 contracts and data model v2 · 0084 security rules v2 and the test matrix · 0085 physics corrections · 0086 simulator tier 1 · 0087 agent daemon. Presented together in the chat (plain-language summary); full text in the repository. Coding starts after approval. |
| 3 | Contracts v2 | `packages/shared` | ADR-004 vocabulary; per-minute record v2 (complete minutes only; optional pressure/temperature/dead time — absent, never 0; counts with live time; dead-time increments); time provenance; device geometry; multichannel events and sampled streams; device types as declarative definitions. Tests first. (B-M1-01…07, 23, 36) |
| 4 | Physics | `packages/physics`, `docs/science/THEORETICAL-FOUNDATION.md` | Dead time from measured live time; β fit (hourly, temperature covariate, significance gate, station's own P₀); hour-scale anomalies; spectrum and MPV from event amplitudes; noise threshold only as a suggestion; foundation erratum and amendments. Numeric known-answer tests; `physicist` review. (B-M1-03, 08…12, 35) |
| 5 | Simulator tier 1 | new `packages/simulator` | Seeded Poisson events with angular distribution, pressure modulation, Landau-like amplitudes, noise, dead time, gaps, resets, clock drift, N devices with true coincidences; output in any device-type format; a **virtual detector** the agent can read instead of a serial port. (B-M1-13) |
| 6 | Data layer v2 and rules v2 | `packages/data-provider`, `infra/firebase/` | Firestore for metadata, catalogue, summaries, calibrations, audit; a flat Realtime Database for per-minute series and the live window (series never nested under stations); pagination, error channel, quarantine counts; realtime retention by time with unique keys; no Cloud Storage. Rules for both databases; emulator tests with real identities (anonymous, other user, viewer, editor, owner, admin) for every collection and query; `security-reviewer`. (B-M1-14…19) |
| 7 | Agent daemon | `apps/agent` (rewrite) | Node 24 service: serial ingest with robust framing and reconnect; CosmicWatch device types; session controller; SQLite raw store and durable outbox; complete-minute records; hourly summaries and amplitude spectra; live window; sign-in with the owner's account and session persistence; rejected-write detection; local web panel (status, setup); raw-line mirror (log + socket) and `muonhub-agent capture`; works fully offline; NTP clock offset; systemd unit and install script; **v5 compatibility bridge** (decision B). (B-M1-20…29) |
| 8 | Firebase setup and first deploy | the `muonhub` project (maintainer) · `muonhub-dev` (decision A) | The maintainer follows `docs/operations/FIREBASE-SETUP.md` (Authentication, Firestore `nam5`, web app; App Check can wait for M2) and creates his MuonHub account. Then the v2 rules are deployed to `muonhub` — the first v6 deploy, done only after the emulator tests pass and with the maintainer's go-ahead at that moment. |
| 9 | Site access and format capture | the university PC (maintainer on site, then remote) | Tailscale with SSH (`docs/operations/REMOTE-ACCESS.md`); identify which v5 reader runs (Chrome Web Serial or the Python bridge); a ~10-minute capture with v5 paused to confirm the MuNRa columns and the dead-time meaning/unit; finalize the device type with real fixtures. (B-M1-34) |
| 10 | Measurements | `muonhub-dev` | Do short REST requests count toward the 100-connection limit? Bytes per live update and per poll; writes, reads, and bytes per stream-day. Results decide the public live mechanism (ADR-005 §6) — shown to the maintainer for approval. (B-M1-29) |
| 11 | Install and 72-hour validation | the university PC, `muonhub` | Install the agent as a service; v5 keeps recording through the compatibility bridge (or a planned v5 pause — decision B); 72 h of real data with scheduled disruptions: USB unplug/replug, a 1-hour network cut, an agent restart, a machine reboot. In parallel, 72 h of the virtual detector on `muonhub-dev`. |
| 12 | Review and close | docs, PR | Reviewers (code, security, silent-failure, physicist, docs); `docs/STATUS.md`, Stage Report in `docs/audit/`; PR #2. |

## How it is executed

- Steps 1–2 in sequence. After the spec gate: steps 3 → (4 ‖ 5) → 6 → 7, with parallel subagents on
  disjoint packages (physics and simulator in parallel; contracts first because everything depends
  on them).
- Steps 8–9 need the maintainer and can happen while steps 3–7 are being built.
- Every step ends in a versioned commit (`6.0.0-alpha.1.<n>`) pushed to the branch, with a short
  report in the chat. New decisions that appear on the way are brought to the chat, never taken
  silently.

## How it is validated

- **Tests:** unit and known-answer numeric tests (physics, simulator, contracts); emulator tests for
  the data layer and both rule sets with real identities; agent tests driven by the virtual detector
  (unplug, reconnect, offline/online, reset, reboot simulated).
- **Real practice (exit criterion):** 72 hours of the real detector writing to `muonhub`, with:
  - **USB unplug/replug** — remotely by unbinding the USB device through Linux sysfs (needs sudo), and
    once physically if someone is on site;
  - **a 1-hour network cut** — a temporary firewall rule that blocks only Firebase (Tailscale stays
    up) and removes itself automatically;
  - **an agent restart and a machine reboot** — the agent must resume by itself and restore its
    session.
- **Checks after the 72 hours:** only complete minutes; gaps exactly at the disruption windows; no
  duplicates; per-minute counts in the cloud match the local raw log; hourly summaries consistent;
  nothing lost across offline periods; rejected writes reported; measured quota use per stream-day
  within the budget; v5 kept recording (if the bridge is used).
- **Reviewers:** code-reviewer, security-reviewer (rules, auth, agent sign-in), silent-failure-hunter
  (serial, sync, listeners), physicist (physics, data semantics), docs-auditor.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `serialport` has had no release since Dec 2024 | low | prebuilt binaries cover Ubuntu x64; Go remains plan C (ADR-007) |
| `node:sqlite` is a release candidate in Node 24 | low | `better-sqlite3` behind the same storage interface |
| The MuNRa dead-time unit is unknown | certain until captured | step 9 capture before the device type is final |
| Short REST requests may count toward the 100 connections | unknown | measured in step 10 before anything depends on it; Firestore fallback |
| The university network blocks Tailscale | unknown | work on site; or an alternative remote path agreed with university IT |
| The v5 page uses Chrome Web Serial, not the bridge | unknown | switch the v5 page to its existing bridge mode (a v5 UI option, no code change); otherwise a planned v5 pause |
| Firebase SDK behavior in a long-running Node process | medium | exercised continuously by the 72-hour run and the virtual detector |

## Out of scope

Web interface, dashboards, public site and live page (M2); comparison, coincidences, calibration UI,
assembly editor (M3); Bring Your Own Detector terminal and catalogue, backups vault, alerts, external
data, Raspberry Pi and offline bundles (M4); v5 migration and cutover (M5); seismic and muography
(after 6.0.0). App Check enforcement (M2).

## Needs the maintainer's approval

- **A. Test environment `muonhub-dev`** (a separate free project for experiments, measurements, and
  the virtual detector) so `muonhub` only ever receives real data. Recommended. It is a different
  purpose, not load splitting, so it complies with Google's terms. The maintainer creates it; its
  configuration can be done by the Adjutant through the API, or by the maintainer.
- **B. v5 coexistence: a "v5 compatibility bridge" in the agent** — the agent serves
  `ws://localhost:8765` with the same messages as v5's Python bridge (`serial_data` lines,
  `bridge_info`, `ping`/`status`), so the open v5 page keeps recording to `munhub-1` while the agent
  owns the serial port. No v5 code changes; the Python bridge is stopped and the v5 page uses its
  bridge mode. Recommended; it also makes the M5 cutover painless. Alternative: a planned v5 pause.
- **C. Node 24 LTS for the whole repository** (not only the agent). Recommended.
- **D. Upgrade split:** zod, vitest, ESLint, TypeScript in M1; Next, React, maplibre with the web
  in M2. Recommended.
- **E. First-time setup in the agent's local panel** (sign in, create station, device, and stream)
  because the web app arrives in M2; the same wizard later serves offline and Bring Your Own Detector
  machines. Recommended over a command-line script.
- **F. Raw data retention on the PC:** keep every raw line with no automatic deletion (estimated
  ≈ 10–20 MB/day ≈ 4–7 GB/year at ≈ 2.4 events/s including database overhead — to be measured); configurable retention comes with
  the Raspberry Pi work in M4. Recommended.
- **G. One approval gate for the five specs** (step 2), then implementation proceeds with progress
  reports, stopping only for new decisions. Recommended.
- **H. Disruption tests need sudo on the university PC** (USB unbind/rebind, temporary firewall
  rule, reboot). Confirm that this access is acceptable.

## Execution log

| Version | Step | Notes |
|---|---|---|
| — | plan approved (2026-10-04) | decisions A–H as recommended |
| 6.0.0-alpha.1.1 | 1 — tooling and upgrades | Node 24, pnpm 11.28, TypeScript 6.0 (7 not yet supported by typescript-eslint), vitest 5, ESLint 10 (web keeps ESLint 9 until M2), Prettier check, Turbo fixes and `agentGuidance: false`, Tauri shell removed. zod 4 moves to step 3 with the new contracts. |
| 6.0.0-alpha.1.1.1 | 1 — fix | vitest 5 no longer excludes `dist/` by default, so compiled tests ran twice (246 instead of 145); `dist/` excluded in every vitest config. |
| 6.0.0-alpha.1.2 | 2 — specs drafted | 0083–0087 written and reviewed (physicist, security-reviewer, silent-failure-hunter); findings applied; awaiting the maintainer's spec gate. |
| — | spec gate | specs 0083–0087 approved 2026-10-07 with the recommendations: dedicated per-machine agent account as station editor; first-attempt web moved to `legacy/` (option b); proposed numeric defaults accepted. |
