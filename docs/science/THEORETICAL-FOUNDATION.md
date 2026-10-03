# Theoretical and Scientific Foundation of MuonHub

> **Status:** v1 — distilled from the deep research (archived source:
> `docs/archive/planning/research/DEEP-RESEARCH-RESULTS.md`). OFFICIAL scientific basis of the project. Every physics claim in
> the UI, landing, AI, and documentation must be consistent with this document.
> **Review:** the `physicist` reviewer (`.claude/agents/physicist.md`). **Rule:** scientific honesty > marketing.
>
> **Editorial note (2026-10-03):** altitude figures such as "Quito ~2850 m, ~730 hPa" describe central
> Quito. Each station's own altitude and reference pressure come from its metadata and barometer —
> the first station (USFQ campus, Cumbayá) reads ≈ 768 hPa, i.e. roughly 2.3–2.4 km.

---

## 0. Executive summary (what CANNOT be ignored)

1. **A single SiPM does not classify particles.** A muon, electron, and gamma (via Compton) produce
   indistinguishable pulses (all are MIP, ~2 MeV). Reporting "muon detected" per event is
   **speculation**. → The correct wording: **"Integral rate of charged particles" / "MIP-type event rate"**.
2. **Muons dominate statistically** (~75–80% of the charged flux at sea level), so the *aggregate
   curve* is indeed driven by muons — but that dominance **decreases at altitude**
   (Quito/Andes), where the soft and hadronic component is 5–9× larger.
3. **Mandatory corrections before speaking of "cosmic signal":** dead time +
   barometric (**local** coefficient, not universal) + thermal.
4. **One minute is too noisy** (Poisson: error ~1.6% per minute). Anomalies
   require integration over **many hours** (N≥100k) and **≥3σ persistent** thresholds.
5. **Ecuador's unique advantage:** geomagnetic cutoff rigidity **≈12–13 GV** (among the highest
   on Earth; the global maximum ≈17 GV lies over Southeast Asia) → filters low-energy solar
   noise; Andean data is pure galactic signal, scarce globally.

---

## 1. Primary cosmic rays and atmospheric cascades

- **Primaries:** ~89% protons, ~9% alpha particles, ~2% heavy nuclei/electrons (PDG).
  Origin: solar (SEP, MeV–GeV), galactic (GCR, supernovae, Fermi acceleration) and
  extragalactic/AGN (>10¹⁸ eV).
- **Spectrum:** power law `dN/dE ∝ E⁻²·⁷` up to the "knee" (~10¹⁵ eV). MuonHub
  interacts with secondaries from primaries of **10¹⁰–10¹² eV**.
- **Cascade (Extensive Air Shower):** a primary collides at 15–20 km and generates three
  components:
  - **Hadronic** (p, n, π, K) — core, attenuates quickly (Λ ≈ 110–148 g/cm²).
  - **Electromagnetic** (e⁺e⁻, γ) — from π⁰→γγ decay, Heitler model.
  - **Muonic (penetrating)** — from decay of π±/K± that did not re-collide.
- **At sea level** (X≈1033 g/cm²): the charged flux is **dominated by muons (75–80%)**.
  **At Andean altitude** (Quito ~2850 m, ~730 hPa) absorption is incomplete: denser and
  mixed flux (more secondary electrons and gammas) → muonic dominance decreases.

→ **MuonHub implication:** the language must distinguish "charged particle" from "muon"; the
degree of muonic dominance depends on the site (altitude) and must be declared.

---

## 2. The atmospheric muon

- **What it is:** lepton, charge ±1e, spin ½, mass **105.66 MeV/c²** (~207× the electron). Does
  not interact via the strong force; only EM and weak.
- **Production:** `π⁺→μ⁺+ν_μ`, `π⁻→μ⁻+ν̄_μ` (branching ~99.9%).
- **Energy/flux:** mean energy at surface **~4 GeV**; vertical integral flux
  **~1 muon·cm⁻²·min⁻¹** (horizontal detector).
- **Angular dependence:** `I(θ) ≈ I₀·cos²θ` (an inclined muon traverses more atmosphere
  `X/cosθ` → more energy loss and higher decay probability).
- **Time dilation (educational pillar):** τ₀ = 2.197 µs ⇒ classically only ~660 m. With
  γ≈38 (4 GeV muon), τ≈83.6 µs and range ~25 km → that is why they reach the surface. **Direct
  empirical proof of Special Relativity.**

---

## 3. Detection physics (CosmicWatch hardware)

- **Hardware:** plastic scintillator (polystyrene/PVT, ~5×5×1 cm³) + **SiPM** (Hamamatsu
  S13360 / SensL C-series). 10-bit ADC (v2) / 12-bit (v3X). (Axani et al. 2018; v3X 2025).
- **Energy loss (Bethe-Bloch):** `−⟨dE/dx⟩` with minimum at β·γ≈3–4 → **MIP**. Cosmic
  muons (>1 GeV) are MIP.
- **Typical deposit:** MIP ≈ 1.5–2.0 MeV·g⁻¹·cm² × ρ(~1 g/cm³) × 1 cm ⇒ **~2.0 MeV**.
- **Scintillation→signal:** ionization excites fluorophores → photons ~400 nm → internal
  reflection → SiPM in Geiger mode (gain ~10⁶) → pulse.
- **Conditioning:** peak-detector "stretches" the pulse (ns→~100 µs) so the ADC can read it.
  Calibration (polynomial) ADC→mV. **Saturation ~180–200 mV** (very large deposits "blind"
  the amplitude → ceiling value).

→ **MuonHub implication:** `sm/sx/sn` (mV) reflect deposited energy with a saturation ceiling;
document this in tooltips. The amplitude spectrum is the rich physical observable (§5).

---

## 4. Dead time and rate correction (MANDATORY)

- **Dead time per event:** v2 ≈ **50 ms** (very large!), v3X ≈ **400 µs** (Axani 2025,
  arXiv:2508.12111).
- The measured rate **underestimates** the true rate. Non-paralyzable correction:

  `R_real = R_measured / (1 − R_measured · τ_DT)`

- Ignoring it causes fatal systematic underestimates (especially at high-rate Andean sites)
  and ruins the barometric calculation.

→ **MuonHub implication:** `packages/physics` MUST apply this correction; τ_DT depends on the
hardware version (device-type metadata). The `dt` field (% dead time) feeds into this.

---

## 5. Critical limitation of the individual detector (scientific honesty)

- **MIP indistinguishability:** a 15 MeV electron and a 4 GeV muon deposit **the same
  ~2 MeV** crossing 1 cm → their pulses in mV overlap. **Impossible to separate with 1 SiPM.**
- **Gamma contamination:** ambient γ rays (K-40, Th-232, radon) do not ionize directly,
  but via **Compton scattering** produce recoil electrons that do generate pulses
  (broadening the low/mid channels).
- **No directionality or primary energy** with a single scintillator.

**What IS defensible to report:**
- **Integral rate of charged particles** / **MIP-type event rate** (with declared
  amplitude threshold).
- **Aggregate** inference: muonic dominance (75–80% at sea level) implies that *fluctuations*
  in the rate track galactic muons (e.g., a Forbush decrease is visible).
- **Never** label an individual event as "muon" with certainty.

→ **MuonHub implication:** honest labelling. The dashboard uses "charged particles /
MIP-type" + uncertainty; "muon" only in aggregate context or with coincidence (§7).

---

## 6. Amplitude spectrum (deposited energy)

The amplitude histogram aggregated from an individual detector shows 3 structures:
1. **Thermal noise / sub-threshold** (SiPM dark count, soft gammas) — filtered (e.g.
   `ADC>30` or dynamic trigger).
2. **Landau distribution** — wide asymmetric peak; the **MPV** (most probable value)
   corresponds to the ~2 MeV of the MIP.
3. **Landau tail (high energy)** — diagonal tracks (larger Δx), multiple showers,
   delta rays.

→ **MuonHub implication:** the **amplitude/Landau spectrum is a first-class chart**
with log scale and the MPV marked. It is the closest to honest "energy physics".

---

## 7. Coincidence and muon telescopes (evolution)

- Stack 2+ detectors + (optional) absorber (Pb/steel); logical **AND** gate in
  a time window (ns by hardware; ~10 ms by software/timestamps).
- **Benefits:** muon purity **>99%** (purges the soft component), thermal noise rejection
  (accidental coincidence rate v3X ~4.5×10⁻⁵ Hz), and **directionality** (acceptance cone →
  East-West anisotropy).

→ **MuonHub implication:** a coincidence assembly (two or more stacked devices) enables reporting
"muons" rigorously and with directionality. The v6 domain model represents it as an Assembly
(ADR-004); the data model is specified in milestone M1.

---

## 8. Flux modulations and corrections

### (A) Barometric — the dominant one at surface
`I(P) = I₀·e^(β(P−P₀))` ⇒ linear: `−ln(I/I₀) = β(P−P₀)`. **β is NOT universal:**

| Station | β (%/hPa) | Reference |
|---|---|---|
| Equatorial (Jeddah, surface) | ≈ −0.24 ± 0.18 | Maghrabi et al. |
| South Pole (Marambio, WCD) | ≈ −0.20 ± 0.03 | LAGO / Santos (2021) |
| Global Muon Detector Network | ≈ −0.12 to −0.17 | De Mendonça et al. (2016) |
| Low latitude/high rigidity (Hong Kong) | ≈ −0.085 | Wang & Lee (1967) |

→ **MuonHub implication:** `packages/physics` calculates **local β by regression** over the
historical data of each node; never assume a fixed β. (See also capability C2 of the archived AI design.)

### (B) Thermal — dual
- **Negative (surface/altitude):** warm air expands → cascade initiates higher →
  muons travel more → more decay → less flux.
- **Positive (deep underground, e.g. IceCube):** lower density → fewer collisions that
  abort pions → more hard muons.
- Fine correction requires vertical profiles (GFS/NCEP).

### (C) Diurnal / seasonal / solar
- Diurnal variation (solar wind anisotropy), seasonal (temperature), and **11-year solar
  cycle** (anticorrelation: solar maximum → fewer GCR).

### (D) Altitude
- Quito ~2850 m → ~730 hPa; hadronic/neutronic flux **5–9× larger** than at sea level.
  Normalize multi-station analyses by the native reference isobar.

### (E) Geomagnetic cutoff rigidity — Ecuador's context
- `R = pc/(ze)` [GV]. Only particles with `R > R_c` (local cutoff rigidity) penetrate.
- Poles: R_c ~1 GV (weak particles enter). **Ecuadorian Andes: R_c ≈ 12–13 GV**
  (among the highest on Earth; the global maximum ≈17 GV corresponds to Doi Inthanon,
  Thailand — Gerontidou et al. 2021; PSNM) → natural filter that purges low-energy solar noise.

→ **MuonHub implication:** main scientific argument:
Ecuadorian data is hard, pristine galactic signal, scarce in Northern Hemisphere networks.

---

## 9. Space weather and events (external correlation)

- **Forbush decreases (FD):** a CME sweeps GCR → sudden asymmetric drop in the
  rate (**1% to ~10%**, depending on latitude), onset within hours, recovery in **days–weeks**.
  Certify by crossing with **NMDB** (neutrons), **NOAA SWPC** (B, Bz, solar wind) and
  **NASA DONKI** (CME/flare catalog).
- **GLE (Ground Level Enhancements):** direct solar protons. **Practically null in
  Ecuador** due to the high cutoff rigidity (~12–13 GV; honesty: do not promise GLE detection
  in the Andes).
- **Geomagnetic storms:** indices **Kp** (3-hourly, 0–9) and **Dst** (hourly, nT) →
  features for AI; can transiently lower R_c.
- **11-year solar cycle:** long-term anticorrelation.

→ **MuonHub implication:** validates and prioritizes external-data correlation (NMDB/NOAA/DONKI/Kp-Dst; milestone M4) and the
muon↔neutron correlation views.

---

## 10. Statistics and "normal values"

- **Poisson:** events are independent; for N counts, `σ ≈ √N`. Relative error
  `√N/N`.
- **One minute is noisy:** N≈3600/min → σ≈60 → error **~1.6%**. A weak Forbush (~1%) is
  buried in the per-minute noise.
- **Best practices:** integrate over **hours** (N≥100k) → error <0.3%. Define anomaly with
  **≥3σ persistent** thresholds, over an already-corrected rate (dead time + barometric + thermal).
- **Per-stream baseline:** build the "normal" empirically from a solar-quiet historical
  record, after removing thermal-barometric deltas. Do not use a priori formulas.

→ **MuonHub implication:** charts/alerts use long rolling windows; AI respects these
limits (no "anomalies" over one minute). Reinforces C1/C3 of `docs/archive/planning/06-AI-DESIGN.md`.

---

## 11. Defensible AI/ML (summary; detail in `docs/archive/planning/06-AI-DESIGN.md`)

- **Anomaly detection (unsupervised):** Autoencoders, Isolation Forest on the
  multivariate vector (mV, corrected rate, pressure, temperature).
- **Non-linear barometric/thermal correction:** **Gradient Boosting (XGBoost/LightGBM)** instead
  of a static linear β.
- **Forecasting:** ARIMA/SARIMA and LSTM (post-Forbush recovery).
- **Cross-correlation:** clustering/SVM (DBSCAN) against DONKI/NMDB/Kp to date the shock.

→ **MuonHub implication:** the future AI design (after 6.0.0; archived draft:
`docs/archive/planning/06-AI-DESIGN.md`) should adopt XGBoost as the correction approach (C2) and the
Poisson limit as a hard constraint on windows.

---

## 12. Outreach glossary (for landing F3 and tooltips)

Rigorous but accessible versions available in the deep research (section "Glossary"):
**Cosmic ray, Atmospheric cascade, Muon, Time dilation, Plastic scintillator, SiPM,
Barometric correction, Forbush decrease, Geomagnetic cutoff rigidity.** The documentation
agent adapts them to es/en/pt-BR for the educational texts.

---

## 13. References

- Particle Data Group, *Review of Particle Physics* (section Cosmic Rays).
- Axani et al., *The CosmicWatch Desktop Muon Detector* (2018); v3X (2025, arXiv:2508.12111).
- Grieder, *Cosmic Rays at Earth*; Gaisser, *Cosmic Rays and Particle Physics*.
- Heitler, *The Quantum Theory of Radiation* (EM cascade model).
- LAGO Collaboration; Santos (2021) — barometric coefficient, WCD.
- De Mendonça et al. (2016) — Global Muon Detector Network.
- Maghrabi et al. (KAAU) — equatorial station; Wang & Lee (1967) — Hong Kong.
- IGRF (International Geomagnetic Reference Field) — cutoff rigidity.
- Gerontidou et al. (2021), "World grid of cosmic ray vertical cut-off rigidity for the last
  decade," *Adv. Space Res.* 67, 2231–2240. https://doi.org/10.1016/j.asr.2021.01.011
- Banglieng et al. / PSNM Collaboration — Princess Sirindhorn Neutron Monitor at Doi Inthanon,
  Thailand (R_c ≈ 17 GV, highest known station); arXiv:2605.15696 and refs therein.
- Maghrabi et al. (2023), "The Role of Atmospheric Pressure, Temperature, and Humidity on
  Cosmic Ray Muons at a Low Latitude Station (KAAU, Jeddah; β ≈ −0.24 ± 0.18 %/hPa),"
  *Int. J. Astron. Astrophys.* 13, 236–258. https://doi.org/10.4236/ijaa.2023.133013
- NMDB (Neutron Monitor Database); NOAA SWPC; NASA DONKI.

> Verify and complete citations (DOI/links) when preparing the scientific article (launch milestone M5).
