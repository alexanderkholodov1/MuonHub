# MuonHub — User manual

> **Start here to understand how MuonHub thinks.** This guide explains the **mental model and the
> terminology** behind the platform — stations, devices, streams, sessions, views — and what the data
> actually means. Step-by-step, screen-by-screen walkthroughs are added as each part of the v6
> interface ships. (English is the source; Spanish and Portuguese follow.)

---

## 1. What MuonHub is for

You have a cosmic-ray detector (or another scientific device). MuonHub is where you **register it,
let it record continuously, see its data live, keep that data safe, and — if you want — share it and
compare it** with other devices, other places, and external references such as neutron monitors and
space-weather data. Many devices across different universities form one shared scientific network.

---

## 2. The mental model

The words below are used consistently across the platform (they are defined in ADR-004,
[`docs/decisions/`](../decisions/)).

```
Institution (optional)   "Universidad San Francisco de Quito"
  └─ Station             "USFQ Rooftop"        a place: location, privacy, public or private
       ├─ Assembly       "2 devices stacked 5 cm apart"   how the devices are physically arranged
       └─ Device         "CosmicWatch #3"      the physical hardware, of a given device type
            └─ Stream    "CosmicWatch #3 @ USFQ Rooftop"  where its data lives in MuonHub
                 └─ Session   one continuous recording period
```

### Station
A **place** where measuring happens — with a location, a city, and a visibility. A station is what
appears **on the map**. You always store the exact location; you choose how precisely the public may
see it (exact, approximate, city, country, or hidden).

### Device and device type
A **device** is always the **physical** object — the actual board plugged into a computer. Its
**device type** describes what kind of hardware it is: how its output is formatted, what each column
means, its units, channels, and default geometry. Device types can be shared with other users
(**Bring Your Own Detector**).

### Assembly
How the devices of a station are arranged in space — for example two devices stacked on top of each
other to detect the same particle in **coincidence**. The geometry (areas, separation, orientation)
matters for interpreting and comparing the data.

### Stream and session
A **stream** is the space in MuonHub where a device's data is stored. If you move a device to
another station, a new stream begins, so data is always tied to where it was measured. A **session**
is one continuous recording period inside a stream.

---

## 3. What the data means (important and honest)

A basic detector with **one sensor** cannot tell apart a muon, an electron, or a gamma ray — at this
scale they all deposit about the same energy. So MuonHub is careful and honest:

- It shows a **charged-particle rate** (also called "MIP-type rate"), **not** a "muon count".
- It shows an **amplitude spectrum** — the distribution of how strong each pulse was — which is the
  real physical fingerprint a single sensor can give.
- Only a **coincidence** setup (two or more devices confirming the same particle) can honestly speak
  of muons.

**Your raw data is never altered.** Corrections (dead time, atmospheric pressure), calibrations, and
filters are applied **on top of** the stored data, through **views**. Every view records exactly how
it was produced, so you can compare, for example, a pure view and a filtered view of the same stream.

---

## 4. The basic workflow (conceptual, not button-by-button)

1. **Create an account** (your MuonHub identity).
2. **Register a station** — its location, the public display precision of that location, and its
   **visibility** (public, institution, or private). Visibility is required; there is no hidden default.
3. **Add a device** — choose its device type (or configure a new one); its calibration starts from
   documented defaults that you control.
4. **Connect the device** through the MuonHub **agent**, a small program that runs in the background
   on the computer next to the device. It reads the device, keeps a **local copy of everything**, and
   syncs to the cloud — surviving internet and power interruptions.
5. **Watch it live** — the dashboard shows the charged-particle rate, pressure, and amplitude
   spectrum. Public stations can also be watched by anyone on the public live page.
6. **Compare and analyse** — create views (calibrations, filters, corrections), compare streams and
   views, and study coincidences.

---

## 5. Glossary

| Term | Meaning |
|---|---|
| **Institution** | A university or organization grouping users and stations. Optional. |
| **Station** | A registered place with a location; appears on the map; has an owner and a visibility. |
| **Device** | The physical hardware unit. |
| **Device type** | The definition of a kind of hardware: format, columns, units, channels, geometry. |
| **Assembly** | The physical arrangement of a station's devices (stacking, separation, tilt). |
| **Stream** | Where a device's data lives in MuonHub; one device at one station. |
| **Session** | One continuous recording period inside a stream. |
| **Calibration** | A versioned set of a device's parameters, valid from a given moment. |
| **Recipe** | A reusable sequence of processing steps (calibration, filters, corrections). |
| **View** | A recipe applied to a stream. The raw view always exists and is never altered. |
| **Agent** | The background program next to the device that reads it, keeps a local copy, and syncs. |
| **Charged-particle / MIP-type rate** | The honest name for what a single-sensor detector counts (not "muons"). |
| **Amplitude spectrum** | The distribution of pulse strengths — a single sensor's real physical signal. |
| **Coincidence** | Two or more devices registering the same particle within a short time window. |
| **Dead time** | The short time a device is busy after an event and cannot count; corrected in views. |
| **Barometric correction** | Adjusting the rate for atmospheric pressure, with a coefficient measured locally. |
| **Visibility** | Who can see a station: **public** (anyone), **institution** (your organization), or **private** (you and the people you share with). |
| **Realtime vs. minute data** | Realtime = individual recent events in a short live window (not stored permanently in the cloud); minute data = per-minute averages kept long-term (older data is archived to stay within the free
storage quota). |

---

## 6. Coming later
Step-by-step guides with real screens, screenshots, and the Spanish/Portuguese versions — once the
v6 interface is built and stable. Track progress in [`../STATUS.md`](../STATUS.md).
