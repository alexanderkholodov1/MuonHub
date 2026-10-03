# Research notes — October 2026

> **These are research notes, not decisions.** They record what was found during the 2026-10-02
> planning session (web research by subagents, checked on 2026-10-02), so that nothing lives only
> in the chat. Scope and sequencing decisions live in [`docs/product/ROADMAP.md`](../product/ROADMAP.md);
> the session's decisions are in
> [`docs/audit/2026-10-02-V6-RESET-SESSION-RECORD.md`](../audit/2026-10-02-V6-RESET-SESSION-RECORD.md).
>
> Every claim carries its source URL. **[UNVERIFIED]** marks anything that could not be confirmed
> from a primary source; **[estimate]** marks back-of-the-envelope numbers. Nothing here overrides
> [`THEORETICAL-FOUNDATION.md`](THEORETICAL-FOUNDATION.md).

Context: MuonHub targets low-cost cosmic-ray detectors (CosmicWatch-class plastic scintillator +
SiPM, ~5×5 cm, single channel; an older educational detector with larger paddles; stacked devices
for coincidences) at USFQ (Cumbayá campus, Quito metropolitan area). The live station's barometer reads
≈ 768 hPa [verified by running, 2026-10-03], consistent with ≈ 2.4 km in a tropical atmosphere; the USFQ
weather station EMA is reported at 2,391 m a.s.l. (Cazorla & Tamayo, ACI Avances 2014) [reported]. The
"~2850 m" used in the research prompts is central Quito's altitude, not the station's. Planned extensions explored here: a ~20-channel
muograph, a seismic sensor, and offline collection (e.g. Raspberry Pi) with precise timestamps.

---

## A. Open data from cosmic-ray detectors

| Source | What it offers | Access | Licence / terms | Usefulness for MuonHub |
|---|---|---|---|---|
| **HiSPARC** (NL) | Event data with ns-resolution timestamps, pulse heights, integrals, reconstructed zenith/azimuth; weather data at some stations | TSV download forms, JSON API, Python SAPPHiRE library — https://docs.hisparc.nl/publicdb/data_access.html , https://docs.hisparc.nl/publicdb/api.html , https://docs.hisparc.nl/sapphire/ | **[UNVERIFIED]** (docs only say "© HiSPARC") | Best real *event-level, multi-detector* dataset to test a coincidence pipeline |
| **LAGO** | Water-Cherenkov detectors; measured data **non-public**; simulated data CC BY-NC-SA 4.0 after a 1-year embargo; non-commercial use with attribution | https://gitmilab.redclara.net/lago/docs/DMP , https://arxiv.org/pdf/1704.03885 | CC BY-NC-SA 4.0 (simulated data) | Ecuador has LAGO detectors at USFQ, EPN and ESPOCH Riobamba; the cited publication lists sites at about 2400 m and 2817 m without naming them **[UNVERIFIED site-altitude mapping]** — https://research.usfq.edu.ec/en/publications/implementing-a-wcd-detector-system-in-ecuador-as-part-of-the-lago/ . An in-house partner; their simulated Quito flux would be a natural benchmark |
| **NMDB** (neutron monitors) | Real-time and historical count rates (original and revised) | NEST web interface — https://www.nmdb.eu/nest/statements.html | Free for non-commercial use, acknowledgement of NMDB and each station required | Standard reference to check that a Forbush decrease or the barometric correction behaves sensibly. Closest station at a similar cutoff: **Mexico City** (2274 m, 8.2 GV) — https://www.nmdb.eu/station/mxco/ . Chile runs monitors at Los Cerrillos (570 m) and Putre (3598 m) — https://sites.bc.edu/magnetometers/wp-content/uploads/sites/226/2024/09/CONSORCIO_OBSERVATORIOS_RC_y_Geo_SAMBA_P_A.pdf ; whether they publish to NMDB is **[UNVERIFIED]** |
| **GMDN** (Nagoya, Hobart, Kuwait, Brazil) | Directional muon rates since 2006, pressure-corrected and uncorrected; CDF format with SPASE metadata | https://cosray.shinshu-u.ac.jp/crest/DB/Public/main.php | Citation required ("GMDN collaboration… http://hdl.handle.net/10091/0002001448") | Closest professional analogue: a network of dedicated (directional) muon detectors. Time resolution **[UNVERIFIED]** (probably hourly) |
| **Pierre Auger** | Shower events, weather, and **scaler (low-threshold counting) rates for space weather** | https://opendata.auger.org/AugerOpenDataPolicy.pdf , https://zenodo.org/record/5588460 , https://arxiv.org/pdf/2507.08504 | CC BY-SA 4.0 | The scaler rates are the useful part |
| **QuarkNet e-Lab** | More than 100k data files from school detectors (CRMD), web analysis tools | https://quarknet.org/content/resources-cosmic-ray-analyses-online | Licence and bulk API **[UNVERIFIED]** | School-detector comparison data |
| **EEE** (Italy) | About 70 school telescopes (MRPC chambers); an "OpenData DB" is mentioned; rate data as text | https://eee.cref.it/?p=2671 | Access path and licence **[UNVERIFIED]** | School-telescope comparison data |
| **CREDO** | Mostly smartphone detections | On request via api.credo.science / contact@credo.science — https://arxiv.org/pdf/2010.08351 | — | Low value as a rate benchmark |
| **IceCube** | Neutrino track releases (IceTracks-DR2, 2008–2022) | https://icecube.wisc.edu/science/data , https://arxiv.org/pdf/2605.19040 | — | Not relevant to surface muon rates |
| **CosmicWatch community** | No curated public dataset found **[UNVERIFIED]**. The v3X hardware logs timestamp, ADC, coincidence flag, temperature, pressure, acceleration; the design is CC BY-NC 4.0 | https://github.com/spenceraxani/CosmicWatch-Desktop-Muon-Detector-v3X | Design: CC BY-NC 4.0 | **A gap MuonHub could fill** by publishing its own data with a DOI on Zenodo |

---

## B. Synthetic data and simulation

| Tool | What it does | Language / licence | Cost | Use for MuonHub |
|---|---|---|---|---|
| Gaisser formula and the Guan et al. 2015 modification (low energy, large zenith) — https://arxiv.org/pdf/1509.06176 | Analytic muon flux in energy and angle at sea level | Formula, re-implementable | Negligible | **Tier 1:** a TypeScript generator of Poisson event streams |
| **EcoMug** — https://github.com/dr4kan/EcoMug (NIM A 1014, 165732, 2021) | Muon generator fitted to data; generates from a plane, cylinder or half-sphere | Header-only C++11; licence **[UNVERIFIED]** | Very low | **Tier 2:** realistic angle and momentum, muography geometry |
| **CRY** (LLNL) — https://nuclear.llnl.gov/simulation/doc_cry_v1.7/cry.pdf | Correlated shower particles (multiplicity, e/γ/n/μ) | C/C++/Fortran; licence **[UNVERIFIED]** | Low | Tables only for **sea level, 2100 m and 11300 m**; for the ≈ 2.4 km USFQ station the 2100 m table is the closest, but it is about 20 g cm⁻² deeper — soft and hadronic yields come out roughly 10–20 % low, so scale them or carry the difference as a systematic. Useful for coincidence backgrounds |
| **PUMAS** — https://github.com/niess/pumas | Muon transport in matter, forward and **backward** (deterministic CSDA mode up to detailed Monte Carlo) | C99, LGPLv3 | Low | **Muography forward model** (transmission through rock) |
| MUSIC/MUSUN — https://arxiv.org/pdf/0810.4635 | Muon propagation through thick rock | Fortran; available on request | Low–medium | Alternative to PUMAS |
| **Geant4** — https://geant4.org/download/license | Full simulation of the detector response | C++, permissive Geant4 licence | High | **Tier 3:** scintillator and SiPM response, strip crosstalk |
| **CORSIKA 8** — https://gitlab.iap.kit.edu/AirShowerPhysics/corsika , https://pos.sissa.it/484/045 | Full air showers | C++; licence **[UNVERIFIED]** (sources disagree: GPLv3 vs BSD-3-Clause — check the repository LICENSE) | Very high (needs a cluster) | Not needed; LAGO's ARTI/CORSIKA site simulations already cover Quito |

**Tiered approach suggested by the research:**
1. **Tier 1 (TypeScript, in the repository):** a seeded Poisson stream using a cos²θ or Guan flux,
   scaled for altitude and pressure; uncorrelated noise, dead time, and N devices with a
   configurable geometric coincidence fraction. Enough to test coincidence, rate and comparison
   code deterministically.
2. **Tier 2:** EcoMug for angle- and momentum-correct tracks through a hodoscope geometry; CRY where
   shower correlations matter.
3. **Tier 3:** PUMAS for target opacity and Geant4 for detector response — both offline, never in
   the browser.

---

## C. Muography feasibility

**Principles.** Transmission (absorption) muography compares the muon flux through a target with
an open-sky flux to infer the opacity (density × length) along each line of sight. Scattering
tomography measures deflection angles — it needs tracks both before and after the object — and only
suits small objects with momentum or angle tracking. "Calibrate against the open sky, then point at the object" is the standard transmission
method. Reviews and studies:
- Tanaka et al., *Nature Reviews Methods Primers* 2023, doi:10.1038/s43586-023-00270-7
  (https://hun-ren.hu/research_news/composed-through-global-cooperation-with-the-participation-of-hun-ren-wigner-rcp-researchers-a-paper-presenting-the-latest-findings-in-muography-research-published-106746)
- Hodoscope resolution study: https://arxiv.org/pdf/2006.03165
- Image quality set by spatial resolution and exposure time:
  https://gi.copernicus.org/preprints/gi-2021-35/gi-2021-35-manuscript-version4.pdf

**Hardware.** Typically two or more planes of X/Y scintillator strips read by SiPMs; each crossing
strip pair defines a pixel, and the line through two planes defines the direction. MuTe (Colombia,
Cerro Machín) uses 2 panels of 30×30 strips (120×4×1 cm), giving 900 pixels, plus a
water-Cherenkov filter and picosecond time-of-flight for background rejection —
https://arxiv.org/pdf/2004.09364 , https://halley.uis.edu.co/fuego/en/el-proyecto/ .

**A 20-channel device**, e.g. 2 planes × (5 X + 5 Y) strips, gives 25 pixels per plane and about 81
directions: coarse (several degrees) but **feasible as a demonstrator** — an open-sky angular map,
then a building or a hill. Exposure time grows steeply with opacity: at hill-to-volcano opacities the flux falls roughly as a
power law of the opacity (~ϱ⁻²), and only becomes exponential at several km water-equivalent (PDG
Cosmic Rays review): large volcanoes need months with m²-scale areas, out of reach
for 5 cm strips. Site-specific exposure times were not computed; that needs a PUMAS or EcoMug run
**[UNVERIFIED for this geometry]**.

**Projects.**
- ScanPyramids — "big void" found with emulsion, scintillator hodoscope and gas detectors (Nature
  2017): https://www.weforum.org/stories/2017/11/the-great-pyramid-of-giza-is-hiding-a-huge-unexplored-space-and-scientists-used-cosmic-rays-to-find-it
- Sakurajima Muography Observatory (14 tracking systems): https://doaj.org/article/89de3a1ed84e4e379164d756370e275f
- Teotihuacan, Mexico: https://physicsworld.com/a/particle-physics-lab-beneath-a-mexican-pyramid/
- Peru's first muography project (UNI/CONIDA, scintillator bars with SiPMs):
  https://indico.nucleares.unam.mx/event/2125/contribution/126
- Chile/Argentina (Copahue; Leone, U. Atacama): https://meetingorganizer.copernicus.org/EGU24/EGU24-6565.html
- Low-cost educational: SAKURA (4 SiPMs, under US$1k) — https://arxiv.org/html/2509.06276v1 ;
  OSECHI — https://pos.sissa.it/485/612
- **Ecuador:** no volcano muography project found **[UNVERIFIED absence]**.

**Software.**
- MUYSC (Python; radiography, telescope parameters, tomography): https://arxiv.org/pdf/2303.02627
- `muograph` (PyPI; scattering and transmission): https://pypi.org/project/muograph
- TomOpt (differentiable): https://libraries.io/pypi/tomopt/0.1.0
- Simulated annealing for volcano muography: https://arxiv.org/pdf/2005.08295

**What a web platform can realistically do:** group per-channel hits into events within a time
window; reconstruct tracks from strip pairs (X/Y per plane, then a direction); show angular rate
maps; compute target/open-sky ratio (transmission) maps with Poisson errors; estimate exposure
time; give a first-order opacity estimate by inverting against a stored flux table; show per-channel
noise diagnostics (singles rate, accidental rate 2·τ_c·R1·R2, τ_c = coincidence half-window).

**Out of reach for the browser:** 3D tomographic inversion, scattering tomography, and full Geant4
or PUMAS forward modelling — those belong in an offline Python service.

---

## D. Seismic ↔ cosmic-ray correlation

- Homola et al. (CREDO), *J. Atmos. Sol.-Terr. Phys.* 247, 106068 (2023), report a correlation
  above 6σ between global cosmic-ray rate variations and the summed magnitude of earthquakes with
  M≥4, with a lag of about 15 days and a periodicity resembling the solar cycle. The correlation is
  **seen only globally, not locally**, and the authors call it unexplained —
  https://press.ifj.edu.pl/en/news/2023/06/14/ , https://par.nsf.gov/servlets/purl/10421219
- No published rebuttal found **[UNVERIFIED absence]**. Independent reviews say no significant
  relation has been established —
  https://indico.in2p3.fr/event/18287/contributions/67510/attachments/52191/67315/PARIS2019_Kevin.pdf

**Honesty protocol** (from the research; to be adopted by a future spec):
- Frame the feature as exploratory, not predictive; never label it "earthquake prediction".
- Remove pressure, temperature and solar (NMDB) effects first.
- Pre-register the analysis.
- Apply look-elsewhere / trial-factor corrections and surrogate tests that **preserve
  autocorrelation** (block bootstrap, phase-randomised surrogates; Ebisuzaki, J. Climate 10 (1997)
  2147) — plain shuffles destroy autocorrelation and overstate significance, worst for two series
  that share a solar-cycle period.
- Also treat the seismometer as a **systematics channel** (vibration or tilt noise on the SiPM).

**Formats and tooling.** miniSEED through FDSN web services, StationXML metadata, and ObsPy (the
standard Python library; not fetched in this research). Raspberry Shake outputs **100 samples/s**
miniSEED over SeedLink and has open historical data since 2016 at https://data.raspberryshake.org/fdsnws/
— https://manual.raspberryshake.org/fdsn.html . Data volume: 100 sps × 3 channels ≈ 26 M samples
per day, a few MB to tens of MB per day compressed **[estimate]** — far above the Firebase free
tier, so only derived products (per-minute RMS, an event catalogue) would go to the cloud, and raw
miniSEED stays elsewhere.

---

## E. Offline precise timestamping (e.g. Raspberry Pi)

- **GPS PPS with chrony and gpsd:** routinely within 1 µs of GPS time, and about 17–50 ns RMS when
  temperature is stable (Pi 5 with u-blox M8T) —
  https://austinsnerdythings.com/2025/02/14/revisiting-microsecond-accurate-ntp-for-raspberry-pi-with-gps-pps-in-2025/
  (hobbyist source, not peer-reviewed). The *system clock* accuracy is not the *event timestamp*
  accuracy: USB-serial latency from the microcontroller adds roughly ms of jitter
  **[UNVERIFIED magnitude]** unless the event is timestamped in hardware (a GPIO edge, a
  PPS-disciplined MCU).
- **DS3231 RTC:** ±2 ppm from 0–40 °C, about ±0.17 s/day and ±1 min/year —
  https://learn.adafruit.com/adafruit-ds3231-precision-rtc-breakout/overview . Fine for per-minute
  rates offline; record an NTP or GPS sync offset on reconnection and correct the drift linearly.

**Accuracy needed per use case:**

| Use case | Needed | Sufficient setup |
|---|---|---|
| Per-minute rates | ~1 s | RTC or occasional NTP |
| Coincidence on the same machine | µs (hardware) or ~ms (software over USB) | Hardware coincidence is best; a ~ms software window makes the accidental rate 2·τ_c·R1·R2 (τ_c = coincidence half-window) non-negligible for noisy channels; host USB-serial latency can exceed 10 ms, so the window is set from the measured delay histogram |
| Coincidence between machines | µs-scale windows | GPS PPS on each machine plus hardware event timestamping; NTP alone (ms) supports only wide windows with accidentals subtracted |

**CosmicWatch hardware coincidence (v2):** two units linked by a 3.5 mm audio cable (the tip
conductor also carries power); the first unit reset becomes the master, a second reset 10–2000 ms
later becomes the slave; the slave records only if the master triggered within about **30 µs**;
stacked slave rate 0.281 s⁻¹ — https://ar5iv.labs.arxiv.org/html/1801.03029 . A 2026 stacked-geometry
preprint describes a **"0.1-second window"**, which contradicts the v2 paper —
https://arxiv.org/html/2601.10879v1 . **To verify against the v3X manual.** Multi-detector
extensions up to 8 devices over Ethernet cable: https://archive.aps.org/pss/2025/q01/6

---

## F. Suggestions from the research (input for planning, not decisions)

- **v6 scope candidates:** a TypeScript synthetic event generator (Guan flux, Poisson, dead time,
  noise, N-device coincidence) used as test fixtures; typed, validated ingest of the CosmicWatch
  coincidence flag with a software coincidence engine that reports the accidental estimate
  2·τ_c·R1·R2; offline-first Raspberry Pi collection with GPS PPS + chrony recommended and DS3231 as
  the minimum, storing a clock-quality record (sync source, offset estimate) with every batch;
  benchmark overlays against NMDB (Mexico City) and GMDN, honouring their acknowledgement and
  citation terms; data exchange with the LAGO Ecuador nodes (USFQ is a member).
- **Later candidates:** a muography demonstrator (~20 channels as 2 X/Y planes, open-sky angular
  map, then a transmission ratio map) after offline EcoMug/PUMAS feasibility runs; a seismic channel
  ingested via FDSN/ObsPy with only derived per-minute metrics in the cloud, presented as
  exploratory with controls; Geant4 detector response and LAGO/CORSIKA site simulations as offline
  references; MuonHub datasets published on Zenodo with a DOI under CC BY.

**Unresolved:** the HiSPARC, CRY, EcoMug, QuarkNet and EEE licences; GMDN time resolution; whether
Ecuador has any volcano muography; whether anyone has published a rebuttal of Homola et al. 2023;
the CosmicWatch v3X hardware coincidence window.
