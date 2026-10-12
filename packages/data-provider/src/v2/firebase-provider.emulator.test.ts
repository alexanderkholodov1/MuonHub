/**
 * Provider integration tests for the v2 data layer against the Firebase Emulator Suite
 * (Auth + Firestore + Realtime Database). Run via `pnpm test:emulator`; skipped otherwise.
 * Real client identities (owner, editor, viewer, stranger, anonymous) go through the security rules.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { v2 } from "@muonhub/shared";
import { createFirebaseProviderV2 } from "./firebase-provider.js";
import type { DataProviderV2 } from "./interface.js";
import { daySummary, minute } from "./fixtures.js";

const authHost = process.env["FIREBASE_AUTH_EMULATOR_HOST"];
const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"];
const databaseHost = process.env["FIREBASE_DATABASE_EMULATOR_HOST"];
const emulatorOn = Boolean(authHost && firestoreHost && databaseHost);
const describeEmu = emulatorOn ? describe : describe.skip;

const PROJECT = "demo-muonhub";
const DB_NS = `${PROJECT}-default-rtdb`;

function hostPort(value: string | undefined): { host: string; port: number } {
  const [host, port] = (value ?? "127.0.0.1:0").split(":");
  return { host: host ?? "127.0.0.1", port: Number(port) };
}

let appSeq = 0;
function connect(): DataProviderV2 {
  appSeq += 1;
  return createFirebaseProviderV2({
    apiKey: "fake-api-key",
    projectId: PROJECT,
    databaseURL: `https://${DB_NS}.firebaseio.com`,
    appName: `v2-test-${appSeq}-${Date.now()}`,
    emulators: {
      auth: `http://${authHost}`,
      firestore: hostPort(firestoreHost),
      database: hostPort(databaseHost),
    },
  });
}

/** Admin-bypass seeding through the emulators' REST APIs (`Authorization: Bearer owner`). */
async function seedRtdb(path: string, value: unknown): Promise<void> {
  const res = await fetch(`http://${databaseHost}/${path}.json?ns=${DB_NS}`, {
    method: "PUT",
    headers: { Authorization: "Bearer owner" },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`seed failed: ${res.status}`);
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

interface Actor {
  provider: DataProviderV2;
  uid: string;
}

let counter = 0;
async function newActor(): Promise<Actor> {
  counter += 1;
  const provider = connect();
  const email = `actor${counter}-${Date.now()}@example.org`;
  const user = await provider.createAccount(email, "CorrectHorse123!");
  const username = `user${counter}x${Date.now().toString(36)}`.slice(0, 30);
  await provider.createUserProfile({
    schemaVersion: 2,
    uid: user.uid,
    displayName: `Actor ${counter}`,
    username,
    email,
    createdAt: Date.now(),
  });
  return { provider, uid: user.uid };
}

const minuteNow = (): number => Math.floor(Date.now() / 60_000) * 60_000;

describeEmu("data layer v2 against the emulators", () => {
  let owner: Actor;
  let viewer: Actor;
  let stranger: Actor;
  let anonymous: DataProviderV2;
  let station: v2.Station;
  let streamId: string;

  beforeAll(async () => {
    [owner, viewer, stranger] = await Promise.all([newActor(), newActor(), newActor()]);
    anonymous = connect();
    const stationId = `st-${Date.now()}`;
    station = {
      schemaVersion: 2,
      id: stationId,
      ownerUid: owner.uid,
      name: "Emulator lab",
      location: { lat: -0.1963, lon: -78.4356, altitudeM: 2850, city: "Quito", countryCode: "EC" },
      publicPrecision: "approximate",
      visibility: "public",
      timezone: "America/Guayaquil",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    streamId = `${owner.uid}_${"a1b2c3d4e5f6"}`;
  });

  afterAll(async () => {
    await Promise.all([owner, viewer, stranger].map((a) => a.provider.close()));
    await anonymous.close();
  });

  it("creates a station with its public projection; anonymous sees only the projection", async () => {
    await owner.provider.createStation(station);
    await expect(owner.provider.createStation(station)).rejects.toMatchObject({
      code: expect.stringMatching(/already-exists|permission-denied/),
    });
    const mine = await owner.provider.listMyStations();
    expect(mine.items.map((s) => s.id)).toContain(station.id);
    const pub = await anonymous.listPublicStations();
    const projection = pub.items.find((p) => p.id === station.id);
    expect(projection?.point).toEqual({ lat: -0.2, lon: -78.5 });
    expect(JSON.stringify(projection)).not.toContain("-0.1963");
    await expect(anonymous.getStation(station.id)).rejects.toMatchObject({
      code: "permission-denied",
    });
    await expect(stranger.provider.getStation(station.id)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("registers a device, stream, and session; metadata update never touches history", async () => {
    const deviceId = `dev-${Date.now()}`;
    await owner.provider.createDevice({
      schemaVersion: 2,
      id: deviceId,
      ownerUid: owner.uid,
      stationId: station.id,
      deviceType: { id: "cosmicwatch-v2", version: 1 },
      label: "CosmicWatch #1",
      geometry: {
        activeAreaCm2: 25,
        thicknessCm: 1,
        material: "EJ-200",
        orientation: "horizontal",
      },
      status: "active",
      createdAt: Date.now(),
    });
    await owner.provider.createStream({
      schemaVersion: 2,
      id: streamId,
      ownerUid: owner.uid,
      stationId: station.id,
      deviceId,
      status: "active",
      createdAt: Date.now(),
    });
    await owner.provider.startSession({
      schemaVersion: 2,
      id: "session-1",
      streamId,
      startedAt: Date.now(),
      agentVersion: "test",
      deviceTypeVersion: 1,
      timeProvenance: { source: "ntp", offsetMs: 0, measuredAt: Date.now() },
      counters: {
        completeMinutes: 0,
        discardedPartialMinutes: 0,
        quarantinedLines: 0,
        eventIdGaps: 0,
      },
    });
    await owner.provider.updateDevice(deviceId, { label: "Renamed" });
    expect((await owner.provider.getDevice(deviceId))?.label).toBe("Renamed");
    // Stranger cannot create a stream claiming the owner's prefix.
    await expect(
      stranger.provider.createStream({
        schemaVersion: 2,
        id: `${owner.uid}_zzzzzzzzzzzz`,
        ownerUid: owner.uid,
        stationId: station.id,
        deviceId,
        status: "active",
        createdAt: Date.now(),
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("writes minutes once and reads a range page by page", async () => {
    const base = minuteNow() - 30 * 60_000;
    const records = Array.from({ length: 25 }, (_, i) =>
      minute(0, { ts: base + i * 60_000, sessionId: "session-1" }),
    );
    const first = await owner.provider.writeMinutes(streamId, records);
    expect(first).toEqual({ written: 25, alreadyExisted: [] });
    const again = await owner.provider.writeMinutes(streamId, [records[3] as v2.MinuteRecord]);
    expect(again.alreadyExisted).toEqual([base + 3 * 60_000]);
    expect(again.written).toBe(0);

    const seen: number[] = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<DataProviderV2["readMinutes"]>> =
        await owner.provider.readMinutes(streamId, {
          fromTs: base,
          toTs: base + 25 * 60_000,
          limit: 10,
          cursor,
        });
      seen.push(...page.items.map((m) => m.ts));
      expect(page.quarantine.count).toBe(0);
      cursor = page.nextCursor;
    } while (cursor !== null);
    expect(seen).toHaveLength(25);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it("refuses a future minute and denies anonymous and stranger reads of minutes", async () => {
    await expect(
      owner.provider.writeMinutes(streamId, [
        minute(0, { ts: minuteNow() + 10 * 60_000, sessionId: "session-1" }),
      ]),
    ).rejects.toMatchObject({ code: "permission-denied" });
    const range = { fromTs: minuteNow() - 3_600_000, toTs: minuteNow() + 60_000 };
    await expect(anonymous.readMinutes(streamId, range)).rejects.toMatchObject({
      code: "permission-denied",
    });
    await expect(stranger.provider.readMinutes(streamId, range)).rejects.toMatchObject({
      code: "permission-denied",
    });
    await expect(
      stranger.provider.writeMinutes(streamId, [minute(0, { ts: minuteNow() - 90 * 60_000 })]),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("quarantines a corrupt minute written outside the client API", async () => {
    const ts = minuteNow() - 600 * 60_000;
    await seedRtdb(`minutes/${streamId}/${v2.minuteKey(ts)}`, { v: 2, s: "x", n: "bad" });
    const page = await owner.provider.readMinutes(streamId, { fromTs: ts, toTs: ts + 60_000 });
    expect(page.items).toEqual([]);
    expect(page.quarantine.count).toBe(1);
  });

  it("shares with a viewer, who can read minutes but not write; removal revokes", async () => {
    await owner.provider.addMember(station.id, viewer.uid, "viewer");
    const range = { fromTs: minuteNow() - 3_600_000, toTs: minuteNow() + 60_000 };
    expect((await viewer.provider.readMinutes(streamId, range)).items.length).toBeGreaterThan(0);
    expect((await viewer.provider.listSharedWithMe()).items.map((s) => s.station.id)).toContain(
      station.id,
    );
    await expect(
      viewer.provider.writeMinutes(streamId, [minute(0, { ts: minuteNow() - 1_000 * 60_000 })]),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await owner.provider.removeMember(station.id, viewer.uid);
    await expect(viewer.provider.readMinutes(streamId, range)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("stores and ranges day summaries; public viewers read them, gaps stay absent", async () => {
    await owner.provider.putDaySummary({ ...daySummary("2026-10-01"), streamId });
    await owner.provider.putDaySummary({ ...daySummary("2026-10-03"), streamId });
    const r = await owner.provider.listDaySummaries(streamId, "2026-10-01", "2026-10-05");
    expect(r.items.map((d) => d.day)).toEqual(["2026-10-01", "2026-10-03"]);
    expect(await owner.provider.getDaySummary(streamId, "2026-10-02")).toBeNull();
    const asAnonymous = await anonymous.getDaySummary(streamId, "2026-10-01");
    expect(asAnonymous?.day).toBe("2026-10-01");
  });

  it("pushes live events in a batch, delivers the window then new events, and prunes by time", async () => {
    const t = Date.now();
    await owner.provider.pushLiveEvents(streamId, [
      { t, amplitude: 1 },
      { t, amplitude: 2 },
    ]);
    const received: number[] = [];
    const errors: Error[] = [];
    const off = owner.provider.subscribeLive(streamId, {
      onData: (e) => received.push(e.amplitude),
      onError: (e) => errors.push(e),
      onInvalid: () => undefined,
    });
    await waitFor(() => received.length >= 2, "initial window");
    await owner.provider.pushLiveEvents(streamId, [{ t: Date.now(), amplitude: 3 }]);
    await waitFor(() => received.length >= 3, "new event");
    expect(received.sort()).toEqual([1, 2, 3]);
    off();
    expect(errors).toEqual([]);

    const old = Date.now() - 20 * 60_000;
    await seedRtdb(`live/${streamId}/events/${v2.minuteKey(old)}aaaa`, { t: old, a: 9 });
    const pruned = await owner.provider.pruneLive(streamId);
    expect(pruned.removed).toBe(1);
  });

  it("delivers a subscription failure on the error channel", async () => {
    const errors: Error[] = [];
    const off = stranger.provider.subscribeLive(streamId, {
      onData: () => undefined,
      onError: (e) => errors.push(e),
      onInvalid: () => undefined,
    });
    await waitFor(() => errors.length > 0, "error callback");
    expect(errors[0]).toMatchObject({ code: "permission-denied" });
    off();
  });

  it("writes status; the public part is readable anonymously, the full status is not", async () => {
    await owner.provider.setStatus(
      streamId,
      { lastSeenAt: Date.now(), agentOnline: true, rawRatePerMin: 12 },
      { publish: true },
    );
    expect((await owner.provider.getStatus(streamId))?.rawRatePerMin).toBe(12);
    expect((await anonymous.getStatusPublic(streamId))?.agentOnline).toBe(true);
    await expect(anonymous.getStatus(streamId)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("transfers ownership; the new owner claims the mirror and the former owner loses access", async () => {
    const transferId = await owner.provider.transferOwnership(station.id, stranger.uid);
    expect((await stranger.provider.getTransfer(transferId))?.to).toBe(stranger.uid);
    await stranger.provider.claimStationMirror(station.id);
    expect((await stranger.provider.getStation(station.id))?.ownerUid).toBe(stranger.uid);
    await expect(
      owner.provider.updateStation(station.id, { name: "Hijack" }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      owner.provider.writeMinutes(streamId, [minute(0, { ts: minuteNow() - 2_000 * 60_000 })]),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});
