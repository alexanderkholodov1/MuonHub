import { describe, expect, it } from "vitest";
import { buildAmplitudeHistogram, estimateMpv } from "./spectrum.js";

describe("buildAmplitudeHistogram", () => {
  it("bins amplitudes uniformly and reports totals", () => {
    const h = buildAmplitudeHistogram([1, 2, 3, 11, 12, 25], {
      binCount: 3,
      minMv: 0,
      maxMv: 30,
    });
    expect(h.binWidthMv).toBe(10);
    expect(h.counts).toEqual([3, 2, 1]);
    expect(h.binEdges).toEqual([0, 10, 20, 30]);
    expect(h.total).toBe(6);
    expect(h.underThreshold).toBe(0);
  });

  it("the sub-threshold cut excludes noise events and counts them", () => {
    const h = buildAmplitudeHistogram([2, 3, 4, 15, 20, 22], {
      thresholdMv: 10,
      binCount: 4,
      minMv: 10,
      maxMv: 30,
    });
    expect(h.underThreshold).toBe(3);
    expect(h.total).toBe(3);
  });

  it("the top edge is inclusive (no event dropped at max)", () => {
    const h = buildAmplitudeHistogram([10, 20], { binCount: 2, minMv: 0, maxMv: 20 });
    expect(h.counts[1]).toBe(2);
    expect(h.total).toBe(2);
  });

  it("rejects empty/degenerate inputs", () => {
    expect(() => buildAmplitudeHistogram([])).toThrow(RangeError);
    expect(() => buildAmplitudeHistogram([5, 5])).toThrow(/max > min/);
    expect(() => buildAmplitudeHistogram([1, 2], { binCount: 0 })).toThrow(RangeError);
  });
});

describe("estimateMpv", () => {
  it("recovers the mode of a symmetric peak exactly (parabolic offset 0)", () => {
    // Peak bin [20, 21) with symmetric neighbors → MPV at the bin center 20.5.
    const amplitudes = [19.2, 19.8, 20.1, 20.3, 20.5, 20.7, 20.9, 21.3, 21.6];
    const h = buildAmplitudeHistogram(amplitudes, { binCount: 40, minMv: 0, maxMv: 40 });
    expect(estimateMpv(h)).toBeCloseTo(20.5, 10);
  });

  it("recovers the known mode of an asymmetric Landau-like sample within one bin width", () => {
    // Landau-like shape: sharp rise, MPV near 18 mV, long high-amplitude tail.
    const amplitudes: number[] = [];
    const shape: Array<[number, number]> = [
      [14, 2],
      [16, 8],
      [18, 20],
      [20, 12],
      [22, 7],
      [26, 4],
      [30, 3],
      [38, 2],
      [50, 1],
    ];
    for (const [mv, n] of shape) {
      for (let i = 0; i < n; i++) amplitudes.push(mv + 0.5);
    }
    const h = buildAmplitudeHistogram(amplitudes, { binCount: 30, minMv: 10, maxMv: 70 });
    expect(Math.abs(estimateMpv(h) - 18.5)).toBeLessThanOrEqual(h.binWidthMv);
  });

  it("falls back to the bin center when the peak is at the histogram edge", () => {
    const h = buildAmplitudeHistogram([1, 1.2, 1.4, 9], { binCount: 5, minMv: 0, maxMv: 10 });
    expect(estimateMpv(h)).toBeCloseTo(1, 10);
  });
});
