import { describe, expect, it } from "vitest";
import { deviceElapsedMs, hostReceivedAt, wrapCounter } from "./clock.js";
import { parseScenario } from "./config.js";
import { expectedAccidentalRate, flaggedCount, trueCoincidenceCount } from "./assembly.js";
import { groundTruth } from "./ground-truth.js";
import { Rng } from "./rng.js";
import { deviceCounterMs, hostTimeFor, simulate } from "./scenario.js";
import { testDevice, testScenario } from "./test-helpers.js";

const DAY = 86_400_000;

describe("clock (CA7)", () => {
  it("32-bit counter rolls over at 4 294 967 296 ms", () => {
    expect(wrapCounter(4_294_967_296)).toBe(0);
    expect(wrapCounter(4_294_967_295)).toBe(4_294_967_295);
    expect(wrapCounter(4_294_967_296 + 1500)).toBe(1500);
    expect(wrapCounter(-1)).toBe(4_294_967_295);
    expect(wrapCounter(300, 8)).toBe(44);
  });

  it("a scenario starting near the limit wraps in the rendered counter", () => {
    const sim = simulate(
      testScenario(
        [
          testDevice({
            rate: { kind: "totalTriggerRate", ratePerS: 20 },
            clock: { offsetMs: 4_294_967_296 - 5000 },
          }),
        ],
        { durationMs: 20_000 },
      ),
    );
    const readings = sim.devices[0]?.recorded.map((e) => deviceCounterMs(e)) ?? [];
    expect(readings.length).toBeGreaterThan(100);
    const wrapIdx = readings.findIndex((v, i) => i > 0 && v < (readings[i - 1] ?? 0));
    expect(wrapIdx).toBeGreaterThan(0);
    expect(readings[wrapIdx] ?? 1e9).toBeLessThan(1000);
    expect(sim.devices[0]?.recorded[wrapIdx]?.deviceMs).toBeGreaterThan(4_294_967_296);
  });

  it("50 ppm drift gives 4.32 s per day (±1 %)", () => {
    const off = deviceElapsedMs(DAY, 0, 0, { driftPpm: 50 }) - DAY;
    expect(Math.abs(off - 4320) / 4320).toBeLessThan(0.01);
  });

  it("jitter has the configured standard deviation; host latency exceeds its mean", () => {
    const rng = new Rng(3);
    const xs = Array.from(
      { length: 50_000 },
      () => deviceElapsedMs(1000, 0, 0, { jitterMs: 2 }, rng) - 1000,
    );
    const sd = Math.sqrt(xs.reduce((a, b) => a + b * b, 0) / xs.length);
    expect(Math.abs(sd - 2)).toBeLessThan(0.05);
    const lat = Array.from({ length: 1000 }, () =>
      hostReceivedAt(0, { meanMs: 5, jitterMs: 10 }, rng),
    );
    expect(Math.min(...lat)).toBeGreaterThanOrEqual(5);
    expect(Math.max(...lat)).toBeGreaterThan(15); // can exceed 10 ms
    expect(hostTimeFor(0, testDevice(), rng)).toBeGreaterThanOrEqual(2);
  });
});

describe("scenario simulation", () => {
  it("rate, ground truth consistency, dead time, noise triggers, saturation", () => {
    const sim = simulate(
      testScenario(
        [
          testDevice({
            rate: { kind: "totalTriggerRate", ratePerS: 50 },
            deadTimeUs: 4000,
            noiseTriggers: { ratePerS: 5, meanAmplitude: 30 },
            amplitude: {
              mpv: 100,
              width: 10,
              unit: "mV",
              noiseSigma: 0,
              saturation: { value: 110, unit: "mV" },
            },
          }),
        ],
        { durationMs: 3_600_000 },
      ),
    );
    const [gt] = groundTruth(sim);
    const c = gt?.counts;
    expect(c).toBeDefined();
    if (!c) return;
    expect(c.arrived).toBe(c.recorded + c.lostToDeadTime);
    expect(c.noise).toBeGreaterThan(0);
    expect(c.saturated).toBeGreaterThan(0);
    // arrivals include noise triggers: n = 55 s⁻¹, loss fraction nτ/(1+nτ) = 0.22/1.22
    const p = (55 * 0.004) / (1 + 55 * 0.004);
    expect(Math.abs(c.lostToDeadTime / c.arrived - p)).toBeLessThan(
      4 * Math.sqrt((p * (1 - p)) / c.arrived),
    );
    // cumulative dead-time counter / elapsed device time equals the ground-truth dead fraction
    const rec = sim.devices[0]?.recorded ?? [];
    const last = rec[rec.length - 1];
    const deadFraction = ((last?.cumulativeDeadMs ?? 0) + 4) / (last?.deviceMs ?? 1);
    expect(Math.abs(deadFraction - p)).toBeLessThan(0.01);
    // per-minute truth
    const iv = gt?.intervals ?? [];
    expect(iv.length).toBe(60);
    expect(iv[10]?.complete).toBe(true);
    expect(iv[10]?.pressureHpa).toBeCloseTo(768, 9);
    expect(iv[10]?.liveMs).toBeLessThan(60_000);
    expect(iv[10]?.trueRatePerS).toBe(50);
  });

  it("rate modulation by pressure shows in the truth (β)", () => {
    const sim = simulate(
      testScenario([testDevice({ rate: { kind: "totalTriggerRate", ratePerS: 10 } })], {
        durationMs: 120_000,
        pressure: {
          kind: "samples",
          samples: [
            { tMs: 0, hPa: 768 },
            { tMs: 120_000, hPa: 788 },
          ],
        },
        betaPercentPerHpa: -1,
        p0Hpa: 768,
      }),
    );
    const iv = sim.devices[0]?.intervals ?? [];
    expect(iv[0]?.trueRatePerS ?? 0).toBeGreaterThan(iv[1]?.trueRatePerS ?? 1e9);
  });

  it("is deterministic (CA1) and seed-dependent", () => {
    const cfg = testScenario([testDevice()], { durationMs: 300_000 });
    const a = simulate(cfg).devices[0]?.recorded;
    const b = simulate(cfg).devices[0]?.recorded;
    const c = simulate({ ...cfg, seed: 8 }).devices[0]?.recorded;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("validates configuration at the boundary", () => {
    expect(() => parseScenario({})).toThrow();
    expect(() => parseScenario({ ...testScenario([testDevice()]), extra: 1 })).toThrow();
    expect(() => parseScenario({ ...testScenario([testDevice()]), durationMs: -1 })).toThrow();
    expect(() =>
      parseScenario({
        ...testScenario([testDevice(), testDevice({ id: "d2" })]),
        coincidence: { fractions: [], halfWindowUs: 30 },
      }),
    ).toThrow(/pair/);
  });

  it("rejects a coincidence fraction that exceeds the lower device's rate", () => {
    expect(() =>
      simulate(
        testScenario(
          [
            testDevice({ rate: { kind: "totalTriggerRate", ratePerS: 10 } }),
            testDevice({ id: "d2", rate: { kind: "totalTriggerRate", ratePerS: 1 } }),
          ],
          { coincidence: { fractions: [0.5], halfWindowUs: 30 } },
        ),
      ),
    ).toThrow(RangeError);
  });
});

describe("coincidences (CA6)", () => {
  it("true-coincidence count matches the configured fraction within 3σ", () => {
    const f = 0.3;
    const sim = simulate(
      testScenario(
        [
          testDevice({ rate: { kind: "totalTriggerRate", ratePerS: 20 } }),
          testDevice({ id: "d2", rate: { kind: "totalTriggerRate", ratePerS: 20 } }),
        ],
        { durationMs: 3_000_000, coincidence: { fractions: [f], halfWindowUs: 30 } },
      ),
    );
    const { upperEvents, shared } = trueCoincidenceCount(sim);
    expect(upperEvents).toBeGreaterThan(50_000);
    expect(Math.abs(shared - f * upperEvents)).toBeLessThan(
      3 * Math.sqrt(upperEvents * f * (1 - f)),
    );
    // shared events have identical true times, and both devices carry the hardware flag for them
    expect(flaggedCount(sim, 0)).toBeGreaterThanOrEqual(shared * 0.99);
    // lower device total rate is preserved: 20 s⁻¹ × 3000 s
    const lowerN = sim.devices[1]?.truth.length ?? 0;
    expect(Math.abs(lowerN - 60_000)).toBeLessThan(3 * Math.sqrt(60_000));
  });

  it("accidentals match 2·τ_c·R₁·R₂ within 3σ at raised rates (zero true fraction)", () => {
    const tauC = 1e-3;
    const T = 10_000;
    const sim = simulate(
      testScenario(
        [
          testDevice({ rate: { kind: "totalTriggerRate", ratePerS: 100 } }),
          testDevice({ id: "d2", rate: { kind: "totalTriggerRate", ratePerS: 100 } }),
        ],
        {
          durationMs: T * 1000,
          stepMs: 10_000,
          coincidence: { fractions: [0], halfWindowUs: tauC * 1e6 },
        },
      ),
    );
    const a = (sim.devices[0]?.recorded ?? []).map((e) => e.trueMs);
    const b = (sim.devices[1]?.recorded ?? []).map((e) => e.trueMs);
    const w = tauC * 1000;
    let pairs = 0;
    let lo = 0;
    for (const t of a) {
      while (lo < b.length && (b[lo] ?? 0) < t - w) lo++;
      for (let j = lo; j < b.length && (b[j] ?? 0) <= t + w; j++) pairs++;
    }
    const expected = expectedAccidentalRate(tauC, a.length / T, b.length / T) * T;
    expect(expected).toBeGreaterThan(1.9e5);
    // variance of a pair count of two Poisson streams exceeds N slightly (overlapping windows)
    expect(Math.abs(pairs - expected)).toBeLessThan(3 * Math.sqrt(expected * (1 + 4 * tauC * 100)));
    // the hardware flag agrees with "a partner within the half-window"
    const expectedFlagged = a.length * (1 - Math.exp(-2 * tauC * (b.length / T)));
    expect(Math.abs(flaggedCount(sim, 0) - expectedFlagged)).toBeLessThan(
      4 * Math.sqrt(expectedFlagged),
    );
    expect(flaggedCount(sim, 1)).toBeGreaterThan(0);
  }, 120_000);
});

describe("interruptions (CA8)", () => {
  const start = 0;
  const cfg = testScenario(
    [
      testDevice({
        rate: { kind: "totalTriggerRate", ratePerS: 20 },
        deadTimeUs: 1000,
        disruptions: {
          gaps: [
            { startMs: 100_000, endMs: 130_000, kind: "usb" },
            { startMs: 300_000, endMs: 330_000, kind: "power" },
          ],
          resets: [200_000],
        },
      }),
    ],
    { startMs: start, durationMs: 400_000 },
  );

  it("USB gap: device keeps recording, but no lines are delivered in the window", () => {
    const dev = simulate(cfg).devices[0];
    const inGap = (dev?.recorded ?? []).filter((e) => e.trueMs >= 100_000 && e.trueMs < 130_000);
    expect(inGap.length).toBeGreaterThan(100);
    expect(inGap.every((e) => !e.delivered)).toBe(true);
    expect(dev?.truth.filter((t) => t.undelivered).length).toBe(inGap.length);
    // the event counter is continuous across a USB gap
    const ids = (dev?.recorded ?? []).filter((e) => e.sessionIndex === 0).map((e) => e.eventId);
    expect(ids).toEqual(ids.map((_, i) => i + 1));
  });

  it("reset and power loss start new sessions: counter, clock, and dead time restart", () => {
    const dev = simulate(cfg).devices[0];
    expect(dev?.sessions.map((s) => s.endReason)).toEqual(["reset", "powerLoss", "end"]);
    expect(dev?.sessions[2]?.startTrueMs).toBe(330_000);
    for (const idx of [1, 2]) {
      const first = (dev?.recorded ?? []).find((e) => e.sessionIndex === idx);
      expect(first?.eventId).toBe(1);
      expect(first?.cumulativeDeadMs).toBe(0);
      const s = dev?.sessions[idx];
      expect(first?.deviceMs ?? 1e9).toBeLessThan((first?.trueMs ?? 0) - (s?.startTrueMs ?? 0) + 1);
      expect(first?.deviceMs ?? -1).toBeGreaterThanOrEqual(0);
    }
    // powered-off arrivals are flagged in the truth and produce no recorded events
    const off = (dev?.truth ?? []).filter((t) => t.off);
    expect(off.length).toBeGreaterThan(100);
    expect((dev?.recorded ?? []).some((e) => e.trueMs >= 300_000 && e.trueMs < 330_000)).toBe(
      false,
    );
  });
});
