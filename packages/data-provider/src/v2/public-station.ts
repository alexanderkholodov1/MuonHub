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

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const ID_LENGTH = 20;

/**
 * Random id from the 62-character alphabet, drawn from the platform CSPRNG with rejection
 * sampling (no modulo bias). 20 characters carry about 119 bits.
 */
export function randomId(length = ID_LENGTH): string {
  const limit = 256 - (256 % ID_ALPHABET.length);
  let out = "";
  while (out.length < length) {
    const bytes = new Uint8Array(length * 2);
    globalThis.crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < limit && out.length < length) out += ID_ALPHABET[b % ID_ALPHABET.length];
    }
  }
  return out;
}

/** New transfer id: random, no station or user id inside. */
export function newTransferId(): string {
  return randomId();
}

/** New stream id: random, because stream ids appear in anonymously readable paths. */
export function newStreamId(): string {
  return randomId();
}

/** New station id: random and unguessable; it carries no owner uid (ADR-009). */
export function newStationId(): string {
  return randomId();
}
