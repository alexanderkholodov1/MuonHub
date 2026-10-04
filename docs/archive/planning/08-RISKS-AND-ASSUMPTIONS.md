# MunHub Lab v6.0 — Risks and Assumptions

> Depends on: `00`–`07`. Living register. Any agent that identifies a new risk adds it here.
> Severity = Impact × Probability. Each risk has a **mitigation** and an **owner**.

---

## 1. Technical risks

| # | Risk | Sev. | Mitigation | Owner |
|---|------|------|-----------|-------|
| R1 | `munra-1` RTDB over quota and disabled (~1 GB). Cannot be read via the live API. | 🟢 **MITIGATED** | ✅ **Cold backup secured** (Console *Export JSON*, ~1.05 GB uncompressed) in `private/munra-1_realtime_database_backup/`. **Migration S07 will run from this dump**, not from the live DB. Risk of losing v5 historical data → resolved. | Alexander ✓ |
| R2 | **Loss of data from the only real detector** during the v5→v6 transition. | 🔴 High | Do not shut down the v5 pipeline until the v6 MVP is writing in parallel and validated; temporary dual-write if needed. | DB Eng. |
| R3 | **Fleet clock desynchronization.** Agent timestamps depend on the host PC clock; drift affects gaps, ordering, and future coincidence detection. | 🟠 Medium | Agent synchronizes via **NTP** and records offset; timestamps in UTC; document detector timezone (already in metadata). Coincidence detection by software assumes ~10 ms window (see foundation §7). | Agent Dev |
| R4 | **Firebase munhub-1 quota/cost limit** (free plan ~1 GB) saturates again before migration to Red Clara. | 🟠 Medium | Efficient schema + realtime retention + cold backups to R2 + usage monitoring; corrections/derivatives computed at the edge (not inflating the DB). If it grows, switch to controlled Blaze plan. | DB Eng. |
| R5 | **Web Serial / drivers** fail on certain OS/browser combinations. | 🟡 Low | The **Tauri agent** is the primary path (browser-independent); Web Serial is only a shortcut in Chromium. | Agent Dev |
| R6 | **Accidental SDK coupling** (bypassing the DataProvider) breaks Firebase↔Supabase portability. | 🟠 Medium | Lint/review rule prohibiting direct SDK imports outside `data-provider`; the architect enforces this in PRs. | Architect |
| R7 | **Firebase→Supabase migration with data loss** (type/precision issues). | 🟠 Medium | Adapters with `zod` validation, quarantine reporting, round-trip export/import tests before the switch. | DB Eng. |

## 2. Scientific risks

| # | Risk | Sev. | Mitigation |
|---|------|------|-----------|
| R8 | **Scientific over-promise** (labeling "muons" with a single-SiPM detector, anomalies over 1-minute windows). | 🔴 High | Physics agent veto; "charged-particle / MIP-type" nomenclature; multi-hour windows + 3σ (foundation §5, §10). |
| R9 | **Barometric β incorrectly applied** (using a universal coefficient). | 🟠 Medium | **Local β by regression** per node; tests against ranges from foundation §8. |
| R10 | **Dead-time correction omitted** → systematic underestimation. | 🟠 Medium | `packages/physics` applies `R/(1−R·τ_DT)` as mandatory; τ_DT per hardware version. |

## 3. Project / organizational risks

| # | Risk | Sev. | Mitigation |
|---|------|------|-----------|
| R11 | **Uncertain adoption** (8 universities interested, unconfirmed). | 🟡 Low | Design for scale but deploy modestly (conservative/recommended tier); do not over-invest in infrastructure before traction. |
| R12 | **Agent drift** (building outside the spec). | 🟠 Medium | SDD with human gates; AGENTS.md; orchestrator; "no code without a spec". |
| R13 | **Single-maintainer dependency** (Alexander). | 🟠 Medium | Comprehensive documentation (EPIC-12) + monorepo + specs for external onboarding. |
| R14 | **Red Clara delays or does not deliver** the requested resources. | 🟠 Medium | Phase A (Firebase) is self-sufficient; the provider-agnostic layer allows indefinite cloud operation if needed. |

---

## 4. Assumptions (to confirm)

- **A1:** ✅ **RESOLVED.** munra-1 was disabled due to quota, but the v5 historical data is
  already backed up as a **cold dump** (`private/munra-1_realtime_database_backup/`, ~1 GB).
  Migration will use the dump.
- **A2:** The USFQ detector emits one of the 4 serial formats already supported in v5.
- **A3:** `munhub-1` starts on the free plan; will move to Blaze if volume requires.
- **A4:** τ_DT for current hardware ≈ 50 ms (CosmicWatch v2) — confirm actual version.
- **A5:** A public detector is available for the live demo on the landing page (F3).
- **A6:** Red Clara will provide a Linux server with Docker (tiers in `RED-CLARA-RESOURCE-TIERS.md`).

> **Recommended immediate action (before F1):** validate A1/R1 — confirm that the historical
> data can be extracted from `munra-1` and a cold dump saved. Highest-impact risk.
