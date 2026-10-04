# MunHub Lab v6.0 — Station and Detector Lifecycle

> Depends on: `01`, `02`, `05`, `docs/research/THEORETICAL-FOUNDATION.md`.
> Two-level model (D21): **Station** = profile/site; **Detector** = physical device.
> Principle (D23): **maximum informativeness/configurability/adjustability**, without
> obstructing the basic flow. Affects EPIC-3 (auth), EPIC-4 (agent), and scientific integrity.

---

## 1. Stages

```
Create Station → Register Detector(s) → Calibration → Operation → Maintenance → Decommission
```

## 2. Create Station (web)

- The user creates the station with its **site metadata** (`02 §3`): name, location
  (**lat/lon/altitude entered manually**, no automatic geolocation), city/country,
  deployment setting, `type` (single/coincidence), timezone.
- **Visibility = mandatory choice, no default** (public/private/unlisted); optional
  **embargo** (private until a date → then public).
- CosmicWatch compatibility: no special hardware requirements.

## 3. Register Detector(s) (physical device)

- Within the station, register ≥1 Detector with: `hardware_model`, `firmware_version`,
  `hw_version` (v2/v3X → τ_DT), `sipm_count`.
- The system **generates a `device_token`** for the device — **without slowing down
  registration** (transparent). Visible later in the detector's **advanced settings/metadata**.
- **Agent pairing:** the Tauri agent connects by the owner logging in and selecting the
  station/detector (or entering a code). Stores secure local credentials and tags its
  transmissions with the `device_token`.
- **Origin auth (D-auth):** Phase A → user auth + rules that validate permission over the
  station; `device_token` used for **identity/consistency warning**. Phase B → optional
  enforcement with per-detector credential (RLS per device).

### Consistency warning (multi-device)
If data arrives with a `device_token` different from the registered one (shared editing, or
the owner connects another device to the same Detector), the app **issues a prominent warning**:
*"Mixing devices is not recommended: calibration may differ and affect data consistency.
Consider creating a new Detector/Station."* If the user proceeds, the Detector records
multiple devices (fully traceable).

## 4. Calibration (scope and meaning)

The platform **does not perform physical calibration**; it stores constants so that
calculations are correct. **Good news:** CosmicWatch firmware **already delivers mV and dead
time**, so in practice the `hw_version` (for τ_DT) is sufficient. Still, per principle D23:

- **Defaults by `hw_version`** applied automatically (zero friction for 99% of users).
- **Optional advanced editing** (in detector advanced settings): `adc_to_mv`,
  `saturation_mv` (~180–200 mV), `trigger_adc_min`, τ_DT override — for users who
  calibrated their hardware with an oscilloscope. Includes a **"restore defaults"** button.
- Data is tagged with the `calibration`/`model_version` in effect at capture time
  (scientific traceability). Without a valid calibration → reported raw, marked "uncalibrated".

## 5. Operation

- The agent: reads serial → **persists to SQLite (layer 1)** → computes derivatives **at the
  edge** (per-minute averages, dead-time correction, validation) → syncs via `DataProvider`
  with an idempotent offline queue (`01 §4`).
- The station shows **active/inactive** status (feeds the landing map, S23, aggregated by city).

## 6. Maintenance

- **Agent auto-update (D-update):** **automatic in the background**, signed, applied on
  restart and **never interrupts recording or causes data loss**.
- **Recalibration:** the user can adjust calibration; traceable via `model_version`.
- **Relocation/hardware change:** update metadata (new altitude/setting changes the physics)
  → a **new segment** is marked to avoid mixing regimes; if the physical device changes,
  register a new Detector.

## 7. Decommission
- Station/Detector is marked inactive/archived **without deleting historical data** (indefinite
  retention). Deletion only by admin, with prior backup (tombstone for publicly cited data).

---

## 8. Resolved decisions
- ✅ Auth: user + manual registration; `device_token` from F1 for identity/warning; per-detector
  enforcement in Phase B.
- ✅ Calibration: hardware defaults + **optional advanced editing** + reset; store all metadata
  (including firmware).
- ✅ Auto-update: automatic in background, without interrupting recording.
- ✅ Visibility: mandatory choice at station creation, no default; optional embargo.
