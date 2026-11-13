/**
 * The detector read through the landing's v5 bridge (features/landing/live-feed.ts), listed on the
 * network page until the v6 agent publishes its own public projection. Shown like any station whose
 * owner chose `approximate`: a point rounded to 0.1° (about 11 km), never the exact location.
 */
import { LIVE_SOURCE } from "@/features/landing/live-feed";
import type { StationFeature } from "./geojson";

export const BRIDGE_STATION = {
  id: "leopard-lab-usfq",
  name: LIVE_SOURCE.station,
  place: "Quito, EC",
  point: { lat: -0.2, lon: -78.4 },
  deviceCount: 1,
} as const;

export function bridgeFeature(active: boolean): StationFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [BRIDGE_STATION.point.lon, BRIDGE_STATION.point.lat] },
    properties: {
      id: BRIDGE_STATION.id,
      name: BRIDGE_STATION.name,
      approximate: true,
      active,
      deviceCount: BRIDGE_STATION.deviceCount,
      place: BRIDGE_STATION.place,
    },
  };
}
