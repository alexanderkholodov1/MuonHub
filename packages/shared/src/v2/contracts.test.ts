import { describe, expect, it } from "vitest";
import {
  AdminEntrySchema,
  AssemblySchema,
  AuditEntrySchema,
  BUILTIN_DEVICE_TYPES,
  CalibrationSchema,
  ChannelEventSchema,
  DaySummarySchema,
  DeviceSchema,
  DeviceTypeSchema,
  InstitutionSchema,
  LiveEventSchema,
  MinuteRecordSchema,
  MUNRA,
  OwnershipTransferSchema,
  PublicStationSchema,
  RawLineSchema,
  SampleBlockSchema,
  SessionSchema,
  StationAccessSchema,
  StationMemberSchema,
  StationSchema,
  StreamSchema,
  StreamStatusPublicSchema,
  StreamStatusSchema,
  UserSchema,
  UsernameClaimSchema,
  hourOf,
  sampleBlockEnd,
  streamOwnerUid,
  type DaySummary,
  type MinuteRecord,
} from "./index.js";

/** Copy of `obj` without the given keys (keeps the tests free of unused bindings). */
function without<T extends object, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
  const copy = { ...obj } as Record<string, unknown>;
  for (const key of keys) delete copy[key as string];
  return copy as Omit<T, K>;
}

const T = Date.UTC(2026, 9, 7, 12, 0, 0);
const UID = "ownerUid123";

const station = {
  schemaVersion: 2,
  id: "usfq-roof",
  ownerUid: UID,
  name: "USFQ rooftop",
  location: { lat: -0.1966, lon: -78.4357, altitudeM: 2391, city: "Cumbayá", countryCode: "EC" },
  publicPrecision: "city",
  visibility: "public",
  timezone: "America/Guayaquil",
  createdAt: T,
  updatedAt: T,
} as const;

const minute: MinuteRecord = {
  schemaVersion: 2,
  ts: T,
  sessionId: "sess1",
  n: 144,
  amplitude: { mean: 40, min: 9, max: 180, unit: "mV" },
  liveSource: "counter",
  liveMs: 59_975,
  deadMs: 25,
  temperatureC: 27.1,
  pressureHpa: 767.9,
  quality: { eventIdGaps: 0, clockAnomalies: 0 },
};

describe("identity", () => {
  it("accepts a user and rejects an invalid username", () => {
    const user = {
      schemaVersion: 2,
      uid: UID,
      displayName: "A",
      username: "alex.k",
      email: "a@example.org",
      createdAt: T,
    };
    expect(UserSchema.safeParse(user).success).toBe(true);
    expect(UserSchema.safeParse({ ...user, username: "Alex K" }).success).toBe(false);
    expect(UsernameClaimSchema.safeParse({ uid: UID, createdAt: T }).success).toBe(true);
    expect(
      InstitutionSchema.safeParse({ schemaVersion: 2, id: "usfq", name: "USFQ", createdAt: T })
        .success,
    ).toBe(true);
  });
});

describe("station (CA4)", () => {
  it("requires an explicit visibility (no default)", () => {
    expect(StationSchema.safeParse(station).success).toBe(true);
    const withoutVisibility = without(station, "visibility");
    expect(StationSchema.safeParse(withoutVisibility).success).toBe(false);
  });
  it("rejects unknown fields and invalid coordinates", () => {
    expect(StationSchema.safeParse({ ...station, email: "x@y.z" }).success).toBe(false);
    expect(
      StationSchema.safeParse({ ...station, location: { ...station.location, lat: 91 } }).success,
    ).toBe(false);
  });
  it("public projection carries no personal data and follows the precision", () => {
    const pub = {
      schemaVersion: 2,
      id: "usfq-roof",
      name: "USFQ rooftop",
      precision: "city",
      city: "Cumbayá",
      countryCode: "EC",
      deviceCount: 1,
      active: true,
      updatedAt: T,
    };
    expect(PublicStationSchema.safeParse(pub).success).toBe(true);
    expect(PublicStationSchema.safeParse({ ...pub, ownerUid: UID }).success).toBe(false);
    expect(PublicStationSchema.safeParse({ ...pub, email: "x@y.z" }).success).toBe(false);
    expect(
      PublicStationSchema.safeParse({ ...pub, point: { lat: -0.19, lon: -78.43 } }).success,
    ).toBe(false);
    expect(
      PublicStationSchema.safeParse({
        ...pub,
        precision: "hidden",
        city: undefined,
        countryCode: undefined,
      }).success,
    ).toBe(true);
    const keys = Object.keys(PublicStationSchema.parse(pub));
    expect(keys).not.toContain("location");
    expect(keys).not.toContain("ownerUid");
  });
  it("members and transfers", () => {
    expect(
      StationMemberSchema.safeParse({ uid: "u2", role: "editor", addedBy: UID, addedAt: T })
        .success,
    ).toBe(true);
    expect(
      StationMemberSchema.safeParse({ uid: "u2", role: "owner", addedBy: UID, addedAt: T }).success,
    ).toBe(false);
    const transfer = {
      schemaVersion: 2,
      id: "usfq-roof_a1b2c3d4",
      stationId: "usfq-roof",
      from: UID,
      to: "u2",
      createdAt: T,
    };
    expect(OwnershipTransferSchema.safeParse(transfer).success).toBe(true);
    expect(OwnershipTransferSchema.safeParse({ ...transfer, id: "nonce-only" }).success).toBe(
      false,
    );
  });
});

describe("device types (CA5)", () => {
  it("built-ins validate against the schema", () => {
    for (const type of BUILTIN_DEVICE_TYPES)
      expect(DeviceTypeSchema.safeParse(type).success).toBe(true);
  });
  it("flags the MuNRa dead-time unit as unverified", () => {
    expect(MUNRA.deadTimeSemantics).toEqual({ kind: "cumulative", unit: "us", unverified: true });
    expect(MUNRA.parser.fields.find((f) => f.quantity === "deadTime")?.unverified).toBe(true);
  });
});

describe("device, assembly, calibration", () => {
  const device = {
    schemaVersion: 2,
    id: "cw3",
    ownerUid: UID,
    stationId: "usfq-roof",
    deviceType: { id: "munra", version: 1 },
    label: "CosmicWatch #3",
    geometry: {
      activeAreaCm2: 25,
      thicknessCm: 1,
      material: "plastic scintillator",
      orientation: "horizontal",
    },
    saturation: { value: 180, unit: "mV" },
    status: "active",
    createdAt: T,
  } as const;
  it("device requires stationId and a positive area", () => {
    expect(DeviceSchema.safeParse(device).success).toBe(true);
    const noStation = without(device, "stationId");
    expect(DeviceSchema.safeParse(noStation).success).toBe(false);
    expect(
      DeviceSchema.safeParse({ ...device, geometry: { ...device.geometry, activeAreaCm2: 0 } })
        .success,
    ).toBe(false);
  });
  it("assembly and calibration", () => {
    expect(
      AssemblySchema.safeParse({
        schemaVersion: 2,
        stationId: "s",
        members: [{ deviceId: "cw3", position: { x: 0, y: 0, z: 5 }, tiltDeg: 0 }],
        updatedAt: T,
      }).success,
    ).toBe(true);
    const cal = {
      schemaVersion: 2,
      deviceId: "cw3",
      version: 1,
      validFrom: T,
      parameters: { tauUs: { value: 400, unit: "us", origin: "default", locked: false } },
      authorUid: UID,
      createdAt: T,
    };
    expect(CalibrationSchema.safeParse(cal).success).toBe(true);
    expect(
      CalibrationSchema.safeParse({
        ...cal,
        parameters: { tauUs: { value: 400, unit: "us", origin: "guess", locked: false } },
      }).success,
    ).toBe(false);
  });
});

describe("stream and session", () => {
  it("stream id is bound to the owner", () => {
    const stream = {
      schemaVersion: 2,
      id: `${UID}_k3j4h5g6`,
      ownerUid: UID,
      stationId: "usfq-roof",
      deviceId: "cw3",
      status: "active",
      createdAt: T,
    };
    expect(StreamSchema.safeParse(stream).success).toBe(true);
    expect(StreamSchema.safeParse({ ...stream, ownerUid: "someoneElse" }).success).toBe(false);
    expect(StreamSchema.safeParse({ ...stream, id: "k3j4h5g6" }).success).toBe(false);
    expect(streamOwnerUid(stream.id)).toBe(UID);
  });
  it("session end fields go together and accept the new end reasons", () => {
    const base = {
      schemaVersion: 2,
      id: "sess1",
      streamId: `${UID}_k3j4h5g6`,
      startedAt: T,
      agentVersion: "6.0.0-alpha.1.3",
      deviceTypeVersion: 1,
      timeProvenance: { source: "ntp", offsetMs: 3, measuredAt: T },
      counters: {
        completeMinutes: 10,
        discardedPartialMinutes: 2,
        quarantinedLines: 0,
        eventIdGaps: 0,
      },
    };
    expect(SessionSchema.safeParse(base).success).toBe(true);
    for (const endReason of ["storageError", "clockStep", "reset"]) {
      expect(SessionSchema.safeParse({ ...base, endedAt: T + 1, endReason }).success).toBe(true);
    }
    expect(SessionSchema.safeParse({ ...base, endedAt: T + 1 }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...base, endedAt: T - 1, endReason: "stop" }).success).toBe(
      false,
    );
  });
});

describe("minute record (CA2)", () => {
  it("accepts a complete minute", () => {
    expect(MinuteRecordSchema.safeParse(minute).success).toBe(true);
  });
  it("rejects a ts that is not a minute boundary", () => {
    expect(MinuteRecordSchema.safeParse({ ...minute, ts: T + 1 }).success).toBe(false);
  });
  it("rejects liveMs outside (0, 60000]", () => {
    expect(MinuteRecordSchema.safeParse({ ...minute, liveMs: 0 }).success).toBe(false);
    expect(MinuteRecordSchema.safeParse({ ...minute, liveMs: 60_001 }).success).toBe(false);
  });
  it("rejects non-integer or negative n", () => {
    expect(MinuteRecordSchema.safeParse({ ...minute, n: 1.5 }).success).toBe(false);
    expect(MinuteRecordSchema.safeParse({ ...minute, n: -1 }).success).toBe(false);
  });
  it("amplitude is absent when n = 0", () => {
    expect(MinuteRecordSchema.safeParse({ ...minute, n: 0 }).success).toBe(false);
    const noAmplitude = without(minute, "amplitude");
    expect(MinuteRecordSchema.safeParse({ ...noAmplitude, n: 0 }).success).toBe(true);
  });
  it("nominal live time carries no liveMs (uncorrected, never zero dead time)", () => {
    expect(MinuteRecordSchema.safeParse({ ...minute, liveSource: "nominal" }).success).toBe(false);
    const nominal = without(minute, "liveMs", "deadMs");
    expect(MinuteRecordSchema.safeParse({ ...nominal, liveSource: "nominal" }).success).toBe(true);
  });
  it("an absent pressure stays absent — never coerced to 0", () => {
    const noBarometer = without(minute, "pressureHpa", "temperatureC");
    const parsed = MinuteRecordSchema.parse(noBarometer);
    expect(parsed.pressureHpa).toBeUndefined();
    expect("pressureHpa" in parsed).toBe(false);
    expect(MinuteRecordSchema.safeParse({ ...minute, pressureHpa: 0 }).success).toBe(false);
  });
});

describe("day summary (CA2)", () => {
  const dayStart = Date.UTC(2026, 9, 7);
  const summary: DaySummary = {
    schemaVersion: 2,
    streamId: `${UID}_k3j4h5g6`,
    day: "2026-10-07",
    hours: {
      "12": {
        hourStart: dayStart + 12 * 3_600_000,
        completeMinutes: 58,
        n: 8350,
        liveSource: "counter",
        liveMs: 3_478_000,
        pressureHpa: 767.9,
        pressureMinutes: 58,
        histogram: [1, 2, 3],
        saturated: 4,
      },
    },
    updatedAt: dayStart,
  };
  it("accepts a summary with only hours that have complete minutes", () => {
    expect(DaySummarySchema.safeParse(summary).success).toBe(true);
  });
  it("a missing hour is a gap, never n = 0", () => {
    expect(hourOf(summary, 12)?.n).toBe(8350);
    expect(hourOf(summary, 13)).toBeUndefined();
  });
  it("rejects an hour entry with zero complete minutes or a mismatched start", () => {
    const zero = { ...summary, hours: { "12": { ...summary.hours["12"]!, completeMinutes: 0 } } };
    expect(DaySummarySchema.safeParse(zero).success).toBe(false);
    const shifted = { ...summary, hours: { "13": summary.hours["12"]! } };
    expect(DaySummarySchema.safeParse(shifted).success).toBe(false);
  });
  it("a pressure mean needs its minute count", () => {
    const noCount = without(summary.hours["12"]!, "pressureMinutes");
    expect(DaySummarySchema.safeParse({ ...summary, hours: { "12": noCount } }).success).toBe(
      false,
    );
  });
});

describe("live, status, multichannel, raw, access, audit", () => {
  it("validates the small records", () => {
    expect(LiveEventSchema.safeParse({ t: T, amplitude: 41 }).success).toBe(true);
    expect(
      StreamStatusSchema.safeParse({
        lastSeenAt: T,
        agentOnline: true,
        lastMinuteTs: T,
        rawRatePerMin: 144,
      }).success,
    ).toBe(true);
    expect(
      StreamStatusPublicSchema.safeParse({ lastSeenAt: T, agentOnline: true, rawRatePerMin: 1 })
        .success,
    ).toBe(false);
    expect(ChannelEventSchema.safeParse({ channel: 19, t: T, amplitude: 3 }).success).toBe(true);
    const block = { channel: 0, startTs: T, rateHz: 100, values: [1, 2, 3, 4] };
    expect(SampleBlockSchema.safeParse(block).success).toBe(true);
    expect(sampleBlockEnd(block)).toBe(T + 40);
    expect(
      RawLineSchema.safeParse({
        deviceId: "cw3",
        hostTs: T,
        monotonicNs: "123456789",
        text: "270 111753 60 1881 0.9 76501.6 27.1 46100 0 COSMIC",
        byteLength: 52,
      }).success,
    ).toBe(true);
    expect(
      StationAccessSchema.safeParse({ ownerUid: UID, editors: { agentUid1: true }, public: true })
        .success,
    ).toBe(true);
    expect(
      StationAccessSchema.safeParse({ ownerUid: UID, editors: { agentUid1: false }, public: true })
        .success,
    ).toBe(false);
    expect(AdminEntrySchema.safeParse({ uid: UID, addedBy: UID, addedAt: T }).success).toBe(true);
  });
  it("audit entries accept only defined actions and bounded details", () => {
    const entry = {
      schemaVersion: 2,
      id: "a1",
      action: "ownershipTransfer",
      actorUid: UID,
      targetId: "usfq-roof",
      createdAt: T,
    };
    expect(AuditEntrySchema.safeParse(entry).success).toBe(true);
    expect(AuditEntrySchema.safeParse({ ...entry, action: "deleteEverything" }).success).toBe(
      false,
    );
    const details = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, i]));
    expect(AuditEntrySchema.safeParse({ ...entry, details }).success).toBe(false);
  });
});
