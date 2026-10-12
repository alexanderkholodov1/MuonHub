/** Test fixtures shared by the unit and emulator tests of the v2 data layer. */
import type { v2 } from "@muonhub/shared";

export const OWNER = "ownerUid1";
export const STATION_ID = `${OWNER}_station12345`;
export const STREAM_ID = `${OWNER}_abcdefgh1234`;
export const DEVICE_ID = "device-1";
export const T0 = Date.UTC(2026, 9, 1, 0, 0, 0);

export function station(overrides: Partial<v2.Station> = {}): v2.Station {
  return {
    schemaVersion: 2,
    id: STATION_ID,
    ownerUid: OWNER,
    name: "USFQ lab",
    location: { lat: -0.1963, lon: -78.4356, altitudeM: 2850, city: "Quito", countryCode: "EC" },
    publicPrecision: "approximate",
    visibility: "public",
    timezone: "America/Guayaquil",
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function device(overrides: Partial<v2.Device> = {}): v2.Device {
  return {
    schemaVersion: 2,
    id: DEVICE_ID,
    ownerUid: OWNER,
    stationId: STATION_ID,
    deviceType: { id: "cosmicwatch-v2", version: 1 },
    label: "CosmicWatch #1",
    geometry: { activeAreaCm2: 25, thicknessCm: 1, material: "EJ-200", orientation: "horizontal" },
    status: "active",
    createdAt: T0,
    ...overrides,
  };
}

export function stream(overrides: Partial<v2.Stream> = {}): v2.Stream {
  return {
    schemaVersion: 2,
    id: STREAM_ID,
    ownerUid: OWNER,
    stationId: STATION_ID,
    deviceId: DEVICE_ID,
    status: "active",
    createdAt: T0,
    ...overrides,
  };
}

export function session(overrides: Partial<v2.Session> = {}): v2.Session {
  return {
    schemaVersion: 2,
    id: "session-1",
    streamId: STREAM_ID,
    startedAt: T0,
    agentVersion: "6.0.0-test",
    deviceTypeVersion: 1,
    timeProvenance: { source: "ntp", offsetMs: 3, measuredAt: T0 },
    counters: {
      completeMinutes: 0,
      discardedPartialMinutes: 0,
      quarantinedLines: 0,
      eventIdGaps: 0,
    },
    ...overrides,
  };
}

export function minute(index: number, overrides: Partial<v2.MinuteRecord> = {}): v2.MinuteRecord {
  return {
    schemaVersion: 2,
    ts: T0 + index * 60_000,
    sessionId: "session-1",
    n: 12,
    amplitude: { mean: 80, min: 20, max: 300, unit: "mV" },
    liveSource: "counter",
    liveMs: 59_000,
    deadMs: 1_000,
    temperatureC: 21.5,
    quality: { eventIdGaps: 0, clockAnomalies: 0 },
    ...overrides,
  };
}

export function daySummary(day = "2026-10-01"): v2.DaySummary {
  const dayStart = Date.parse(`${day}T00:00:00Z`);
  return {
    schemaVersion: 2,
    streamId: STREAM_ID,
    day,
    hours: {
      "03": {
        hourStart: dayStart + 3 * 3_600_000,
        completeMinutes: 60,
        n: 700,
        liveSource: "nominal",
      },
    },
    updatedAt: dayStart + 4 * 3_600_000,
  };
}
