import { describe, expect, it } from "vitest";
import {
  correctRateByLiveTime,
  correctRateByTau,
  deadFractionFromCounter,
  liveMsForMinute,
  minuteRate,
  uncorrectedRate,
} from "./live-time.js";
import { poissonRelativeError } from "./statistics.js";

describe("counting-noise known answers", () => {
  it("per-minute noise: R = 2.4 s⁻¹, 60 s → N ≈ 144, σ/N ≈ 8.3 %", () => {
    const n = 2.4 * 60;
    expect(n).toBeCloseTo(144, 9);
    expect(poissonRelativeError(n)).toBeCloseTo(0.0833, 3);
  });
  it("per-hour noise: R = 2.4 s⁻¹, 3600 s → σ/N ≈ 1.08 %", () => {
    expect(poissonRelativeError(2.4 * 3600)).toBeCloseTo(0.0108, 4);
  });
  it("time to 100k counts: ≈ 11.6 h; σ/N ≈ 0.32 %", () => {
    expect(100_000 / 2.4 / 3600).toBeCloseTo(11.57, 1);
    expect(poissonRelativeError(100_000)).toBeCloseTo(0.0032, 4);
  });
  it("wrong τ inflation: 50 ms assumed vs 0.4 ms true at 2.4 s⁻¹ ≈ 13.5 %", () => {
    const wrong = correctRateByTau(2.4, 0, 0.05).rate as number;
    const right = correctRateByTau(2.4, 0, 0.0004).rate as number;
    expect(wrong / right - 1).toBeCloseTo(0.135, 2);
  });
});

describe("deadFractionFromCounter", () => {
  it("cumulative counter: D 46,000 → 52,000 µs over 60 s → 1.0e-4", () => {
    const r = deadFractionFromCounter(
      { deadTimeUs: 46_000, deviceTimeMs: 1_000 },
      { deadTimeUs: 52_000, deviceTimeMs: 61_000 },
    );
    expect(r.status).toBe("ok");
    expect(r.deadFraction as number).toBeCloseTo(1.0e-4, 12);
    expect(r.deadMs).toBeCloseTo(6, 12);
    expect(r.liveFraction as number).toBeCloseTo(1 - 1e-4, 12);
    expect(liveMsForMinute(r.deadFraction as number)).toBeCloseTo(59_994, 6);
  });

  it("counter reset: D decreases → reset reported, no fraction", () => {
    const r = deadFractionFromCounter(
      { deadTimeUs: 52_000, deviceTimeMs: 1_000 },
      { deadTimeUs: 100, deviceTimeMs: 61_000 },
    );
    expect(r.reset).toBe(true);
    expect(r.status).toBe("invalid");
    expect(r.deadFraction).toBeUndefined();
  });

  it("reset inside a minute: device clock decrease invalidates the minute", () => {
    const r = deadFractionFromCounter(
      { deadTimeUs: 1_000, deviceTimeMs: 90_000 },
      { deadTimeUs: 2_000, deviceTimeMs: 5_000 },
    );
    expect(r.reset).toBe(true);
    expect(r.status).toBe("invalid");
  });

  it("rejects non-finite input and a dead time longer than the elapsed time", () => {
    expect(
      deadFractionFromCounter(
        { deadTimeUs: NaN, deviceTimeMs: 0 },
        { deadTimeUs: 1, deviceTimeMs: 1 },
      ).status,
    ).toBe("invalid");
    const r = deadFractionFromCounter(
      { deadTimeUs: 0, deviceTimeMs: 0 },
      { deadTimeUs: 5_000_000, deviceTimeMs: 1_000 },
    );
    expect(r.status).toBe("invalid");
    expect(r.reset).toBe(false);
  });
});

describe("liveMsForMinute", () => {
  it("rejects fractions outside [0, 1)", () => {
    expect(() => liveMsForMinute(1)).toThrow(RangeError);
    expect(() => liveMsForMinute(-0.1)).toThrow(RangeError);
    expect(liveMsForMinute(0)).toBe(60_000);
  });
});

describe("correctRateByLiveTime", () => {
  it("σ by live time: N = 144, T_live = 59.9 s → σ(R) = 12/59.9 s⁻¹", () => {
    const r = correctRateByLiveTime(144, 59_900);
    expect(r.status).toBe("ok");
    expect(r.liveSource).toBe("counter");
    expect(r.rate as number).toBeCloseTo(144 / 59.9, 12);
    expect(r.sigma as number).toBeCloseTo(12 / 59.9, 12);
  });
  it("is invalid for impossible inputs", () => {
    expect(correctRateByLiveTime(1.5, 1000).status).toBe("invalid");
    expect(correctRateByLiveTime(10, 0).status).toBe("invalid");
    expect(correctRateByLiveTime(-1, 1000).rate).toBeUndefined();
  });
});

describe("correctRateByTau", () => {
  it("τ model: R = 2.4 s⁻¹, τ = 400 µs → R_true = 2.40231 s⁻¹", () => {
    const r = correctRateByTau(2.4, 0.1, 400e-6);
    expect(r.status).toBe("ok");
    expect(r.liveSource).toBe("tau");
    expect(r.rate as number).toBeCloseTo(2.40231, 5);
  });
  it("propagates σ_R and σ_τ with (1 − Rτ)² in both terms", () => {
    const r = correctRateByTau(2.4, 0.1, 400e-6, 100e-6);
    const d2 = (1 - 2.4 * 400e-6) ** 2;
    expect(r.sigma as number).toBeCloseTo(Math.hypot(0.1 / d2, (2.4 * 2.4 * 100e-6) / d2), 12);
  });
  it("Rτ ≥ 1 (R = 30 s⁻¹, τ = 50 ms) → invalid, no number", () => {
    const r = correctRateByTau(30, 1, 0.05);
    expect(r.status).toBe("invalid");
    expect(r.rate).toBeUndefined();
    expect(correctRateByTau(-1, 1, 0.05).status).toBe("invalid");
  });
});

describe("uncorrectedRate and minuteRate", () => {
  it("nominal live time: status uncorrected, no liveMs claimed", () => {
    const r = uncorrectedRate(144, 60_000);
    expect(r.status).toBe("uncorrected");
    expect(r.liveSource).toBe("nominal");
    expect(r.rate).toBeCloseTo(2.4, 12);
    expect("liveMs" in r).toBe(false);
    expect(uncorrectedRate(1.5, 60_000).status).toBe("invalid");
  });
  it("minuteRate follows the record's live source", () => {
    const base = { n: 144 } as never;
    expect(minuteRate({ ...(base as object), liveSource: "nominal" } as never).status).toBe(
      "uncorrected",
    );
    const c = minuteRate({ n: 144, liveSource: "counter", liveMs: 59_900 } as never);
    expect(c.status).toBe("ok");
    expect(c.liveSource).toBe("counter");
    expect(c.rate as number).toBeCloseTo(144 / 59.9, 12);
    const t = minuteRate({ n: 144, liveSource: "tau", liveMs: 59_990 } as never);
    expect(t.liveSource).toBe("tau");
  });
});
