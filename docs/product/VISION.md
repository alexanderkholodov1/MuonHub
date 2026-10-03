# MuonHub — Vision

> Status: living document · Last updated: 2026-10-03 (milestone M0)
> Decisions referenced here live in [`../decisions/`](../decisions/README.md).

## What MuonHub is

MuonHub is an **open-science platform for cosmic-ray detectors and related instruments**. It
acquires, stores, visualizes, compares, and analyzes data from low-cost detectors (CosmicWatch-class
plastic scintillators with SiPMs today; other particle detectors, a muograph, and a seismic sensor
tomorrow), and aims to grow into a **multi-university network across Latin America**.

It was born as Alexander Kholodov's contribution to Dennis Cazar's research at the LEOPARD
laboratory (USFQ, Quito, Ecuador), within the EL-BONGO / Erasmus+ CBHE project
(source: [`../archive/planning/00-MASTER-PLAN.md`](../archive/planning/00-MASTER-PLAN.md)).
Its first station is on the USFQ campus in Cumbayá (Quito metropolitan area) at roughly 2,400 m —
the station's barometer reads ≈ 768 hPa [verified 2026-10-03], consistent with about 2.3–2.4 km,
not with central Quito's ≈ 2,850 m. The high geomagnetic cutoff rigidity of the region
(≈ 12–13 GV) makes the data scientifically distinctive
([`../science/THEORETICAL-FOUNDATION.md`](../science/THEORETICAL-FOUNDATION.md) §0, §8E).

## Principles

1. **Scientific honesty.** Nothing contradicts the theoretical foundation. A single-SiPM detector
   measures an integral **charged-particle / MIP-type rate**, never "muons" per event; muon language
   is reserved for aggregate inference or coincidence data.
2. **Data integrity (ADR-006).** Raw data is immutable. Filtering, calibrating, discriminating, and
   classifying are allowed and important, but they are applied **on top of stored data**. Storing
   altered data as if it were pure is forbidden; a derived dataset is stored only on an explicit
   request, with its provenance and a visible "derived" label.
3. **Free tier only (ADR-005).** MuonHub runs indefinitely on a single Firebase project (`muonhub`)
   on the no-cost Spark plan, with no paid services. Every design choice is measured against the free
   quotas.
4. **A scientific tool the user controls.** Calibrations, recipes, views, comparisons, and
   coincidence parameters are configurable, versioned, and reproducible; automatic routines only
   propose, a person decides.
5. **Bring Your Own Detector.** The platform adapts to any detector: users describe their own device
   types, share them, and the community reviews them.
6. **Accessible and open.** Public stations are visible to anyone; data is published for citation
   (CC-BY 4.0 for public data, MIT for code); the interface works on phones as well as desktops.

## What v6 is

v6 is a **rebuild** of the platform as a typed TypeScript monorepo, reusing the knowledge and the
sound parts of the first v6 attempt (2026-06) and of v5. It is delivered in **six milestones, one
pull request each** (M0 Foundation → M5 Migration + launch), each opened only when its milestone is
planned, tested, validated with real hardware, and corrected. See [`ROADMAP.md`](ROADMAP.md).

The release that completes M5 is **`6.0.0`**. v5 keeps running unchanged on its own Firebase
project until then.

## Vocabulary (ADR-004)

| Term | Meaning |
|---|---|
| **Device** | Always the physical hardware unit (e.g. "CosmicWatch #3"). |
| **Device type** | The definition of a class of hardware: output format, columns, units, channels, default geometry. What Bring Your Own Detector shares. |
| **Station** | The site and setup where devices are installed: location, privacy, public or private. |
| **Assembly** | The physical arrangement of devices in a station (stacking, separation, tilt). |
| **Stream** | The space in MuonHub where data lives: one device at one station produces a stream. Data belongs to streams. |
| **Session** | A continuous recording period inside a stream. |
| **Calibration** | A versioned set of device parameters with a validity date. |
| **Recipe** | A reusable processing sequence (calibration, filters, corrections). |
| **View** | A recipe applied to a stream. The raw view always exists and is never altered. |
| **Agent** | The MuonHub software that reads devices on a PC or Raspberry Pi. |
