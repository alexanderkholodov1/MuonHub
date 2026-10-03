# Session record — 2026-10-03

> Continues [`2026-10-02-V6-RESET-SESSION-RECORD.md`](2026-10-02-V6-RESET-SESSION-RECORD.md). Records
> what the maintainer approved and asked in the chat on 2026-10-03, the explanations given, and what
> remains open. Verification labels: [verified], [verified by running], [reported].

## 1. Approved by the maintainer

| # | Approval |
|---|---|
| 1 | **Terminology** (ADR-004): Device, Device type, Station, Assembly, Stream, Session, Calibration, Recipe, View, Agent. |
| 2 | **Agent as a headless daemon** instead of Tauri (ADR-007) — "lighter and independent of other applications". |
| 3 | **Private backup vault repository** — approved; designed and built in M4. |
| 4 | **Firebase setup by the maintainer himself** in the web console, to learn how Firebase works (guide: `docs/operations/FIREBASE-SETUP.md`), at the start of M1. |
| 5 | **Branches:** rescue the best of the archived specs and the status-pill branch into v6; close the branches. |
| 6 | **M0 plan** ([`../product/plans/M0-foundation.md`](../product/plans/M0-foundation.md)) and the **milestone structure** M0–M5 with seismic and muography after 6.0.0. Every later milestone's complete step plan is shown and approved before execution. |
| 7 | **Firestore location `nam5`** (confirmed 2026-10-02). |

## 2. Requirements stated

- The public site has a landing page, supporting pages (About, the scientific background, and more),
  **and a separate page where anyone can watch something demonstrative of what public detectors
  capture**.
- Agent memory features are not used because the workstation account is shared; state lives in the
  repository.

## 3. Explanations given (plain language)

- **Public live demo (ADR-005 §6, Proposed):** the agent copies the last minutes of public streams to
  a "showcase" location; anonymous visitors ask briefly for new data every few seconds only while the
  page is visible, instead of holding one of the 100 simultaneous database connections. Whether short
  requests count toward that limit is measured in M1 before anything is built on it. The earlier idea
  of serving live data from Hosting was withdrawn (Hosting publishes files by deploys).
- **Load balancing across Firebase projects: rejected.** Google Cloud Terms §3.3 and Google APIs
  Terms §2.d forbid using several projects to circumvent quotas [verified — official terms read];
  the risk is suspension of the projects or the account. Legitimate: different products in one
  project; old projects for other purposes (e.g. testing).
- **Why a private vault:** Spark has no automatic backups (RTDB automated backups are Blaze-only
  [verified — official docs]); the agent's local copy protects only its own machine's raw data.

## 4. Findings during M0

- **First station altitude [verified by running]:** the live v5 station's barometer reads
  76,785 Pa ≈ 768 hPa (read-only, authorised), i.e. roughly 2.3–2.4 km — the USFQ campus in
  Cumbayá, not central Quito (≈ 2,850 m, ≈ 730 hPa). Affects the barometric reference pressure.
- **Emulator test timing [verified by running]:** the first-attempt realtime-cap test takes ≈ 12 s
  in CI and exceeds its 20 s timeout on the development machine — a symptom of the pruning design
  replaced in M1.
- **Physicist review gap [verified]:** the rules required a physicist review that no reviewer could
  run; a `physicist` reviewer was added (usable as an agent type from the next session).
- **Correction of an Adjutant statement:** the status-pill lesson is that, after a reboot, the v5
  uploader's session was not restored and its writes were silently rejected — not that "the
  uploader did not come back".

## 5. Open — needs the maintainer

See [`../STATUS.md`](../STATUS.md) (§ Open questions): wording proposed by the Adjutant in ADR-004,
ADR-006, ADR-008, and ADR-009; the public live demo mechanism; the website contact address; the
staging environment.
