import { describe, expect, it, vi } from "vitest";
import { v2 } from "@muonhub/shared";
import { createMemoryProviderV2, MemoryStore } from "./memory-provider.js";
import {
  DEVICE_ID,
  OWNER,
  STATION_ID,
  STREAM_ID,
  T0,
  daySummary,
  device,
  minute,
  session,
  station,
  stream,
} from "./fixtures.js";

function setup() {
  const store = new MemoryStore();
  const provider = createMemoryProviderV2({ store, now: () => T0 + 5_000 });
  return { store, provider };
}

describe("memory provider — stations", () => {
  it("creates a station and its public projection; a second create fails", async () => {
    const { provider } = setup();
    await provider.createStation(station());
    await expect(provider.createStation(station())).rejects.toMatchObject({
      code: "already-exists",
    });
    const pub = await provider.listPublicStations();
    expect(pub.items.map((p) => p.id)).toEqual([STATION_ID]);
  });

  it("does not create a projection for a private station", async () => {
    const { provider } = setup();
    await provider.createStation(station({ visibility: "private" }));
    expect((await provider.listPublicStations()).items).toEqual([]);
  });

  it("updating metadata keeps history untouched and refreshes the projection", async () => {
    const { provider } = setup();
    await provider.createStation(station());
    await provider.createStream(stream());
    await provider.writeMinutes(STREAM_ID, [minute(0)]);
    await provider.updateStation(STATION_ID, { name: "Renamed" });
    expect((await provider.getStation(STATION_ID))?.name).toBe("Renamed");
    expect((await provider.listPublicStations()).items[0]?.name).toBe("Renamed");
    const page = await provider.readMinutes(STREAM_ID, { fromTs: T0, toTs: T0 + 60_000 });
    expect(page.items).toHaveLength(1);
  });

  it("removes the projection when the station leaves public", async () => {
    const { provider } = setup();
    await provider.createStation(station());
    await provider.updateStation(STATION_ID, { visibility: "private" });
    expect((await provider.listPublicStations()).items).toEqual([]);
  });

  it("rejects an invalid update and an update of a missing station", async () => {
    const { provider } = setup();
    await provider.createStation(station());
    await expect(provider.updateStation(STATION_ID, { name: "" })).rejects.toMatchObject({
      code: "invalid-argument",
    });
    await expect(provider.updateStation("nope", { name: "x" })).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("transfers ownership with an immutable transfer record", async () => {
    const { provider, store } = setup();
    const me = await provider.createAccount("a@example.org", "secret1");
    await provider.createStation(station({ ownerUid: me.uid }));
    const id = await provider.transferOwnership(STATION_ID, "newOwner1");
    expect((await provider.getStation(STATION_ID))?.ownerUid).toBe("newOwner1");
    expect((await provider.getStation(STATION_ID))?.transferId).toBe(id);
    expect((await provider.getTransfer(id))?.from).toBe(me.uid);
    expect(store.docs.has(`ownershipTransfers/${id}`)).toBe(true);
    await expect(provider.transferOwnership(STATION_ID, "x1")).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("shares a station and lists it for the member", async () => {
    const store = new MemoryStore();
    const owner = createMemoryProviderV2({ store, now: () => T0 });
    const guest = createMemoryProviderV2({ store, now: () => T0 });
    const o = await owner.createAccount("o@example.org", "secret1");
    const g = await guest.createAccount("g@example.org", "secret1");
    await owner.createStation(station({ ownerUid: o.uid, visibility: "private" }));
    await owner.addMember(STATION_ID, g.uid, "viewer");
    await expect(owner.addMember(STATION_ID, g.uid, "editor")).rejects.toMatchObject({
      code: "already-exists",
    });
    const shared = await guest.listSharedWithMe();
    expect(shared.items).toEqual([
      { station: expect.objectContaining({ id: STATION_ID }), role: "viewer" },
    ]);
    await owner.changeMemberRole(STATION_ID, g.uid, "editor");
    expect((await owner.listMembers(STATION_ID)).items[0]?.role).toBe("editor");
    await owner.removeMember(STATION_ID, g.uid);
    expect((await guest.listSharedWithMe()).items).toEqual([]);
  });
});

describe("memory provider — devices, streams, sessions", () => {
  it("separates create from metadata update", async () => {
    const { provider } = setup();
    await provider.createDevice(device());
    await expect(provider.createDevice(device())).rejects.toMatchObject({ code: "already-exists" });
    await provider.updateDevice(DEVICE_ID, { label: "Renamed" });
    expect((await provider.getDevice(DEVICE_ID))?.label).toBe("Renamed");
    await expect(provider.updateDevice("missing", { label: "x" })).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("appends calibrations and refuses to replace a version", async () => {
    const { provider } = setup();
    const cal = (version: number): v2.Calibration => ({
      schemaVersion: 2,
      deviceId: DEVICE_ID,
      version,
      validFrom: T0,
      parameters: { saturation: { value: 1000, unit: "mV", origin: "default", locked: false } },
      authorUid: OWNER,
      createdAt: T0,
    });
    await provider.addCalibration(cal(2));
    await provider.addCalibration(cal(1));
    await expect(provider.addCalibration(cal(1))).rejects.toMatchObject({ code: "already-exists" });
    expect((await provider.listCalibrations(DEVICE_ID)).items.map((c) => c.version)).toEqual([
      1, 2,
    ]);
  });

  it("publishes device type versions create-only and moves the pointer forward only", async () => {
    const { provider } = setup();
    const [base] = v2.BUILTIN_DEVICE_TYPES;
    if (base === undefined) throw new Error("no builtin");
    await provider.publishDeviceType({ ...base, version: 2 });
    await expect(provider.publishDeviceType({ ...base, version: 2 })).rejects.toMatchObject({
      code: "already-exists",
    });
    await expect(provider.publishDeviceType({ ...base, version: 1 })).rejects.toMatchObject({
      code: "conflict",
    });
    expect((await provider.getDeviceType(base.id))?.version).toBe(2);
    expect((await provider.getDeviceType(base.id, 2))?.version).toBe(2);
  });

  it("closes a session only once", async () => {
    const { provider } = setup();
    await provider.startSession(session());
    await provider.endSession(STREAM_ID, "session-1", { endedAt: T0 + 1000, endReason: "stop" });
    await expect(
      provider.endSession(STREAM_ID, "session-1", { endedAt: T0 + 2000, endReason: "stop" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      provider.endSession(STREAM_ID, "nope", { endedAt: T0, endReason: "stop" }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("updates counters of an open session only", async () => {
    const { provider } = setup();
    await provider.startSession(session());
    const counters = {
      completeMinutes: 5,
      discardedPartialMinutes: 1,
      quarantinedLines: 0,
      eventIdGaps: 0,
    };
    await provider.updateSessionCounters(STREAM_ID, "session-1", counters);
    await provider.endSession(STREAM_ID, "session-1", { endedAt: T0 + 1000, endReason: "stop" });
    await expect(
      provider.updateSessionCounters(STREAM_ID, "session-1", counters),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("returns invalid stored records as quarantine, not silence", async () => {
    const { provider, store } = setup();
    await provider.createDevice(device());
    store.plantDoc("devices/broken", { id: "broken", stationId: STATION_ID });
    const r = await provider.listDevices(STATION_ID);
    expect(r.items).toHaveLength(1);
    expect(r.quarantine.count).toBe(1);
    expect(r.quarantine.samples[0]?.key).toBe("broken");
  });

  it("throws invalid-data when a single stored document is malformed", async () => {
    const { provider, store } = setup();
    store.plantDoc("devices/broken", { id: "broken" });
    await expect(provider.getDevice("broken")).rejects.toMatchObject({ code: "invalid-data" });
  });
});

describe("memory provider — minutes", () => {
  it("is write-once: existing minutes are reported and left untouched", async () => {
    const { provider } = setup();
    const first = await provider.writeMinutes(STREAM_ID, [minute(0), minute(1)]);
    expect(first).toEqual({ written: 2, alreadyExisted: [] });
    const again = await provider.writeMinutes(STREAM_ID, [
      minute(1, { n: 999, amplitude: { mean: 1, min: 1, max: 1, unit: "mV" } }),
      minute(2),
    ]);
    expect(again).toEqual({ written: 1, alreadyExisted: [T0 + 60_000] });
    const page = await provider.readMinutes(STREAM_ID, { fromTs: T0, toTs: T0 + 3 * 60_000 });
    expect(page.items[1]?.n).toBe(12);
  });

  it("refuses invalid minutes", async () => {
    const { provider } = setup();
    await expect(provider.writeMinutes(STREAM_ID, [minute(0, { ts: T0 + 1 })])).rejects.toThrow();
  });

  it("reads a long range completely by cursor, without a 500-record cap", async () => {
    const { provider } = setup();
    const records = Array.from({ length: 2500 }, (_, i) => minute(i));
    await provider.writeMinutes(STREAM_ID, records);
    let cursor: string | null = null;
    let total = 0;
    let pages = 0;
    do {
      const page: Awaited<ReturnType<typeof provider.readMinutes>> = await provider.readMinutes(
        STREAM_ID,
        {
          fromTs: T0,
          toTs: T0 + 2500 * 60_000,
          limit: 1000,
          cursor,
        },
      );
      total += page.items.length;
      pages += 1;
      cursor = page.nextCursor;
    } while (cursor !== null);
    expect(total).toBe(2500);
    expect(pages).toBe(3);
  });

  it("quarantines a corrupt stored minute and keeps the rest", async () => {
    const { provider, store } = setup();
    await provider.writeMinutes(STREAM_ID, [minute(0), minute(2)]);
    store.plantRt(`minutes/${STREAM_ID}/${v2.minuteKey(T0 + 60_000)}`, { v: 2, s: "x", n: "bad" });
    const page = await provider.readMinutes(STREAM_ID, { fromTs: T0, toTs: T0 + 5 * 60_000 });
    expect(page.items).toHaveLength(2);
    expect(page.quarantine.count).toBe(1);
  });

  it("never turns an absent pressure into zero", async () => {
    const { provider } = setup();
    await provider.writeMinutes(STREAM_ID, [minute(0)]);
    const [m] = (await provider.readMinutes(STREAM_ID, { fromTs: T0, toTs: T0 + 60_000 })).items;
    expect(m).not.toHaveProperty("pressureHpa");
  });
});

describe("memory provider — day summaries", () => {
  it("stores summaries and lists a range; a missing day stays absent", async () => {
    const { provider } = setup();
    await provider.putDaySummary(daySummary("2026-10-01"));
    await provider.putDaySummary(daySummary("2026-10-03"));
    const r = await provider.listDaySummaries(STREAM_ID, "2026-10-01", "2026-10-05");
    expect(r.items.map((d) => d.day)).toEqual(["2026-10-01", "2026-10-03"]);
    expect(await provider.getDaySummary(STREAM_ID, "2026-10-02")).toBeNull();
    const paged = await provider.listDaySummaries(STREAM_ID, "2026-10-01", "2026-10-05", {
      limit: 1,
    });
    expect(paged.nextCursor).toBe("2026-10-01");
  });

  it("quarantines a summary stored under a wrong path", async () => {
    const { provider, store } = setup();
    store.plantDoc(`streams/${STREAM_ID}/days/2026-10-02`, daySummary("2026-10-01"));
    const r = await provider.listDaySummaries(STREAM_ID, "2026-10-01", "2026-10-05");
    expect(r.quarantine.count).toBe(1);
  });
});

describe("memory provider — live window", () => {
  it("keeps same-millisecond events, prunes by time, and keeps recent ones", async () => {
    const { provider } = setup();
    const nowMs = T0 + 3_600_000;
    await provider.pushLiveEvents(STREAM_ID, [
      { t: nowMs, amplitude: 1 },
      { t: nowMs, amplitude: 2 },
      { t: nowMs - 700_000, amplitude: 3 },
    ]);
    const r = await provider.pruneLive(STREAM_ID, nowMs);
    expect(r).toEqual({ removed: 1, skipped: 0 });
    const again = await provider.pruneLive(STREAM_ID, nowMs);
    expect(again.removed).toBe(0);
  });

  it("delivers the window once, then only new events, and reports invalid entries", async () => {
    const { provider, store } = setup();
    const nowMs = T0 + 5_000;
    await provider.pushLiveEvents(STREAM_ID, [{ t: nowMs - 1000, amplitude: 1 }]);
    const onData = vi.fn();
    const onInvalid = vi.fn();
    const off = provider.subscribeLive(STREAM_ID, { onData, onError: vi.fn(), onInvalid });
    expect(onData).toHaveBeenCalledTimes(1);
    await provider.pushLiveEvents(STREAM_ID, [{ t: nowMs, amplitude: 2 }]);
    expect(onData).toHaveBeenCalledTimes(2);
    store.plantRt(`live/${STREAM_ID}/events/${String(nowMs).padStart(13, "0")}zzzz`, { t: "x" });
    expect(onInvalid).toHaveBeenCalledTimes(1);
    off();
    await provider.pushLiveEvents(STREAM_ID, [{ t: nowMs + 1, amplitude: 3 }]);
    expect(onData).toHaveBeenCalledTimes(2);
  });
});

describe("memory provider — status", () => {
  it("publishes the public subset only on request", async () => {
    const { provider } = setup();
    await provider.setStatus(STREAM_ID, { lastSeenAt: T0, agentOnline: true, rawRatePerMin: 12 });
    expect(await provider.getStatusPublic(STREAM_ID)).toBeNull();
    await provider.setStatus(
      STREAM_ID,
      { lastSeenAt: T0, agentOnline: true, rawRatePerMin: 12 },
      { publish: true },
    );
    expect(await provider.getStatusPublic(STREAM_ID)).toEqual({
      lastSeenAt: T0,
      agentOnline: true,
    });
  });

  it("notifies subscribers and reports invalid stored status", async () => {
    const { provider, store } = setup();
    const onData = vi.fn();
    const onInvalid = vi.fn();
    provider.subscribeStatus(STREAM_ID, { onData, onError: vi.fn(), onInvalid });
    expect(onData).toHaveBeenLastCalledWith(null);
    await provider.setStatus(STREAM_ID, { lastSeenAt: T0, agentOnline: false });
    expect(onData).toHaveBeenLastCalledWith({ lastSeenAt: T0, agentOnline: false });
    store.plantRt(`status/${STREAM_ID}`, { agentOnline: "yes" });
    expect(onInvalid).toHaveBeenCalledTimes(1);
  });
});

describe("memory provider — auth", () => {
  it("signs up, signs in, and reports credential errors without revealing which part is wrong", async () => {
    const { provider } = setup();
    await provider.createAccount("a@example.org", "secret1");
    await provider.signOut();
    expect(provider.currentUser()).toBeNull();
    await expect(provider.signInWithEmail("a@example.org", "wrong!")).rejects.toMatchObject({
      code: "invalid-credentials",
    });
    await expect(provider.signInWithEmail("zzz@example.org", "wrong!")).rejects.toMatchObject({
      code: "invalid-credentials",
    });
    expect((await provider.signInWithEmail("a@example.org", "secret1")).email).toBe(
      "a@example.org",
    );
  });

  it("claims one username per user", async () => {
    const { provider } = setup();
    const user: v2.User = {
      schemaVersion: 2,
      uid: "u1",
      displayName: "Ana",
      username: "ana",
      email: "a@example.org",
      createdAt: T0,
    };
    await provider.createUserProfile(user);
    await expect(provider.createUserProfile({ ...user, uid: "u2" })).rejects.toMatchObject({
      code: "already-exists",
    });
    expect(await provider.findUidByUsername("ana")).toBe("u1");
  });
});
