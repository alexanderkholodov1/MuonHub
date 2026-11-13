import { describe, expect, it } from "vitest";
import { latestSessionKey, parseEvents, parseMinutes } from "./live-feed";
import { hourStats, niceTicks, clockTime } from "./hour-stats";
import { lensed, sampleZenith, screenDirection, slabFor, trackThrough } from "./field-math";
import { QUIET_AFTER_MS, replayDelayFor, statusFor } from "./useLiveFeed";

describe("live source parsing", () => {
  it("keeps valid events, oldest first, and skips malformed ones", () => {
    const raw = {
      "1794573206061": { ts: 1794573206061, sipm: 0.4, temp: 30.9 },
      "1794573205392": { ts: 1794573205392, sipm: 1.4 },
      bad: { ts: "x" },
      nothing: null,
    };
    expect(parseEvents(raw)).toEqual([
      { ts: 1794573205392, amplitude: 1.4 },
      { ts: 1794573206061, amplitude: 0.4 },
    ]);
    expect(parseEvents(null)).toEqual([]);
  });

  it("reads minutes keyed by epoch seconds, converting pressure to hPa", () => {
    const raw = {
      "1794573120": { ec: 153, pr: 76661, tp: 30.9 },
      "1794573060": { ec: 156 },
      "not-a-time": { ec: 1 },
      "1794573180": { ec: -1 },
    };
    expect(parseMinutes(raw)).toEqual([
      { start: 1794573060000, count: 156, pressureHpa: null, temperatureC: null },
      { start: 1794573120000, count: 153, pressureHpa: 766.61, temperatureC: 30.9 },
    ]);
  });

  it("picks the most recent session by its time, not by string order", () => {
    expect(latestSessionKey({ session_999: true, session_1793377005775: true, other: true })).toBe(
      "session_1793377005775",
    );
    expect(latestSessionKey({})).toBeNull();
  });
});

describe("hour statistics", () => {
  const minute = (start: number, count: number) => ({
    start,
    count,
    pressureHpa: null,
    temperatureC: null,
  });

  it("gives the mean with its Poisson uncertainty √ΣN / minutes and the chance spread √mean", () => {
    const stats = hourStats([minute(0, 100), minute(60_000, 144), minute(180_000, 156)]);
    expect(stats).not.toBeNull();
    expect(stats?.minutes).toBe(3);
    expect(stats?.mean).toBeCloseTo(400 / 3, 10);
    expect(stats?.meanUncertainty).toBeCloseTo(20 / 3, 10);
    expect(stats?.chanceSpread).toBeCloseTo(Math.sqrt(400 / 3), 10);
    expect([stats?.min, stats?.max]).toEqual([100, 156]);
    expect(stats?.last.count).toBe(156);
    expect(hourStats([])).toBeNull();
  });

  it("chooses round ticks, at least three across a typical range", () => {
    expect(niceTicks(103, 176)).toEqual([120, 140, 160]);
    expect(niceTicks(0, 1).length).toBeGreaterThanOrEqual(3);
    expect(niceTicks(5, 5)).toEqual([5]);
  });

  it("shows clock time in the station's time zone", () => {
    expect(clockTime(Date.UTC(2026, 10, 13, 12, 32), "America/Guayaquil")).toBe("07:32");
  });
});

describe("feed status", () => {
  it("is live while events are recent and quiet after a few minutes without any", () => {
    expect(statusFor(1_000_000, 1_000_000 + QUIET_AFTER_MS)).toBe("live");
    expect(statusFor(1_000_000, 1_000_001 + QUIET_AFTER_MS)).toBe("quiet");
    expect(statusFor(null, 0)).toBe("quiet");
  });

  it("replays behind the polling, within a bound", () => {
    expect(replayDelayFor(1_000, 1_000)).toBe(15_000);
    expect(replayDelayFor(1_000, 6_000)).toBe(20_000);
    expect(replayDelayFor(0, 10_000_000)).toBe(60_000);
  });
});

describe("hero geometry", () => {
  it("lenses like a point mass: far points stay, near points move out to the Einstein ring", () => {
    const lens = { x: 0, y: 0 };
    const far = lensed({ x: 1000, y: 0 }, lens, 10);
    expect(far.x).toBeCloseTo(1000.1, 1);
    expect(far.y).toBe(0);
    const behind = lensed({ x: 0, y: 0 }, lens, 10);
    expect(Math.hypot(behind.x, behind.y)).toBeCloseTo(10, 10);
    const near = lensed({ x: 3, y: 4 }, lens, 10);
    expect(Math.hypot(near.x, near.y)).toBeCloseTo((5 + Math.sqrt(25 + 400)) / 2, 10);
    expect(lensed({ x: 3, y: 4 }, lens, 0)).toEqual({ x: 3, y: 4 });
  });

  it("draws zenith angles with cos θ = (1 − u)^¼, mostly near the vertical", () => {
    expect(sampleZenith(0)).toBe(0);
    expect(Math.cos(sampleZenith(0.5))).toBeCloseTo(Math.pow(0.5, 0.25), 10);
    expect(sampleZenith(1)).toBeLessThan(Math.PI / 2);
    // Median zenith angle for cos³θ·sinθ: cos θ = 0.5^¼ → about 33°.
    expect((sampleZenith(0.5) * 180) / Math.PI).toBeCloseTo(32.8, 1);
  });

  it("builds tracks that enter above the top edge and cross the detector", () => {
    const direction = screenDirection(Math.PI / 6, 0);
    expect(Math.hypot(direction.x, direction.y)).toBeCloseTo(1, 10);
    const crossing = { x: 500, y: 300 };
    const track = trackThrough(crossing, direction);
    expect(track.start.y).toBe(-24);
    const at = {
      x: track.start.x + direction.x * track.toCrossing,
      y: track.start.y + direction.y * track.toCrossing,
    };
    expect(at.x).toBeCloseTo(500, 9);
    expect(at.y).toBeCloseTo(300, 9);
  });

  it("places the detector beside the text on wide screens and above it on narrow ones", () => {
    expect(slabFor(1366, 900).center).toEqual({ x: 1011, y: 540 });
    const phone = slabFor(390, 1100);
    expect(phone.center.x).toBe(195);
    expect(phone.center.y).toBeLessThanOrEqual(260);
  });
});
