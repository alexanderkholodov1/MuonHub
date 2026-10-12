/**
 * Pure builders of derived records: the public projection and the RTDB authorization mirror.
 * The projection must hold exactly what the owner approved (`publicPrecision`) and no personal data.
 */
import { v2 } from "@muonhub/shared";

/** Rounding step of `approximate` locations: 0.1 degree (about 11 km). */
export const APPROXIMATE_STEP_DEG = 0.1;

function floorTo(value: number, step: number): number {
  return Math.floor(value / step + 1e-9) * step;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export function buildPublicStation(
  station: v2.Station,
  stats: { deviceCount: number; active: boolean },
  nowMs: number,
): v2.PublicStation {
  const { location, publicPrecision: precision } = station;
  const base = {
    schemaVersion: 2 as const,
    id: station.id,
    name: station.name,
    precision,
    deviceCount: stats.deviceCount,
    active: stats.active,
    updatedAt: nowMs,
  };
  let projection: v2.PublicStation;
  switch (precision) {
    case "exact":
      projection = {
        ...base,
        point: { lat: location.lat, lon: location.lon },
        city: location.city,
        countryCode: location.countryCode,
      };
      break;
    case "approximate":
      projection = {
        ...base,
        point: {
          lat: round6(floorTo(location.lat, APPROXIMATE_STEP_DEG)),
          lon: round6(floorTo(location.lon, APPROXIMATE_STEP_DEG)),
        },
        city: location.city,
        countryCode: location.countryCode,
      };
      break;
    case "city":
      projection = { ...base, city: location.city, countryCode: location.countryCode };
      break;
    case "country":
      projection = { ...base, countryCode: location.countryCode };
      break;
    case "hidden":
      projection = base;
      break;
  }
  return v2.PublicStationSchema.parse(projection);
}

/** True when a public projection must exist for this station. */
export function isPublic(station: Pick<v2.Station, "visibility">): boolean {
  return station.visibility === "public";
}

export function buildStationAccess(
  station: Pick<v2.Station, "ownerUid" | "visibility">,
  members: readonly Pick<v2.StationMember, "uid" | "role">[],
): v2.StationAccess {
  const editors: Record<string, true> = {};
  const viewers: Record<string, true> = {};
  for (const m of members) (m.role === "editor" ? editors : viewers)[m.uid] = true;
  const access: v2.StationAccess = {
    ownerUid: station.ownerUid,
    public: isPublic(station),
  };
  if (Object.keys(editors).length > 0) access.editors = editors;
  if (Object.keys(viewers).length > 0) access.viewers = viewers;
  return v2.StationAccessSchema.parse(access);
}

/** Recursively removes `undefined` (Firestore and RTDB reject it); never turns it into 0. */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v: unknown) => stripUndefined(v)) as T;
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

const NONCE_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Random id fragment (letters and digits) for stream ids and transfer ids. */
export function randomToken(length = 12): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += NONCE_ALPHABET[b % NONCE_ALPHABET.length];
  return out;
}

export function newTransferId(stationId: string): string {
  return `${stationId}_${randomToken(12)}`;
}

/** New stream id `<ownerUid>_<random>` (spec 0083 FR7). */
export function newStreamId(ownerUid: string): string {
  return `${ownerUid}_${randomToken(16)}`;
}
