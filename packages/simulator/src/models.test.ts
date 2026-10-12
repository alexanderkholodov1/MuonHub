import { describe, expect, it } from "vitest";
import { baseRate, chirkinCosThetaStar, cos2BaseRate, flatDetectorRate } from "./flux.js";
import {
  createPressureSeries,
  createRateModel,
  createTemperatureSeries,
  forbushFactor,
  poissonArrivals,
} from "./modulation.js";
import { Rng } from "./rng.js";

const HOUR = 3_600_000;

describe("flux (CA4b)", () => {
  it("R = A·I_v·π/2 gives 0.2749 s⁻¹ for 25 cm² and I_v = 0.0070", () => {
    const r = cos2BaseRate(25, 0.007);
    expect(Math.abs(r - 0.2749) / 0.2749).toBeLessThan(0.001);
    expect(baseRate({ kind: "cos2", areaCm2: 25, ivPerCm2SSr: 0.007 })).toBe(r);
  });

  it("numerical integration reproduces the closed form for cos²θ", () => {
    const num = flatDetectorRate(25, (th) => 0.007 * Math.cos(th) ** 2, 1001);
    expect(Math.abs(num - cos2BaseRate(25, 0.007)) / num).toBeLessThan(1e-6);
  });

  it("Guan/Chirkin angular shape is close to cos²θ for the total rate and valid at the horizon", () => {
    expect(chirkinCosThetaStar(1)).toBeCloseTo(1, 3);
    expect(chirkinCosThetaStar(0)).toBeGreaterThan(0);
    expect(chirkinCosThetaStar(-1)).toBe(chirkinCosThetaStar(0));
    const star = baseRate({ kind: "cos2Star", areaCm2: 25, ivPerCm2SSr: 0.007 });
    const plain = cos2BaseRate(25, 0.007);
    expect(Math.abs(star - plain) / plain).toBeLessThan(0.05);
  });

  it("a total trigger rate is returned as given", () => {
    expect(baseRate({ kind: "totalTriggerRate", ratePerS: 2.4 })).toBe(2.4);
  });

  it("a generated run reproduces the base rate within 3σ", () => {
    const rate = cos2BaseRate(25, 0.007);
    const rng = new Rng(21);
    const model = createRateModel({ baseRatePerS: rate });
    const T = 4_000_000 * 1000; // ms → ≈ 10⁶ events
    let n = 0;
    for (const t of poissonArrivals(rng, model, 0, T, 60_000)) if (t >= 0) n++;
    const expected = (rate * T) / 1000;
    expect(Math.abs(n - expected)).toBeLessThan(3 * Math.sqrt(expected));
  });
});

describe("pressure, diurnal, Forbush, temperature", () => {
  it("pressure series: constant, samples (interpolated), tide with noise", () => {
    expect(createPressureSeries({ kind: "constant", hPa: 768 })(5)).toBe(768);
    const s = createPressureSeries({
      kind: "samples",
      samples: [
        { tMs: 1000, hPa: 770 },
        { tMs: 0, hPa: 760 },
      ],
    });
    expect(s(-5)).toBe(760);
    expect(s(500)).toBeCloseTo(765, 9);
    expect(s(5000)).toBe(770);
    const tide = createPressureSeries({
      kind: "tide",
      meanHpa: 768,
      semidiurnalAmplitudeHpa: 1.5,
      seed: 1,
    });
    expect(tide(10 * HOUR)).toBeCloseTo(769.5, 9);
    expect(tide(16 * HOUR)).toBeCloseTo(766.5, 9);
    const noisy = createPressureSeries(
      { kind: "tide", meanHpa: 768, semidiurnalAmplitudeHpa: 1.5, synopticSigmaHpa: 1, seed: 1 },
      0,
    );
    const again = createPressureSeries(
      { kind: "tide", meanHpa: 768, semidiurnalAmplitudeHpa: 1.5, synopticSigmaHpa: 1, seed: 1 },
      0,
    );
    expect(noisy(1234567)).toBe(again(1234567));
    expect(noisy(5 * HOUR + 1)).not.toBe(768 + 1.5 * Math.cos((2 * Math.PI * (5 - 10)) / 12));
  });

  it("rejects empty pressure samples", () => {
    expect(() => createPressureSeries({ kind: "samples", samples: [] })).toThrow(RangeError);
  });

  it("rate follows R = R₀·exp((β/100)(P−P₀))", () => {
    const p = createPressureSeries({
      kind: "samples",
      samples: [
        { tMs: 0, hPa: 768 },
        { tMs: 1000, hPa: 778 },
      ],
    });
    const r = createRateModel({
      baseRatePerS: 2.4,
      betaPercentPerHpa: -0.12,
      p0Hpa: 768,
      pressure: p,
    });
    expect(r(0)).toBeCloseTo(2.4, 12);
    expect(r(1000)).toBeCloseTo(2.4 * Math.exp(-0.0012 * 10), 12);
    // P₀ defaults to the pressure at t = 0
    const r2 = createRateModel({ baseRatePerS: 2.4, betaPercentPerHpa: -0.12, pressure: p });
    expect(r2(0)).toBeCloseTo(2.4, 12);
  });

  it("diurnal modulation has the configured amplitude and phase", () => {
    const r = createRateModel({ baseRatePerS: 10, diurnal: { amplitude: 0.01, phaseHours: 6 } });
    expect(r(6 * HOUR)).toBeCloseTo(10.1, 9);
    expect(r(18 * HOUR)).toBeCloseTo(9.9, 9);
  });

  it("Forbush dip: depth at onset, exponential recovery, nothing before", () => {
    const dip = [{ onsetMs: 100, depthPercent: 3, recoveryHours: 24 }];
    expect(forbushFactor(dip, 50)).toBe(1);
    expect(forbushFactor(dip, 100)).toBeCloseTo(0.97, 12);
    expect(forbushFactor(dip, 100 + 24 * HOUR)).toBeCloseTo(1 - 0.03 / Math.E, 12);
    const r = createRateModel({ baseRatePerS: 2, forbush: dip });
    expect(r(100)).toBeCloseTo(1.94, 9);
  });

  it("temperature series: diurnal cycle and deterministic noise", () => {
    const t = createTemperatureSeries({ meanC: 20, diurnalAmplitudeC: 3, phaseHours: 14 });
    expect(t(14 * HOUR)).toBeCloseTo(23, 9);
    const n = createTemperatureSeries({ meanC: 20, noiseSigmaC: 0.5, seed: 3 });
    expect(n(90_000)).toBe(n(90_001));
    expect(n(90_000)).not.toBe(n(200_000));
  });

  it("poissonArrivals skips zero-rate steps", () => {
    const n = [...poissonArrivals(new Rng(1), () => 0, 0, 10_000, 1000)];
    expect(n).toEqual([]);
  });
});

describe("pressure modulation recovers β (CA4)", () => {
  it("hourly ln R vs P over 60 days recovers β within 3σ_β", () => {
    const beta = -0.12;
    const pressure = createPressureSeries(
      { kind: "tide", meanHpa: 768, semidiurnalAmplitudeHpa: 1.5, synopticSigmaHpa: 1, seed: 99 },
      0,
    );
    const rate = createRateModel({
      baseRatePerS: 2.4,
      betaPercentPerHpa: beta,
      p0Hpa: 768,
      pressure,
    });
    const rng = new Rng(2024);
    const hours = 60 * 24;
    const counts = new Array<number>(hours).fill(0);
    for (const t of poissonArrivals(rng, rate, 0, hours * HOUR, 10_000)) {
      const h = Math.floor(t / HOUR);
      counts[h] = (counts[h] ?? 0) + 1;
    }
    const xs: number[] = [];
    const ys: number[] = [];
    for (let h = 0; h < hours; h++) {
      let p = 0;
      for (let k = 0; k < 360; k++) p += pressure(h * HOUR + k * 10_000 + 5000);
      xs.push(p / 360);
      ys.push(Math.log((counts[h] ?? 1) / 3600));
    }
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < n; i++) {
      sxx += ((xs[i] ?? 0) - mx) ** 2;
      sxy += ((xs[i] ?? 0) - mx) * ((ys[i] ?? 0) - my);
    }
    const slope = sxy / sxx;
    let rss = 0;
    for (let i = 0; i < n; i++) rss += ((ys[i] ?? 0) - my - slope * ((xs[i] ?? 0) - mx)) ** 2;
    const sigmaSlope = Math.sqrt(rss / (n - 2) / sxx);
    const betaFit = slope * 100;
    const sigmaBeta = sigmaSlope * 100;
    expect(Math.abs(betaFit - beta)).toBeLessThan(3 * sigmaBeta);
    expect(sigmaBeta).toBeLessThan(0.05);
  });
});
