# MunHub Lab v6.0 — Station Networks ("the array")

> Decision D27: group stations into **networks/arrays** for joint analysis. This is the
> highest scientific value of a distributed network. Phase F4/F5. Depends on `02`, `07`, `06`.

---

## 1. Concept

A **Network** (network/array) is a logical grouping of stations for viewing and analyzing them
together. Examples: "Andes Ecuador", "Campus USFQ", "EL-BONGO LatAm Network". A station
can belong to multiple networks.

> Not included (per D27): data backup between stations (peer backup) — the 3-layer redundancy
> already protects the data. The ability to have multiple detectors per station exists in the
> model, but the primary/backup designation is not built now.

## 2. Who creates them
- A user/institution creates a network and adds stations (their own or public ones).
- Linking happens **at station creation or editing**, or from a dedicated **network panel**.
- Network visibility inherits the rules of its member stations (only stations the user can see
  are visible in the joint view).

## 3. Scientific value (what this enables)

- **Compare and contrast** multiple stations on the same time axis (corrected rate,
  pressure, spectra).
- **Regional aggregates** (map/time-series of the full network).
- **Network-level event detection:** a Forbush **simultaneous across multiple stations** = a
  real signal of very high confidence (vs. a local artefact). Same principle by which NMDB
  confirms events with multiple monitors.
- **Geographic studies:** altitude/latitude effects across network stations (exploits the
  equatorial advantage: unique geomagnetic cutoff rigidity).
- **Network-level AI:** the pipeline (`06-AI-DESIGN`) can run cross-station analysis and
  report network insights (inter-station correlation, event propagation).

## 4. Data model (summary; detail in `02`)
- `networks(id, name, description, owner_uid, institution_id null, visibility, created_at)`
- `network_stations(network_id, station_id)`  — N:N relationship
- `ai_insights` can reference `network_id` (network-level insights).

## 5. UI
- **Network panel:** station list, network map, comparative charts, detected common events.
  Reuses components from `EPIC-5` (charts) and `S23` (map).
- Map markers on the landing page can be grouped by network in addition to city.

## 6. Backlog (new specs → see `04`)
- Create/edit network and link stations.
- Multi-station comparative view.
- Simultaneous network-event detection (with the physics agent validating the criterion).
