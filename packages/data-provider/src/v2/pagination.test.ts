import { describe, expect, it } from "vitest";
import { v2 } from "@muonhub/shared";
import { buildMinutePage, iteratePages, planMinuteRange } from "./pagination.js";
import { T0, minute } from "./fixtures.js";

const entries = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => {
    const { key, value } = v2.serializeMinute(minute(from + i));
    return [key, value] as const;
  });

describe("planMinuteRange", () => {
  it("plans an inclusive start and exclusive end with one extra row", () => {
    const plan = planMinuteRange({ fromTs: T0, toTs: T0 + 600_000, limit: 5 });
    expect(plan).toMatchObject({ startExclusive: false, limit: 5, fetchLimit: 6 });
    expect(plan.startKey).toBe(v2.minuteKey(T0));
    expect(plan.endKey).toBe(v2.minuteKey(T0 + 600_000));
  });

  it("continues strictly after a cursor inside the range", () => {
    const cursor = v2.minuteKey(T0 + 120_000);
    const plan = planMinuteRange({ fromTs: T0, toTs: T0 + 600_000, cursor });
    expect(plan).toMatchObject({ startKey: cursor, startExclusive: true });
  });

  it("ignores a cursor before the range start", () => {
    const plan = planMinuteRange({
      fromTs: T0,
      toTs: T0 + 600_000,
      cursor: v2.minuteKey(T0 - 60_000),
    });
    expect(plan.startExclusive).toBe(false);
  });

  it.each([
    { fromTs: T0, toTs: T0 },
    { fromTs: -1, toTs: T0 },
    { fromTs: T0, toTs: T0 + 1, limit: 0 },
    { fromTs: T0, toTs: T0 + 1, limit: 5001 },
    { fromTs: T0, toTs: T0 + 1, cursor: "abc" },
    { fromTs: 1.5, toTs: T0 },
  ])("rejects invalid input %j", (q) => {
    expect(() => planMinuteRange(q)).toThrowError(/./);
    try {
      planMinuteRange(q);
    } catch (e) {
      expect(e).toMatchObject({ code: "invalid-argument" });
    }
  });
});

describe("buildMinutePage", () => {
  it("returns a cursor only when more rows exist", () => {
    const page = buildMinutePage(entries(4), { limit: 3 });
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBe(v2.minuteKey(T0 + 2 * 60_000));
    expect(buildMinutePage(entries(3), { limit: 3 }).nextCursor).toBeNull();
  });

  it("quarantines invalid records instead of dropping them, and still advances the cursor", () => {
    const rows = [...entries(4)];
    rows[1] = [rows[1]![0], { v: 2, s: "x", n: -1 }] as never;
    rows[2] = [rows[2]![0], null] as never;
    const page = buildMinutePage(rows, { limit: 3 });
    expect(page.items).toHaveLength(1);
    expect(page.quarantine.count).toBe(2);
    expect(page.quarantine.samples.map((s) => s.key)).toEqual([rows[1]![0], rows[2]![0]]);
    expect(page.nextCursor).toBe(rows[2]![0]);
  });

  it("never reports the values of a bad record", () => {
    const rows = [[v2.minuteKey(T0), { v: 2, s: "private-session-token", n: "nope" }]] as const;
    const page = buildMinutePage(rows, { limit: 5 });
    expect(JSON.stringify(page.quarantine)).not.toContain("private-session-token");
  });
});

describe("iteratePages", () => {
  it("walks every page and stops at a null cursor", async () => {
    const all = entries(10);
    const seen: number[] = [];
    for await (const page of iteratePages(async (cursor) => {
      const start = cursor === null ? 0 : all.findIndex(([k]) => k === cursor) + 1;
      return buildMinutePage(all.slice(start, start + 4), { limit: 3 });
    })) {
      seen.push(...page.items.map((m) => (m.ts - T0) / 60_000));
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("fails if a cursor does not advance", async () => {
    const stuck = async () => ({
      items: [],
      quarantine: { count: 0, samples: [] },
      nextCursor: "0000000000001",
    });
    await expect(
      (async () => {
        for await (const page of iteratePages(stuck)) void page;
      })(),
    ).rejects.toMatchObject({ code: "internal" });
  });
});
