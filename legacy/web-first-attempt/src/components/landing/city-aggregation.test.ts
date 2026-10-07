import { describe, expect, it } from "vitest";
import type { Station } from "@muonhub/shared";
import {
  aggregatePublicStationsByCity,
  cityKey,
  stationToPublicCitySummary,
  type PublicStationCitySummary,
} from "./city-aggregation";

describe("city aggregation for the public landing map", () => {
  it("groups public station summaries by normalized city and country", () => {
    const stations: PublicStationCitySummary[] = [
      { id: "station-1", city: " Quito ", country: "ec" },
      { id: "station-2", city: "Quito", country: "EC" },
      { id: "station-3", city: "Lima", country: "PE" },
    ];

    const cities = aggregatePublicStationsByCity(stations, [
      { stationId: "station-1", detectorCount: 1, activeNowCount: 1 },
      { stationId: "station-2", detectorCount: 2, activeNowCount: 0 },
      { stationId: "station-3", detectorCount: 1, activeNowCount: 1 },
    ]);

    expect(cities).toHaveLength(2);
    expect(cities[0]).toMatchObject({
      key: "EC:quito",
      city: "Quito",
      country: "EC",
      detectorCount: 3,
      activeNowCount: 1,
      positionSource: "city-centroid",
    });
    expect(cities[0]?.centroid).toEqual({ latitude: -0.18, longitude: -78.47 });
    expect(cities[1]).toMatchObject({
      key: "PE:lima",
      detectorCount: 1,
      activeNowCount: 1,
    });
  });

  it("omits cities without public detectors", () => {
    const cities = aggregatePublicStationsByCity(
      [{ id: "empty-station", city: "Quito", country: "EC" }],
      [{ stationId: "empty-station", detectorCount: 0, activeNowCount: 0 }],
    );

    expect(cities).toEqual([]);
  });

  it("uses deterministic coarse fallback positions for unknown city centroids", () => {
    const stations: PublicStationCitySummary[] = [
      { id: "station-1", city: "Ambato", country: "EC" },
      { id: "station-2", city: "Ambato", country: "EC" },
    ];

    const first = aggregatePublicStationsByCity(stations, [
      { stationId: "station-1", detectorCount: 1, activeNowCount: 0 },
      { stationId: "station-2", detectorCount: 1, activeNowCount: 1 },
    ]);
    const second = aggregatePublicStationsByCity(stations, [
      { stationId: "station-1", detectorCount: 1, activeNowCount: 0 },
      { stationId: "station-2", detectorCount: 1, activeNowCount: 1 },
    ]);

    expect(first[0]?.positionSource).toBe("coarse-country-fallback");
    expect(first[0]?.centroid).toEqual(second[0]?.centroid);
    expect(first[0]?.centroid.latitude.toString()).toMatch(/^-?\d+(?:\.(?:25|5|75))?$/);
    expect(first[0]?.centroid.longitude.toString()).toMatch(/^-?\d+(?:\.(?:25|5|75))?$/);
  });

  it("strips station fields that must never reach the map model", () => {
    const station = {
      id: "station-privacy",
      name: "Private lab site name",
      ownerUid: "owner-uid",
      institutionId: null,
      visibility: "public",
      embargoUntil: null,
      latitude: -0.1962,
      longitude: -78.4351,
      altitudeM: 2400,
      city: "Quito",
      country: "EC",
      placement: "indoor",
      type: "single",
      timezone: "America/Guayaquil",
      shares: [],
    } satisfies Station;

    const summary = stationToPublicCitySummary(station);

    expect(summary).toEqual({ id: "station-privacy", city: "Quito", country: "EC" });
    expect(Object.keys(summary)).not.toContain("latitude");
    expect(Object.keys(summary)).not.toContain("longitude");
    expect(Object.keys(summary)).not.toContain("ownerUid");
    expect(Object.keys(summary)).not.toContain("name");
  });

  it("builds stable city keys without preserving whitespace", () => {
    expect(cityKey("  Quito  ", " ec ")).toBe("EC:quito");
  });
});
