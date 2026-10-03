import type { Station } from "@muonhub/shared";

export interface PublicStationCitySummary {
  readonly id: string;
  readonly city: string;
  readonly country: string;
}

export interface StationDetectorActivity {
  readonly stationId: string;
  readonly detectorCount: number;
  readonly activeNowCount: number;
}

export interface CityDetectorAggregate {
  readonly key: string;
  readonly city: string;
  readonly country: string;
  readonly detectorCount: number;
  readonly activeNowCount: number;
  readonly centroid: CityCentroid;
  readonly positionSource: "city-centroid" | "coarse-country-fallback";
}

export interface CityCentroid {
  readonly latitude: number;
  readonly longitude: number;
}

type StationType = Pick<Station, "id" | "city" | "country">;

const CITY_CENTROIDS = {
  "AR:buenos aires": { latitude: -34.61, longitude: -58.38 },
  "BO:la paz": { latitude: -16.5, longitude: -68.15 },
  "BR:rio de janeiro": { latitude: -22.91, longitude: -43.17 },
  "BR:sao paulo": { latitude: -23.55, longitude: -46.63 },
  "BR:são paulo": { latitude: -23.55, longitude: -46.63 },
  "CL:santiago": { latitude: -33.45, longitude: -70.66 },
  "CO:bogota": { latitude: 4.71, longitude: -74.07 },
  "CO:bogotá": { latitude: 4.71, longitude: -74.07 },
  "CR:san jose": { latitude: 9.93, longitude: -84.08 },
  "CR:san josé": { latitude: 9.93, longitude: -84.08 },
  "EC:cuenca": { latitude: -2.9, longitude: -79.0 },
  "EC:guayaquil": { latitude: -2.19, longitude: -79.89 },
  "EC:quito": { latitude: -0.18, longitude: -78.47 },
  "MX:ciudad de mexico": { latitude: 19.43, longitude: -99.13 },
  "MX:ciudad de méxico": { latitude: 19.43, longitude: -99.13 },
  "MX:mexico city": { latitude: 19.43, longitude: -99.13 },
  "PE:lima": { latitude: -12.05, longitude: -77.04 },
  "UY:montevideo": { latitude: -34.9, longitude: -56.16 },
} as const satisfies Record<string, CityCentroid>;

const COUNTRY_FALLBACK_CENTROIDS = {
  AR: { latitude: -38.42, longitude: -63.62 },
  BO: { latitude: -16.29, longitude: -63.59 },
  BR: { latitude: -14.24, longitude: -51.93 },
  CL: { latitude: -35.68, longitude: -71.54 },
  CO: { latitude: 4.57, longitude: -74.3 },
  CR: { latitude: 9.75, longitude: -83.75 },
  EC: { latitude: -1.83, longitude: -78.18 },
  MX: { latitude: 23.63, longitude: -102.55 },
  PE: { latitude: -9.19, longitude: -75.02 },
  UY: { latitude: -32.52, longitude: -55.77 },
} as const satisfies Record<string, CityCentroid>;

export function stationToPublicCitySummary(station: StationType): PublicStationCitySummary {
  return {
    id: station.id,
    city: station.city,
    country: station.country,
  };
}

export function aggregatePublicStationsByCity(
  stations: ReadonlyArray<PublicStationCitySummary>,
  detectorActivity: ReadonlyArray<StationDetectorActivity>,
): CityDetectorAggregate[] {
  const activityByStation = new Map(
    detectorActivity.map((activity) => [activity.stationId, activity] as const),
  );
  const aggregates = new Map<string, CityDetectorAggregate>();

  for (const station of stations) {
    const activity = activityByStation.get(station.id);
    const detectorCount = Math.max(0, activity?.detectorCount ?? 0);
    if (detectorCount === 0) continue;

    const city = normalizeDisplayName(station.city);
    const country = station.country.trim().toUpperCase();
    const key = cityKey(city, country);
    const position = resolveCityPosition(city, country);
    const current = aggregates.get(key);

    aggregates.set(key, {
      key,
      city,
      country,
      detectorCount: (current?.detectorCount ?? 0) + detectorCount,
      activeNowCount: (current?.activeNowCount ?? 0) + Math.max(0, activity?.activeNowCount ?? 0),
      centroid: position.centroid,
      positionSource: position.source,
    });
  }

  return [...aggregates.values()].sort((left, right) => {
    if (right.detectorCount !== left.detectorCount) {
      return right.detectorCount - left.detectorCount;
    }
    return left.key.localeCompare(right.key);
  });
}

export function cityKey(city: string, country: string): string {
  return `${country.trim().toUpperCase()}:${normalizeForKey(city)}`;
}

function resolveCityPosition(
  city: string,
  country: string,
): { readonly centroid: CityCentroid; readonly source: CityDetectorAggregate["positionSource"] } {
  const cityCentroid = CITY_CENTROIDS[cityKey(city, country) as keyof typeof CITY_CENTROIDS];
  if (cityCentroid != null) {
    return { centroid: cityCentroid, source: "city-centroid" };
  }

  const countryCentroid =
    COUNTRY_FALLBACK_CENTROIDS[country.trim().toUpperCase() as keyof typeof COUNTRY_FALLBACK_CENTROIDS] ??
    globalFallbackCentroid(country);
  return {
    centroid: coarseJitteredFallback(countryCentroid, cityKey(city, country)),
    source: "coarse-country-fallback",
  };
}

function coarseJitteredFallback(anchor: CityCentroid, seed: string): CityCentroid {
  const hash = hashString(seed);
  const latitudeJitter = ((hash % 41) - 20) / 10;
  const longitudeJitter = (((Math.floor(hash / 41) % 41) - 20) / 10) * 1.2;

  return {
    latitude: clamp(roundToQuarterDegree(anchor.latitude + latitudeJitter), -85, 85),
    longitude: clamp(roundToQuarterDegree(anchor.longitude + longitudeJitter), -180, 180),
  };
}

function globalFallbackCentroid(country: string): CityCentroid {
  const hash = hashString(country);
  return {
    latitude: roundToQuarterDegree(-55 + (hash % 320) / 4),
    longitude: roundToQuarterDegree(-120 + (Math.floor(hash / 320) % 360) / 4),
  };
}

function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeForKey(value: string): string {
  return normalizeDisplayName(value).toLocaleLowerCase("en-US");
}

function roundToQuarterDegree(value: number): number {
  return Math.round(value * 4) / 4;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
