import { describe, expect, it } from "vitest";
import {
  applyDeadTime,
  sampleNoiseAmplitude,
  sampleSignalAmplitude,
  simulateDeadTimeRun,
} from "./device.js";
import { moyalCdf, Rng } from "./rng.js";
import { ksPValue, ksStatistic } from "./test-helpers.js";

describe("dead time (CA3)", () => {
  for (const nTau of [0.001, 0.05, 0.2]) {
    it(`loss fraction matches nτ/(1+nτ) for nτ = ${nTau}`, () => {
      const rate = 100;
      const tau = nTau / rate;
      const N = 10_000_000;
      const run = simulateDeadTimeRun(new Rng(31 + Math.round(nTau * 1000)), rate, tau, N);
      const p = nTau / (1 + nTau);
      const measured = (N - run.recorded) / N;
      expect(Math.abs(measured - p)).toBeLessThan(3 * Math.sqrt((p * (1 - p)) / N));
      // cumulative dead time / elapsed = recorded·τ / T equals the dead fraction
      const deadFraction = run.cumulativeDeadS / run.elapsedS;
      expect(Math.abs(deadFraction - p)).toBeLessThan(3 * Math.sqrt((p * (1 - p)) / N));
    });
  }

  it("applyDeadTime is non-paralyzable: lost events do not extend the dead period", () => {
    // τ = 10: recorded at 0, 5 lost, 9 lost, 10 recorded (not paralyzed by 5 and 9)
    expect(applyDeadTime([0, 5, 9, 10, 12], 10)).toEqual([true, false, false, true, false]);
  });
});

describe("amplitudes (CA5)", () => {
  const cfg = {
    mpv: 100,
    width: 10,
    unit: "mV" as const,
    noiseSigma: 0,
    saturation: { value: 140, unit: "mV" as const },
  };

  it("peak of 10⁶ events recovers the MPV within 2 %; none above saturation; saturation flagged", () => {
    const rng = new Rng(77);
    const n = 1_000_000;
    const binW = 1;
    const hist = new Array<number>(300).fill(0);
    let saturated = 0;
    for (let i = 0; i < n; i++) {
      const a = sampleSignalAmplitude(rng, { ...cfg, saturation: { value: 250, unit: "mV" } });
      const bin = Math.min(299, Math.floor(a.value / binW));
      hist[bin] = (hist[bin] ?? 0) + 1;
      if (a.saturated) saturated++;
    }
    expect(saturated).toBeGreaterThan(0);
    // parabola fit to the 13 bins around the maximum
    let m = 0;
    for (let i = 0; i < 300; i++) if ((hist[i] ?? 0) > (hist[m] ?? 0)) m = i;
    let sx = 0,
      sx2 = 0,
      sx3 = 0,
      sx4 = 0,
      sy = 0,
      sxy = 0,
      sx2y = 0;
    for (let k = -6; k <= 6; k++) {
      const y = hist[m + k] ?? 0;
      sx += k;
      sx2 += k * k;
      sx3 += k ** 3;
      sx4 += k ** 4;
      sy += y;
      sxy += k * y;
      sx2y += k * k * y;
    }
    // solve normal equations for y = a + b k + c k²
    const nn = 13;
    const det =
      nn * (sx2 * sx4 - sx3 * sx3) - sx * (sx * sx4 - sx3 * sx2) + sx2 * (sx * sx3 - sx2 * sx2);
    const detB =
      nn * (sxy * sx4 - sx3 * sx2y) - sy * (sx * sx4 - sx3 * sx2) + sx2 * (sx * sx2y - sxy * sx2);
    const detC =
      nn * (sx2 * sx2y - sxy * sx3) - sx * (sx * sx2y - sxy * sx2) + sy * (sx * sx3 - sx2 * sx2);
    const b = detB / det;
    const c = detC / det;
    const peak = (m + 0.5 + -b / (2 * c)) * binW;
    expect(Math.abs(peak - cfg.mpv) / cfg.mpv).toBeLessThan(0.02);
  });

  it("matches the Moyal CDF (KS) and clips at saturation with flags", () => {
    const rng = new Rng(78);
    const n = 100_000;
    const xs: number[] = [];
    let flagged = 0;
    for (let i = 0; i < n; i++) {
      const a = sampleSignalAmplitude(rng, { ...cfg, saturation: { value: 1e9, unit: "mV" } });
      xs.push(a.value);
    }
    const d = ksStatistic(xs, (x) => moyalCdf((x - cfg.mpv) / cfg.width));
    expect(ksPValue(d, n)).toBeGreaterThan(0.01);

    const rng2 = new Rng(78);
    for (let i = 0; i < n; i++) {
      const a = sampleSignalAmplitude(rng2, cfg);
      expect(a.value).toBeLessThanOrEqual(140);
      if (a.saturated) {
        flagged++;
        expect(a.value).toBe(140);
      } else {
        expect(a.value).toBeLessThan(140);
      }
    }
    const expected = n * (1 - moyalCdf((140 - 100) / 10));
    expect(Math.abs(flagged - expected)).toBeLessThan(3 * Math.sqrt(expected));
  });

  it("Gaussian noise widens the distribution; noise-trigger amplitudes are exponential and clipped", () => {
    const rng = new Rng(5);
    const a = Array.from(
      { length: 20000 },
      () =>
        sampleSignalAmplitude(rng, {
          ...cfg,
          noiseSigma: 20,
          saturation: { value: 1e9, unit: "mV" },
        }).value,
    );
    const b = Array.from(
      { length: 20000 },
      () => sampleSignalAmplitude(rng, { ...cfg, saturation: { value: 1e9, unit: "mV" } }).value,
    );
    const sd = (v: number[]): number => {
      const m = v.reduce((x, y) => x + y, 0) / v.length;
      return Math.sqrt(v.reduce((x, y) => x + (y - m) ** 2, 0) / v.length);
    };
    expect(sd(a)).toBeGreaterThan(sd(b));
    const noise = Array.from(
      { length: 20000 },
      () => sampleNoiseAmplitude(rng, { ratePerS: 1, meanAmplitude: 30 }, 1e9).value,
    );
    expect(Math.abs(noise.reduce((x, y) => x + y, 0) / noise.length - 30)).toBeLessThan(1.5);
    expect(sampleNoiseAmplitude(rng, { ratePerS: 1, meanAmplitude: 1e9 }, 5).saturated).toBe(true);
  });
});
