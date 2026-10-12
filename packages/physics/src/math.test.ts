import { describe, expect, it } from "vitest";
import {
  erfc,
  invert,
  lag1Autocorrelation,
  madSigma,
  mean,
  median,
  solveLinear,
  sum,
  twoSidedTail,
  variance,
} from "./math.js";
import { effectiveSampleSize } from "./statistics.js";

describe("math helpers", () => {
  it("basic statistics", () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(mean([1, 2, 3])).toBe(2);
    expect(variance([1, 2, 3])).toBe(1);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(madSigma([1, 2, 3, 4, 5])).toBeCloseTo(1.4826, 4);
    expect(() => mean([])).toThrow(RangeError);
    expect(() => median([])).toThrow(RangeError);
    expect(() => variance([1])).toThrow(RangeError);
  });
  it("autocorrelation and effective sample size", () => {
    expect(lag1Autocorrelation([1, 2])).toBe(0);
    expect(lag1Autocorrelation([1, 1, 1])).toBe(0);
    const ramp = Array.from({ length: 100 }, (_, i) => i);
    expect(lag1Autocorrelation(ramp)).toBeGreaterThan(0.9);
    expect(effectiveSampleSize(ramp)).toBeLessThan(5);
    expect(effectiveSampleSize([1, 2])).toBe(2);
  });
  it("erfc and the two-sided normal tail", () => {
    expect(erfc(0)).toBeCloseTo(1, 6);
    expect(erfc(-1)).toBeCloseTo(1.842701, 5);
    expect(twoSidedTail(3)).toBeCloseTo(0.0027, 4);
  });
  it("linear algebra", () => {
    expect(
      solveLinear(
        [
          [2, 0],
          [0, 4],
        ],
        [2, 8],
      ),
    ).toEqual([1, 2]);
    expect(
      solveLinear(
        [
          [0, 0],
          [0, 0],
        ],
        [1, 1],
      ),
    ).toBeUndefined();
    const inv = invert([
      [2, 0],
      [0, 4],
    ]) as number[][];
    expect(inv[1]?.[1]).toBeCloseTo(0.25, 12);
    expect(
      invert([
        [1, 1],
        [1, 1],
      ]),
    ).toBeUndefined();
  });
});
