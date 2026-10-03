# MuonHub — Public site plan

> Status: information architecture recorded in M0 (2026-10-03). The **visual design is M2 work**,
> done in a dedicated design session against [`../design/DESIGN-LANGUAGE.md`](../design/DESIGN-LANGUAGE.md)
> ("Observatory Dark": the public site may be dramatic; the app stays calm, §7) and
> [`../design/LANDING-CONCEPT.md`](../design/LANDING-CONCEPT.md). Its complete plan is shown to the
> maintainer before execution. Items marked **Proposed** are not yet approved.

## Requirements from the maintainer

- A landing page and the supporting pages (About, the scientific background, and more).
- A separate page where **anyone, without an account, can watch something demonstrative of what
  the devices of public stations capture** — live data of stations marked public, possibly limited in some
  way.
- Exact coordinates are stored; what visitors see is the **public display precision chosen by each
  station owner** (exact, approximate, city, country, or hidden).

## Site-wide constraints (free tier)

- **Hosting ≈ 360 MB/day:** pages are static exports with lean JavaScript; charts use uPlot
  (≈ 50 KB) and Plotly is never loaded on public pages; long cache lifetimes; images optimized.
- **Realtime Database ≈ 100 simultaneous connections:** *(Proposed, ADR-005 §6)* anonymous visitors
  do not hold a persistent connection. The live mechanism is decided after the M1 measurement.
- **Firestore ≈ 50k reads/day:** public pages read pre-aggregated documents (e.g. one network
  summary per visit), never collections.
- **App Check** protects every public read.
- **Privacy:** public pages read only public projections — never personal data, never exact
  coordinates unless the owner chose "exact".
- **i18n:** English is the source locale; Spanish and Brazilian Portuguese are translations
  (decisions D17, D28). Every string lives in a message catalogue from M2 onward.
- **Accessibility and mobile:** mobile-first layouts, `prefers-reduced-motion` honoured, body text
  ≥ 16 px (design language).

## Pages

### 1. Landing (`/`)
- **Purpose:** explain MuonHub in seconds and invite universities, students, and enthusiasts in.
- **Content:** the hero concept from `LANDING-CONCEPT.md` (a field of faint stars and particle
  streaks where the cursor behaves like a mass bending nearby paths; optionally breathing with a real
  public rate); a short value statement; a **live teaser** (one small, slowly updating public rate);
  the network map preview; links to Live, Science, Join.
- **Data:** one network summary document; the live teaser uses the same public mechanism as the Live
  page.
- **Free tier:** the hero is a light canvas animation with a static fallback; no chart library on
  first load.

### 2. Live (`/live`) — the public demonstration page
- **Purpose:** let anyone watch what the devices of public stations capture right now.
- **Content:** a list or picker of public streams; a live chart of recent events and the rate;
  plain-language explanations of what is shown (charged-particle / MIP-type events, never "muons"
  for single-SiPM devices); clearly marked "demonstration" limits if any (e.g. the last ~10 minutes).
- **Data (Proposed, ADR-005):** for public streams only, the agent keeps a compact public window;
  the visitor's browser asks briefly for "anything new since …" every few seconds while the page is
  visible and stops when hidden; the exact mechanism (short REST requests vs Firestore) is chosen
  from the M1 measurement.
- **Free tier:** *(Proposed)* no persistent connection per visitor; incremental requests only.

### 3. Network map (`/network`)
- **Purpose:** show the reach of the network.
- **Content:** a map of public stations at each owner's chosen precision (aggregated bubbles when
  the precision is city or country); how many are active now (from the latest data time, not the
  registration status); links to public stations' Live view.
- **Data:** public station projections (no personal data); one aggregated document for counts.
- **Free tier:** vector map tiles from a free provider whose terms must be verified in M2.

### 4. Science (`/science`)
- **Purpose:** the scientific background, honest and accessible.
- **Content:** adapted from [`../science/THEORETICAL-FOUNDATION.md`](../science/THEORETICAL-FOUNDATION.md):
  cosmic rays and air showers; what a plastic scintillator with a SiPM measures (an integral
  charged-particle / MIP-type rate); why corrections matter (dead time, pressure, temperature); why
  one minute is too noisy and anomalies need hours; coincidence and when "muon" is the right word;
  Ecuador's high geomagnetic cutoff (≈ 12–13 GV); space weather and Forbush decreases. Uses the
  foundation's outreach glossary (§12).
- **Data:** none (static content). Wording reviewed against the foundation before publication.

### 5. About (`/about`)
- **Purpose:** who is behind MuonHub.
- **Content (to be provided by the maintainer):** the people, the lab, the institutions, and the
  funding acknowledgements. Candidates from the archived planning (to confirm): the LEOPARD laboratory
  at USFQ, the responsible researcher, the EL-BONGO / Erasmus+ CBHE framework, and the version
  history from MuNRa to MuonHub.
- **Data:** none (static content).

### 6. Join / Bring Your Own Detector (`/join`)
- **Purpose:** how to take part.
- **Content:** create an account; register a station and a device; install the agent; configure an
  unknown detector with the configuration terminal (M4); the review labels of the device-type
  catalogue.
- **Data:** the public part of the device-type catalogue (M4).

### 7. Data and citation (`/data`)
- **Purpose:** open science.
- **Content:** the data licence (CC-BY 4.0 for public data; MIT for code); how to cite MuonHub and
  its datasets (DOI from M5); how to download public data.
- **Data:** static content; dataset links from M5.

### 8. Documentation (`/docs`)
- **Purpose:** the user manual and FAQ.
- **Content:** the user manual (English first, then Spanish and Portuguese, M5); the FAQ.

### 9. Privacy and Terms (`/privacy`, `/terms`)
- **Purpose:** what is collected, what is public, and the rules of use (versioned Terms are
  **Proposed** for M5).

### 10. Contact (`/contact`)
- **Purpose:** reach the team.
- **Content:** the real contact address (open question — the current landing shows an unverified
  address) and the project's public repository.

### Signed-in area (outside this plan)
Accounts, stations, devices, streams, dashboards, comparisons, calibrations, and the admin area are
the app register of M2–M4 and follow the calm side of the design language.
