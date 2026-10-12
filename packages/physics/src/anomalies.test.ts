import { describe, expect, it } from "vitest";
import { detectHourScaleDeviations, type HourlyRate } from "./anomalies.js";
import { gaussian, mulberry32 } from "./test-helpers.js";

const T0 = 1_700_000_000_000;
const H = 3_600_000;
const SIGMA = 0.025;

function flat(n: number, bump: Record<number, number> = {}): HourlyRate[] {
  return Array.from({ length: n }, (_, i) => ({
    hourStart: T0 + i * H,
    rate: 2.4 + (bump[i] ?? 0),
    sigma: SIGMA,
  }));
}

describe("detectHourScaleDeviations", () => {
  const baseline = { value: 2.4, sigma: 0.001 };

  it("anomaly persistence: one 4σ hour → none; 3 consecutive 4σ hours → one deviation", () => {
    const one = detectHourScaleDeviations(flat(48, { 20: 0.1 }), baseline);
    expect(one.status).toBe("ok");
    expect(one.deviations).toHaveLength(0);
    const three = detectHourScaleDeviations(flat(48, { 20: 0.1, 21: 0.1, 22: 0.1 }), baseline);
    expect(three.deviations).toHaveLength(1);
    const d = three.deviations[0];
    expect(d?.windows).toBe(3);
    expect(d?.sign).toBe(1);
    expect(d?.start).toBe(T0 + 20 * H);
    expect(d?.end).toBe(T0 + 23 * H);
    expect(d?.maxAbsZ).toBeGreaterThan(3.9);
  });

  it("does not join runs of opposite sign or separated by a gap", () => {
    const opposite = detectHourScaleDeviations(
      flat(48, { 10: 0.1, 11: 0.1, 12: -0.1, 13: -0.1 }),
      baseline,
    );
    expect(opposite.deviations).toHaveLength(0);
    const negative = detectHourScaleDeviations(
      flat(48, { 10: -0.1, 11: -0.1, 12: -0.1 }),
      baseline,
    );
    expect(negative.deviations[0]?.sign).toBe(-1);
    const gap = flat(48, { 10: 0.1, 11: 0.1, 13: 0.1 }).filter((_, i) => i !== 12);
    expect(detectHourScaleDeviations(gap, baseline).deviations).toHaveLength(0);
  });

  it("overdispersion: AR(1) residuals widen σ and the false-alarm rate per year is reported", () => {
    const rng = mulberry32(7);
    let ar = 0;
    const windows: HourlyRate[] = Array.from({ length: 24 * 60 }, (_, i) => {
      ar = 0.8 * ar + 0.6 * 0.05 * gaussian(rng);
      return { hourStart: T0 + i * H, rate: 2.4 + ar + SIGMA * gaussian(rng), sigma: SIGMA };
    });
    const res = detectHourScaleDeviations(windows, baseline);
    expect(res.sigmaOverdispersion).toBeGreaterThan(0.02);
    const plain = detectHourScaleDeviations(flat(100), baseline);
    expect(plain.sigmaOverdispersion).toBe(0);
    // 8766 h · 2 · (0.00135)^3 ≈ 4.3e-5 per year for 3σ and 3 windows.
    expect(res.falseAlarmsPerYear).toBeCloseTo(8766 * 2 * 0.00135 ** 3, 7);
    expect(res.falseAlarmsPerYear).toBeLessThan(1e-3);
    const loose = detectHourScaleDeviations(windows, baseline, { threshold: 2, persistence: 1 });
    expect(loose.falseAlarmsPerYear).toBeGreaterThan(res.falseAlarmsPerYear);
  });

  it("is not computable with fewer than two windows", () => {
    expect(detectHourScaleDeviations(flat(1), baseline).status).toBe("not-computable");
  });

  it("sorts unsorted windows", () => {
    const w = flat(48, { 20: 0.1, 21: 0.1, 22: 0.1 }).reverse();
    expect(detectHourScaleDeviations(w, baseline).deviations).toHaveLength(1);
  });
});
