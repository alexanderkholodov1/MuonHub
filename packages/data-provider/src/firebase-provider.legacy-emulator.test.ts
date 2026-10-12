/**
 * FirebaseProvider integration tests — run against the Firebase Emulator Suite.
 *
 * Executed only via `pnpm test:emulator` (firebase emulators:exec), which sets
 * FIREBASE_DATABASE_EMULATOR_HOST so the admin target talks to the local emulator,
 * never muonhub. Excluded from the default `pnpm test` (see vitest.config.ts).
 *
 * Covers spec 0007 acceptance criteria 2 (CRUD + index + minutes + idempotent latest),
 * 3 (incremental realtime), and 4 (streaming export/import round trip + quarantine).
 * Also covers spec 0009 auth flows against the Firebase Auth emulator.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { gzipSync } from "node:zlib";
import { getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getStorage } from "firebase-admin/storage";
import {
  MinuteRecordSchema,
  type Institution,
  type Station,
  type Detector,
  type Session,
  type MinuteRecord,
  type RealtimeRecord,
  type EventSummary,
  type SignalRecord,
} from "@muonhub/shared";
import { createFirebaseProvider, REALTIME_CAP } from "./firebase-provider.js";
import { Paths, padTs, signalBlobObjectPath } from "./firebase-paths.js";
import { CANONICAL_SLIM_MINUTE_RECORD_FIELDS } from "./slim-minute-record.js";
import type { DataProvider } from "./provider.js";
import type { DataChunk, SignalBlobRef } from "./types.js";

const emulatorOn = Boolean(process.env["FIREBASE_DATABASE_EMULATOR_HOST"]);
const describeEmu = emulatorOn ? describe : describe.skip;
const databaseURL = "https://demo-muonhub-default-rtdb.firebaseio.com";
const storageBucket = "demo-muonhub.appspot.com";

// ── Fixtures ────────────────────────────────────────────────────────────────────
let seq = 0;
const uid = (p: string) => `${p}_${Date.now()}_${seq++}`;
const authEmail = () => `${uid("auth")}@example.org`;
const authPassword = "CorrectHorse123!";

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function makeStation(id: string, ownerUid: string): Station {
  return {
    id,
    name: `Station ${id}`,
    ownerUid,
    institutionId: null,
    visibility: "public",
    embargoUntil: null,
    latitude: -0.2,
    longitude: -78.5,
    altitudeM: 2850,
    city: "Quito",
    country: "EC",
    placement: "indoor",
    type: "single",
    timezone: "America/Guayaquil",
    shares: [],
  };
}

function makeDetector(id: string, stationId: string): Detector {
  return {
    id,
    stationId,
    deviceToken: `tok_${id}`,
    hardwareModel: "CosmicWatch v3",
    firmwareVersion: "1.0.0",
    hwVersion: "v3X",
    sipmCount: 1,
    status: "active",
  };
}

function makeMinute(ts: number, ec: number): MinuteRecord {
  return {
    ts,
    ec,
    cc: 0,
    sm: 5,
    sx: 9,
    sn: 2,
    tp: 21,
    pr: 1013,
    dt: 1.2,
  };
}

function makeEventSummary(
  detectorId: string,
  sessionId: string,
  intervalStartTs: number,
): EventSummary {
  return {
    detectorId,
    sessionId,
    intervalStartTs,
    intervalEndTs: intervalStartTs + 3_600_000,
    signalCount: 3,
    aboveThresholdCount: 2,
    tailCount: 1,
    coincidenceCount: 1,
    noiseThresholdMv: 12.5,
    mpvMv: 84.2,
    histogram: {
      binWidthMv: 5,
      minMv: 0,
      counts: [0, 2, 1],
    },
  };
}

function makeSignal(ts: number, sipmMv: number, coincident = false): SignalRecord {
  return {
    ts,
    sipmMv,
    adc1: 120,
    adc2: 121,
    coincident,
    deadtimeUs: 400,
    tempC: 20.5,
    pressureHpa: 1013.2,
  };
}

function adminDatabase() {
  const app = getApps().find((candidate) => candidate.name === "muonhub-admin");
  if (app == null) {
    throw new Error("Firebase admin app is not initialized");
  }
  return getDatabase(app);
}

function adminBucket() {
  const app = getApps().find((candidate) => candidate.name === "muonhub-admin");
  if (app == null) {
    throw new Error("Firebase admin app is not initialized");
  }
  return getStorage(app).bucket(storageBucket);
}

function snapshotChildKeys(raw: unknown): string[] {
  if (raw == null || typeof raw !== "object") return [];
  return Object.keys(raw as Record<string, unknown>).sort();
}

describeEmu("FirebaseProvider (emulator)", () => {
  let provider: DataProvider;

  beforeAll(async () => {
    provider = await createFirebaseProvider({
      target: "admin",
      databaseURL,
      storageBucket,
    });
  });

  it("round-trips institution, station, detector and session (AC2)", async () => {
    const inst: Institution = {
      id: uid("inst"),
      name: "USFQ",
      country: "EC",
      city: "Quito",
      adminUids: [],
    };
    await provider.upsertInstitution(inst);
    expect((await provider.getInstitution(inst.id))?.name).toBe("USFQ");

    const sid = uid("st");
    const station = makeStation(sid, "owner1");
    await provider.upsertStation(station);
    expect((await provider.getStation(sid))?.city).toBe("Quito");

    const did = uid("det");
    const detector: Detector = {
      id: did,
      stationId: sid,
      deviceToken: `tok_${did}`,
      hardwareModel: "CosmicWatch v3",
      firmwareVersion: "1.0.0",
      hwVersion: "v3X",
      sipmCount: 1,
      status: "active",
    };
    await provider.upsertDetector(detector);

    // Detector is reachable by id (proves /detector_index was written).
    expect((await provider.getDetector(did))?.stationId).toBe(sid);
    expect((await provider.listDetectors(sid)).map((d) => d.id)).toContain(did);

    const session: Session = {
      id: uid("sess"),
      detectorId: did,
      startedAt: Date.now(),
    } as Session;
    await provider.upsertSession(session);
    expect((await provider.listSessions(did)).length).toBeGreaterThanOrEqual(1);
  });

  it("returns in-range minutes in order and keeps latest idempotent (AC2)", async () => {
    const sid = uid("st");
    const did = uid("det");
    await provider.upsertStation(makeStation(sid, "owner1"));
    await provider.upsertDetector(makeDetector(did, sid));

    const t0 = 1_700_000_000_000;
    await provider.pushMinuteRecord(did, makeMinute(t0, 10));
    await provider.pushMinuteRecord(did, makeMinute(t0 + 60_000, 11));
    await provider.pushMinuteRecord(did, makeMinute(t0 + 120_000, 12));

    const got = await provider.getMinuteRecords(did, {
      fromTs: t0,
      toTs: t0 + 60_000,
    });
    expect(got.map((r) => r.ts)).toEqual([t0, t0 + 60_000]);

    // Latest is the newest ts.
    expect((await provider.getLatest(did))?.ts).toBe(t0 + 120_000);

    // Idempotent: re-push same ts → still one record, latest unchanged by an older ts.
    await provider.pushMinuteRecord(did, makeMinute(t0 + 120_000, 99));
    await provider.pushMinuteRecord(did, makeMinute(t0, 5)); // older ts must not move latest
    const all = await provider.getMinuteRecords(did, { fromTs: t0, toTs: t0 + 120_000 });
    expect(all.length).toBe(3);
    expect((await provider.getLatest(did))?.ts).toBe(t0 + 120_000);
    expect((await provider.getLatest(did))?.ec).toBe(99);
  });

  it("stores minute records in the canonical slim format (S0074)", async () => {
    const sid = uid("st");
    const did = uid("det");
    await provider.upsertStation(makeStation(sid, "owner1"));
    await provider.upsertDetector(makeDetector(did, sid));

    const ts = 1_700_100_000_000;
    const record: MinuteRecord = {
      ...makeMinute(ts, 42),
      ecDt: 43,
      ecCorr: 41,
      flux: 1.7,
    };
    await provider.pushMinuteRecord(did, record);

    const rawMinute = (
      await adminDatabase()
        .ref(Paths.minute(sid, did, ts))
        .get()
    ).val();
    expect(rawMinute).toEqual({
      ec: 42,
      cc: 0,
      sm: 5,
      sx: 9,
      sn: 2,
      tp: 21,
      pr: 1013,
      dt: 1.2,
    });
    expect(snapshotChildKeys(rawMinute)).toEqual([...CANONICAL_SLIM_MINUTE_RECORD_FIELDS].sort());

    const rawLatest = (await adminDatabase().ref(Paths.latest(sid, did)).get()).val();
    expect(rawLatest).toMatchObject({ ts });
    expect(rawLatest).not.toHaveProperty("ecDt");
    expect(rawLatest).not.toHaveProperty("ecCorr");
    expect(rawLatest).not.toHaveProperty("flux");

    const [readBack] = await provider.getMinuteRecords(did, {
      fromTs: ts,
      toTs: ts,
    });
    expect(MinuteRecordSchema.parse(readBack)).toEqual(makeMinute(ts, 42));
  });

  it("round-trips slim EventSummary nodes in interval order (S0077 FR1)", async () => {
    const sid = uid("st");
    const did = uid("det");
    const sessionId = uid("sess");
    await provider.upsertStation(makeStation(sid, "owner1"));
    await provider.upsertDetector(makeDetector(did, sid));

    const t0 = 1_700_300_000_000;
    const first = makeEventSummary(did, sessionId, t0);
    const second = makeEventSummary(did, sessionId, t0 + 3_600_000);
    const outside = makeEventSummary(did, sessionId, t0 + 7_200_000);
    await provider.putEventSummary(second);
    await provider.putEventSummary(outside);
    await provider.putEventSummary(first);

    const got = await provider.getEventSummaries(did, {
      fromTs: t0,
      toTs: t0 + 3_600_000,
    });
    expect(got.map((summary) => summary.intervalStartTs)).toEqual([t0, t0 + 3_600_000]);
    expect(got).toEqual([first, second]);

    const rawSummary = (
      await adminDatabase()
        .ref(Paths.eventSummary(sid, did, t0))
        .get()
    ).val();
    expect(rawSummary).toMatchObject({
      sessionId,
      intervalEndTs: t0 + 3_600_000,
      signalCount: 3,
      histogram: first.histogram,
    });
    expect(rawSummary).not.toHaveProperty("detectorId");
    expect(rawSummary).not.toHaveProperty("intervalStartTs");
  });

  it("round-trips gzip NDJSON signal blobs and lists in-range refs (S0077 FR2)", async () => {
    const sid = uid("st");
    const did = uid("det");
    const sessionId = uid("sess");
    await provider.upsertStation(makeStation(sid, "owner1"));
    await provider.upsertDetector(makeDetector(did, sid));

    const intervalStartTs = 1_700_400_000_000;
    const ref: SignalBlobRef = { detectorId: did, sessionId, intervalStartTs };
    const outsideRef: SignalBlobRef = {
      detectorId: did,
      sessionId,
      intervalStartTs: intervalStartTs + 3_600_000,
    };
    const signals = [
      makeSignal(intervalStartTs + 1_000, 42),
      makeSignal(intervalStartTs + 2_000, 84, true),
    ];
    await provider.putSignalBlob(outsideRef, [makeSignal(outsideRef.intervalStartTs + 1_000, 21)]);
    await provider.putSignalBlob(ref, signals);

    const listed = await provider.listSignalBlobs(did, {
      fromTs: intervalStartTs,
      toTs: intervalStartTs,
    });
    expect(listed).toEqual([ref]);
    expect(await provider.getSignalBlob(ref)).toEqual(signals);

    const [storedBytes] = await adminBucket().file(signalBlobObjectPath(ref)).download();
    expect([...storedBytes.subarray(0, 2)]).toEqual([0x1f, 0x8b]);
  });

  it("skips corrupt signal blob lines without coercion (S0077 FR2)", async () => {
    const sid = uid("st");
    const did = uid("det");
    const sessionId = uid("sess");
    await provider.upsertStation(makeStation(sid, "owner1"));
    await provider.upsertDetector(makeDetector(did, sid));

    const intervalStartTs = 1_700_500_000_000;
    const ref: SignalBlobRef = { detectorId: did, sessionId, intervalStartTs };
    const valid = makeSignal(intervalStartTs + 1_000, 42);
    const schemaInvalid = {
      ...makeSignal(intervalStartTs + 2_000, 99),
      sipmMv: "99",
    };
    const ndjson = [JSON.stringify(valid), "{not-json", JSON.stringify(schemaInvalid)].join("\n");
    await adminBucket()
      .file(signalBlobObjectPath(ref))
      .save(gzipSync(Buffer.from(ndjson, "utf8")), {
        metadata: {
          contentType: "application/x-ndjson",
        },
      });

    expect(await provider.getSignalBlob(ref)).toEqual([valid]);
  });

  it("delivers only realtime events appended after subscription (AC3)", async () => {
    const sid = uid("st");
    const did = uid("det");
    await provider.upsertStation(makeStation(sid, "owner1"));
    await provider.upsertDetector(makeDetector(did, sid));

    // Seed history BEFORE subscribing.
    const rt = (ts: number): RealtimeRecord => ({ ts, sipmMv: 30 });
    await provider.pushRealtimeRecord(did, rt(1_000));
    await new Promise((r) => setTimeout(r, 200));

    const received: number[] = [];
    const unsub = provider.subscribeRealtime(did, (r) => received.push(r.ts));
    await new Promise((r) => setTimeout(r, 300)); // let the catch-up tail be skipped

    await provider.pushRealtimeRecord(did, rt(2_000));
    await new Promise((r) => setTimeout(r, 250));
    await provider.pushRealtimeRecord(did, rt(3_000));
    await new Promise((r) => setTimeout(r, 250));

    expect(received).not.toContain(1_000); // history not re-delivered
    expect(received).toContain(2_000);
    expect(received).toContain(3_000);

    // Idempotent unsubscribe; no delivery afterwards.
    expect(() => {
      unsub();
      unsub();
    }).not.toThrow();
    await provider.pushRealtimeRecord(did, rt(4_000));
    await new Promise((r) => setTimeout(r, 250));
    expect(received).not.toContain(4_000);
  });

  it("keeps realtime storage capped to the newest records (S0074)", async () => {
    const sid = uid("st");
    const did = uid("det");
    await provider.upsertStation(makeStation(sid, "owner1"));
    await provider.upsertDetector(makeDetector(did, sid));

    const baseTs = 1_700_200_000_000;
    const pushCount = REALTIME_CAP + 5;
    for (let i = 0; i < pushCount; i++) {
      await provider.pushRealtimeRecord(did, {
        ts: baseTs + i,
        sipmMv: 30 + i,
      });
    }

    const rawRealtime = (await adminDatabase().ref(Paths.realtime(sid, did)).get()).val();
    const keys = snapshotChildKeys(rawRealtime);
    expect(keys.length).toBeLessThanOrEqual(REALTIME_CAP);
    expect(keys.length).toBe(REALTIME_CAP);
    expect(keys[0]).toBe(padTs(baseTs + pushCount - REALTIME_CAP));
    expect(keys[keys.length - 1]).toBe(padTs(baseTs + pushCount - 1));
  });

  it("round-trips a dataset through exportAll → importAll and quarantines invalid chunks (AC4)", async () => {
    const sid = uid("st");
    const did = uid("det");
    await provider.upsertStation(makeStation(sid, "owner1"));
    await provider.upsertDetector(makeDetector(did, sid));
    const t0 = 1_800_000_000_000;
    await provider.pushMinuteRecord(did, makeMinute(t0, 10));
    await provider.pushMinuteRecord(did, makeMinute(t0 + 60_000, 11));

    // Export just this detector's slice.
    const chunks: DataChunk[] = [];
    for await (const c of provider.exportAll({ detectorIds: [did] })) chunks.push(c);
    const minuteChunks = chunks.filter((c) => c.kind === "minute");
    expect(minuteChunks.length).toBeGreaterThanOrEqual(2);

    // Re-import the exported chunks: idempotent (no duplication).
    async function* replay(): AsyncIterable<DataChunk> {
      for (const c of chunks) yield c;
    }
    const report1 = await provider.importAll(replay());
    expect(report1.imported).toBeGreaterThanOrEqual(chunks.length - report1.quarantined);
    const minutesAfter = await provider.getMinuteRecords(did, {
      fromTs: t0,
      toTs: t0 + 60_000,
    });
    expect(minutesAfter.length).toBe(2); // not duplicated

    // A schema-invalid chunk is quarantined, not thrown.
    async function* withBad(): AsyncIterable<DataChunk> {
      yield {
        kind: "minute",
        detectorId: did,
        data: { ts: -1, ec: -5 } as unknown as MinuteRecord, // invalid
      };
    }
    const report2 = await provider.importAll(withBad());
    expect(report2.quarantined).toBeGreaterThanOrEqual(1);
    expect(report2.imported).toBe(0);
  });

  it("register creates a Firebase Auth user and /users record (S0009 AC2)", async () => {
    const authProvider = await createFirebaseProvider({
      target: "client",
      apiKey: "demo-key",
      authDomain: "demo-muonhub.firebaseapp.com",
      databaseURL,
      projectId: "demo-muonhub",
    });
    const email = authEmail();

    const user = await authProvider.register(email, authPassword, {
      displayName: "Quito Researcher",
      language: "es",
    });

    expect(user.email).toBe(email);
    expect(user.role).toBe("user");
    expect(user.language).toBe("es");
    expect(user.displayName).toBe("Quito Researcher");

    const reader = await createFirebaseProvider({
      target: "admin",
      databaseURL,
      uid: user.uid,
    });
    expect(await reader.getCurrentUser()).toMatchObject({
      uid: user.uid,
      email,
      role: "user",
      language: "es",
    });

    await authProvider.signOut();
    expect((await authProvider.signIn(email, authPassword)).uid).toBe(user.uid);
  });

  it("signIn returns the user profile and maps wrong passwords (S0009 AC2)", async () => {
    const authProvider = await createFirebaseProvider({
      target: "client",
      apiKey: "demo-key",
      authDomain: "demo-muonhub.firebaseapp.com",
      databaseURL,
      projectId: "demo-muonhub",
    });
    const email = authEmail();
    const created = await authProvider.register(email, authPassword, {
      displayName: "Password Test User",
      language: "en",
    });

    await authProvider.signOut();
    await expect(authProvider.signIn(email, "wrong-password")).rejects.toMatchObject({
      code: "auth/invalid-credential",
    });

    const signedIn = await authProvider.signIn(email, authPassword);
    expect(signedIn.uid).toBe(created.uid);
    expect(signedIn.displayName).toBe("Password Test User");
  });

  it("onAuthStateChanged fires on login/logout and signOut clears the session (S0009 AC2)", async () => {
    const authProvider = await createFirebaseProvider({
      target: "client",
      apiKey: "demo-key",
      authDomain: "demo-muonhub.firebaseapp.com",
      databaseURL,
      projectId: "demo-muonhub",
    });
    const email = authEmail();
    const created = await authProvider.register(email, authPassword, {
      displayName: "Listener Test User",
      language: "pt-BR",
    });
    await authProvider.signOut();
    expect(await authProvider.getCurrentUser()).toBeNull();

    const states: Array<string | null> = [];
    const unsubscribe = authProvider.onAuthStateChanged((user) => {
      states.push(user?.uid ?? null);
    });

    await waitFor(() => states.includes(null), "initial signed-out auth state");
    await authProvider.signIn(email, authPassword);
    await waitFor(() => states.includes(created.uid), "signed-in auth state");

    expect((await authProvider.getCurrentUser())?.uid).toBe(created.uid);
    await authProvider.signOut();
    await waitFor(
      () => states.filter((state) => state === null).length >= 2,
      "signed-out auth state",
    );
    expect(await authProvider.getCurrentUser()).toBeNull();

    expect(() => {
      unsubscribe();
      unsubscribe();
    }).not.toThrow();
  });

  it("admin target rejects interactive auth methods as unsupported (S0009)", async () => {
    await expect(
      provider.register("admin-auth@example.org", authPassword, {
        displayName: "Admin Auth",
        language: "en",
      }),
    ).rejects.toMatchObject({ code: "auth/unsupported" });
    await expect(provider.signIn("admin-auth@example.org", authPassword)).rejects.toMatchObject({
      code: "auth/unsupported",
    });
    await expect(provider.signOut()).rejects.toMatchObject({ code: "auth/unsupported" });
    await expect(provider.sendPasswordReset("admin-auth@example.org")).rejects.toMatchObject({
      code: "auth/unsupported",
    });
    expect(() => provider.onAuthStateChanged(() => undefined)).toThrowError(/not supported/i);
  });
});
