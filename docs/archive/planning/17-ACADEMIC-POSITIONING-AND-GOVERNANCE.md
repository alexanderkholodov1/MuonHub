# MunHub Lab v6.0 — Academic Positioning, Attribution, and Governance

> This document covers what MunHub needs to be **ready to announce** to the scientific community,
> with correct attribution to Alexander Kholodov (critical for his research career), following
> best practices for **open science**. Includes the legal/academic/administrative steps in order.

---

## 1. Authorship and attribution (highest priority for career)

- **Creator and lead developer:** Alexander Kholodov (USFQ). Must be unambiguously and citably
  recorded.
- **Supervisor / responsible researcher (PI):** Dennis Cazar (LEOPARD, USFQ).
- **Framework:** EL-BONGO project, Erasmus+ CBHE (EU-funded); USFQ; LEOPARD laboratory.
- **How this materializes in the repo and platform:**
  - `CITATION.cff` (GitHub standard format) → automatically generates "Cite this repository".
  - `AUTHORS.md` + clear credits in the `README` and the platform **footer/About** page.
  - Funding acknowledgments (Erasmus+/EU CBHE, USFQ, LEOPARD) in README and papers.

## 2. Persistent identifiers (research standard)

- **ORCID:** Alexander must **create his ORCID iD** (free, 5 min, orcid.org) → unique researcher
  identifier. Link it in: platform profile, `CITATION.cff`, repo, and papers.
  (Also useful: optional ORCID login for researchers on the platform — future.)
- **Software DOI (citable):** integrate **GitHub ↔ Zenodo** → each tagged *release* receives a
  **DOI**. This makes MunHub software formally citable (with your name as author).
- **Dataset DOI:** public datasets can receive a DOI (S68) → institutions cite the network data
  (and you as the platform creator).

## 3. Licenses (already decided, context here for reference)

- **Code:** MIT (D14) — maximum adoption, requires preserving the copyright notice (your credit).
- **Public data:** CC-BY 4.0 (D19) — reusable **with mandatory attribution**.

## 4. Scientific publication (recommended path)

- **Preprint first:** submit to **arXiv** (establishes priority/date, free, citable) when the
  system and/or first data are ready.
- **Journal for the SOFTWARE:** **JOSS** (Journal of Open Source Software) — ideal and designed
  for open-source scientific software like MunHub; peer review focused on the software.
- **Journal for the SCIENCE/instrument:** options depend on results — e.g. *JINST*,
  *Rev. Sci. Instrum.*, *EPJ Plus*, or *The Physics Teacher* (educational angle). The physicist
  and supervisor choose the venue based on the contribution.
- Theoretical foundation already available (`docs/research/THEORETICAL-FOUNDATION.md`) → input
  for the paper (EPIC-12 S48).

## 5. Open science standards (FAIR-ish checklist)

- ✅ Open source (MIT) · ✅ Open data (CC-BY) · ✅ Documentation (EPIC-12).
- **Semantic versioning** (vX.Y.Z) + `CHANGELOG.md` + tagged *releases*.
- **Reproducibility:** README with deployment steps (Firebase and Red Clara), sample data.
- **DOIs + ORCID** (above). **FAIR data** (Findable, Accessible, Interoperable, Reusable):
  rich metadata per station (already in the model!), open formats (CSV/JSON), public API (S67).

## 6. Contribution governance (when universities join)

- `CONTRIBUTING.md` (how to contribute, SDD workflow) + `CODE_OF_CONDUCT.md` (community norms).
- Credit to contributors (e.g. all-contributors) without diluting primary authorship.
- Simple contribution agreement (which license applies to external contributions).

## 7. Legal / institutional / administrative (Alexander's actions — outside the code)

> These are human-managed tasks, not resolvable by an agent. Listed here so they stay on record:

- [ ] **Create ORCID iD.**
- [ ] **Clarify intellectual property (IP) with USFQ/Dennis**: the system was built by Alexander
      under USFQ research and Erasmus+ funding. A **written agreement** is advisable to recognize
      authorship and usage rights for portfolio/career purposes, and to define whether IP is
      personal, shared, or institutional. **Do this early** (avoids future ambiguity).
- [ ] **Obtain written authorship recognition** (the supervisor has already drafted a contribution
      letter — keep it; expand if needed).
- [ ] **Confirm acknowledgment requirements** of the Erasmus+/EU funding (typically requires a
      specific mention + logos on outputs).
- [ ] **Terms of Service + Privacy Policy** for the platform (supports `10-Governance`; review
      with USFQ before public launch).
- [ ] Define the official **name/identity** (MunHub Lab), logo, and whether it is formally
      registered in any way.

## 8. Community presence (future, to keep in mind)

- Public landing page as the project's face (F3) + a short **whitepaper**.
- Paper + preprint + DOIs build a **citable footprint**.
- Present at conferences/schools (EL-BONGO, LAGO, LatAm particle physics networks).
- The **station network** as a citable resource for other universities.

## 9. Decisions to confirm (when ready)
- Target **JOSS** for the software + **arXiv** preprint? (recommended).
- Set up **Zenodo↔GitHub** for release DOIs from the first release?
- **IP position** (to be defined with USFQ) — not an AI decision.
