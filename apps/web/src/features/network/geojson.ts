/**
 * Public projections → map features (spec 0091). Only stations whose owner chose `exact` or
 * `approximate` precision have a point; every other station stays off the map — never placed at a
 * city centre or at random. Features carry projection fields only (no personal data exists there).
 */
import type { v2 } from "@muonhub/shared";

export interface StationFeature {
  readonly type: "Feature";
  readonly geometry: { readonly type: "Point"; readonly coordinates: [number, number] };
  readonly properties: {
    readonly id: string;
    readonly name: string;
    readonly approximate: boolean;
    readonly active: boolean;
    readonly deviceCount: number;
    readonly place: string;
  };
}

export interface StationCollection {
  readonly type: "FeatureCollection";
  readonly features: StationFeature[];
}

/** The place at the precision the owner chose; `null` when the location is hidden. */
export function placeText(station: v2.PublicStation): string | null {
  if (station.city !== undefined && station.countryCode !== undefined) {
    return `${station.city}, ${station.countryCode}`;
  }
  return station.countryCode ?? null;
}

export function toFeatures(stations: readonly v2.PublicStation[]): StationCollection {
  const features: StationFeature[] = [];
  for (const s of stations) {
    if (s.point === undefined) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.point.lon, s.point.lat] },
      properties: {
        id: s.id,
        name: s.name,
        approximate: s.precision === "approximate",
        active: s.active,
        deviceCount: s.deviceCount,
        place: placeText(s) ?? "",
      },
    });
  }
  return { type: "FeatureCollection", features };
}
