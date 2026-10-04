# ADR-004 — Terminology and domain model

- **Status:** Accepted
- **Date:** 2026-10-03
- **Supersedes:** D21 (Station → Detector entity model)

## Context

- v5 used **"profile"** for a site *and* the place where its data lived.
- The first v6 attempt split this into **Station** (site) and **Detector** (device). In practice,
  "detector" ended up meaning two different things: the physical device, and the space in the
  platform where that device's data is stored (e.g. "data belongs to a detector",
  `detector_index`). The maintainer kept thinking in v5 terms because the new vocabulary never
  separated the two cleanly.
- What is coming makes the ambiguity untenable:
  - **Bring Your Own Detector:** users define their own kinds of hardware.
  - **Multichannel devices:** a muograph with ~20 channels.
  - **Non-particle instruments:** a seismometer.
  - **Stacked assemblies** for coincidences.
  - **Several analysis views** of the same data (ADR-006).
- The proposal "device profile" was rejected by the maintainer because it collides with the v5
  meaning of "profile".

## Decision

The following vocabulary is binding in the domain model, code, schemas, security rules, UI, and
documentation. The Spanish column gives the term used in the chat and in the Spanish UI translation.

| Term (EN) | ES | Definition | Example |
|---|---|---|---|
| **Device** | Dispositivo | **Always** the physical hardware unit. | "CosmicWatch #3" |
| **Device type** | Tipo de dispositivo | The definition of a kind of hardware: output format, columns, units, channels, default geometry. This is what users create and share in Bring Your Own Detector. | "CosmicWatch v3X" |
| **Station** | Estación | The place and setup where devices are installed: location, public display precision, and visibility (public, institution, private). | "USFQ lab, rooftop" |
| **Assembly** | Montaje | The physical arrangement of devices in a station: stacking, separation, offsets, tilt. Used for per-area normalisation and coincidence acceptance. | "2 CosmicWatch stacked 5 cm apart" |
| **Stream** | Flujo de datos | **The space in MuonHub where data lives.** One device at one station produces one stream. Moving the device to another station starts a new stream. | "CosmicWatch #3 @ USFQ" |
| **Session** | Sesión | A continuous recording period inside a stream. A new session starts on a restart, a device reset, or a configuration change. | |
| **Calibration** | Calibración | A versioned set of parameters of a *device*, with a validity date. It applies to the device's streams from that date on. | |
| **Recipe** | Receta | A reusable processing sequence: calibration, filters, corrections. | "30 mV threshold + barometric correction" |
| **View** | Vista | A recipe applied to a stream. The **raw view** always exists and is never altered (ADR-006). | "Pure" vs "Filtered" |
| **Agent** | Agente | The MuonHub software, running on the PC or Raspberry Pi, that reads the devices (ADR-007). | |

### Rules

1. **The physical object is a Device.** The word "detector" keeps only its general scientific sense
   ("a cosmic-ray detector"). It never names a data space and is not a domain term.
   _(Confirmed by the maintainer on 2026-10-04.)_
2. **Data belongs to a stream.** It does not belong to a device or a station on their own.
3. **Comparisons are between views.** Pure and filtered data of the same stream are two views of
   one stream, never two copies of the data.
4. **Calibration describes the device; views describe the analysis.** A recalibration creates a
   new calibration version; it never rewrites stored data.
5. **A device type is shareable; a device is not.** Many devices can share one device type.

### Mapping from earlier vocabularies

| Earlier term | Where | Becomes |
|---|---|---|
| Profile | v5 | Station + its stream(s) |
| Session | v5 | Session |
| Realtime records | v5, first attempt | The ephemeral live window of a stream (ADR-006) |
| Station | first attempt | Station |
| Detector (device + owner of the data) | first attempt | Device (hardware) + Stream (data) |
| `hwVersion` / serial format | first attempt | Device type |
| Detector calibration | first attempt | Calibration (versioned, on the device) |
| Per-detector retention tiers | ADR-003 | Per-stream retention settings (specified in M1) |

## Consequences

- **New code:** from M1 on, schemas, database paths, rules, API names, and UI strings use these
  terms.
- **First-attempt code:** it keeps the old names until M1 replaces it; it is not patched to the new
  vocabulary.
- **Data model:** the M1 data model is designed around `deviceTypes`, `devices`, `stations`,
  `assemblies`, `streams`, `sessions`, `calibrations`, `recipes`, and `views` (detailed in the M1
  specs).
- **Migration:** v5 data maps profile → station + stream (M5).
- **Writing:** agents and contributors must not use "detector" as a domain term in new work.

## Alternatives considered

- **"Device profile" for the device type.** Rejected by the maintainer: it collides with the v5
  "profile".
- **Keep "Detector" as both device and data owner.** Rejected: that ambiguity is what this ADR
  removes.
- **Data owned by the device.** Rejected: a device that moves between stations would mix data from
  different sites and conditions. A stream keeps each placement separate.
