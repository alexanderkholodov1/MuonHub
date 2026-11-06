import { describe, expect, it } from "vitest";
import {
  MINUTE_MS,
  minuteOverlaps,
  reconcile,
  reportMarkdown,
  type MinuteSample,
} from "./reconcile.js";

const T0 = Date.UTC(2026, 0, 1);
const minutes = (from: number, count: number, n = 140, sessionId = "s1"): MinuteSample[] =>
  Array.from({ length: count }, (_, i) => ({ ts: from + i * MINUTE_MS, n, sessionId }));
const check = (r: ReturnType<typeof reconcile>, id: string) => r.checks.find((c) => c.id === id);

describe("reconcile", () => {
  it("passes when the cloud holds exactly the local minutes", () => {
    const local = minutes(T0, 10);
    const r = reconcile({ local, cloud: [...local] });
    expect(r.pass).toBe(true);
    expect(r.stats.localEvents).toBe(1400);
    expect(reportMarkdown(r)).toContain("PASS");
  });

  it("fails on a minute missing in the cloud, an extra one, or a different count", () => {
    const local = minutes(T0, 5);
    const cloud = [...local.slice(0, 4), { ...local[0]!, ts: T0 + 9 * MINUTE_MS }];
    const r = reconcile({ local, cloud });
    expect(check(r, "cloud-matches-local")?.pass).toBe(false);
    expect(check(r, "cloud-matches-local")?.detail).toContain(
      "missing in cloud 1, extra in cloud 1",
    );
    const r2 = reconcile({
      local,
      cloud: local.map((m, i) => (i === 2 ? { ...m, n: m.n + 1 } : m)),
    });
    expect(check(r2, "cloud-matches-local")?.detail).toContain("different 1");
  });

  it("fails on duplicates and on misaligned or negative minutes", () => {
    const local = minutes(T0, 3);
    expect(check(reconcile({ local, cloud: [...local, local[1]!] }), "no-duplicates")?.pass).toBe(
      false,
    );
    const bad = [{ ts: T0 + 1, n: 1, sessionId: "s1" }];
    expect(check(reconcile({ local: bad, cloud: bad }), "complete-minutes")?.pass).toBe(false);
    const negative = [{ ts: T0, n: -1, sessionId: "s1" }];
    expect(check(reconcile({ local: negative, cloud: negative }), "complete-minutes")?.pass).toBe(
      false,
    );
  });

  it("fails when a minute overlaps a disruption, and treats windows as half-open", () => {
    const w = { startMs: T0 + 2 * MINUTE_MS, endMs: T0 + 4 * MINUTE_MS, label: "usb" };
    expect(minuteOverlaps(T0 + MINUTE_MS, w)).toBe(false);
    expect(minuteOverlaps(T0 + 2 * MINUTE_MS, w)).toBe(true);
    expect(minuteOverlaps(T0 + 3 * MINUTE_MS, w)).toBe(true);
    expect(minuteOverlaps(T0 + 4 * MINUTE_MS, w)).toBe(false);
    const clean = [...minutes(T0, 2), ...minutes(T0 + 4 * MINUTE_MS, 2)];
    expect(reconcile({ local: clean, cloud: clean, noDataWindows: [w] }).pass).toBe(true);
    const dirty = minutes(T0, 6);
    expect(
      check(reconcile({ local: dirty, cloud: dirty, noDataWindows: [w] }), "no-data-in-disruptions")
        ?.pass,
    ).toBe(false);
  });

  it("fails when an expected minute never reached the cloud", () => {
    const local = minutes(T0, 3);
    const r = reconcile({
      local,
      cloud: local,
      expectedMinutes: [T0, T0 + MINUTE_MS, T0 + 5 * MINUTE_MS],
    });
    expect(check(r, "coverage")?.pass).toBe(false);
    expect(check(r, "coverage")?.detail).toContain("2 of 3 present");
  });

  it("compares counts with the planted truth within a tolerance", () => {
    const local = minutes(T0, 100);
    const close = new Map(local.map((m, i) => [m.ts, m.n + (i % 2 === 0 ? 1 : -1)]));
    const truth = { perMinute: close, toleranceEvents: 2, minShare: 0.98, maxTotalRelError: 0.001 };
    const ok = reconcile({ local, cloud: local, truth });
    expect(check(ok, "truth")?.pass).toBe(true);
    expect(ok.stats.truthMaxAbsDiff).toBe(1);
    const far = new Map(local.map((m) => [m.ts, m.n + 10]));
    const bad = reconcile({ local, cloud: local, truth: { ...truth, perMinute: far } });
    expect(check(bad, "truth")?.pass).toBe(false);
    expect(bad.stats.truthTotalRelError).toBeCloseTo(10 / 150, 6);
  });
});
