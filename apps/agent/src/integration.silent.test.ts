/**
 * Silent-failure review of step 7 (spec 0087): nothing may be marked uploaded, dropped, or left
 * uncounted without a trace. Read-backs see only the server; hour revisions never go backwards;
 * held minutes are counted on every end; invalid items are quarantined and counted; an auth check
 * that cannot answer never parks; crash recovery rebuilds every hour a session touched.
 */
import { afterEach, describe, expect, it } from "vitest";
import { v2 as dp } from "@muonhub/data-provider";
import { v2 } from "@muonhub/shared";
import { HOUR_MS } from "./aggregation/summary.js";
import { MINUTE_MS } from "./aggregation/aggregator.js";
import { createParser } from "./parsing/parser.js";
import { memoryLogger } from "./log.js";
import { Reporter } from "./reporter.js";
import { recoverOpenSessions } from "./session/recovery.js";
import { openLocalStore } from "./store/sqlite.js";
import type { FullSessionCounters, SessionRow } from "./store/types.js";
import {
  cloudMinutes,
  dataChunks,
  makeHarness,
  scriptedFactory,
  settleSource,
  STREAM_ID,
  T0,
  until,
  type Harness,
  type ScriptedSource,
} from "./testing/harness.js";

const MIN = 60_000;
const harnesses: Harness[] = [];
afterEach(async () => {
  for (const h of harnesses.splice(0)) await h.agent.stop().catch(() => undefined);
});

const quick = { uploaderMs: 1e9, diskMs: 1e9, clockMs: 1e9, backoffMinMs: 5, backoffMaxMs: 20 };

async function setup(
  o: Partial<Parameters<typeof makeHarness>[0]> = {},
  clock = { t: T0 + 3 * HOUR_MS },
) {
  const factory = scriptedFactory();
  const h = await makeHarness({ factory, now: () => clock.t, intervals: quick, ...o });
  harnesses.push(h);
  await h.agent.start();
  await until(() => factory.sources.length > 0);
  // let the start-up restore + flush settle before the test drives the uploader
  await until(() => h.agent.status().sync.signedIn || o.signedIn === false);
  return { h, factory, src: factory.sources[0]!, clock };
}

async function feed(h: Harness, src: ScriptedSource, plan: Parameters<typeof dataChunks>[0]) {
  src.push(...dataChunks(plan));
  await settleSource(h, src);
}

const hourEntry = (hourStart: number, completeMinutes: number): v2.HourEntry => ({
  hourStart,
  completeMinutes,
  n: completeMinutes * 60,
  liveSource: "nominal",
});

describe("read-back sees only the server (pending in the SDK's local cache)", () => {
  it("a minute write held in the local cache is NOT marked uploaded until the server has it", async () => {
    const { h, src, clock } = await setup();
    h.memory.injectFault({ op: "writeMinutes.chunk", kind: "pending-local" });
    await feed(h, src, { fromHost: T0, count: 3 * 60 + 5, firstId: 1 });
    await h.agent.drain();
    const local = h.store.minuteCount(STREAM_ID);
    expect(local).toBeGreaterThanOrEqual(2);
    // the SDK "has" the minutes locally; the server does not: nothing is confirmed
    expect(h.store.outboxCounts().pending.minute).toBe(local);
    clock.t += 10 * MIN;
    await h.agent.drain();
    expect(h.store.outboxCounts().pending.minute).toBe(local);
    expect(h.store.outboxCounts().parked).toBe(0);
    for (const item of h.store.pendingItems("minute", Number.MAX_SAFE_INTEGER, 100)) {
      expect(item.lastError).toMatch(/^unknown/);
    }
    // the connection comes back and the queued write reaches the server: the read-back confirms it
    h.memory.deliverPendingLocal();
    clock.t += 10 * MIN;
    await h.agent.drain();
    expect(h.store.outboxCounts().pending.minute).toBe(0);
    expect(h.store.outboxCounts().parked).toBe(0);
    expect((await cloudMinutes(h)).length).toBe(local);
  });

  it("a minute write lost from the local cache is written again (absent on the server)", async () => {
    const { h, src, clock } = await setup();
    h.memory.injectFault({ op: "writeMinutes.chunk", kind: "pending-local" });
    await feed(h, src, { fromHost: T0, count: 3 * 60 + 5, firstId: 1 });
    await h.agent.drain();
    h.memory.dropPendingLocal(); // the process lost its SDK queue
    clock.t += 10 * MIN;
    await h.agent.drain();
    expect(h.store.outboxCounts().pending.minute).toBe(0);
    expect((await cloudMinutes(h)).length).toBe(h.store.minuteCount(STREAM_ID));
  });

  it("an hour summary pending in the local cache is not confirmed by its read-back", async () => {
    const { h, clock } = await setup();
    const hourStart = T0 + 2 * HOUR_MS;
    h.store.enqueue({
      streamId: STREAM_ID,
      kind: "hour",
      ts: hourStart,
      payload: JSON.stringify(hourEntry(hourStart, 10)),
    });
    h.memory.injectFault({ op: "putDaySummary", kind: "pending-local" });
    await h.agent.drain();
    clock.t += 10 * MIN;
    await h.agent.drain();
    expect(h.store.outboxCounts().pending.hour).toBe(1);
    h.memory.deliverPendingLocal();
    clock.t += 10 * MIN;
    await h.agent.drain();
    expect(h.store.outboxCounts().pending.hour).toBe(0);
    expect(h.store.outboxCounts().parked).toBe(0);
  });
});

describe("hour revisions never go backwards", () => {
  it("sends only the newest revision; an older one is superseded", async () => {
    const { h } = await setup();
    const hourStart = T0 + 2 * HOUR_MS;
    const { day, hh } = { day: "2026-01-01", hh: "02" };
    for (const [rev, minutes] of [
      [0, 10],
      [1, 20],
    ] as const) {
      h.store.enqueue({
        streamId: STREAM_ID,
        kind: "hour",
        ts: hourStart,
        rev,
        payload: JSON.stringify(hourEntry(hourStart, minutes)),
      });
    }
    await h.agent.drain();
    expect((await h.provider.getDaySummary(STREAM_ID, day))?.hours[hh]?.completeMinutes).toBe(20);
    expect(h.store.outboxCounts().pending.hour).toBe(0);
    expect(h.store.outboxCounts().parked).toBe(0);
  });

  it("unparkAll after a newer revision was uploaded does not overwrite it", async () => {
    const { h } = await setup();
    const hourStart = T0 + 2 * HOUR_MS;
    h.store.enqueue({
      streamId: STREAM_ID,
      kind: "hour",
      ts: hourStart,
      rev: 0,
      payload: JSON.stringify(hourEntry(hourStart, 10)),
    });
    const old = h.store.pendingItems("hour", Number.MAX_SAFE_INTEGER, 1)[0]!;
    h.store.park(old.id, "permission-denied: test", T0);
    h.store.enqueue({
      streamId: STREAM_ID,
      kind: "hour",
      ts: hourStart,
      rev: 1,
      payload: JSON.stringify(hourEntry(hourStart, 30)),
    });
    await h.agent.drain();
    expect(
      (await h.provider.getDaySummary(STREAM_ID, "2026-01-01"))?.hours["02"]?.completeMinutes,
    ).toBe(30);
    expect(h.store.unparkAll()).toBe(1);
    await h.agent.drain();
    expect(
      (await h.provider.getDaySummary(STREAM_ID, "2026-01-01"))?.hours["02"]?.completeMinutes,
    ).toBe(30);
    expect(h.store.outboxCounts().pending.hour).toBe(0);
    expect(h.store.outboxCounts().parked).toBe(0);
  });
});

describe("minutes held for the clock are counted on every end", () => {
  async function holding() {
    const factory = scriptedFactory();
    const h = await makeHarness({ factory, intervals: quick, holdForClock: true });
    harnesses.push(h);
    h.clock.reading = { synchronized: false, offsetMs: 0, known: true };
    await h.agent.start();
    await until(() => factory.sources.length > 0);
    const src = factory.sources[0]!;
    src.push(...dataChunks({ fromHost: T0, count: 5 * 60 + 5, firstId: 1 }));
    await settleSource(h, src);
    const held = h.agent.pipeline.heldMinutes;
    expect(held).toBeGreaterThanOrEqual(3);
    return { h, factory, src, held };
  }

  const endPayload = (h: Harness, sessionId: string) => {
    const item = h.store
      .pendingItems("session-end", Number.MAX_SAFE_INTEGER, 50)
      .find((i) => i.sessionId === sessionId);
    return item === undefined
      ? null
      : (JSON.parse(item.payload) as { endReason: string; counters: v2.SessionCounters });
  };

  it("stop during the boot hold: held minutes are discarded and counted in the session end", async () => {
    const { h, held } = await holding();
    const id = h.agent.pipeline.activeSession!.id;
    await h.agent.stop();
    const session = h.store.getSession(id)!;
    expect(session.endReason).toBe("stop");
    // first partial + the minute in progress + every held minute
    expect(session.counters.discardedPartialMinutes).toBe(held + 2);
    expect(session.counters.completeMinutes).toBe(0);
    expect(h.store.minuteCount(STREAM_ID)).toBe(0);
    expect(h.agent.pipeline.heldMinutes).toBe(0);
    const cloud = await h.provider.getSession(STREAM_ID, id);
    const sent = endPayload(h, id) ?? cloud;
    expect(sent?.counters?.discardedPartialMinutes).toBe(held + 2);
    expect(h.logger.lines.some((l) => l.code === "minutes-dropped")).toBe(true);
  });

  it("USB loss during the boot hold: the same accounting with endReason usbLoss", async () => {
    const { h, src, held } = await holding();
    const id = h.agent.pipeline.activeSession!.id;
    src.fail(new Error("device unplugged"));
    await until(() => h.store.getSession(id)?.endReason === "usbLoss");
    const session = h.store.getSession(id)!;
    expect(session.counters.discardedPartialMinutes).toBe(held + 2);
    expect(h.agent.pipeline.heldMinutes).toBe(0);
    expect(endPayload(h, id)?.counters.discardedPartialMinutes ?? held + 2).toBe(held + 2);
  });

  it("device reset during the boot hold: the ended session counts its held minutes", async () => {
    const { h, src, held } = await holding();
    const id = h.agent.pipeline.activeSession!.id;
    src.push(
      ...dataChunks({
        fromHost: T0 + 5 * MIN + 10_000,
        count: 30,
        firstId: 1,
        monoStart: 5 * MIN + 10_000,
      }),
    );
    await settleSource(h, src);
    const session = h.store.getSession(id)!;
    expect(session.endReason).toBe("reset");
    expect(session.counters.discardedPartialMinutes).toBe(held + 2);
    expect(endPayload(h, id)?.counters.discardedPartialMinutes).toBe(held + 2);
  });
});

describe("validation failures are quarantined, counted and journalled", () => {
  it("hour, session-start, session-counters and session-end items", async () => {
    const { h } = await setup();
    const before = h.store.quarantineCount();
    const bad = (kind: "hour" | "session-start" | "session-counters" | "session-end") =>
      h.store.enqueue({
        streamId: STREAM_ID,
        kind,
        ts: T0 + 7 * HOUR_MS,
        sessionId: kind === "hour" ? null : "bogus-session",
        payload: JSON.stringify({ nonsense: true }),
      });
    bad("hour");
    bad("session-start");
    bad("session-counters");
    bad("session-end");
    await h.agent.drain();
    const st = h.agent.status();
    expect(st.queue.parked).toBe(4);
    expect(st.sync.rejectedCount).toBe(4);
    expect(h.store.quarantineCount()).toBe(before + 4);
    const errors = h.logger.lines.filter((l) => l.level === "error" && l.code === "write-rejected");
    expect(errors).toHaveLength(4);
  });
});

describe("an auth check that cannot answer never parks", () => {
  it("a denied write with an unanswerable session check backs off, pending, not parked", async () => {
    const { h, src, clock } = await setup();
    let calls = 0;
    const original = h.refresh.checkSession!;
    h.refresh.checkSession = () => {
      calls += 1;
      return calls === 1 ? Promise.resolve(true) : Promise.reject(new Error("network down"));
    };
    await feed(h, src, { fromHost: T0, count: 3 * 60 + 5, firstId: 1 });
    h.memory.injectFault({ op: "writeMinutes", kind: "permission-denied", times: Infinity });
    await h.agent.drain();
    expect(h.store.outboxCounts().parked).toBe(0);
    expect(h.agent.status().sync.paused).toBe(false);
    expect(h.store.outboxCounts().pending.minute).toBeGreaterThan(0);
    expect(h.logger.lines.some((l) => l.code === "upload-denied-unchecked")).toBe(true);
    // and a cycle whose own session check fails sends nothing, pauses nothing
    await h.agent.drain();
    expect(h.store.outboxCounts().parked).toBe(0);
    expect(h.agent.status().conditions.some((c) => c.code === "outbox-paused")).toBe(false);
    h.refresh.checkSession = original;
    h.memory.clearFaults();
    clock.t += 30 * MIN;
    await h.agent.drain();
    expect(h.store.outboxCounts().pending.minute).toBe(0);
    expect(h.store.outboxCounts().parked).toBe(0);
  });

  it("a persistent 'unauthenticated' denial raises the paused alert once (no flapping)", async () => {
    const { h, src, clock } = await setup();
    await feed(h, src, { fromHost: T0, count: 3 * 60 + 5, firstId: 1 });
    h.memory.injectFault({ op: "writeMinutes", kind: "unauthenticated", times: Infinity });
    for (let i = 0; i < 6; i++) {
      clock.t += 10 * MIN;
      await h.agent.drain();
    }
    const raised = h.logger.lines.filter((l) => l.code === "outbox-paused" && l.level === "error");
    expect(raised).toHaveLength(1);
    expect(h.store.outboxCounts().parked).toBe(0);
    h.memory.clearFaults();
    clock.t += 10 * MIN;
    await h.agent.drain();
    expect(h.store.outboxCounts().pending.minute).toBe(0);
    expect(h.agent.status().conditions.some((c) => c.code === "outbox-paused")).toBe(false);
  });
});

describe("crash recovery rebuilds every hour the session touched", () => {
  it("enqueues a summary for each hour, not only the last", async () => {
    const store = await openLocalStore({ path: ":memory:" });
    const start = T0 + 50 * MIN;
    const counters: FullSessionCounters = {
      completeMinutes: 0,
      discardedPartialMinutes: 0,
      quarantinedLines: 0,
      eventIdGaps: 0,
      quarantinedRecords: 0,
      clockAnomalies: 0,
      droppedLiveBatches: 0,
      droppedHeartbeats: 0,
      parkedItems: 0,
      restarts: 0,
    };
    const session: SessionRow = {
      id: "crashed-session",
      streamId: STREAM_ID,
      startedAt: start,
      endedAt: null,
      endReason: null,
      agentVersion: "6.0.0-test",
      deviceTypeId: v2.MUNRA.id,
      deviceTypeVersion: v2.MUNRA.version,
      calibrationVersion: null,
      timeProvenance: { source: "ntp", offsetMs: 0, measuredAt: start },
      synthetic: false,
      counters,
      lastRawTs: start + 20 * MIN,
    };
    store.upsertSession(session);
    // minutes in two hours, stored without any summary (the crash came before the rollover)
    for (let ts = start + MIN; ts < start + 20 * MIN; ts += MINUTE_MS) {
      const record: v2.MinuteRecord = {
        schemaVersion: 2,
        ts,
        sessionId: session.id,
        n: 60,
        liveSource: "nominal",
        quality: { eventIdGaps: 0, clockAnomalies: 0 },
      };
      store.commitMinute(
        { streamId: STREAM_ID, ts, sessionId: session.id, record, aux: {} },
        { streamId: STREAM_ID, kind: "minute", ts, sessionId: session.id, payload: "{}" },
      );
    }
    recoverOpenSessions({
      store,
      reporter: new Reporter(memoryLogger(), () => T0),
      parser: createParser(v2.MUNRA),
      deviceType: v2.MUNRA,
      bootTimeMs: 0,
      now: () => T0 + 2 * HOUR_MS,
    });
    expect(store.latestSummary(STREAM_ID, T0)?.entry.completeMinutes).toBe(9);
    expect(store.latestSummary(STREAM_ID, T0 + HOUR_MS)?.entry.completeMinutes).toBe(10);
    expect(store.getSession(session.id)?.endReason).toBe("unknown");
  });
});

void dp;
