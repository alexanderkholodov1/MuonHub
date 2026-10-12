import { afterEach, describe, expect, it } from "vitest";
import { v2 as dp } from "@muonhub/data-provider";
import { v2 } from "@muonhub/shared";
import {
  cloudMinutes,
  dataChunks,
  makeHarness,
  scriptedFactory,
  settleSource,
  type ScriptedSource,
  STREAM_ID,
  T0,
  until,
  type Harness,
} from "./testing/harness.js";

const MIN = 60_000;
const harnesses: Harness[] = [];
const unhandled: unknown[] = [];
const onUnhandled = (e: unknown): void => {
  unhandled.push(e);
};
process.on("unhandledRejection", onUnhandled);

afterEach(async () => {
  for (const h of harnesses.splice(0)) await h.agent.stop().catch(() => undefined);
});

async function setup(
  o: Partial<Parameters<typeof makeHarness>[0]> = {},
  clock = { t: T0 + 3 * 3_600_000 },
) {
  const factory = scriptedFactory();
  const h = await makeHarness({
    factory,
    now: () => clock.t,
    intervals: { uploaderMs: 1e9, diskMs: 1e9, clockMs: 1e9, backoffMinMs: 5, backoffMaxMs: 20 },
    ...o,
  });
  harnesses.push(h);
  await h.agent.start();
  await until(() => factory.sources.length > 0);
  return { h, factory, src: factory.sources[0]!, clock };
}

/** Feeds `minutes` minutes of 1 event/s starting at a minute boundary and waits for them. */
async function feed(
  h: Harness,
  src: ReturnType<typeof scriptedFactory>["sources"][number],
  plan: Parameters<typeof dataChunks>[0],
): Promise<void> {
  src.push(...dataChunks(plan));
  await settleSource(h, src as unknown as ScriptedSource);
}

describe("CA3: outbox offline then online", () => {
  it("uploads every minute exactly once and in order after an offline hour; a rejection parks one item", async () => {
    const { h, src, clock } = await setup();
    h.memory.injectFault({ op: "*", kind: "unavailable", times: Infinity });
    await feed(h, src, { fromHost: T0 + 30_000, count: 66 * 60, firstId: 1 });
    await h.agent.drain();
    expect(h.store.outboxCounts().pending.minute).toBeGreaterThanOrEqual(64);
    expect(h.agent.status().queue.parked).toBe(0);
    expect(await cloudMinutes(h).catch(() => [])).toHaveLength(0);

    h.memory.clearFaults();
    clock.t += 10 * MIN; // past the backoff
    await h.agent.drain();
    await h.agent.drain();
    const cloud = await cloudMinutes(h);
    const local = h.store.minutesInRange(STREAM_ID, 0, Number.MAX_SAFE_INTEGER);
    expect(cloud.map((m) => m.ts)).toEqual(local.map((m) => m.ts));
    expect(new Set(cloud.map((m) => m.ts)).size).toBe(cloud.length);
    expect(h.store.outboxCounts().pending.minute).toBe(0);
    for (const m of cloud) expect(m.n).toBe(60);
    // never uploaded again
    await h.agent.drain();
    expect(await cloudMinutes(h)).toHaveLength(cloud.length);
  });

  it("a permanent rejection with a valid session parks the item, shows in status, and does not block later items", async () => {
    const { h, src, clock } = await setup();
    await feed(h, src, { fromHost: T0, count: 3 * 60 + 5, firstId: 1 });
    h.memory.injectFault({ op: "writeMinutes", kind: "permission-denied", times: 2 });
    await h.agent.drain();
    // the batch is narrowed to single items, the first single is parked
    clock.t += 10 * MIN;
    await h.agent.drain();
    await h.agent.drain();
    const st = h.agent.status();
    expect(st.queue.parked).toBe(1);
    expect(st.sync.rejectedCount).toBe(1);
    expect(st.sync.lastRejected?.code).toBe("permission-denied");
    expect(h.logger.lines.some((l) => l.level === "error" && l.code === "write-rejected")).toBe(
      true,
    );
    // later items of the kind were not blocked
    expect((await cloudMinutes(h)).length).toBe(1);
    expect(h.store.outboxCounts().pending.minute).toBe(0);
    // parked items are visible and exportable, and retry puts them back
    expect(h.store.parkedItems(10)).toHaveLength(1);
    expect(h.store.unparkAll()).toBe(1);
    await h.agent.drain();
    expect((await cloudMinutes(h)).length).toBe(2);
  });

  it("re-enqueueing an existing key is a no-op", async () => {
    const { h, src } = await setup();
    await feed(h, src, { fromHost: T0, count: 130, firstId: 1 });
    const before = h.store.outboxCounts().pending.minute;
    const item = h.store.pendingItems("minute", Number.MAX_SAFE_INTEGER, 1)[0]!;
    expect(
      h.store.enqueue({
        streamId: STREAM_ID,
        kind: "minute",
        ts: item.ts,
        sessionId: item.sessionId,
        payload: "{}",
      }),
    ).toBe(false);
    expect(h.store.outboxCounts().pending.minute).toBe(before);
  });
});

describe("CA4: serial loss", () => {
  it("reports disconnected at once, ends the session with usbLoss, and starts a new session on reconnect", async () => {
    const { h, factory, src } = await setup();
    await feed(h, src, { fromHost: T0 + 10_000, count: 200, firstId: 1 });
    src.fail(new Error("device unplugged"));
    await until(() => h.agent.status().device.label === "device disconnected");
    await until(() => factory.sources.length === 2);
    h.agent.pipeline.flush();
    const first = h.store.listSessions(STREAM_ID, 10)[0]!;
    expect(first.endReason).toBe("usbLoss");
    expect(h.logger.lines.some((l) => l.code === "device-lost" && l.level === "error")).toBe(true);
    const second = factory.sources[1]!;
    await feed(h, second, { fromHost: T0 + 10 * MIN, count: 150, firstId: 1, monoStart: 10 * MIN });
    const sessions = h.store.listSessions(STREAM_ID, 10);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.endedAt).toBeNull();
    expect(sessions[0]!.id).not.toBe(sessions[1]!.id);
    expect(unhandled).toHaveLength(0);
  });
});

describe("CA17: device silent", () => {
  it("reports 'device silent' within the window, produces no minutes, and reopens the port", async () => {
    const { h, factory, src } = await setup({ silenceWindowMs: 40 });
    await feed(h, src, { fromHost: T0 + 20_000, count: 100, firstId: 1 });
    const minutesBefore = h.store.minuteCount(STREAM_ID);
    await until(() => h.agent.status().device.label === "device silent");
    expect(h.agent.status().conditions.some((c) => c.code === "device-silent")).toBe(true);
    expect(h.logger.lines.some((l) => l.code === "device-silent" && l.level === "error")).toBe(
      true,
    );
    expect(h.store.recentEvents(50).some((e) => e.code === "device-silent")).toBe(true);
    await until(() => factory.sources.length === 2);
    expect(h.store.minuteCount(STREAM_ID)).toBe(minutesBefore);
    expect(h.store.listSessions(STREAM_ID, 5)[0]!.endReason).toBe("usbLoss");
  });
});

describe("CA11: token revoked mid-run", () => {
  it("pauses the outbox without parking, shows signed out, and after re-sign-in uploads each item exactly once", async () => {
    const { h, src, clock } = await setup();
    await feed(h, src, { fromHost: T0, count: 5 * 60 + 5, firstId: 1 });
    await h.agent.drain();
    const uploadedBefore = (await cloudMinutes(h)).length;
    expect(uploadedBefore).toBeGreaterThan(0);

    h.refresh.revoked = true;
    h.memory.injectFault({ op: "writeMinutes", kind: "permission-denied", times: Infinity });
    await h.provider.signOut();
    await feed(h, src, { fromHost: T0 + 5 * MIN + 5000, count: 4 * 60, firstId: 306 });
    await h.agent.drain();
    const st = h.agent.status();
    expect(st.sync.paused).toBe(true);
    expect(st.sync.label).toContain("signed out");
    expect(st.queue.parked).toBe(0);
    expect(h.logger.lines.some((l) => l.level === "error" && /signed out/.test(l.message))).toBe(
      true,
    );
    const pending = h.store.outboxCounts().pending.minute;
    expect(pending).toBeGreaterThan(0);

    h.refresh.revoked = false;
    h.memory.clearFaults();
    clock.t += 10 * MIN;
    await h.provider.signInWithEmail("agent@example.org", "pw-pw-pw-1");
    await h.agent.drain();
    await h.agent.drain();
    expect(h.agent.status().sync.paused).toBe(false);
    expect(h.store.outboxCounts().pending.minute).toBe(0);
    const cloud = await cloudMinutes(h);
    expect(new Set(cloud.map((m) => m.ts)).size).toBe(cloud.length);
    expect(cloud.length).toBe(h.store.minuteCount(STREAM_ID));
  });
});

describe("CA12: lost acknowledgement", () => {
  it("reads the record back and marks it uploaded: no duplicate, no wrongful park", async () => {
    let lost = 0;
    const { h, src, clock } = await setup({
      wrapProvider: (p) => ({
        ...p,
        writeMinutes: async (streamId, records) => {
          const r = await p.writeMinutes(streamId, records);
          if (lost === 0) {
            lost += 1;
            throw new dp.DataProviderError("outcome-unknown");
          }
          return r;
        },
      }),
    });
    await feed(h, src, { fromHost: T0, count: 3 * 60 + 5, firstId: 1 });
    await h.agent.drain();
    clock.t += 10 * MIN;
    await h.agent.drain();
    expect(lost).toBe(1);
    const cloud = await cloudMinutes(h);
    expect(cloud.length).toBe(h.store.minuteCount(STREAM_ID));
    expect(new Set(cloud.map((m) => m.ts)).size).toBe(cloud.length);
    expect(h.store.outboxCounts().pending.minute).toBe(0);
    expect(h.store.outboxCounts().parked).toBe(0);
  });

  it("absent on read-back → written again: no park, no duplicate", async () => {
    let lost = 0;
    const { h, src, clock } = await setup({
      wrapProvider: (p) => ({
        ...p,
        writeMinutes: async (streamId, records) => {
          // the write never reached the server, and its acknowledgement is "lost"
          if (lost === 0) {
            lost += 1;
            throw new dp.DataProviderError("outcome-unknown");
          }
          return p.writeMinutes(streamId, records);
        },
      }),
    });
    await feed(h, src, { fromHost: T0, count: 3 * 60 + 5, firstId: 1 });
    await h.agent.drain();
    expect(h.store.outboxCounts().pending.minute).toBe(h.store.minuteCount(STREAM_ID));
    expect(await cloudMinutes(h)).toHaveLength(0);
    clock.t += 10 * MIN;
    await h.agent.drain();
    const cloud = await cloudMinutes(h);
    expect(cloud.length).toBe(h.store.minuteCount(STREAM_ID));
    expect(new Set(cloud.map((m) => m.ts)).size).toBe(cloud.length);
    expect(h.store.outboxCounts().pending.minute).toBe(0);
    expect(h.store.outboxCounts().parked).toBe(0);
  });

  it("different on read-back → parked as a conflict, never overwritten; the rest uploads", async () => {
    const memory = new dp.MemoryStore();
    let lost = 0;
    let planted: v2.MinuteRecord | null = null;
    const { h, src, clock } = await setup({
      memory,
      wrapProvider: (p) => ({
        ...p,
        writeMinutes: async (streamId, records) => {
          if (lost === 0) {
            lost += 1;
            // another writer stored a DIFFERENT minute at the first timestamp
            const first = records[0]!;
            planted = { ...first, n: first.n + 7 };
            const { key, value } = v2.serializeMinute(planted);
            memory.plantRt(`minutes/${streamId}/${key}`, value);
            throw new dp.DataProviderError("outcome-unknown");
          }
          return p.writeMinutes(streamId, records);
        },
      }),
    });
    await feed(h, src, { fromHost: T0, count: 4 * 60 + 5, firstId: 1 });
    await h.agent.drain();
    clock.t += 10 * MIN;
    await h.agent.drain();
    clock.t += 10 * MIN;
    await h.agent.drain();
    const parked = h.store.parkedItems(10);
    expect(parked).toHaveLength(1);
    expect(parked[0]!.ts).toBe(planted!.ts);
    expect(parked[0]!.lastError).toMatch(/conflict/);
    expect(h.agent.status().sync.lastRejected?.code).toBe("conflict");
    const cloud = await cloudMinutes(h);
    // the stored minute was not overwritten, and every other minute arrived
    expect(cloud.find((m) => m.ts === planted!.ts)?.n).toBe(planted!.n);
    expect(cloud.length).toBe(h.store.minuteCount(STREAM_ID));
    expect(h.store.outboxCounts().pending.minute).toBe(0);
  });
});
