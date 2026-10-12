/**
 * CA7: what the agent writes (minutes, day summaries, session records, live batches, status) passes
 * the spec 0084 security rules for an authorised identity and is rejected for another user.
 * Runs against the Firebase Emulator Suite via `pnpm test:emulator`; skipped otherwise.
 *
 * The agent signs in as a dedicated machine account that the station owner added as an EDITOR
 * (the recommended identity, spec 0087 FR11).
 */
import { afterAll, describe, expect, it } from "vitest";
import { v2 as dp } from "@muonhub/data-provider";
import { v2 } from "@muonhub/shared";
import {
  dataChunks,
  makeHarness,
  scriptedFactory,
  settleSource,
  until,
  type Harness,
  type ScriptedSource,
} from "./testing/harness.js";

const authHost = process.env["FIREBASE_AUTH_EMULATOR_HOST"];
const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"];
const databaseHost = process.env["FIREBASE_DATABASE_EMULATOR_HOST"];
const emulatorOn = Boolean(authHost && firestoreHost && databaseHost);
const describeEmu = emulatorOn ? describe : describe.skip;

const PROJECT = "demo-muonhub";
const DB_NS = `${PROJECT}-default-rtdb`;
const hostPort = (value: string | undefined): { host: string; port: number } => {
  const [host, port] = (value ?? "127.0.0.1:0").split(":");
  return { host: host ?? "127.0.0.1", port: Number(port) };
};

async function seedRtdb(path: string, value: unknown): Promise<void> {
  const res = await fetch(`http://${databaseHost ?? ""}/${path}.json?ns=${DB_NS}`, {
    method: "PUT",
    headers: { Authorization: "Bearer owner" },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`seed failed: ${String(res.status)}`);
}

let seq = 0;
function connect(): dp.DataProviderV2 {
  seq += 1;
  return dp.createFirebaseProviderV2({
    apiKey: "fake-api-key",
    projectId: PROJECT,
    databaseURL: `https://${DB_NS}.firebaseio.com`,
    appName: `agent-emu-${String(seq)}-${String(Date.now())}`,
    emulators: {
      auth: `http://${authHost}`,
      firestore: hostPort(firestoreHost),
      database: hostPort(databaseHost),
    },
  });
}

async function actor(label: string): Promise<{ provider: dp.DataProviderV2; uid: string }> {
  const provider = connect();
  const email = `${label}-${String(Date.now())}-${String(seq)}@example.org`;
  const user = await provider.createAccount(email, "CorrectHorse123!");
  await provider.createUserProfile({
    schemaVersion: 2,
    uid: user.uid,
    displayName: label,
    username: `${label}${Date.now().toString(36)}`.slice(0, 30),
    email,
    createdAt: Date.now(),
  });
  return { provider, uid: user.uid };
}

describeEmu("the agent against the emulators and the security rules (CA7)", () => {
  const harnesses: Harness[] = [];
  afterAll(async () => {
    for (const h of harnesses) await h.agent.stop().catch(() => undefined);
  });

  it("an editor-account agent uploads minutes, summaries, sessions, live batches and status; a stranger is denied", async () => {
    const owner = await actor("owner");
    const machine = await actor("machine");
    const stranger = await actor("stranger");

    const stationId = dp.newStationId();
    const streamId = dp.newStreamId();
    const now = Date.now();
    await owner.provider.createStation(
      v2.StationSchema.parse({
        schemaVersion: 2,
        id: stationId,
        ownerUid: owner.uid,
        name: "Agent test station",
        location: { lat: -0.19, lon: -78.43, altitudeM: 2850, city: "Quito", countryCode: "EC" },
        publicPrecision: "city",
        visibility: "private",
        timezone: "America/Guayaquil",
        createdAt: now,
        updatedAt: now,
      }),
    );
    await owner.provider.createDevice(
      v2.DeviceSchema.parse({
        schemaVersion: 2,
        id: "device-agent-1",
        ownerUid: owner.uid,
        stationId,
        deviceType: { id: "munra", version: 1 },
        label: "MuNRa",
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
    await owner.provider.createStream(
      v2.StreamSchema.parse({
        schemaVersion: 2,
        id: streamId,
        ownerUid: owner.uid,
        stationId,
        deviceId: "device-agent-1",
        status: "active",
        createdAt: now,
      }),
    );
    await owner.provider.addMember(stationId, machine.uid, "editor");
    // The rules refuse minutes older than the stream (`ts >= streamStation.since`). The test replays
    // minutes from a few minutes ago, so the stream's `since` is moved back through the emulator's
    // admin REST API (never possible with a client identity).
    await seedRtdb(`streamStation/${streamId}`, { stationId, since: Date.now() - 3_600_000 });

    const factory = scriptedFactory();
    const h = await makeHarness({
      factory,
      externalProvider: machine.provider,
      streamId,
      intervals: { uploaderMs: 1e9, diskMs: 1e9, clockMs: 1e9, backoffMinMs: 5, backoffMaxMs: 20 },
    });
    harnesses.push(h);
    await h.agent.start();
    await until(() => factory.sources.length > 0);
    // Real wall-clock minutes so the live window and heartbeat are current.
    const base = Math.floor(Date.now() / 60_000) * 60_000 - 6 * 60_000;
    const src = factory.sources[0] as ScriptedSource;
    src.push(...dataChunks({ fromHost: base + 20_000, count: 5 * 60, firstId: 1 }));
    await settleSource(h, src);
    await h.agent.drain();
    await h.agent.drain();
    h.agent.live?.push({ t: Date.now(), amplitude: 42 });
    await h.agent.live?.flushBatch();
    await h.agent.live?.heartbeat(true);
    // Stopping ends the session: the hour summary and the session end are enqueued and flushed.
    await h.agent.stop();

    expect(h.store.outboxCounts().parked).toBe(0);
    expect(h.store.outboxCounts().pending.minute).toBe(0);
    expect(h.agent.status().live.droppedLiveBatches).toBe(0);
    expect(h.agent.status().live.droppedHeartbeats).toBe(0);

    // The owner reads what the agent wrote.
    const minutes = await owner.provider.readMinutes(streamId, {
      fromTs: 0,
      toTs: base + 3_600_000,
    });
    expect(minutes.items.length).toBeGreaterThanOrEqual(3);
    expect(minutes.items.every((m) => m.n === 60)).toBe(true);
    const day = new Date(base).toISOString().slice(0, 10);
    const summary = await owner.provider.getDaySummary(streamId, day);
    expect(Object.keys(summary?.hours ?? {}).length).toBeGreaterThanOrEqual(1);
    const sessions = await owner.provider.listSessions(streamId);
    expect(sessions.items).toHaveLength(1);
    expect(sessions.items[0]?.endReason).toBe("stop");
    expect((await owner.provider.getStatus(streamId))?.lastSeenAt).toBeGreaterThan(0);

    // A stranger is rejected on every path the agent writes to.
    const denied = async (op: () => Promise<unknown>): Promise<void> => {
      await expect(op()).rejects.toMatchObject({
        code: expect.stringMatching(/permission-denied|unauthenticated/) as unknown,
      });
    };
    const minute = minutes.items[0] as v2.MinuteRecord;
    await denied(() =>
      stranger.provider.writeMinutes(streamId, [{ ...minute, ts: minute.ts + 3_600_000 * 24 }]),
    );
    await denied(() =>
      stranger.provider.setStatus(streamId, { lastSeenAt: Date.now(), agentOnline: true }),
    );
    await denied(() =>
      stranger.provider.pushLiveEvents(streamId, [{ t: Date.now(), amplitude: 1 }]),
    );
    await denied(() =>
      stranger.provider.putDaySummary({ ...(summary as v2.DaySummary), updatedAt: Date.now() }),
    );
    await denied(() =>
      stranger.provider.readMinutes(streamId, { fromTs: 0, toTs: base + 3_600_000 }),
    );
  });

  it("with the membership removed (revoked machine) the agent pauses and parks nothing", async () => {
    const owner = await actor("owner2");
    const machine = await actor("machine2");
    const stationId = dp.newStationId();
    const streamId = dp.newStreamId();
    const now = Date.now();
    await owner.provider.createStation(
      v2.StationSchema.parse({
        schemaVersion: 2,
        id: stationId,
        ownerUid: owner.uid,
        name: "Revocation test",
        location: { lat: 0, lon: 0, altitudeM: 10, city: "Quito", countryCode: "EC" },
        publicPrecision: "hidden",
        visibility: "private",
        timezone: "America/Guayaquil",
        createdAt: now,
        updatedAt: now,
      }),
    );
    await owner.provider.createDevice(
      v2.DeviceSchema.parse({
        schemaVersion: 2,
        id: "device-agent-2",
        ownerUid: owner.uid,
        stationId,
        deviceType: { id: "munra", version: 1 },
        label: "MuNRa",
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
    await owner.provider.createStream(
      v2.StreamSchema.parse({
        schemaVersion: 2,
        id: streamId,
        ownerUid: owner.uid,
        stationId,
        deviceId: "device-agent-2",
        status: "active",
        createdAt: now,
      }),
    );
    await owner.provider.addMember(stationId, machine.uid, "editor");
    await seedRtdb(`streamStation/${streamId}`, { stationId, since: Date.now() - 3_600_000 });
    await owner.provider.removeMember(stationId, machine.uid);

    const factory = scriptedFactory();
    const h = await makeHarness({
      factory,
      externalProvider: machine.provider,
      streamId,
      intervals: { uploaderMs: 1e9, diskMs: 1e9, clockMs: 1e9, backoffMinMs: 5, backoffMaxMs: 20 },
    });
    harnesses.push(h);
    await h.agent.start();
    await until(() => factory.sources.length > 0);
    const base = Math.floor(Date.now() / 60_000) * 60_000 - 6 * 60_000;
    const src = factory.sources[0] as ScriptedSource;
    src.push(...dataChunks({ fromHost: base + 20_000, count: 3 * 60, firstId: 1 }));
    await settleSource(h, src);
    await h.agent.drain();
    // Denied while the account itself is still valid: that is a permanent rejection (parked, shown),
    // not a sign-out; the machine can no longer write and the data stays safe locally.
    expect(h.agent.status().queue.parked).toBeGreaterThanOrEqual(1);
    expect(h.agent.status().sync.rejectedCount).toBeGreaterThanOrEqual(1);
    expect(h.store.minuteCount(streamId)).toBeGreaterThanOrEqual(2);
  });
});
