import { describe, expect, it } from "vitest";
import { Rng, erfc, hashLabel, moyalCdf, normalCdf } from "./rng.js";
import { ksPValue, ksStatistic } from "./test-helpers.js";

describe("Rng", () => {
  it("is deterministic and seed-dependent (CA1)", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const sa = Array.from({ length: 1000 }, () => a.nextUint32());
    const sb = Array.from({ length: 1000 }, () => b.nextUint32());
    const sc = Array.from({ length: 1000 }, () => c.nextUint32());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });

  it("reproduces a stored reference sequence for seed 1 (cross-platform guard)", () => {
    const r = new Rng(1);
    const first = [r.nextUint32(), r.nextUint32(), r.nextUint32()];
    expect(first).toEqual(REFERENCE_SEED_1);
  });

  it("rejects invalid seeds", () => {
    expect(() => new Rng(-1)).toThrow(RangeError);
    expect(() => new Rng(1.5)).toThrow(RangeError);
    expect(() => new Rng(2 ** 32)).toThrow(RangeError);
  });

  it("forks independent, reproducible streams without consuming state", () => {
    const r = new Rng(5);
    const f1 = r.fork("x").nextUint32();
    expect(r.fork("x").nextUint32()).toBe(f1);
    expect(r.fork("y").nextUint32()).not.toBe(f1);
    expect(hashLabel("a")).not.toBe(hashLabel("b"));
  });

  it("uniform stays in the open interval and has mean 1/2", () => {
    const r = new Rng(9);
    let s = 0;
    const n = 200_000;
    for (let i = 0; i < n; i++) {
      const u = r.uniform();
      expect(u).toBeGreaterThan(0);
      expect(u).toBeLessThan(1);
      s += u;
    }
    expect(Math.abs(s / n - 0.5)).toBeLessThan((3 * Math.sqrt(1 / 12)) / Math.sqrt(n));
  });

  it("normal has mean 0 and variance 1", () => {
    const r = new Rng(10);
    const n = 200_000;
    let s = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const z = r.normal();
      s += z;
      s2 += z * z;
    }
    expect(Math.abs(s / n)).toBeLessThan(3 / Math.sqrt(n));
    expect(Math.abs(s2 / n - 1)).toBeLessThan((3 * Math.SQRT2) / Math.sqrt(n));
  });

  it("exponential: mean within 3σ and KS vs exponential passes (CA2)", () => {
    const r = new Rng(11);
    const n = 100_000;
    const rate = 2.4;
    const xs = Array.from({ length: n }, () => r.exponential(rate));
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    expect(Math.abs(mean - 1 / rate)).toBeLessThan(3 / rate / Math.sqrt(n));
    const d = ksStatistic(xs, (x) => 1 - Math.exp(-rate * x));
    expect(ksPValue(d, n)).toBeGreaterThan(0.01);
  });

  it("Moyal sampler matches the Moyal CDF (KS, CA5)", () => {
    const r = new Rng(12);
    const n = 100_000;
    const xs = Array.from({ length: n }, () => r.moyal());
    const d = ksStatistic(xs, moyalCdf);
    expect(ksPValue(d, n)).toBeGreaterThan(0.01);
  });

  it("chance follows its probability", () => {
    const r = new Rng(13);
    const n = 100_000;
    let k = 0;
    for (let i = 0; i < n; i++) if (r.chance(0.3)) k++;
    expect(Math.abs(k - 0.3 * n)).toBeLessThan(3 * Math.sqrt(n * 0.3 * 0.7));
  });
});

describe("special functions", () => {
  it("erfc and the normal CDF match known values", () => {
    expect(erfc(0)).toBeCloseTo(1, 6);
    expect(erfc(1)).toBeCloseTo(0.157299207, 6);
    expect(erfc(-1)).toBeCloseTo(1.842700793, 6);
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 5);
  });

  it("Moyal CDF: F(0) = erfc(1/√2) ≈ 0.3173", () => {
    expect(moyalCdf(0)).toBeCloseTo(0.3173105, 5);
  });
});

// Filled from the first run of the implementation; guards cross-platform byte identity.
const REFERENCE_SEED_1: number[] = [2442144158, 3238099751, 3819917871];
