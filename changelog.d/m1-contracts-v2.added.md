- Domain contracts v2 in `@muonhub/shared` (`v2` namespace, zod 4): users, stations with private
  exact location and owner-chosen public precision, sharing and immutable ownership transfers,
  device types (CosmicWatch v2, v3X, MuNRa built in), devices with geometry, assemblies, versioned
  calibrations, owner-bound streams, sessions with time provenance, complete-minute records with
  counter-based live time, day summaries without zero-filled gaps, live and status records,
  multichannel and sampled data, agent raw lines, and the access mirror and audit entries.
- A compact Realtime Database form for minute records with a lossless round trip.
- `docs/architecture/DATA-MODEL.md`: entities, Firestore and Realtime Database paths, key table,
  budget estimates, and the v5 → v6 field mapping.
