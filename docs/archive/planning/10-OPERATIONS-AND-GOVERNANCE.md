# MunHub Lab v6.0 — Operations, Observability, and Data Governance

> Depends on: `01`, `05`. Two parts: (A) how the system is operated and observed in
> production; (B) how data is governed in an international multi-university network.

---

# Part A — Observability and Operations

## A1. Principles
- "If it cannot be observed, it cannot be operated." The entire platform emits structured
  logs, metrics, and errors; failures are detected before users report them.
- Start simple and cheap (compatible with Firebase now and Red Clara later).

## A2. Logging
- **Structured (JSON)** with severity levels, in the web app, API, agent, and AI jobs.
- `correlation_id` per request/synchronization for end-to-end tracing.
- The local agent stores rotated logs locally (diagnostics even when offline).

## A3. Error tracking
- Centralized exception capture (frontend and backend). Self-hostable and free option
  (e.g. **GlitchTip/Sentry self-hosted**) to avoid paid services and to run on Red Clara.
  In Phase A can start with logging + a simple dashboard.

## A4. Metrics and health checks
- **System health:** `/health` endpoints (web/API), DB status, job status.
- **Network health:** number of active/inactive stations, last data per detector, sync
  latency, detectors with gaps. (Reuses map state from S23, aggregated by city.)
- **Data metrics:** rows/min ingested, quarantine rate, storage usage
  (monitors Firebase limit — see R4).

## A5. Alerts
- Triggers: key detector down, backup job failure (critical!), migration error, storage
  usage above threshold, elevated error rate.
- Channel: email/webhook to admin. No noise: group and rate-limit alerts.

## A6. Runbooks (in `docs/technical/`)
- Procedures for: restore from cold backup, rotate secrets, migrate provider,
  re-sync a stuck agent, respond to "detector down". (Authored by the documentation role.)

## A7. Informal SLO (startup)
- Best-effort availability in Phase A; high-availability target with redundancy in Phase B.
- **Zero data loss** is the hard SLO (the 3-layer redundancy exists for this).

---

# Part B — Data Governance

## B1. Ownership
- Data from each detector **belongs to its owner/institution**. MunHub is custodian, not
  owner. The institution decides visibility and use.

## B2. Visibility and sharing policy
- Per **station**: **public / institution / private** (D24, see `11`).
- **ML consent (opt-out):** training is opt-in by default; a toggle in settings excludes
  a station from training (default at user level), with an honest message recommending
  keeping it enabled. The AI pipeline respects the opt-out. See `13`/`06`.
- **Optional embargo:** an institution can keep data private for a period and release it
  afterwards (supports the scientific practice of publishing first).
- Share with specific users/institutions (`detector_shares`).
- Public data → visible on landing/map and via export; private → owner/shared/admin only.

## B3. Data attribution and license
- Public data under **CC-BY 4.0** (D19) → requires attribution. (Code is MIT.)
- The UI displays who to attribute for each detector (institution + location).
- Data from **external APIs** (NMDB/NOAA/DONKI) are cited according to their terms (see `07`).

## B4. Terms of use and privacy
- **Terms** for institutions/users: what is collected, how it is backed up, what is made
  public according to their choice.
- **Minimal personal data:** only what is necessary for the account (email, name, institution,
  country, language). No over-collection. Allow account export/deletion.
- Detector scientific data is not personal, but precise location can be sensitive → allow
  showing an **approximate location** publicly if the institution prefers.

## B5. Retention and deletion
- Minutes: indefinite retention (scientific value). Realtime: short window.
- Deletion of a detector/account: with prior backup and, for publicly cited data,
  tombstone policy (do not break scientific references).

## B6. Compliance (pragmatic)
- No heavy legal framework at launch, but aligned with GDPR-like principles (minimization,
  consent, right to export/delete) given the international network. Review with USFQ.

---

## Resolved decisions
- ✅ Public data license = **CC-BY 4.0** (D19).
- ✅ Public map = **aggregation by city** (D20); exact location (lat/lon) is stored but
  NOT exposed on the public map (city only). Available in shared/private data.

## Pending product decisions (for the maintainer)
- Allow temporary data embargo? How long by default? (Round B)
