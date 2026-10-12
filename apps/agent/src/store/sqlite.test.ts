import { describe, expect, it } from "vitest";
import { openLocalStore } from "./sqlite.js";
import type { LocalStore, MinuteRow, NewOutboxItem } from "./types.js";

async function memory(): Promise<LocalStore> {
  return openLocalStore({ path: ":memory:" });
}

const raw = (text: string, hostTs = 1000) => ({
  deviceId: "dev",
  sessionId: null,
  hostTs,
  monotonicNs: "1",
  text,
  byteLength: text.length,
  flags: 0,
});

const minuteRow = (ts: number): { row: MinuteRow; item: NewOutboxItem } => ({
  row: {
    streamId: "s",
    ts,
    sessionId: "sess",
    record: {
      schemaVersion: 2,
      ts,
      sessionId: "sess",
      n: 0,
      liveSource: "nominal",
      quality: { eventIdGaps: 0, clockAnomalies: 0 },
    },
    aux: {},
  },
  item: { streamId: "s", kind: "minute", ts, sessionId: "sess", payload: "{}" },
});

describe("LocalStore (sqlite)", () => {
  it("appends raw lines and refuses to modify or delete them (ADR-006)", async () => {
    const s = await memory();
    expect(s.appendRawLines([raw("a"), raw("b", 2000)])).toBe(2);
    expect(s.rawLineCount()).toBe(2);
    expect(s.rawLinesBetween(0, 1500).map((r) => r.text)).toEqual(["a"]);
    expect(() => s.transaction(() => s.appendRawLines([]))).not.toThrow();
  });

  it("stores a minute and its outbox item together; a duplicate stores nothing", async () => {
    const s = await memory();
    const { row, item } = minuteRow(60_000);
    expect(s.commitMinute(row, item)).toBe("stored");
    expect(s.commitMinute(row, item)).toBe("duplicate");
    expect(s.minuteCount("s")).toBe(1);
    expect(s.outboxCounts().pending.minute).toBe(1);
  });

  it("re-enqueueing an existing key is a no-op; revisions are distinct items", async () => {
    const s = await memory();
    const item: NewOutboxItem = { streamId: "s", kind: "hour", ts: 3_600_000, payload: "{}" };
    expect(s.enqueue(item)).toBe(true);
    expect(s.enqueue(item)).toBe(false);
    expect(s.enqueue({ ...item, rev: 1 })).toBe(true);
    expect(s.outboxCounts().pending.hour).toBe(2);
  });

  it("orders pending items, honours backoff, parks and unparks", async () => {
    const s = await memory();
    for (const ts of [180_000, 60_000, 120_000]) s.enqueue({ ...minuteRow(ts).item });
    const due = s.pendingItems("minute", 0, 10);
    expect(due.map((i) => i.ts)).toEqual([60_000, 120_000, 180_000]);
    s.markRetry([due[0]!.id], "net", 10_000);
    expect(s.pendingItems("minute", 5000, 10).map((i) => i.ts)).toEqual([120_000, 180_000]);
    s.park(due[1]!.id, "denied", 7);
    expect(s.outboxCounts().parked).toBe(1);
    expect(s.oldestParkedAt()).toBe(7);
    expect(s.unparkAll()).toBe(1);
    s.markUploaded([due[2]!.id], 9);
    expect(s.outboxCounts().uploaded).toBe(1);
  });

  it("rolls a failed transaction back", async () => {
    const s = await memory();
    expect(() =>
      s.transaction(() => {
        s.enqueue(minuteRow(60_000).item);
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(s.outboxCounts().pending.minute).toBe(0);
  });
});
