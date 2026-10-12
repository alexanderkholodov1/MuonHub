import { describe, expect, it } from "vitest";
import { buildCorrectedRateInsights, type InsightHour } from "./insights.js";
import { syntheticHours } from "./test-helpers.js";

function toInsight(h: ReturnType<typeof syntheticHours>[number]): InsightHour {
  return {
    hourStart: h.hourStart,
    counts: h.counts,
    completeMinutes: 60,
    liveSource: "counter",
    liveMs: h.liveMs,
    ...(h.pressureHpa === undefined ? {} : { pressureHpa: h.pressureHpa }),
    ...(h.temperatureC === undefined ? {} : { temperatureC: h.temperatureC }),
  };
}

describe("buildCorrectedRateInsights", () => {
  it("is not computable without hours", () => {
    expect(buildCorrectedRateInsights([]).status).toBe("not-computable");
  });

  it("applies β only when significant and flags a persistent hour-scale deviation", () => {
    const raw = syntheticHours({ hours: 60 * 24, betaPctPerHpa: -0.12 });
    const hours = raw
      .map(toInsight)
      .map((h, i) => (i >= 900 && i < 904 ? { ...h, counts: Math.round(h.counts * 1.1) } : h));
    const out = buildCorrectedRateInsights(hours);
    expect(out.status).toBe("ok");
    expect(out.beta.applied).toBe(true);
    expect(out.hourly).toHaveLength(hours.length);
    expect(out.hourly[10]?.corrected.barometric).toBe("applied");
    expect(out.deviations.deviations.length).toBeGreaterThanOrEqual(1);
    expect(out.provenance.fn).toBe("buildCorrectedRateInsights");
  });

  it("keeps hours uncorrected for nominal live time and reports β as not computable", () => {
    const hours: InsightHour[] = Array.from({ length: 5 }, (_, i) => ({
      hourStart: 1_700_000_000_000 + i * 3_600_000,
      counts: 8640,
      completeMinutes: 60,
      liveSource: "nominal",
    }));
    const out = buildCorrectedRateInsights(hours);
    expect(out.beta.status).toBe("not-computable");
    expect(out.hourly[0]?.corrected.status).toBe("uncorrected");
    expect(out.hourly[0]?.corrected.barometric).toBe("not-computable");
  });

  it("marks the β fit uncorrected and records live sources when any hour is nominal", () => {
    const raw = syntheticHours({ hours: 60 * 24, betaPctPerHpa: -0.12 });
    const hours = raw
      .map(toInsight)
      .map((h, i) => (i % 10 === 0 ? { ...h, liveSource: "nominal" as const } : h));
    const out = buildCorrectedRateInsights(hours);
    expect(out.beta.status).toBe("uncorrected");
    expect(out.beta.provenance.params["nominalHours"]).toBe(144);
    expect(out.beta.provenance.params["liveSources"]).toEqual({ nominal: 144, counter: 1296 });
    const clean = buildCorrectedRateInsights(raw.map(toInsight));
    expect(clean.beta.status).toBe("ok");
    expect(clean.beta.provenance.params["nominalHours"]).toBe(0);
  });

  it("handles a single usable hour without a baseline", () => {
    const out = buildCorrectedRateInsights([
      { hourStart: 0, counts: 100, completeMinutes: 60, liveSource: "nominal" },
    ]);
    expect(out.deviations.status).toBe("not-computable");
  });
});
