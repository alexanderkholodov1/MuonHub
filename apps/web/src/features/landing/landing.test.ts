import { describe, expect, it } from "vitest";
import { latestSessionKey, parseEvents, parseMinutes } from "./live-feed";
import { binMinutes, hourStats, logHistogram, niceTicks, clockTime } from "./hour-stats";
import { runs } from "./LineChart";
import { pulseHeight } from "./LiveVisuals";
import {
  arrivalDirection,
  clusterAround,
  facing,
  latLonToVector,
  localAxes,
  rotate,
  sampleZenith,
} from "./globe-math";
import {
  QUIET_AFTER_MS,
  mergeMinutes,
  replayDelayFor,
  replayedMinuteCount,
  statusFor,
} from "./useLiveFeed";
import { mergeByName, type V5Detector } from "./v5-detectors";

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
      "1794573120": { ec: 153, pr: 76661, tp: 30.9, sm: 2.4 },
      "1794573060": { ec: 156 },
      "not-a-time": { ec: 1 },
      "1794573180": { ec: -1 },
    };
    expect(parseMinutes(raw)).toEqual([
      {
        start: 1794573060000,
        count: 156,
        pressureHpa: null,
        temperatureC: null,
        sipmMeanMv: null,
        sipmMinMv: null,
        sipmMaxMv: null,
        deadTimePct: null,
      },
      {
        start: 1794573120000,
        count: 153,
        pressureHpa: 766.61,
        temperatureC: 30.9,
        sipmMeanMv: 2.4,
        sipmMinMv: null,
        sipmMaxMv: null,
        deadTimePct: null,
      },
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
    sipmMeanMv: null,
    sipmMinMv: null,
    sipmMaxMv: null,
    deadTimePct: null,
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

describe("running count of the replayed minute", () => {
  const events = [59_000, 60_000, 61_000, 75_000, 90_000].map((ts) => ({ ts, amplitude: 1 }));

  it("counts the detections of the minute being replayed that have already been replayed", () => {
    // Replay delay 15 s: at 95 s the replay shows 80 s, inside the minute that starts at 60 s.
    expect(replayedMinuteCount(events, 15_000, 95_000)).toEqual({ minuteStart: 60_000, count: 3 });
    expect(replayedMinuteCount(events, 15_000, 120_000)).toEqual({ minuteStart: 60_000, count: 4 });
    expect(replayedMinuteCount(events, null, 95_000)).toBeNull();
  });
});

describe("munhub-lab detectors", () => {
  const d = (
    key: string,
    name: string,
    lastDataTs: number | null,
    live = false,
    sessions = 1,
  ): V5Detector => ({
    key,
    name,
    live,
    lastDataTs,
    sessions,
    firstDataTs: lastDataTs === null ? null : lastDataTs - 1_000,
    recentCounts: [],
    lastSession: null,
  });

  it("merges profiles listed twice under one name, keeping the newest data", () => {
    const merged = mergeByName([d("HAYEK-1", "HAYEK-1", null), d("hayek_1", "HAYEK-1", 2_000)]);
    expect(merged).toEqual([
      {
        key: "hayek_1",
        name: "HAYEK-1",
        live: false,
        lastDataTs: 2_000,
        sessions: 2,
        firstDataTs: 1_000,
        recentCounts: [],
        lastSession: null,
      },
    ]);
  });

  it("lists live detectors first, then by their latest data", () => {
    const merged = mergeByName([
      d("a", "A", 1_000),
      d("b", "B", 3_000),
      d("c", "C", 500, true),
      d("z", "Z", null),
    ]);
    expect(merged.map((x) => x.name)).toEqual(["C", "B", "A", "Z"]);
  });
});

describe("globe geometry", () => {
  it("places latitude and longitude on the unit sphere, y toward the north pole", () => {
    expect(latLonToVector(0, 0)).toEqual([0, 0, 1]);
    const north = latLonToVector(90, 0);
    expect(north[1]).toBeCloseTo(1, 12);
    const east = latLonToVector(0, 90);
    expect(east[0]).toBeCloseTo(1, 12);
  });

  it("brings a place to the front (toward the camera at +z)", () => {
    const quito = latLonToVector(-0.2, -78.4);
    const front = rotate(quito, facing(-0.2, -78.4));
    expect(front[0]).toBeCloseTo(0, 12);
    expect(front[1]).toBeCloseTo(0, 12);
    expect(front[2]).toBeCloseTo(1, 12);
  });

  it("builds an orthonormal local frame, up being the place's normal", () => {
    const { east, north, up } = localAxes(-0.2, -78.4);
    const dot = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0);
    expect(dot(east, north)).toBeCloseTo(0, 12);
    expect(dot(east, up)).toBeCloseTo(0, 12);
    expect(dot(north, up)).toBeCloseTo(0, 12);
    expect(dot(north, [0, 1, 0])).toBeGreaterThan(0.99);
  });

  it("draws zenith angles with cos θ = (1 − u)^¼ and arrivals from above the horizon", () => {
    expect(sampleZenith(0)).toBe(0);
    expect((sampleZenith(0.5) * 180) / Math.PI).toBeCloseTo(32.8, 1);
    const axes = localAxes(-0.2, -78.4);
    const vertical = arrivalDirection(axes, 0, 1.3);
    expect(vertical.map((v, i) => v - (axes.up[i] ?? 0)).every((v) => Math.abs(v) < 1e-12)).toBe(
      true,
    );
    const slanted = arrivalDirection(axes, sampleZenith(0.99), 2.1);
    const height = slanted.reduce((sum, v, i) => sum + v * (axes.up[i] ?? 0), 0);
    expect(height).toBeGreaterThan(0);
  });

  it("rings a cluster of markers around a place", () => {
    expect(clusterAround(-0.2, -78.4, 1, 2)).toEqual([[-0.2, -78.4]]);
    const ring = clusterAround(-0.2, -78.4, 4, 2);
    expect(ring).toHaveLength(4);
    for (const [lat, lon] of ring) expect(Math.hypot(lat + 0.2, lon + 78.4)).toBeCloseTo(2, 2);
  });
});

describe("charts", () => {
  const m = (min: number, count: number, sipm: number | null = null) => ({
    start: min * 60_000,
    count,
    pressureHpa: 766,
    temperatureC: 30,
    sipmMeanMv: sipm,
    sipmMinMv: null,
    sipmMaxMv: null,
    deadTimePct: null,
  });

  it("bins minutes by the clock: mean per minute with √ΣN / minutes, gaps left out", () => {
    const binned = binMinutes([m(0, 100), m(1, 144), m(4, 120), m(10, 150, 2)], 5);
    expect(binned.rate.map((p) => p.t)).toEqual([0, 600_000]);
    const first = binned.rate[0];
    expect(first?.v).toBeCloseTo(364 / 3, 10);
    expect((first?.hi ?? 0) - (first?.v ?? 0)).toBeCloseTo(Math.sqrt(364) / 3, 10);
    expect(binned.sipm).toEqual([{ t: 600_000, v: 2 }]);
  });

  it("breaks a line where minutes are missing, never drawing a gap as a value", () => {
    const pts = [0, 1, 2, 6, 7].map((i) => ({ t: i * 60_000, v: 1 }));
    expect(runs(pts, 150_000).map((r) => r.length)).toEqual([3, 2]);
  });

  it("merges a day of minutes with the newest ones, by start", () => {
    const merged = mergeMinutes([m(0, 1), m(1, 2)], [m(1, 5), m(2, 3)], 2);
    expect(merged.map((x) => [x.start / 60_000, x.count])).toEqual([
      [1, 5],
      [2, 3],
    ]);
  });

  it("counts pulse sizes in logarithmic bins and maps sizes to bar heights", () => {
    const bins = logHistogram([0.3, 0.5, 1, 1, 50, 0, -1], 0.25, 100, 4);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(5);
    // Edges 0.25, 1.12, 5, 22.4, 100 mV: 0.3, 0.5, 1 and 1 fall in the first bin, 50 in the last.
    expect(bins.map((b) => b.count)).toEqual([4, 0, 0, 1]);
    expect(pulseHeight(0.3)).toBeCloseTo(0.15, 10);
    expect(pulseHeight(70)).toBeCloseTo(1, 10);
    expect(pulseHeight(1000)).toBe(1);
  });
});

describe("language", () => {
  it("follows the visitor's choice, else Spanish for any es-* browser language, else English", async () => {
    const { preferredLocale } = await import("@/i18n/LocaleProvider");
    expect(preferredLocale("en", ["es-EC"])).toBe("en");
    expect(preferredLocale(null, ["es-EC", "en"])).toBe("es");
    expect(preferredLocale(null, ["en-US", "es"])).toBe("es");
    expect(preferredLocale(null, ["en-US"])).toBe("en");
  });

  it("falls back to English for a string not yet translated", async () => {
    const { setActiveLocale, t } = await import("@/i18n/t");
    setActiveLocale("es");
    expect(t("landing.hero.title")).toBe("Rayos cósmicos, contados en vivo.");
    expect(t("app.name")).toBe("MuonHub");
    setActiveLocale("en");
    expect(t("landing.hero.title")).toBe("Cosmic rays, counted live.");
  });
});
