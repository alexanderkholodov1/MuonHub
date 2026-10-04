import { describe, expect, it } from "vitest";
import { applyBarometricCorrection, betaToPercentPerHpa, fitBarometricBeta } from "./barometric.js";

/** Synthetic exponential series I(P) = I₀·e^{β(P−P₀)} at Andean pressures (~730 hPa). */
function syntheticSeries(
  beta: number,
  i0: number,
  p0: number,
): { rate: number; pressureHpa: number }[] {
  const points: { rate: number; pressureHpa: number }[] = [];
  for (let p = 700; p <= 760; p += 2) {
    points.push({ pressureHpa: p, rate: i0 * Math.exp(beta * (p - p0)) });
  }
  return points;
}

// Reference range: THEORETICAL-FOUNDATION.md §8A — surface-muon β ≈ −0.085 … −0.24 %/hPa.
describe("fitBarometricBeta", () => {
  it("recovers β = −0.24 %/hPa from a noiseless series with r² ≈ 1", () => {
    const beta = -0.0024; // 1/hPa, the equatorial-surface literature value
    const fit = fitBarometricBeta(syntheticSeries(beta, 600, 730));
    expect(fit.beta).toBeCloseTo(beta, 9);
    expect(fit.betaPercentPerHpa).toBeCloseTo(-0.24, 6);
    expect(fit.rSquared).toBeCloseTo(1, 9);
    expect(fit.n).toBe(31);
  });

  it("fitted β stays inside the documented surface range for in-range synthetic data", () => {
    for (const betaPct of [-0.085, -0.12, -0.2, -0.24]) {
      const fit = fitBarometricBeta(syntheticSeries(betaPct / 100, 500, 730));
      expect(fit.betaPercentPerHpa).toBeLessThanOrEqual(-0.08);
      expect(fit.betaPercentPerHpa).toBeGreaterThanOrEqual(-0.3);
    }
  });

  it("uses the sample mean pressure as P₀ and recovers I₀ there", () => {
    const fit = fitBarometricBeta(syntheticSeries(-0.0024, 600, 730));
    expect(fit.refPressureHpa).toBeCloseTo(730, 9);
    expect(fit.refRate).toBeCloseTo(600, 6);
  });

  it("excludes non-positive rates (log domain) and keeps fitting", () => {
    const points = [...syntheticSeries(-0.0024, 600, 730), { rate: 0, pressureHpa: 731 }];
    const fit = fitBarometricBeta(points);
    expect(fit.n).toBe(31);
    expect(fit.beta).toBeCloseTo(-0.0024, 9);
  });

  it("throws without ≥ 2 usable points or without pressure variance", () => {
    expect(() => fitBarometricBeta([{ rate: 10, pressureHpa: 730 }])).toThrow(RangeError);
    expect(() =>
      fitBarometricBeta([
        { rate: 10, pressureHpa: 730 },
        { rate: 11, pressureHpa: 730 },
      ]),
    ).toThrow(/variance/);
  });

  it("a constant-rate series fits β = 0 with r² = 1", () => {
    const fit = fitBarometricBeta([
      { rate: 50, pressureHpa: 720 },
      { rate: 50, pressureHpa: 730 },
      { rate: 50, pressureHpa: 740 },
    ]);
    expect(fit.beta).toBeCloseTo(0, 12);
    expect(fit.rSquared).toBe(1);
  });
});

describe("applyBarometricCorrection", () => {
  it("flattens the synthetic series back to I₀ at every pressure", () => {
    const beta = -0.0024;
    const series = syntheticSeries(beta, 600, 730);
    const fit = fitBarometricBeta(series);
    for (const p of series) {
      expect(applyBarometricCorrection(p.rate, p.pressureHpa, fit)).toBeCloseTo(600, 6);
    }
  });

  it("is the identity at the reference pressure", () => {
    expect(applyBarometricCorrection(123, 730, { beta: -0.0024, refPressureHpa: 730 })).toBeCloseTo(
      123,
      12,
    );
  });

  it("rejects non-physical inputs", () => {
    const fit = { beta: -0.0024, refPressureHpa: 730 };
    expect(() => applyBarometricCorrection(-1, 730, fit)).toThrow(RangeError);
    expect(() => applyBarometricCorrection(10, 0, fit)).toThrow(RangeError);
  });
});

describe("betaToPercentPerHpa", () => {
  it("converts 1/hPa to %/hPa", () => {
    expect(betaToPercentPerHpa(-0.0024)).toBeCloseTo(-0.24, 12);
  });
});
