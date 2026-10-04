import { EventSummarySchema, type SignalRecord } from "@muonhub/shared";
import { describe, expect, it } from "vitest";
import { buildEventSummary, calibrateNoiseThreshold } from "./event-science.js";

const START_TS = 1_717_200_000_000;

function repeat(values: readonly number[], times: number): number[] {
  const out: number[] = [];
  for (let index = 0; index < times; index++) {
    out.push(...values);
  }
  return out;
}

function signal(tsOffsetMs: number, sipmMv: number, coincident = false): SignalRecord {
  return {
    ts: START_TS + tsOffsetMs,
    sipmMv,
    coincident,
    deadtimeUs: 400,
    tempC: 20,
    pressureHpa: 730,
  };
}

describe("calibrateNoiseThreshold", () => {
  it("places the threshold above the sub-threshold noise lobe and below the MIP-type peak", () => {
    const noiseLobe = repeat([3.2, 3.8, 4.1, 4.5, 5.0, 5.4, 6.2, 7.0, 8.4, 9.0], 4);
    const landauBulk = repeat([34, 38, 42, 45, 48, 51, 55, 62, 74, 92], 4);

    const calibration = calibrateNoiseThreshold([...noiseLobe, ...landauBulk]);

    expect(calibration.method).toBe("auto-sigma");
    expect(calibration.thresholdMv).toBeGreaterThan(9);
    expect(calibration.thresholdMv).toBeLessThan(34);
  });

  it("keeps a quantized dark-count lobe strictly below the detection threshold", () => {
    const calibration = calibrateNoiseThreshold([5, 5, 5, 5, 5, 48, 51, 55], {
      minNoiseSamples: 5,
    });

    expect(calibration.thresholdMv).toBeGreaterThan(5);
    expect(calibration.thresholdMv).toBeLessThan(48);
  });

  it("rejects invalid calibration windows and options", () => {
    expect(() => calibrateNoiseThreshold([])).toThrow("at least one");
    expect(() => calibrateNoiseThreshold([1, 2, 3], { noiseFraction: 0 })).toThrow("noiseFraction");
    expect(() => calibrateNoiseThreshold([1, 2, 3], { minNoiseSamples: 0 })).toThrow(
      "minNoiseSamples",
    );
    expect(() => calibrateNoiseThreshold([1, 2, 3], { sigmaMultiplier: 0 })).toThrow(
      "sigmaMultiplier",
    );
    expect(() => calibrateNoiseThreshold([1, 2, 3], { noiseMarginMv: -1 })).toThrow(
      "noiseMarginMv",
    );
  });
});

describe("buildEventSummary", () => {
  it("returns a schema-valid summary with counts, histogram, MPV, tail, and coincidence totals", () => {
    const signals = [
      signal(100, 20),
      signal(200, 21, true),
      signal(300, 22),
      signal(400, 24),
      signal(500, 40, true),
      signal(600, 45),
      signal(700, 90),
    ];

    const summary = buildEventSummary(signals, {
      detectorId: "det_1",
      sessionId: "sess_1",
      intervalStartTs: START_TS,
      intervalEndTs: START_TS + 1_000,
      noiseThresholdMv: 10,
      signalCount: 9,
      aboveThresholdCount: 7,
      binCount: 8,
      histogramMinMv: 10,
      histogramMaxMv: 98,
      tailCutMv: 80,
    });

    expect(EventSummarySchema.parse(summary)).toEqual(summary);
    expect(summary.signalCount).toBe(9);
    expect(summary.aboveThresholdCount).toBe(7);
    expect(summary.tailCount).toBe(1);
    expect(summary.coincidenceCount).toBe(2);
    expect(
      summary.histogram.counts.reduce((total: number, count: number) => total + count, 0),
    ).toBe(7);
    expect(summary.mpvMv).toBeGreaterThanOrEqual(15);
    expect(summary.mpvMv).toBeLessThan(30);
  });

  it("uses the documented MPV multiplier tail cut when no explicit cut is provided", () => {
    const summary = buildEventSummary(
      [signal(100, 20), signal(200, 21), signal(300, 22), signal(400, 95)],
      {
        detectorId: "det_1",
        sessionId: "sess_1",
        intervalStartTs: START_TS,
        intervalEndTs: START_TS + 1_000,
        noiseThresholdMv: 10,
        binCount: 8,
        histogramMinMv: 10,
        histogramMaxMv: 100,
      },
    );

    expect(summary.tailCount).toBe(1);
    expect(summary.mpvMv).toBeDefined();
  });

  it("returns a schema-valid empty-spectrum summary when no signals are above threshold", () => {
    const summary = buildEventSummary([], {
      detectorId: "det_1",
      sessionId: "sess_1",
      intervalStartTs: START_TS,
      intervalEndTs: START_TS + 1_000,
      noiseThresholdMv: 10,
      signalCount: 3,
      aboveThresholdCount: 0,
      binCount: 4,
    });

    expect(EventSummarySchema.parse(summary)).toEqual(summary);
    expect(summary.mpvMv).toBeUndefined();
    expect(summary.histogram).toEqual({
      binWidthMv: 1,
      minMv: 10,
      counts: [0, 0, 0, 0],
    });
  });

  it("rejects signals outside the declared summary interval", () => {
    expect(() =>
      buildEventSummary([signal(1_000, 20)], {
        detectorId: "det_1",
        sessionId: "sess_1",
        intervalStartTs: START_TS,
        intervalEndTs: START_TS + 1_000,
        noiseThresholdMv: 10,
      }),
    ).toThrow("inside [intervalStartTs, intervalEndTs)");
  });

  it("rejects invalid summary parameters", () => {
    const params = {
      detectorId: "det_1",
      sessionId: "sess_1",
      intervalStartTs: START_TS,
      intervalEndTs: START_TS + 1_000,
      noiseThresholdMv: 10,
    };

    expect(() => buildEventSummary([], { ...params, binCount: 0 })).toThrow("binCount");
    expect(() => buildEventSummary([], { ...params, intervalEndTs: START_TS })).toThrow(
      "intervalEndTs",
    );
    expect(() => buildEventSummary([], { ...params, noiseThresholdMv: -1 })).toThrow(
      "noiseThresholdMv",
    );
    expect(() => buildEventSummary([], { ...params, signalCount: -1 })).toThrow("signalCount");
    expect(() => buildEventSummary([], { ...params, aboveThresholdCount: 1.5 })).toThrow(
      "aboveThresholdCount",
    );
  });
});
