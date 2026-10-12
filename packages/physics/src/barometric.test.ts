import { describe, expect, it } from "vitest";
import { applyBarometricCorrection, betaToPercentPerHpa, fitBarometricBeta } from "./barometric.js";
import { correctRateByLiveTime } from "./live-time.js";
import { syntheticHours } from "./test-helpers.js";

describe("betaToPercentPerHpa", () => {
  it("converts 1/hPa to %/hPa", () => {
    expect(betaToPercentPerHpa(-0.0012)).toBeCloseTo(-0.12, 12);
  });
});

describe("fitBarometricBeta", () => {
  it("β recovery: 90 days, β = −0.12 %/hPa within 2σ_β, |β|/σ_β ≥ 3, applied", () => {
    const fit = fitBarometricBeta(syntheticHours({ hours: 90 * 24, betaPctPerHpa: -0.12 }));
    expect(fit.status).toBe("ok");
    expect(Math.abs((fit.beta as number) + 0.12)).toBeLessThan(2 * (fit.sigmaBeta as number));
    expect(fit.significance as number).toBeGreaterThanOrEqual(3);
    expect(fit.applied).toBe(true);
    expect(fit.temperatureCoef).toBeDefined();
    expect(fit.hoursUsed).toBeGreaterThan(2000);
    expect(fit.provenance.fn).toBe("fitBarometricBeta");
  });

  it("β gate: one week of the same stream is not significant and is not applied", () => {
    const fit = fitBarometricBeta(syntheticHours({ hours: 7 * 24, betaPctPerHpa: -0.12 }));
    expect(fit.status).toBe("ok");
    // Known answer for the seeded series (seed 20261003): |β|/σ_β ≈ 1.28, σ_β ≈ 0.092 %/hPa.
    expect(fit.significance as number).toBeGreaterThanOrEqual(1.2);
    expect(fit.significance as number).toBeLessThanOrEqual(2.0);
    expect(fit.sigmaBeta as number).toBeGreaterThanOrEqual(0.05);
    expect(fit.sigmaBeta as number).toBeLessThanOrEqual(0.1);
    expect(fit.applied).toBe(false);
    expect(fit.reason).toContain("<");
  });

  it("P₀ is the mean pressure of the fit period, not 730", () => {
    const hours = syntheticHours({ hours: 30 * 24, betaPctPerHpa: -0.12 });
    const fit = fitBarometricBeta(hours);
    const meanP = hours.reduce((s, h) => s + (h.pressureHpa as number), 0) / hours.length;
    expect(fit.p0Hpa as number).toBeCloseTo(meanP, 1);
    expect(Math.abs((fit.p0Hpa as number) - 768)).toBeLessThan(2);
  });

  it("works without temperature (covariate omitted)", () => {
    const hours = syntheticHours({ hours: 60 * 24, betaPctPerHpa: -0.12 }).map(
      ({ temperatureC: _t, ...rest }) => rest,
    );
    const fit = fitBarometricBeta(hours);
    expect(fit.status).toBe("ok");
    expect(fit.temperatureCoef).toBeUndefined();
  });

  it("can switch the temperature covariate off", () => {
    const fit = fitBarometricBeta(syntheticHours({ hours: 60 * 24, betaPctPerHpa: -0.12 }), {
      useTemperature: false,
    });
    expect(fit.temperatureCoef).toBeUndefined();
  });

  it("rejects a wrong-sign β (positive) as outside the plausible range", () => {
    const fit = fitBarometricBeta(syntheticHours({ hours: 90 * 24, betaPctPerHpa: 0.2 }));
    expect(fit.applied).toBe(false);
    expect(fit.reason).toContain("plausible range");
  });

  it("is not computable with too little data, span or pressure variation", () => {
    expect(fitBarometricBeta([]).status).toBe("not-computable");
    const short = fitBarometricBeta(syntheticHours({ hours: 48, betaPctPerHpa: -0.12 }));
    expect(short.status).toBe("not-computable");
    expect(short.reason).toContain("span");
    const flat = syntheticHours({ hours: 10 * 24, betaPctPerHpa: -0.12 }).map((h) => ({
      ...h,
      pressureHpa: 768 + 0.01 * Math.sin(h.hourStart),
    }));
    const f = fitBarometricBeta(flat);
    expect(f.status).toBe("not-computable");
    expect(f.reason).toContain("pressure standard deviation");
  });

  it("is not computable when the pressure is absent (never computed from 0)", () => {
    const hours = syntheticHours({ hours: 10 * 24, betaPctPerHpa: -0.12 }).map(
      ({ pressureHpa: _p, ...rest }) => rest,
    );
    expect(fitBarometricBeta(hours).status).toBe("not-computable");
  });

  it("excludes gross outlier hours", () => {
    const hours = syntheticHours({ hours: 60 * 24, betaPctPerHpa: -0.12 }).map((h, i) =>
      i % 200 === 0 ? { ...h, counts: Math.round(h.counts * 1.3) } : h,
    );
    const fit = fitBarometricBeta(hours);
    expect(fit.hoursExcluded).toBeGreaterThan(0);
    expect(fit.status).toBe("ok");
  });

  it("is not computable for a degenerate regression", () => {
    const base = syntheticHours({ hours: 10 * 24, betaPctPerHpa: -0.12 });
    // Pressure is a deterministic function of temperature: collinear columns.
    const hours = base.map((h) => ({ ...h, temperatureC: (h.pressureHpa as number) * 2 }));
    expect(fitBarometricBeta(hours).status).toBe("not-computable");
  });
});

describe("applyBarometricCorrection", () => {
  const fit = {
    status: "ok" as const,
    beta: -0.12,
    sigmaBeta: 0.02,
    p0Hpa: 768,
    hoursUsed: 100,
    hoursExcluded: 0,
    applied: true,
    reason: "applied",
    provenance: { fn: "fitBarometricBeta", version: "2", params: {} },
  };
  const rate = { ...correctRateByLiveTime(144 * 10, 600_000), rate: 2.4, sigma: 0 };

  it("β propagation: added σ = 0.02/100 · 5 · R_c (corrected rate) s⁻¹", () => {
    const out = applyBarometricCorrection(rate, 773, fit);
    expect(out.barometric).toBe("applied");
    expect(out.sigma as number).toBeCloseTo((0.02 / 100) * 5 * 2.4 * Math.exp(0.0012 * 5), 12);
    expect(out.rate as number).toBeCloseTo(2.4 * Math.exp(0.0012 * 5), 12);
  });

  it("leaves the rate alone when β is not applied or the inputs are absent", () => {
    expect(applyBarometricCorrection(rate, 773, { ...fit, applied: false }).barometric).toBe(
      "not-applied",
    );
    expect(applyBarometricCorrection(rate, undefined, fit).barometric).toBe("not-computable");
    expect(applyBarometricCorrection(correctRateByLiveTime(1.5, 0), 773, fit).barometric).toBe(
      "not-computable",
    );
  });
});
