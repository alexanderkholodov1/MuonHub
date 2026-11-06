import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { v2 as dp } from "@muonhub/data-provider";
import { v2 } from "@muonhub/shared";
import { StateSchema, stateFile } from "./state";

const PROJECT = "demo-muonhub";
const DATABASE = `${PROJECT}-default-rtdb`;
const MINUTE = 60_000;

export default async function globalSetup(): Promise<void> {
  // Refuse direct invocation without the emulators: the admin fixture write must stay local.
  for (const [name, expected] of Object.entries({
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    FIREBASE_DATABASE_EMULATOR_HOST: "127.0.0.1:9000",
  })) {
    if (process.env[name] !== expected) throw new Error(`Expected ${name}=${expected}`);
  }

  // The emulator defaults to legacy email enumeration behavior (HTTP 400 for an unknown email).
  // Use its supported privacy setting, matching modern Firebase projects, without mocking Auth.
  const privacy = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emailPrivacyConfig: { enableImprovedEmailPrivacy: true } }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!privacy.ok) throw new Error(`Emulator email privacy setup failed: ${privacy.status}`);

  const run = randomUUID().replaceAll("-", "").slice(0, 12);
  const providers: dp.DataProviderV2[] = [];
  async function account(label: string) {
    const provider = dp.createFirebaseProviderV2({
      apiKey: "demo-api-key",
      projectId: PROJECT,
      databaseURL: `https://${DATABASE}.firebaseio.com`,
      appName: `e2e-${label}-${run}`,
      emulators: {
        auth: "http://127.0.0.1:9099",
        firestore: { host: "127.0.0.1", port: 8080 },
        database: { host: "127.0.0.1", port: 9000 },
      },
    });
    providers.push(provider);
    const email = `e2e-${label}-${run}@example.test`;
    const password = `TEST-${randomUUID()}`;
    const { uid } = await provider.createAccount(email, password);
    await provider.createUserProfile({
      schemaVersion: 2,
      uid,
      email,
      displayName: `TEST E2E ${label}`,
      username: `e2e_${label}_${run}`,
      createdAt: Date.now(),
    });
    return { provider, credentials: { email, password, uid } };
  }

  try {
    const owner = await account("owner");
    const second = await account("second");
    const station = { id: dp.newStationId(), name: `TEST E2E public station ${run}` };
    const privateStation = {
      id: dp.newStationId(),
      name: `TEST E2E private station ${run}`,
      city: "TEST private location",
    };
    const device = { id: `e2e-device-${run}`, label: `TEST E2E device ${run}` };
    const streamId = dp.newStreamId();
    const now = Date.now();
    for (const [record, visibility] of [
      [station, "public"],
      [privateStation, "private"],
    ] as const) {
      await owner.provider.createStation(
        v2.StationSchema.parse({
          schemaVersion: 2,
          id: record.id,
          name: record.name,
          ownerUid: owner.credentials.uid,
          location: {
            lat: -0.19,
            lon: -78.43,
            altitudeM: 2400,
            city: visibility === "private" ? privateStation.city : "Quito",
            countryCode: "EC",
          },
          publicPrecision: "exact",
          visibility,
          timezone: "America/Guayaquil",
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    await owner.provider.createDevice(
      v2.DeviceSchema.parse({
        schemaVersion: 2,
        ...device,
        ownerUid: owner.credentials.uid,
        stationId: station.id,
        deviceType: { id: "cosmicwatch-v2", version: 1 },
        geometry: {
          activeAreaCm2: 25,
          thicknessCm: 1,
          material: "EJ-200",
          orientation: "horizontal",
        },
        status: "active",
        createdAt: now,
      }),
    );
    await owner.provider.createStream({
      schemaVersion: 2,
      id: streamId,
      ownerUid: owner.credentials.uid,
      stationId: station.id,
      deviceId: device.id,
      status: "active",
      createdAt: now,
    });
    await owner.provider.refreshPublicProjection(station.id);

    // Exactly 180 complete minutes; the ongoing minute is never stored.
    const minutesEnd = Math.floor(Date.now() / MINUTE) * MINUTE;
    const start = minutesEnd - 180 * MINUTE;
    const sessionId = `TEST-e2e-session-${run}`;
    await owner.provider.startSession({
      schemaVersion: 2,
      id: sessionId,
      streamId,
      startedAt: start,
      agentVersion: "TEST-e2e-fixture",
      deviceTypeVersion: 1,
      timeProvenance: { source: "none", offsetMs: 0, measuredAt: now },
      counters: {
        completeMinutes: 180,
        discardedPartialMinutes: 0,
        quarantinedLines: 0,
        eventIdGaps: 0,
      },
    });
    // Same historical-fixture exception as the agent rehearsal: only backdate the access mirror.
    const response = await fetch(
      `http://127.0.0.1:9000/streamStation/${streamId}/since.json?ns=${DATABASE}`,
      {
        method: "PUT",
        headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
        body: JSON.stringify(start),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new Error(`Emulator fixture mirror failed: ${response.status}`);
    const minutes = Array.from({ length: 180 }, (_, i) =>
      v2.MinuteRecordSchema.parse({
        schemaVersion: 2,
        ts: start + i * MINUTE,
        sessionId,
        n: 60,
        amplitude: { mean: 100, min: 80, max: 120, unit: "adc" },
        liveSource: "nominal",
        temperatureC: 20 + (i % 10) / 10,
        pressureHpa: 760 + (i % 10) / 10,
        quality: { eventIdGaps: 0, clockAnomalies: 0 },
      }),
    );
    const written = await owner.provider.writeMinutes(streamId, minutes);
    if (written.written !== minutes.length) throw new Error("Incomplete E2E minute fixture");

    const state = StateSchema.parse({
      owner: owner.credentials,
      second: second.credentials,
      unknownEmail: `e2e-unknown-${run}@example.test`,
      station,
      privateStation,
      device,
      streamId,
      minutesEnd,
    });
    mkdirSync(new URL("./.state/", import.meta.url), { recursive: true });
    writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  } finally {
    await Promise.all(providers.map((provider) => provider.close()));
  }
}
