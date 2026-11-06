import { describe, expect, it } from "vitest";
import type { v2 } from "@muonhub/shared";
import {
  MINUTE_MS,
  chartSummary,
  coveragePercent,
  freshness,
  rangeStats,
  toChartData,
} from "./series";

const T0 = Date.UTC(2026, 10, 6, 0, 0);
const minute = (i: number, n: number, extra: Partial<v2.MinuteRecord> = {}): v2.MinuteRecord => ({
  schemaVersion: 2,
  ts: T0 + i * MINUTE_MS,
  sessionId: "s1",
  n,
  ...(n > 0 ? { amplitude: { mean: 2, min: 1, max: 30, unit: "mV" as const } } : {}),
  liveSource: "nominal",
  quality: { eventIdGaps: 0, clockAnomalies: 0 },
  ...extra,
});

describe("toChartData", () => {
  it("keeps consecutive minutes and breaks the line after a missing minute", () => {
    const d = toChartData([minute(0, 100), minute(1, 110), minute(4, 90)]);
    expect(d.x).toEqual([
      T0 / 1000,
      (T0 + 60_000) / 1000,
      (T0 + 120_000) / 1000,
      (T0 + 240_000) / 1000,
    ]);
    expect(d.rate).toEqual([100, 110, null, 90]);
  });

  it("leaves absent quantities absent", () => {
    const d = toChartData([minute(0, 5, { pressureHpa: 767.2 }), minute(1, 6)]);
    expect(d.pressure).toEqual([767.2, null]);
    expect(d.temperature).toEqual([null, null]);
  });
});

describe("rangeStats", () => {
  it("computes the mean rate with its Poisson uncertainty from raw counts", () => {
    const s = rangeStats([minute(0, 100), minute(1, 121)], T0, T0 + 4 * MINUTE_MS);
    expect(s.events).toBe(221);
    expect(s.meanPerMin).toBeCloseTo(110.5, 10);
    expect(s.sigmaPerMin).toBeCloseTo(Math.sqrt(221) / 2, 10);
    expect(s.coverage).toBe(0.5);
    expect(s.lastTs).toBe(T0 + MINUTE_MS);
  });

  it("averages environmental quantities over the minutes that carry them, never as sums", () => {
    const s = rangeStats(
      [
        minute(0, 1, { pressureHpa: 767, temperatureC: 30 }),
        minute(1, 1, { pressureHpa: 769 }),
        minute(2, 1),
      ],
      T0,
      T0 + 3 * MINUTE_MS,
    );
    expect(s.meanPressureHpa).toBe(768);
    expect(s.meanTemperatureC).toBe(30);
  });

  it("reports no data as null, not zero", () => {
    const s = rangeStats([], T0, T0 + MINUTE_MS);
    expect(s).toMatchObject({ minutes: 0, meanPerMin: null, sigmaPerMin: null, lastTs: null });
  });
});

describe("freshness", () => {
  it("is fresh while the last minute ended at most three minutes ago", () => {
    expect(freshness(null, T0)).toBe("none");
    expect(freshness(T0, T0 + 4 * MINUTE_MS)).toBe("fresh");
    expect(freshness(T0, T0 + 4 * MINUTE_MS + 1)).toBe("stale");
  });
});

describe("coveragePercent", () => {
  it("rounds down, so 100.0 % means no minute is missing", () => {
    expect(coveragePercent(1440, 1440)).toBe("100.0");
    expect(coveragePercent(1439, 1440)).toBe("99.9");
    expect(coveragePercent(4319, 4320)).toBe("99.9");
    expect(coveragePercent(180, 1440)).toBe("12.5");
    expect(coveragePercent(0, 1440)).toBe("0.0");
    expect(coveragePercent(3, 0)).toBe("0.0");
  });
});

describe("chartSummary", () => {
  it("counts recorded values and ignores gaps", () => {
    expect(chartSummary([3, null, 7, 5])).toEqual({ count: 3, min: 3, max: 7 });
    expect(chartSummary([null, null])).toEqual({ count: 0, min: null, max: null });
  });
});
