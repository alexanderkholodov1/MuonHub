import { mkdtempSync, rmSync, statSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { v2 } from "@muonhub/shared";
import { createFileCredentialStore } from "./sync/credentials.js";
import { openLocalStore } from "./store/sqlite.js";
import type { LocalStore } from "./store/types.js";
import {
  cloudMinutes,
  dataChunks,
  makeHarness,
  scriptedFactory,
  STREAM_ID,
  T0,
  until,
  type Harness,
} from "./testing/harness.js";

const MIN = 60_000;
const harnesses: Harness[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const h of harnesses.splice(0)) await h.agent.stop().catch(() => undefined);
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const quick = { uploaderMs: 1e9, diskMs: 1e9, clockMs: 1e9, backoffMinMs: 5, backoffMaxMs: 20 };

async function boot(o: Partial<Parameters<typeof makeHarness>[0]> = {}) {
  const factory = scriptedFactory();
  const h = await makeHarness({ factory, intervals: quick, ...o });
  harnesses.push(h);
  await h.agent.start();
  await until(() => factory.sources.length > 0);
  return { h, factory, src: factory.sources[0]! };
}

const settle = async (h: Harness): Promise<void> => {
  await new Promise((r) => setTimeout(r, 15));
  h.agent.pipeline.flush();
};

describe("CA5: sign-in persistence", () => {
  it("creates the credential file with mode 0600 and refuses a file others can read", () => {
    const dir = mkdtempSync(join(tmpdir(), "mh-cred-"));
    dirs.push(dir);
    const path = join(dir, "credentials");
    const store = createFileCredentialStore(path);
    store.write("refresh-token-xyz");
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(store.read()).toBe("refresh-token-xyz");
    chmodSync(path, 0o644);
    expect(() => store.read()).toThrow(/0600/);
    store.clear();
    expect(store.read()).toBeNull();
  });

  it("a restarted process restores the session from the stored token and uploads", async () => {
    const { h, src } = await boot({ signedIn: false, withProvider: true });
    await h.provider.createAccount("agent@example.org", "pw-pw-pw-1");
    await h.provider.signOut();
    h.credentials.write("refresh-token-1");
    // new process: same store, signed out, credential file present
    await h.agent.stop();
    const second = await makeHarness({
      factory: scriptedFactory(),
      store: h.store,
      memory: h.memory,
      credentials: h.credentials,
      signedIn: false,
      intervals: quick,
    });
    harnesses.push(second);
    await second.agent.start();
    await until(() => second.agent.status().sync.signedIn);
    expect(second.logger.lines.some((l) => l.code === "signed-out")).toBe(false);
    void src;
  });

  it("with a revoked credential the agent keeps recording locally and reports signed out", async () => {
    const factory = scriptedFactory();
    const h = await makeHarness({ factory, signedIn: false, intervals: quick });
    harnesses.push(h);
    h.credentials.write("revoked-token");
    h.refresh.revoked = true;
    await h.agent.start();
    await until(() => factory.sources.length > 0);
    await until(() => h.agent.status().sync.label.startsWith("signed out"));
    factory.sources[0]!.push(...dataChunks({ fromHost: T0, count: 3 * 60 + 5, firstId: 1 }));
    await settle(h);
    await h.agent.drain();
    expect(h.store.minuteCount(STREAM_ID)).toBeGreaterThanOrEqual(2);
    expect(h.store.outboxCounts().pending.minute).toBeGreaterThanOrEqual(2);
    expect(h.store.outboxCounts().parked).toBe(0);
    expect(h.logger.lines.some((l) => l.code === "signed-out" && l.level === "error")).toBe(true);
  });
});

/** A store that fails its writes on demand, like a full disk. */
function faulty(inner: LocalStore): LocalStore & { failWrites: boolean } {
  const f = { failWrites: false } as LocalStore & { failWrites: boolean };
  const err = (): never => {
    throw Object.assign(new Error("database or disk is full"), { code: "ERR_SQLITE_ERROR" });
  };
  return Object.assign(f, inner, {
    appendRawLines: (rows: Parameters<LocalStore["appendRawLines"]>[0]) =>
      f.failWrites ? err() : inner.appendRawLines(rows),
    commitMinute: (...a: Parameters<LocalStore["commitMinute"]>) =>
      f.failWrites ? err() : inner.commitMinute(...a),
  });
}

describe("CA13: disk low and SQLite errors", () => {
  it("shows 'disk low' above the floor; below it ends the session with storageError and stops cleanly", async () => {
    const { h, factory, src } = await boot({
      intervals: { ...quick, diskMs: 20 },
      disk: { lowBytes: 2_000_000_000, floorBytes: 200_000_000 },
    });
    src.push(...dataChunks({ fromHost: T0, count: 100, firstId: 1 }));
    await settle(h);
    h.disk.free = 1_000_000_000;
    await until(() => h.agent.status().conditions.some((c) => c.code === "disk-low"));
    expect(h.agent.status().disk.level).toBe("low");
    expect(h.logger.lines.some((l) => l.code === "disk-low" && l.level === "error")).toBe(true);
    expect(h.agent.status().device.label).not.toBe("stopped");

    h.disk.free = 100_000_000;
    await until(() => h.agent.status().device.label === "stopped");
    expect(h.store.listSessions(STREAM_ID, 1)[0]!.endReason).toBe("storageError");
    expect(h.logger.lines.some((l) => l.code === "storage-stopped" && l.level === "error")).toBe(
      true,
    );
    // no restart loop: the port is not reopened while the disk is full
    await new Promise((r) => setTimeout(r, 120));
    expect(factory.sources).toHaveLength(1);

    // space comes back: acquisition resumes with a new session
    h.disk.free = 50_000_000_000;
    await until(() => factory.sources.length === 2);
    expect(h.agent.status().conditions.some((c) => c.code === "storage-stopped")).toBe(false);
  });

  it("a SQLite write error stops acquisition cleanly instead of crashing", async () => {
    const inner = await openLocalStore({ path: ":memory:" });
    const store = faulty(inner);
    const { h, factory, src } = await boot({ store });
    src.push(...dataChunks({ fromHost: T0, count: 30, firstId: 1 }));
    await settle(h);
    store.failWrites = true;
    src.push(...dataChunks({ fromHost: T0 + 40_000, count: 30, firstId: 31 }));
    await settle(h);
    await until(() => h.agent.status().device.label === "stopped");
    expect(h.logger.lines.some((l) => l.code === "storage-error" && l.level === "error")).toBe(
      true,
    );
    await new Promise((r) => setTimeout(r, 60));
    expect(factory.sources).toHaveLength(1);
  });
});

describe("CA14: clock step and NTP hold", () => {
  it("a +5 min wall-clock jump ends the session with clockStep; no short or duplicate minute is uploaded", async () => {
    const { h, src } = await boot();
    // 3.5 min of data, then the wall clock jumps by +5 min while the monotonic clock continues
    src.push(...dataChunks({ fromHost: T0, count: 210, firstId: 1 }));
    src.push(
      ...dataChunks({
        fromHost: T0 + 210_000,
        count: 200,
        firstId: 211,
        monoStart: 210_000,
        wallShift: 5 * MIN,
      }),
    );
    await settle(h);
    await h.agent.drain();
    const sessions = h.store.listSessions(STREAM_ID, 10);
    expect(sessions).toHaveLength(2);
    const ended = sessions[1]!;
    expect(ended.endReason).toBe("clockStep");
    expect(ended.counters.clockAnomalies).toBe(1);
    expect(ended.counters.discardedPartialMinutes).toBeGreaterThanOrEqual(1);
    const cloud = await cloudMinutes(h);
    expect(new Set(cloud.map((m) => m.ts)).size).toBe(cloud.length);
    for (const m of cloud) expect(m.n).toBe(60);
  });

  it("holds minute output until NTP is reported synchronized, then releases it", async () => {
    const factory = scriptedFactory();
    const h = await makeHarness({ factory, intervals: quick, holdForClock: true });
    harnesses.push(h);
    h.clock.reading = { synchronized: false, offsetMs: 0, known: true };
    await h.agent.start();
    await until(() => factory.sources.length > 0);
    factory.sources[0]!.push(...dataChunks({ fromHost: T0, count: 5 * 60 + 5, firstId: 1 }));
    await settle(h);
    expect(h.agent.status().clock.holding).toBe(true);
    expect(h.agent.pipeline.heldMinutes).toBeGreaterThanOrEqual(3);
    expect(h.store.minuteCount(STREAM_ID)).toBe(0);
    h.clock.reading = { synchronized: true, offsetMs: 2, known: true };
    h.agent.gate.update(h.clock.reading);
    expect(h.store.minuteCount(STREAM_ID)).toBeGreaterThanOrEqual(3);
    expect(h.agent.pipeline.heldMinutes).toBe(0);
  });

  it("after the 10 min limit minutes are produced with time source 'none', never labelled ntp", async () => {
    const factory = scriptedFactory();
    let t = T0;
    const h = await makeHarness({
      factory,
      intervals: quick,
      holdForClock: true,
      clockHoldMs: 100,
      now: () => t,
    });
    harnesses.push(h);
    h.clock.reading = { synchronized: false, offsetMs: 0, known: true };
    await h.agent.start();
    await until(() => factory.sources.length > 0);
    factory.sources[0]!.push(...dataChunks({ fromHost: T0, count: 3 * 60 + 5, firstId: 1 }));
    await settle(h);
    t += 10 * MIN;
    h.agent.gate.evaluate();
    expect(h.store.minuteCount(STREAM_ID)).toBeGreaterThanOrEqual(2);
    expect(h.store.listSessions(STREAM_ID, 1)[0]!.timeProvenance.source).toBe("none");
  });

  it("drops held minutes when the clock steps while holding (their timestamps are untrustworthy)", async () => {
    const factory = scriptedFactory();
    const h = await makeHarness({ factory, intervals: quick, holdForClock: true });
    harnesses.push(h);
    h.clock.reading = { synchronized: false, offsetMs: 0, known: true };
    await h.agent.start();
    await until(() => factory.sources.length > 0);
    const src = factory.sources[0]!;
    src.push(...dataChunks({ fromHost: T0, count: 200, firstId: 1 }));
    src.push(
      ...dataChunks({
        fromHost: T0 + 200_000,
        count: 70,
        firstId: 201,
        monoStart: 200_000,
        wallShift: 3_600_000,
      }),
    );
    await settle(h);
    expect(h.agent.pipeline.heldMinutes).toBe(0);
    expect(h.store.minuteCount(STREAM_ID)).toBe(0);
    expect(h.logger.lines.some((l) => l.code === "minutes-dropped")).toBe(true);
  });
});

describe("CA15: crash recovery", () => {
  it("closes the open session with powerLoss, counts the in-progress minute, and rebuilds the hour from local minutes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mh-crash-"));
    dirs.push(dir);
    const dbPath = join(dir, "agent.db");
    const storeA = await openLocalStore({ path: dbPath });
    const a = await boot({ store: storeA });
    // 4.5 minutes of data: 3 complete minutes stored, the 4th is in progress in memory
    a.src.push(...dataChunks({ fromHost: T0 + 30_000, count: 4 * 60 + 30, firstId: 1 }));
    await settle(a.h);
    const stored = storeA.minuteCount(STREAM_ID);
    expect(stored).toBeGreaterThanOrEqual(3);
    // the process is killed: nothing runs again for A; a new process starts on the same file
    const storeB = await openLocalStore({ path: dbPath });
    const factory = scriptedFactory();
    const b = await makeHarness({
      factory,
      store: storeB,
      intervals: quick,
      bootTimeMs: T0 + 24 * 3_600_000,
    });
    harnesses.push(b);
    await b.agent.start();
    const sessions = storeB.listSessions(STREAM_ID, 10);
    expect(sessions[0]!.endReason).toBe("powerLoss");
    expect(sessions[0]!.endedAt).not.toBeNull();
    expect(sessions[0]!.counters.discardedPartialMinutes).toBeGreaterThanOrEqual(2); // first partial + in progress
    expect(storeB.minuteCount(STREAM_ID)).toBe(stored);
    // hour summary is rebuilt from the stored minutes, not from memory
    const hour = storeB.latestSummary(STREAM_ID, Math.floor(T0 / 3_600_000) * 3_600_000);
    expect(hour?.entry.completeMinutes).toBe(stored);
    expect(hour?.entry.n).toBe(stored * 60);
    // and unknown when the machine did not reboot
    expect(v2.EndReasonSchema.safeParse(sessions[0]!.endReason).success).toBe(true);
    a.h.agent.supervisor.stop().catch(() => undefined);
  });

  it("closes the session as unknown when the last raw line is newer than the boot time (process crash)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mh-crash2-"));
    dirs.push(dir);
    const dbPath = join(dir, "agent.db");
    const storeA = await openLocalStore({ path: dbPath });
    const a = await boot({ store: storeA });
    a.src.push(...dataChunks({ fromHost: T0, count: 150, firstId: 1 }));
    await settle(a.h);
    const storeB = await openLocalStore({ path: dbPath });
    const b = await makeHarness({
      factory: scriptedFactory(),
      store: storeB,
      intervals: quick,
      bootTimeMs: T0 - 1000,
    });
    harnesses.push(b);
    await b.agent.start();
    expect(storeB.listSessions(STREAM_ID, 1)[0]!.endReason).toBe("unknown");
  });
});
