# Science documentation

The scientific basis of MuonHub and the references that scientific code must follow.

| Document | What it is |
|---|---|
| [`THEORETICAL-FOUNDATION.md`](THEORETICAL-FOUNDATION.md) | **The official scientific basis of the project.** What a single-SiPM detector can and cannot measure, the corrections (dead time, barometric, thermal), the amplitude spectrum, coincidence, Forbush decreases, statistics, and defensible AI/ML. Every physics claim in code, UI, and documentation must be consistent with it. |
| [`SERIAL-FORMATS.md`](SERIAL-FORMATS.md) | Canonical reference for the detector serial formats inherited from v5 (CosmicWatch/MuNRa, JSON, key-value, CSV), with the open unit/column ambiguities and the 2026-10 audit status note. |
| [`RESEARCH-NOTES-2026-10.md`](RESEARCH-NOTES-2026-10.md) | Sourced research notes (not decisions): open cosmic-ray data, simulation tooling, muography feasibility, seismic ↔ cosmic-ray correlation, offline precise timestamping. |

## Rules

- **Physicist review is mandatory.** Any change to physics wording, corrections, statistics, or
  scientific claims needs a review by the physicist persona before it merges.
- **Never contradict [`THEORETICAL-FOUNDATION.md`](THEORETICAL-FOUNDATION.md).** If new evidence
  calls part of it into question, propose a change to the foundation first; code and UI follow
  the foundation, never the other way round.
- **Scientific honesty:** on single-SiPM devices, individual events are a "charged-particle /
  MIP-type" rate, never "muons"; muon language is valid only for aggregate inference or
  coincidence-mode hardware.
- Research notes record findings with their sources and verification status; they become scope
  only through [`docs/product/ROADMAP.md`](../product/ROADMAP.md) and an approved spec.
