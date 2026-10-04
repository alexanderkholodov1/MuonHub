# MunHub Lab v6.0 — External API Integration

> Depends on: `00`–`02`. Covers EPIC-7 (S26–S29). All sources are **free and unpaid**.
> Goal: correlate detector data with space weather and cosmic/geomagnetic events to
> explain flux variations.
>
> ⚠️ Exact endpoints/formats must be **verified at implementation time** (APIs change).
> This document fixes which source, which data, and for what purpose; the developer confirms
> current URLs/parameters.

---

## 1. Selected sources (D11)

| Source | Contribution | Rationale | Auth |
|--------|-------------|-----------|------|
| **NMDB** (Neutron Monitor Database) | Near-real-time neutron monitor counts; Forbush decreases | **Most comparable** to charged-particle rates: both track the cosmic-ray flux | No key required (academic use; cite) |
| **NOAA SWPC** | Solar wind, Kp index, flares, geomagnetic alerts | Solar "drivers" that explain flux variations | No key required (open JSON) |
| **NASA DONKI** | Event catalog: CMEs, flares, shocks | Mark point events on charts | Free API key (DEMO_KEY or own key) |
| **Dst/Kp indices** (Kyoto WDC / GFZ Potsdam) | Geomagnetic indices | Correlation with equatorial cutoff rigidity (Ecuador advantage) | No key required (cite) |

---

## 2. Data obtained from each source

- **NMDB:** count series per station (via NEST / real-time data service).
  Use 1–2 reference stations plus one low-rigidity station for contrast. Hourly/minutal
  resolution. Purpose: detect Forbush decreases and compare with corrected rate.
- **NOAA SWPC:** JSON products (e.g. solar wind plasma/mag, planetary Kp, GOES X-ray flares).
  Sub-hourly resolution. Purpose: solar context and triggers.
- **NASA DONKI:** CME/flare/SEP queries by date range. Purpose: event annotations on charts
  ("CME on …").
- **Dst/Kp:** hourly/3-hour index. Purpose: geomagnetic activity level for correlation.

---

## 3. Ingestion design

```
[Scheduler] ─▶ [Per-source Fetcher] ─▶ [Normalizer] ─▶ external_events (local cache)
                     │ (respects rate limits,                    │
                     │  retries, backoff)                        ▼
                     └─────────────────────────────▶ [UI: overlays/correlation]
```

- **Local cache mandatory:** never query an external API directly from the user's browser
  on each view. A scheduled job fetches data and stores it in `external_events`; the UI
  reads from the project database. (Protects rate limits, enables offline use and speed.)
- **`external_events` schema** (see `02-DATA-MODEL`): `{id, source, kind, ts, payload jsonb,
  fetched_at}`. `payload` stores the normalized raw data.
- **Idempotency:** key `(source, kind, ts)` prevents duplicates on re-fetch.
- **Rate limits / courtesy:** reasonable fetch intervals; backoff; identifiable User-Agent;
  **cite/attribute** each source in the UI (academic requirement).
- **Fault tolerance:** if one source is unavailable, the others continue; the UI marks data
  as "stale".

---

## 4. Correlation views (S29)

- Overlay of external events (CMEs, Forbush decreases, Kp peaks) as markers/bands over
  detector time series.
- **Charged-particle rate vs. neutron comparison (NMDB):** two aligned series; highlight
  simultaneous Forbush decreases (cross-validation of data).
- **Lag/correlation analysis** with Kp/Dst/solar wind (supports AI capability C6).
- All scientific language reviewed by the physics agent.

---

## 5. Per-source contracts (to be completed at implementation)

For each source, the backend developer documents in the spec: current base URL,
endpoints/parameters, response format, temporal resolution, limits, terms of use/attribution,
and the exact mapping to `external_events`. Keep that documentation alongside the fetcher code.

---

## 6. Out of scope
- Paid sources or sources with restrictive quotas.
- Re-distributing raw third-party data without adequate attribution/licensing.
