/**
 * Serialization / deserialization between typed v6 entities and the Firebase RTDB plain-object
 * representation. All schemas from `@muonhub/shared` are used for validation at every boundary
 * (guardrail FR6).
 *
 * Values are stored verbatim — no scientific rounding, no filtering.
 *
 * "shares" on Station is stored in RTDB as a map { [uid]: "viewer"|"editor" } for efficient
 * per-user rule lookups; the entity model uses an array of StationShare objects. These helpers
 * convert between the two.
 */

import type {
  User,
  Institution,
  Station,
  Detector,
  Session,
  MinuteRecord,
  RealtimeRecord,
  EventSummary,
} from "@muonhub/shared";
import {
  UserSchema,
  InstitutionSchema,
  StationSchema,
  DetectorSchema,
  SessionSchema,
  MinuteRecordSchema,
  RealtimeRecordSchema,
  EventSummarySchema,
} from "@muonhub/shared";
import { padTs, unpadTs } from "./firebase-paths.js";
import {
  type CanonicalSlimMinuteRecord,
  toCanonicalSlimMinuteRecord,
} from "./slim-minute-record.js";

// ── Internal logger (never throws) ───────────────────────────────────────────

function warn(msg: string, err?: unknown): void {
  console.warn(`[FirebaseProvider] ${msg}`, err ?? "");
}

/**
 * Shallow copy of `obj` without the given keys. Entity ids are stored as the RTDB
 * node key, not duplicated inside the value, so they are stripped before writing.
 */
function omit<T extends object>(obj: T, ...keys: string[]): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
  for (const k of keys) delete copy[k];
  return copy;
}

// ── RTDB shape aliases ────────────────────────────────────────────────────────

/** Raw shape for a User node as stored in RTDB. */
type RtdbUser = Record<string, unknown>;
/** Raw shape for shares sub-node: { [uid]: "viewer"|"editor" } */
type RtdbShares = Record<string, "viewer" | "editor">;

// ── User ─────────────────────────────────────────────────────────────────────

export function serializeUser(user: User): RtdbUser {
  return omit(user, "uid");
}

export function deserializeUser(uid: string, raw: unknown): User | null {
  if (raw == null || typeof raw !== "object") return null;
  const result = UserSchema.safeParse({ uid, ...(raw as object) });
  if (!result.success) {
    warn(`User(${uid}) parse failed`, result.error.message);
    return null;
  }
  return result.data;
}

// ── Institution ───────────────────────────────────────────────────────────────

export function serializeInstitution(inst: Institution): Record<string, unknown> {
  return omit(inst, "id");
}

export function deserializeInstitution(id: string, raw: unknown): Institution | null {
  if (raw == null || typeof raw !== "object") return null;
  const result = InstitutionSchema.safeParse({ id, ...(raw as object) });
  if (!result.success) {
    warn(`Institution(${id}) parse failed`, result.error.message);
    return null;
  }
  return result.data;
}

// ── Station ───────────────────────────────────────────────────────────────────

/**
 * Convert shares array → RTDB map for storage.
 * The map form { [uid]: "viewer"|"editor" } enables per-user security rules.
 */
function sharesArrayToMap(shares: Station["shares"]): RtdbShares {
  const map: RtdbShares = {};
  for (const s of shares) {
    map[s.uid] = s.permission;
  }
  return map;
}

/**
 * Convert RTDB shares map → shares array for the entity.
 */
function sharesMapToArray(map: unknown): Station["shares"] {
  if (map == null || typeof map !== "object") return [];
  const result: Station["shares"] = [];
  for (const [uid, perm] of Object.entries(map as Record<string, unknown>)) {
    if (perm === "viewer" || perm === "editor") {
      result.push({ uid, permission: perm });
    }
  }
  return result;
}

export function serializeStation(station: Station): Record<string, unknown> {
  return {
    ...omit(station, "id", "shares"),
    shares: sharesArrayToMap(station.shares),
  };
}

export function deserializeStation(id: string, raw: unknown): Station | null {
  if (raw == null || typeof raw !== "object") return null;
  const rawObj = raw as Record<string, unknown>;
  // Convert the shares map to an array before parsing.
  const sharesArray = sharesMapToArray(rawObj["shares"]);
  const result = StationSchema.safeParse({
    id,
    ...rawObj,
    shares: sharesArray,
  });
  if (!result.success) {
    warn(`Station(${id}) parse failed`, result.error.message);
    return null;
  }
  return result.data;
}

// ── Detector ──────────────────────────────────────────────────────────────────

export function serializeDetector(detector: Detector): Record<string, unknown> {
  return omit(detector, "id", "stationId");
}

export function deserializeDetector(
  id: string,
  stationId: string,
  raw: unknown,
): Detector | null {
  if (raw == null || typeof raw !== "object") return null;
  const result = DetectorSchema.safeParse({ id, stationId, ...(raw as object) });
  if (!result.success) {
    warn(`Detector(${id}) parse failed`, result.error.message);
    return null;
  }
  return result.data;
}

// ── Session ───────────────────────────────────────────────────────────────────

export function serializeSession(session: Session): Record<string, unknown> {
  return omit(session, "id", "detectorId");
}

export function deserializeSession(
  id: string,
  detectorId: string,
  raw: unknown,
): Session | null {
  if (raw == null || typeof raw !== "object") return null;
  const result = SessionSchema.safeParse({ id, detectorId, ...(raw as object) });
  if (!result.success) {
    warn(`Session(${id}) parse failed`, result.error.message);
    return null;
  }
  return result.data;
}

// ── MinuteRecord ──────────────────────────────────────────────────────────────

/** Store only the canonical raw fields; `ts` is the padded RTDB key. */
export function serializeMinuteRecord(
  record: MinuteRecord,
): CanonicalSlimMinuteRecord {
  return toCanonicalSlimMinuteRecord(record);
}

/**
 * `latest` has no timestamp key, so it stores `ts` plus the canonical raw
 * observables. Derived fields are still omitted.
 */
export function serializeLatestMinuteRecord(
  record: MinuteRecord,
): CanonicalSlimMinuteRecord & Pick<MinuteRecord, "ts"> {
  return {
    ts: record.ts,
    ...toCanonicalSlimMinuteRecord(record),
  };
}

export function deserializeMinuteRecord(
  key: string,
  raw: unknown,
): MinuteRecord | null {
  if (raw == null || typeof raw !== "object") return null;
  const rawObj = raw as Record<string, unknown>;
  const result = MinuteRecordSchema.safeParse({
    ts: unpadTs(key),
    ec: rawObj["ec"],
    cc: rawObj["cc"],
    sm: rawObj["sm"],
    sx: rawObj["sx"],
    sn: rawObj["sn"],
    tp: rawObj["tp"],
    pr: rawObj["pr"],
    dt: rawObj["dt"],
  });
  if (!result.success) {
    warn(`MinuteRecord(key=${key}) parse failed`, result.error.message);
    return null;
  }
  return result.data;
}

export function deserializeLatestMinuteRecord(raw: unknown): MinuteRecord | null {
  if (raw == null || typeof raw !== "object") return null;
  const rawObj = raw as Record<string, unknown>;
  const result = MinuteRecordSchema.safeParse({
    ts: rawObj["ts"],
    ec: rawObj["ec"],
    cc: rawObj["cc"],
    sm: rawObj["sm"],
    sx: rawObj["sx"],
    sn: rawObj["sn"],
    tp: rawObj["tp"],
    pr: rawObj["pr"],
    dt: rawObj["dt"],
  });
  if (!result.success) {
    warn("latest MinuteRecord parse failed", result.error.message);
    return null;
  }
  return result.data;
}

// ── EventSummary ───────────────────────────────────────────────────────────────

/** Store detectorId and intervalStartTs in the path/key, not redundantly in the value. */
export function serializeEventSummary(summary: EventSummary): Record<string, unknown> {
  return omit(summary, "detectorId", "intervalStartTs");
}

export function deserializeEventSummary(
  detectorId: string,
  key: string,
  raw: unknown,
): EventSummary | null {
  if (raw == null || typeof raw !== "object") return null;
  const result = EventSummarySchema.safeParse({
    ...(raw as object),
    detectorId,
    intervalStartTs: unpadTs(key),
  });
  if (!result.success) {
    warn(`EventSummary(key=${key}) parse failed`, result.error.message);
    return null;
  }
  return result.data;
}

// ── RealtimeRecord ────────────────────────────────────────────────────────────

export function serializeRealtimeRecord(
  record: RealtimeRecord,
): Record<string, unknown> {
  return record as unknown as Record<string, unknown>;
}

export function deserializeRealtimeRecord(
  key: string,
  raw: unknown,
): RealtimeRecord | null {
  if (raw == null || typeof raw !== "object") return null;
  const rawObj = raw as Record<string, unknown>;
  const ts = rawObj["ts"] ?? unpadTs(key);
  const result = RealtimeRecordSchema.safeParse({ ...rawObj, ts });
  if (!result.success) {
    warn(`RealtimeRecord(key=${key}) parse failed`, result.error.message);
    return null;
  }
  return result.data;
}

// ── Re-export warn for use in provider ───────────────────────────────────────
export { warn };

// ── Re-export padTs for latest comparison ────────────────────────────────────
export { padTs };
