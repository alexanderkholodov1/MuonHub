# MuonHub — User manual

> **Start here to understand how MuonHub thinks.** This guide explains the **mental model and the
> terminology** behind the platform — institutions, stations, detectors, sessions, and what the
> data actually means. Step-by-step, screen-by-screen walkthroughs are added as each part of the
> v6 interface ships. (English is the source; Spanish and Portuguese follow.)

---

## 1. What MuonHub is for

You have a small cosmic-ray detector. MuonHub is where you **register it, let it record continuously,
see its data live, keep that data safe, and — if you want — share it and compare it with what other
stations and the Sun are doing.** Many detectors across different universities form one shared
scientific network.

---

## 2. The mental model: four levels

MuonHub organizes everything into four nested ideas. The clearest way to picture them:

```
Institution            "Universidad San Francisco de Quito"   (a university / organization)
  └─ Station           "USFQ Rooftop"                         (a place with a detector)
       └─ Detector     "CosmicWatch #1"                       (the physical device)
            └─ Session "Run 2026-06-07"                       (one stretch of recording)
```

### 🏛️ Institution
A university, lab, or organization that groups people and stations together. You **don't need** one
— an independent student or hobbyist can use MuonHub without belonging to any institution.

### 📍 Station
A **place** where measuring happens — a registered site with a location (latitude, longitude,
altitude), a city, and a chosen visibility. A station is what appears **on the map**. Think of it as
"the rooftop of the physics building at USFQ". A station has an owner and can be shared with others.

> A station is the *profile/site*. It is **not** the device — that's the detector.

### 🔬 Detector
The **physical device** inside a station — the actual CosmicWatch board plugged into a computer.
Its calibration, firmware, and identity live here, and **the measurements belong to the detector**.
Most stations have exactly one detector (so it feels 1-to-1). Advanced setups can have two or more
detectors in the same station to form a **coincidence telescope** (see glossary).

### ⏱️ Session
**One continuous run of recording** from a detector — for example, "the data we took from Monday to
Friday". Sessions let you organize, label, and download data in meaningful chunks.

---

## 3. What the data means (important & honest)

A basic detector with **one sensor** cannot tell apart a muon, an electron, or a gamma — at this
scale they all deposit about the same energy. So MuonHub is careful and honest:

- It shows a **charged-particle rate** (also called "MIP-type rate"), **not** a "muon count".
- It shows an **amplitude spectrum** (a Landau curve) — the distribution of how strong each pulse
  was — which is the real physical fingerprint a single sensor can give.
- Only a **coincidence** setup (two detectors confirming the same particle) can honestly claim
  "muons".

The platform also **corrects** the rate automatically for two effects that would otherwise distort
it: detector **dead time** (the brief moments it's busy and can't count) and **atmospheric
pressure** (more air above you = fewer particles get through). These corrections are always applied.

---

## 4. The basic workflow (conceptual, not button-by-button)

1. **Create an account** (your MuonHub identity).
2. **Register a station** — give it a location and choose its **visibility** (public, institution,
   or private). This choice is required; there is no hidden default.
3. **Add a detector** to the station — pick its hardware; calibration starts from sensible defaults.
4. **Connect the detector** through the MuonHub **agent** (a small program you install on the
   detector's computer). It reads the device, keeps a **local backup**, and syncs to the cloud —
   even surviving internet or power interruptions.
5. **Watch it live** — your station's dashboard shows the corrected particle rate, pressure, and the
   amplitude spectrum, updating in real time.
6. **Share or keep private**, **organize into sessions**, **download data**, and (later) **compare**
   your data with space-weather events.

---

## 5. Glossary

| Term | Meaning |
|---|---|
| **Institution** | A university/organization grouping users and stations. Optional. |
| **Station** | A registered site with a location; appears on the map; has an owner and a visibility. |
| **Detector** | The physical device inside a station. Data belongs to it. |
| **Session** | One continuous recording run of a detector. |
| **Agent** | The small installable program that reads the detector, backs up locally, and syncs. |
| **Charged-particle / MIP-type rate** | The honest name for what a single-sensor detector counts (not "muons"). |
| **Amplitude (Landau) spectrum** | The distribution of pulse strengths — a single detector's real physical signal. |
| **Coincidence** | Two+ detectors confirming the same particle; only this honestly identifies muons. |
| **Dead time** | The short time a detector is busy after an event and can't count; corrected automatically. |
| **Barometric correction** | Adjusting the rate for atmospheric pressure, using a value measured locally. |
| **Visibility** | Who can see a station: **public** (anyone), **institution** (your organization), or **private** (you + people you share with). |
| **Roles** | Account permission levels (e.g., admin / user / guest) governing what you can do. |
| **Realtime vs. minute data** | Realtime = individual recent events (a short window); minute data = per-minute averages kept indefinitely. |

---

## 6. Coming later
Step-by-step guides with real screens, screenshots, and the Spanish/Portuguese versions — once the
v6 interface is built and stable. Track progress in [`../STATUS.md`](../STATUS.md).
