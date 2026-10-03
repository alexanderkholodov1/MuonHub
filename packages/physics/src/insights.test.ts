import type { MinuteRecord } from "@muonhub/shared";
import { describe, expect, it } from "vitest";
import { buildCorrectedRateInsights } from "./insights.js";

function minuteRecord(ts: number, ec: number, pr: number): MinuteRecord {
  return {
    ts,
    ec,
    cc: 0,
    sm: 45,
    sx: 80,
    sn: 20,
    tp: 18,
    pr,
    dt: 1,
  };
}

function barometricSeries(count: number, anomalyIndex?: number): MinuteRecord[] {
  const beta = -0.002;
  const refPressure = 730;
  const baseRate = 100;
  return Array.from({ length: count }, (_, index) => {
    const pressure = refPressure + Math.sin(index / 8) * 4;
    const expectedRate = baseRate * Math.exp(beta * (pressure - refPressure));
    const rawRate = index === anomalyIndex ? expectedRate * 1.8 : expectedRate;
    return minuteRecord(1_700_000_000_000 + index * 60_000, rawRate, pressure);
  });
}

describe("buildCorrectedRateInsights", () => {
  it("builds the dead-time corrected series while beta is still collecting", () => {
    const insights = buildCorrectedRateInsights(barometricSeries(20), "v3X", {
      betaMinPoints: 30,
    });

    expect(insights.points).toHaveLength(20);
    expect(insights.beta).toBeNull();
    expect(insights.baseline).toBeNull();
    expect(insights.usableBetaSampleCount).toBe(20);
    expect(insights.points[0]?.deadTimeCorrectedRate).toBeGreaterThan(
      insights.points[0]?.rawRate ?? 0,
    );
    expect(insights.points[0]?.barometricCorrectedRate).toBeNull();
  });

  it("fits local beta, builds a corrected baseline, and flags 3-sigma anomalies", () => {
    const insights = buildCorrectedRateInsights(barometricSeries(240, 120), "v3X", {
      betaMinPoints: 30,
    });

    expect(insights.beta).not.toBeNull();
    expect(insights.beta?.fit.n).toBe(240);
    expect(insights.beta?.fit.betaPercentPerHpa).toBeLessThan(0);
    expect(insights.baseline?.median).toBeCloseTo(100, 0);
    expect(insights.anomalies).toHaveLength(1);
    expect(insights.anomalies[0]?.ts).toBe(1_700_000_000_000 + 120 * 60_000);
    expect(insights.anomalies[0]?.zScore).toBeGreaterThan(3);
  });

  it("sorts records before deriving beta range", () => {
    const records = barometricSeries(40).reverse();
    const insights = buildCorrectedRateInsights(records, "v3X", { betaMinPoints: 30 });

    expect(insights.beta?.fromTs).toBe(1_700_000_000_000);
    expect(insights.beta?.toTs).toBe(1_700_000_000_000 + 39 * 60_000);
  });
});
