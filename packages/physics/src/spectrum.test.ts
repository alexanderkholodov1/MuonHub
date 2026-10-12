import { describe, expect, it } from "vitest";
import { buildAmplitudeHistogram, fitMpv, mergeHistograms, moyalPdf } from "./spectrum.js";
import { mulberry32 } from "./test-helpers.js";

const edges = Array.from({ length: 101 }, (_, i) => i * 2); // 0..200 mV, 2 mV bins
const binning = { edges, unit: "mV" as const };
const sat = { value: 190, unit: "mV" as const };

/** Moyal sample by inverse CDF: P(x ≤ X) = erfc(exp(−λ/2)/√2), found by bisection. */
function erfcApprox(x: number): number {
  // Abramowitz–Stegun 7.1.26 is too coarse; use the series via numerical integration of the pdf instead.
  return x;
}
void erfcApprox;

function moyalCdf(l: number): number {
  // Numerical integral of the standard Moyal density from −∞ (−8) to l (trapezoid).
  const lo = -6;
  if (l <= lo) return 0;
  const n = 4000;
  const h = (l - lo) / n;
  let s = 0.5 * (moyalPdf(lo, 0, 1) + moyalPdf(l, 0, 1));
  for (let i = 1; i < n; i++) s += moyalPdf(lo + i * h, 0, 1);
  return s * h;
}

function sampleFromCdfTable(
  cdfAt: (x: number) => number,
  lo: number,
  hi: number,
  n: number,
  seed: number,
): number[] {
  const grid = 4000;
  const xs: number[] = [];
  const cs: number[] = [];
  for (let i = 0; i <= grid; i++) {
    const x = lo + ((hi - lo) * i) / grid;
    xs.push(x);
    cs.push(cdfAt(x));
  }
  const total = cs[grid] as number;
  const rng = mulberry32(seed);
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const u = rng() * total;
    let a = 0;
    let b = grid;
    while (b - a > 1) {
      const m = (a + b) >> 1;
      if ((cs[m] as number) <= u) a = m;
      else b = m;
    }
    const f = ((u - (cs[a] as number)) / ((cs[b] as number) - (cs[a] as number) || 1)) as number;
    out.push((xs[a] as number) + f * ((xs[b] as number) - (xs[a] as number)));
  }
  return out;
}

describe("buildAmplitudeHistogram", () => {
  it("spectrum scale: 10⁶ amplitudes, no exception, counts sum to 10⁶ with the saturation bin", () => {
    const rng = mulberry32(1);
    function* gen(): Generator<number> {
      for (let i = 0; i < 1_000_000; i++) yield rng() * 200;
    }
    const h = buildAmplitudeHistogram(gen(), binning, sat);
    let regular = 0;
    for (const c of h.counts) regular += c;
    expect(h.total).toBe(1_000_000);
    expect(regular + h.underflow + h.overflow + h.saturated + h.nonFinite).toBe(1_000_000);
    expect(h.saturated).toBeGreaterThan(40_000);
  });

  it("counts saturated events only in the saturation bin, never in the last regular bin", () => {
    const h = buildAmplitudeHistogram([10, 189.9, 190, 199.9, 250, -1, NaN], binning, sat);
    expect(h.saturated).toBe(3);
    expect(h.counts[94]).toBe(1); // 189.9 in [188, 190)
    expect(h.counts[99]).toBe(0);
    expect(h.underflow).toBe(1);
    expect(h.nonFinite).toBe(1);
    expect(h.total).toBe(7);
  });

  it("counts values between the last edge and saturation as overflow", () => {
    const h = buildAmplitudeHistogram([150, 150], { edges: [0, 100], unit: "mV" }, sat);
    expect(h.overflow).toBe(2);
  });

  it("is invalid for bad edges or mismatched units", () => {
    expect(buildAmplitudeHistogram([1], { edges: [1], unit: "mV" }, sat).status).toBe("invalid");
    expect(buildAmplitudeHistogram([1], { edges: [0, 0, 1], unit: "mV" }, sat).status).toBe(
      "invalid",
    );
    expect(buildAmplitudeHistogram([1], binning, { value: 190, unit: "adc" }).status).toBe(
      "invalid",
    );
  });
});

describe("mergeHistograms", () => {
  it("adds counts and tallies", () => {
    const a = buildAmplitudeHistogram([1, 3, 195], binning, sat);
    const b = buildAmplitudeHistogram([1, 5, -2], binning, sat);
    const m = mergeHistograms([a, b]);
    expect(m.status).toBe("ok");
    expect(m.counts[0]).toBe(2);
    expect(m.saturated).toBe(1);
    expect(m.underflow).toBe(1);
    expect(m.total).toBe(6);
  });
  it("is not computable when empty and invalid when binning differs", () => {
    expect(mergeHistograms([]).status).toBe("not-computable");
    const a = buildAmplitudeHistogram([1], binning, sat);
    const b = buildAmplitudeHistogram([1], { edges: [0, 1, 2], unit: "mV" }, sat);
    expect(mergeHistograms([a, b]).status).toBe("invalid");
  });
});

describe("fitMpv", () => {
  it("MPV (consistency): Moyal sample, known MPV, fitted within its uncertainty", () => {
    const mu = 60;
    const scale = 8;
    const data = sampleFromCdfTable((x) => moyalCdf((x - mu) / scale), 0, 190, 200_000, 11);
    const fit = fitMpv(buildAmplitudeHistogram(data, binning, sat));
    expect(fit.status).toBe("ok");
    expect(Math.abs((fit.mpv as number) - mu)).toBeLessThan(3 * (fit.sigmaMpv as number));
    expect(fit.sigmaMpv as number).toBeLessThan(0.5);
    expect(fit.width as number).toBeCloseTo(scale, 0);
  });

  it("MPV (robustness): Landau sample, noise = 0, within 3 % of the Landau MPV", () => {
    // Landau density φ(λ) = (1/π)∫₀^∞ exp(−t ln t − λt) sin(πt) dt, mode ≈ −0.2228.
    const landau = (lam: number): number => {
      const n = 4000;
      const tmax = 60;
      const h = tmax / n;
      let s = 0;
      for (let i = 1; i < n; i++) {
        const t = i * h;
        s += Math.exp(-t * Math.log(t) - lam * t) * Math.sin(Math.PI * t);
      }
      return (s * h) / Math.PI;
    };
    const mpv = 60;
    const xi = 6; // x = mpv + xi·(λ + 0.2228)
    const grid = 4000;
    const hi = 190;
    const xs: number[] = [];
    const cs: number[] = [];
    let acc = 0;
    let prev = 0;
    for (let i = 0; i <= grid; i++) {
      const x = (hi * i) / grid;
      const d = Math.max(0, landau((x - mpv) / xi - 0.2228)) / xi;
      if (i > 0) acc += 0.5 * (d + prev) * (hi / grid);
      prev = d;
      xs.push(x);
      cs.push(acc);
    }
    const rng = mulberry32(5);
    const data: number[] = [];
    for (let k = 0; k < 200_000; k++) {
      const u = rng() * acc;
      let a = 0;
      let b = grid;
      while (b - a > 1) {
        const m = (a + b) >> 1;
        if ((cs[m] as number) <= u) a = m;
        else b = m;
      }
      const f = (u - (cs[a] as number)) / ((cs[b] as number) - (cs[a] as number) || 1);
      data.push((xs[a] as number) + f * ((xs[b] as number) - (xs[a] as number)));
    }
    const fit = fitMpv(buildAmplitudeHistogram(data, binning, sat));
    expect(fit.status).toBe("ok");
    // The Moyal approximation is biased for the true Landau shape; documented tolerance 3 %.
    expect(Math.abs((fit.mpv as number) - mpv) / mpv).toBeLessThan(0.03);
  });

  it("is not computable for poor or invalid histograms", () => {
    expect(fitMpv(buildAmplitudeHistogram([], { edges: [0, 1], unit: "mV" }, sat)).status).toBe(
      "not-computable",
    );
    const sparse = buildAmplitudeHistogram([10, 12, 14], binning, sat);
    expect(fitMpv(sparse).status).toBe("not-computable");
    const spike = buildAmplitudeHistogram(new Array<number>(500).fill(11), binning, sat);
    expect(fitMpv(spike).status).toBe("not-computable");
    expect(fitMpv(buildAmplitudeHistogram([1], { edges: [1], unit: "mV" }, sat)).status).toBe(
      "not-computable",
    );
  });
});
