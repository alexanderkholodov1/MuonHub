# MunHub Lab v6.0 — Redundancy and Security

> Depends on: `00`–`02`. **System priority #1: the safety of the data.**
> Covers EPIC-9 (S35–S38) and reinforces EPIC-3/8. Mandatory reading for the DB and
> security engineers.

---

## 1. Three-layer redundancy model

| Layer | What | Where | When | Failure it covers |
|------|-----|-------|--------|-----------------|
| **1. Edge** | Local backup | SQLite on each detector PC (Tauri agent) | Real time, before upload | Internet outage, cloud outage, or platform downtime (maintenance/update) |
| **2. Primary** | Online DB | Firebase munhub-1 → Supabase/Postgres | Real time | Loss of the local PC; global access |
| **3. Cold** | Compressed backups | Cloudflare R2 | Scheduled job (daily + weekly/monthly) | Corruption/deletion of the primary; provider down |

**Principle:** no datum exists in a single copy. The edge is the local source of truth;
the primary is the shared source of truth; the cold layer is the insurance.

### Recovery scenarios (DR)
- **Internet down on site:** the agent keeps recording to SQLite; when the network returns,
  it syncs what is ahead (idempotent by `(detector, ts)`).
- **Platform under maintenance/update:** same as above; the edge does not depend on the web
  to record.
- **Corruption/deletion in the primary:** restore from the latest cold backup (R2) +
  re-sync from the local SQLite databases (which may be further ahead).
- **Provider migration:** `exportAll → importAll` (see `01-ARCH §3`), with verification.

---

## 2. Cold backups (S35/S36)

- **Generation:** a scheduled job uses `DataProvider.exportAll()` (streaming, paginated) →
  compressed file (gzip/zstd) + **checksum (SHA-256)** + manifest (range, count, version).
- **Destination:** Cloudflare R2 (S3-compatible). Private bucket; credentials per environment.
- **Rotation:** e.g. 30 daily + 12 monthly (configurable). Automatic cleanup.
- **Restoration:** verify checksum → `importAll()` into the target → row report.
- **Restore test:** a periodic job validates that the latest backup is restorable
  (restore-to-temp + count), not merely that it exists. An untested backup does not count.

---

## 3. Integrity verification (S38)

- **Idempotency and deduplication** by natural key `(detector_id, ts_minute)`.
- **Gap detection** (≥2 min) — already exists in v5; it is reported, never filled with
  fabricated values.
- **Checksums** on backups; **cross counts** local vs primary vs cold.
- **Quarantine** for records that fail `zod` validation (not discarded: isolated for review).
- **Scientific invariants** (averages never sums; no event filtering) validated at write time.

---

## 4. Authentication and authorization

- **Auth:** Firebase Auth (Phase A) → Supabase Auth (Phase B), behind the `DataProvider`.
- **Roles** (from DB, never hardcoded): `admin` (global), `institution_admin` (their
  institution), `user`, `guest`.
- **Hybrid tenancy:** Institution→Users→Detectors + independent users.
- **Permission matrix (summary):**

| Action | guest | user (owner) | institution_admin | admin |
|--------|:----:|:----:|:----:|:----:|
| View public station | ✓ | ✓ | ✓ | ✓ |
| View/edit own station (and its detectors) | — | ✓ | ✓ (within their institution) | ✓ |
| Share station | — | ✓ | ✓ | ✓ |
| Manage users of their institution | — | — | ✓ | ✓ |
| Admin console / DB migration | — | — | — | ✓ |

---

## 5. Rules / RLS (deny-by-default)

- **Phase A (Firebase rules):** port v5 with renames (`profiles→stations`, detectors as a
  subnode of the station, `organizations→institutions`); **public** read for `public`
  stations, **institutional** read for members of the owning institution, and `private` only
  owner/shared/admin (D24, see `11`). Deny-by-default for everything else.
- **Phase B (Postgres RLS):** one policy per table and action, equivalent to the rules.
  Nothing readable/writable without an explicit policy.
- **Rules tests:** a suite that verifies allowed and **denied** accesses (negative cases).

---

## 6. Secret handling

- `private/` (munhub-1 service account) and `.env` → in `.gitignore`. **Never commit.**
- `.env.example` documents variables without real values.
- In production: injection via environment variables / the server's secret manager.
- Key rotation documented; Firebase client keys (web apiKey) are not secret,
  but access is limited by the rules.

---

## 7. Threats considered (summary)

| Threat | Mitigation |
|---------|-----------|
| Data deletion/corruption | 3 layers + tested backups + quarantine |
| Unauthorized access | deny-by-default + DB roles + negative tests |
| Secret leakage | secrets outside the repo + rotation |
| Detector spoofing (fake data) | user auth + per-detector `device_token` (notice on change); per-device RLS hardening in Phase B |
| Provider loss (Firebase/R2) | agnostic layer + backup on a different provider |
| Invalid data injection | `zod` validation + idempotency + invariants |

> **Evolution (post Red Clara):** active Postgres replica (primary+replica) and, where
> applicable, a per-detector signature/key for authenticity of the submitted data.
