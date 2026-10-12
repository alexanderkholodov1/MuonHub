import { describe, expect, it } from "vitest";
import { v2 } from "@muonhub/shared";
import { preset, simulate, groundTruthOf } from "@muonhub/simulator";
import { createVirtualFactory } from "./sources/virtual.js";
import { cloudMinutes, makeHarness, STREAM_ID } from "./testing/harness.js";

describe("virtual detector, disruptions preset (CA2, CA3)", () => {
  it("produces only complete minutes, splits sessions on resets, counts gaps, and uploads exactly once in order", async () => {
    const scenario = preset("disruptions");
    const h = await makeHarness({ factory: createVirtualFactory({ scenario }), synthetic: true });
    await h.agent.start();
    await h.agent.finished;
    await h.agent.drain();
    await h.agent.drain();

    const minutes = h.store.minutesInRange(STREAM_ID, 0, Number.MAX_SAFE_INTEGER);
    expect(minutes.length).toBeGreaterThan(200);
    // every stored minute is a complete UTC minute with a valid record
    for (const m of minutes) {
      expect(m.ts % 60_000).toBe(0);
      expect(v2.MinuteRecordSchema.safeParse(m.record).success).toBe(true);
    }
    // no minute inside the two gaps (usb at +1h for 10 min, power at +4h for 5 min)
    const start = scenario.startMs;
    const inGap = (a: number, b: number) =>
      minutes.filter((m) => m.ts >= start + a && m.ts < start + b);
    expect(inGap(3_600_000, 3_600_000 + 540_000)).toHaveLength(0);
    expect(inGap(4 * 3_600_000, 4 * 3_600_000 + 240_000)).toHaveLength(0);

    // sessions: initial + reset(+3h) + power loss reset(+4h)
    const sessions = h.store.listSessions(STREAM_ID, 50);
    expect(sessions.length).toBeGreaterThanOrEqual(3);
    expect(sessions.map((s) => s.endReason)).toContain("reset");
    expect(sessions.every((s) => s.synthetic)).toBe(true);
    const discarded = sessions.reduce((a, s) => a + s.counters.discardedPartialMinutes, 0);
    expect(discarded).toBeGreaterThanOrEqual(3);

    // counts against ground truth: stored n per minute never exceeds what was delivered
    const truth = groundTruthOf(simulate(scenario).devices[0]!);
    expect(truth.counts.recorded).toBeGreaterThan(0);
    const stored = minutes.reduce((a, m) => a + m.record.n, 0);
    expect(stored).toBeLessThanOrEqual(truth.counts.recorded);

    // minute counts match the planted truth (host latency moves a few events across minute edges;
    // four lines are damaged on purpose)
    const perMinute = new Map<number, number>();
    for (const e of truth.events) {
      if (e.lost || e.off || e.undelivered) continue;
      const k = Math.floor(e.trueMs / 60_000) * 60_000;
      perMinute.set(k, (perMinute.get(k) ?? 0) + 1);
    }
    const close = minutes.filter((m) => Math.abs(m.record.n - (perMinute.get(m.ts) ?? 0)) <= 4);
    expect(close.length / minutes.length).toBeGreaterThan(0.98);
    // dead time comes from the counter: 200 us per event at ~2.4 events/s is a live fraction near 0.9995
    const counterMinutes = minutes.filter((m) => m.record.liveSource === "counter");
    expect(counterMinutes.length).toBeGreaterThan(minutes.length * 0.95);
    for (const m of counterMinutes) expect((m.record.liveMs ?? 0) / 60_000).toBeGreaterThan(0.998);

    // cloud: same minutes, exactly once, in order
    const cloud = await cloudMinutes(h);
    expect(cloud.map((m) => m.ts)).toEqual(minutes.map((m) => m.ts));
    expect(new Set(cloud.map((m) => m.ts)).size).toBe(cloud.length);
    expect(h.store.outboxCounts().pending.minute).toBe(0);
    expect(h.store.outboxCounts().parked).toBe(0);
  }, 120_000);
});
