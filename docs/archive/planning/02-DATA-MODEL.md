# MunHub Lab v6.0 — Data model and migration

> Depends on: [`00-MASTER-PLAN.md`](00-MASTER-PLAN.md), [`01-ARCHITECTURE.md`](01-ARCHITECTURE.md).
> Defines the canonical v6 schema (**two-level model: Station + Detector**, D21), its mapping
> to Firebase (Phase A) and Postgres/TimescaleDB (Phase B), the mandatory metadata, and the
> v5→v6 migration with backward compatibility.
> **Guiding principle (D23):** the more informative, configurable, and adjustable, the better.
> Store **every metadata field possible**; expose advanced settings without obstructing the basic flow.

---

## 1. Vocabulary (resolves the "detector device" vs "Detector profile" collision)

| v6 term | What it is | Was in v5 |
|---|---|---|
| **Institution** | University/organization that groups users and stations | organization |
| **User** | A person's account | user |
| **Station** | The registered **profile/site**: location, metadata, visibility. What appears on the map and has an owner/institution. | profile |
| **Detector** | The physical CosmicWatch **device** inside a station: device token, firmware, calibration. DATA belongs to the detector. | (did not exist separately) |
| **Session** | One data-taking run of a detector | session |

> "Detector" now ALWAYS means the physical device. "Station" is the profile.

---

## 2. Entities and relationships

```
Institution 1 ── N User           (institution_id on User, NULLABLE → independent)
Institution 1 ── N Station        (institution_id on Station, NULLABLE)
User        1 ── N Station        (owner_uid; + station_shares for sharing)
Station     1 ── N Detector       (normally 1; several with a consistency notice)
Detector    1 ── N Session
Detector    1 ── N MinuteRecord   (time series, indefinite retention)
Detector    1 ── N RealtimeRecord (short window, expires)
Detector    1 ── 1 LatestRecord
ExternalEvent (global, from APIs)  (NMDB, NOAA, DONKI, Dst/Kp)
AiInsight   N ── 1 Detector/Station (ML results, Phase 7)
```

- **Data (sessions, minutes, realtime) hangs off the Detector** (because calibration is
  per device). For a single-detector station (the 99% case) it is 1:1 and the UI renders it
  transparently. The **Station view aggregates** its detectors.
- A **coincidence Station** (muon telescope) = a station with ≥2 detectors
  (future; the schema already supports it).

---

## 3. Metadata (MANDATORY fields marked ✓; the rest optional but desirable)

### Station (site/profile)
| Field | Type | Req. | Note |
|-------|------|--------|------|
| name | string | ✓ | human-readable name |
| owner_uid | string | ✓ | owner |
| institution_id | string\|null | — | null = independent |
| **visibility** | enum(public/institution/private) | ✓ | **mandatory choice at creation, NO default** (D22, D24) |
| ml_training_opt_out | bool | — | exclude this station from ML training (default: use the user's preference) |
| embargo_until | date\|null | — | private until this date, then public (optional capability) |
| **latitude** | number | ✓ | decimal degrees (**manual** entry, not geolocation) |
| **longitude** | number | ✓ | decimal degrees (manual) |
| **altitude_m** | number | ✓ | meters above sea level (key for flux) |
| city | string | ✓ | (defines the map bubble, D20) |
| country | string ISO-3166 | ✓ | |
| **placement** | enum(ground/indoor/basement/underground/outdoor/rooftop) | ✓ | affects shielding |
| **type** | enum(single/coincidence) | ✓ | station type |
| timezone | string IANA | ✓ | diurnal analysis |
| floor, shielding, orientation, notes | various | — | the more, the better (D23) |

### Detector (physical device)
| Field | Type | Req. | Note |
|-------|------|--------|------|
| id, station_id | — | ✓ | belongs to a station |
| label | string | — | "main", "upper", etc. |
| **device_token** | string | ✓ (auto-generated) | device identity; **does not obstruct registration**; visible in advanced settings; enables the "different device" notice |
| **hardware_model** | string | ✓ | e.g. "CosmicWatch v2" |
| **firmware_version** | string | ✓ | store everything possible |
| hw_version | enum(v2/v3X/…) | ✓ | defines **τ_DT** (v2≈50 ms, v3X≈400 µs) |
| sipm_count | int | ✓ | 1 by default |
| **calibration** | object | — | `{ adc_to_mv:[…], saturation_mv, trigger_adc_min }`. **Defaults per hw_version**; **optional advanced editing** + "reset to defaults" button |
| status | enum(active/inactive) | ✓ | |

> **Backward compatibility (ADR-004):** v5 stations/users without metadata are imported
> regardless (null) and the app shows a **non-intrusive notification** to complete them. They
> are required only for **new registrations**. The migration automatically creates **one
> Detector** per v5 profile with defaults + a generated token.

> **Consistency notice (device-token case):** if data arrives with a device_token different
> from the one registered on a Detector (or editing is shared and another device connects),
> the app warns: "mixing devices is not recommended; calibration may differ and affect
> consistency; we suggest creating a new station/detector". If the user proceeds, the Detector
> keeps several registered devices (traceable).

---

## 4. Time-series records (scientific core) — per Detector

### MinuteRecord (indefinite retention) — **averages, NEVER sums**
| Field | Unit | Description |
|-------|--------|-------------|
| ts | epoch ms | start of the minute |
| ec | counts/min | event rate (charged particles) |
| cc | counts/min | coincidences/min (meaningful only when `type=coincidence`) |
| sm / sx / sn | mV | SiPM amplitude avg/max/min (the firmware already delivers mV) |
| tp | °C | temperature |
| pr | hPa | atmospheric pressure |
| dt | % | dead time |
| *(derived — `packages/physics`)* | | |
| ec_dt | counts/min | dead-time corrected: `R/(1−R·τ_DT)` |
| ec_corr | counts/min | pressure corrected (on top of `ec_dt`), **LOCAL β via regression** |
| flux | 1/cm²/min | if an effective area is configured |

> **Pipeline (mandatory order):** raw → dead time → barometric (local β) → thermal.
> See `docs/research/THEORETICAL-FOUNDATION.md` §4 and §8.

### RealtimeRecord (short window, expires)
Per event: `ts`, `sipm_mv`, `temp`, `deadtime`, … Retention 8 min (cap 5000 in Firebase;
retention policy in Postgres).

> **v5 inconsistencies reconciled in `packages/shared`:** canonical dead time = **`dt`**
> (not `d`); pressure in **hPa**; `cc` = coincidences (not "muons", see §7).
> **Non-negotiable invariants:** averages never sums; no event filtering; gaps ≥2 min break
> the line; realtime >8 min → auto-expiry. Validated with `zod` in `packages/shared`.

---

## 5. Phase A schema — Firebase (munhub-1)

```
/users/{uid}                       → role, displayName, email, institution_id, country, language
/institutions/{id}                 → name, country, city, admin_uids, website, logo_url
/stations/{id}                     → owner_uid, institution_id, visibility, embargo_until,
  │                                   latitude, longitude, altitude_m, city, country,
  │                                   placement, type, timezone, floor, shielding, notes,
  │                                   shares/{uid}: 'view'|'edit'
  └─ detectors/{detId}             → device_token, hardware_model, firmware_version,
       │                              hw_version, sipm_count, calibration{…}, status
       ├─ sessions/{sid}/minutes/{ts}
       ├─ realtime/{ts}            (.indexOn ts)
       └─ latest
/external_events/{source}/{id}     → cache of external APIs
```
Rules: deny-by-default; `stations` public/unlisted readable by anyone; private only
owner/shared/institution admin/global admin (see `05`).

## 6. Phase B schema — Postgres + TimescaleDB

```sql
institutions(id pk, name, country, city, website, logo_url, created_at)
users(uid pk, email, display_name, role, institution_id fk null, country, language, created_at)
stations(id pk, name, owner_uid fk, institution_id fk null, visibility, embargo_until,
         latitude, longitude, altitude_m, city, country, placement, type, timezone,
         floor, shielding, orientation, notes, created_at)
station_shares(station_id fk, uid fk, permission)
detectors(id pk, station_id fk, label, device_token, hardware_model, firmware_version,
          hw_version, sipm_count, calibration jsonb, status, added_at)
sessions(id pk, detector_id fk, started_at, ended_at, source_file_hash)

-- TimescaleDB hypertables
minute_records(detector_id fk, ts timestamptz, ec, cc, sm, sx, sn, tp, pr, dt,
               ec_dt, ec_corr, flux)        -- PK (detector_id, ts) → hypertable
realtime_records(detector_id fk, ts timestamptz, sipm_mv, temp, deadtime, …)  -- + retention
external_events(id pk, source, kind, ts, payload jsonb, fetched_at)
ai_insights(id pk, station_id fk null, detector_id fk null, kind, ts_range, result jsonb,
            model_version, confidence)
```
- TimescaleDB: hypertables + continuous aggregates (hour/day) for long-range charts.
- Row-level RLS equivalent to the Phase A rules. Indexes on `(detector_id, ts)` + geospatial
  (lat/lon) for the map.

---

## 7. Scientific note on `cc`/"muons" (honesty, D7/D9)

A single SiPM does NOT distinguish muon/electron/gamma (all MIP ~2 MeV —
`THEORETICAL-FOUNDATION.md` §5). Therefore:
- Station `type=single`: primary metric = **"Integral charged-particle / MIP-type rate"**,
  NOT "muons". Show the **amplitude spectrum (Landau, MPV)**. Muon dominance (75–80% at sea
  level) is only **aggregate** and **lower at altitude** (Andes).
- Station `type=coincidence`: `cc` IS a muon selection (>99% purity) + directionality.
- The UI takes the exact wording from the theoretical report for tooltips.

---

## 8. Migration v5 → v6

1. **v5 export:** the source is the **cold dump** `private/munra-1_realtime_database_backup/
   *_data.json.gz` (~1GB; munra-1 is disabled due to quota, R1). Decompress and read
   `/profiles`, `/users`, `/organizations` from the file (not from the live DB).
2. **Transform** (adapter in `data-provider`/`shared`):
   - `profile → Station` (+ null metadata) **+ create a Detector** with calibration defaults
     per hw_version + a generated `device_token`.
   - `organization → Institution`; `sharedWith → station_shares`.
   - Normalize: `d→dt`, pressure to hPa; validate with `zod` (quarantine what is invalid).
   - Move `sessions/minutes`, `realtime`, `latest` under the created Detector.
3. **Load** via `DataProvider.importAll()` (target: munhub-1 in Phase A).
4. **Report:** migrated rows, quarantined rows, stations without metadata (→ notification).
5. **Idempotent and resumable** (natural key `(detector_id, ts)`).

> The same machinery **imports an external DB from file** (admin, F5) via an input adapter
> that maps the external format to the v6 schema.

---

## 9. Retention and performance

| Data | Retention | Mechanism |
|------|-----------|-----------|
| minute_records | Indefinite | hypertable + continuous aggregates |
| realtime_records | 8 min | retention policy / cap 5000 (Firebase) |
| external_events | Configurable (~2 years) | cleanup job |
| cold backups | Rotation (30 daily + 12 monthly) | job → Cloudflare R2 |

Long-range charts: continuous aggregates (Phase B); LTTB max 500 pts (Phase A).

---

## 10. Ecosystem entities and account fields

**User (key fields, D25):** `uid`, `email` (unique), **`username` (unique)**, `display_name`,
`role`, `institution_id` (null), `country`, `language`, `email_verified` (bool),
`ml_training_opt_out` (bool, default false), `directory_opt_in` (bool, searchable by username).

**Institution:** `id`, `name`, `country`, `city`, `admin_uids`, `website`, `logo_url`,
`default_station_visibility` (suggested).

**Station networks (D27, see `14`):**
- `networks(id, name, description, owner_uid, institution_id null, visibility, created_at)`
- `network_stations(network_id, station_id)`  — N:N

**Sharing (already referenced):** `station_shares(station_id, uid|institution_id, permission[viewer|editor])`.

**Support and notifications (see `12`):**
- `support_tickets(id, user_uid, category, status, subject, context jsonb, created_at, updated_at)`
- `ticket_messages(id, ticket_id, author_uid, body, attachments, created_at)`
- `notifications(id, user_uid, type, payload jsonb, read_at, created_at)`
- `notification_prefs(user_uid, type, channel, frequency)`

**Administration (see `15`):**
- `audit_log(id, actor_uid, action, resource_type, resource_id, diff jsonb, ip, created_at)` — append-only.
- `feature_flags(key, enabled, scope)`; `announcements(id, body, audience, starts_at, ends_at)`.

**Monetization — hooks only, no billing (D26, see `13`):**
- `plans(id, name, limits jsonb)`; `entitlements(subject_type, subject_id, plan_id, valid_until)`
- `usage_events(id, subject_type, subject_id, kind, amount, ts)` — metering (observation).

> All these entities respect deny-by-default, RLS/rules, and the audit log. Most belong to
> phases F4–F7; the base schema (username, institutional visibility, ML consent,
> entitlements) is included from F1 to avoid migrating later.
