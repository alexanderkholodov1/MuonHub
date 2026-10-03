/**
 * RTDB path helpers for the Phase A muonhub node layout.
 *
 * Layout (spec 0007):
 *   /users/{uid}
 *   /institutions/{id}
 *   /stations/{stationId}
 *     └─ detectors/{detId}
 *          ├─ sessions/{sid}
 *          ├─ minutes/{ts}          (zero-padded epoch-ms key)
 *          ├─ realtime/{ts}
 *          ├─ eventSummaries/{ts}   (zero-padded interval-start key)
 *          └─ latest
 *   /detector_index/{detId}        → stationId  (O(1) lookup)
 *   Cloud Storage:
 *     signals/{detId}/{sessionId}/{ts}.ndjson.gz
 *
 * Minute keys are zero-padded to 15 digits so lexical order equals numeric order
 * (epoch-ms in year 9999 ≈ 2.5 × 10^14, 15 digits covers that range).
 */

/** Width of a zero-padded epoch-ms key. */
export const TS_PAD_WIDTH = 15;

/** Pad an epoch-ms timestamp so lexical order is the same as numeric order. */
export function padTs(ts: number): string {
  return String(ts).padStart(TS_PAD_WIDTH, "0");
}

/** Parse a padded key back to a number. */
export function unpadTs(key: string): number {
  return parseInt(key, 10);
}

// ── Node paths ────────────────────────────────────────────────────────────────

export const Paths = {
  user: (uid: string) => `users/${uid}`,
  institution: (id: string) => `institutions/${id}`,
  stations: () => `stations`,
  station: (id: string) => `stations/${id}`,
  stationShares: (id: string) => `stations/${id}/shares`,
  detectors: (stationId: string) => `stations/${stationId}/detectors`,
  detector: (stationId: string, detId: string) =>
    `stations/${stationId}/detectors/${detId}`,
  detectorIndex: (detId: string) => `detector_index/${detId}`,
  sessions: (stationId: string, detId: string) =>
    `stations/${stationId}/detectors/${detId}/sessions`,
  session: (stationId: string, detId: string, sid: string) =>
    `stations/${stationId}/detectors/${detId}/sessions/${sid}`,
  minutes: (stationId: string, detId: string) =>
    `stations/${stationId}/detectors/${detId}/minutes`,
  minute: (stationId: string, detId: string, ts: number) =>
    `stations/${stationId}/detectors/${detId}/minutes/${padTs(ts)}`,
  realtime: (stationId: string, detId: string) =>
    `stations/${stationId}/detectors/${detId}/realtime`,
  eventSummaries: (stationId: string, detId: string) =>
    `stations/${stationId}/detectors/${detId}/eventSummaries`,
  eventSummary: (stationId: string, detId: string, intervalStartTs: number) =>
    `stations/${stationId}/detectors/${detId}/eventSummaries/${padTs(intervalStartTs)}`,
  latest: (stationId: string, detId: string) =>
    `stations/${stationId}/detectors/${detId}/latest`,
} as const;

export function signalBlobObjectPath(ref: {
  detectorId: string;
  sessionId: string;
  intervalStartTs: number;
}): string {
  return `signals/${ref.detectorId}/${ref.sessionId}/${padTs(ref.intervalStartTs)}.ndjson.gz`;
}
