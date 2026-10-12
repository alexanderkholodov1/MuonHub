import { describe, expect, it } from "vitest";
import { v2 } from "@muonhub/shared";
import { MinuteAggregator, type AggregatorOutput } from "./aggregator.js";
import { buildHourEntry } from "./summary.js";
import type { MinuteRow } from "../store/types.js";
import type { ParsedEvent } from "../parsing/parser.js";

const T0 = Date.UTC(2026, 0, 1, 0, 0, 0);

function ev(i: number, extra: Partial<ParsedEvent> = {}): ParsedEvent {
  return {
    eventId: i,
    deviceTimeMs: i * 1000,
    deadTimeUs: i * 200,
    amplitude: { value: 100 + (i % 7), unit: "mV" },
    temperatureC: 24,
    pressureHpa: 768,
    ...extra,
  };
}

/** One event per second starting `offsetS` after T0. */
function run(agg: MinuteAggregator, fromS: number, toS: number, start = 0): AggregatorOutput[] {
  const out: AggregatorOutput[] = [];
  for (let s = fromS; s < toS; s++) out.push(...agg.add(T0 + s * 1000, ev(start + s)));
  return out;
}
const minutes = (o: AggregatorOutput[]) => o.filter((x) => x.kind === "minute");
const discards = (o: AggregatorOutput[]) => o.filter((x) => x.kind === "discard");

function make(type: v2.DeviceType = v2.MUNRA): MinuteAggregator {
  const a = new MinuteAggregator({ deviceType: type });
  a.startSession("sess1");
  return a;
}

describe("MinuteAggregator (CA2)", () => {
  it("discards the partial first minute and emits only complete minutes", () => {
    const a = make();
    // starts at 00:00:30 -> first minute partial; completes 00:01 and 00:02 once 00:03:00 line arrives
    const out = run(a, 30, 185);
    expect(discards(out)).toHaveLength(1);
    expect(discards(out)[0]).toMatchObject({ ts: T0, reason: "partial" });
    const mins = minutes(out);
    expect(mins.map((m) => (m.kind === "minute" ? m.record.ts : 0))).toEqual([
      T0 + 60_000,
      T0 + 120_000,
    ]);
    for (const m of mins) {
      if (m.kind !== "minute") continue;
      expect(m.record.n).toBe(60);
      expect(m.record.liveSource).toBe("counter");
      expect(m.record.liveMs).toBeCloseTo(60_000 * (1 - 0.2 / 1000), 3); // 200 us per second
      expect(m.record.deadMs).toBeCloseTo(12, 6);
      expect(m.record.amplitude?.unit).toBe("mV");
    }
  });

  it("never emits the minute in progress; end() discards it", () => {
    const a = make();
    const out = run(a, 0, 90);
    expect(minutes(out)).toHaveLength(0);
    expect(a.end()).toEqual([{ kind: "discard", ts: T0 + 60_000, reason: "end" }]);
    expect(a.end()).toEqual([]);
  });

  it("emits genuine zero-count minutes between lines inside the silence window, with no amplitude", () => {
    const a = make();
    const out = [
      ...run(a, 0, 60),
      ...a.add(T0 + 60_000 + 59_000, ev(60)),
      ...a.add(T0 + 3 * 60_000 + 5_000, ev(61)),
    ];
    const mins = minutes(out);
    // minute 0 partial (discarded); minute 1 has one event; minute 2 is empty
    expect(mins).toHaveLength(2);
    const empty = mins[1];
    expect(empty?.kind === "minute" && empty.record).toMatchObject({
      ts: T0 + 120_000,
      n: 0,
      liveSource: "nominal",
    });
    expect(empty?.kind === "minute" && empty.record.amplitude).toBeUndefined();
    expect(empty?.kind === "minute" && "liveMs" in empty.record).toBe(false);
  });

  it("a gap (long silence) discards the minute in progress and the next minute starts partial", () => {
    const a = make();
    run(a, 0, 100);
    expect(a.gap()).toEqual([{ kind: "discard", ts: T0 + 60_000, reason: "gap" }]);
    const out = [
      ...a.add(T0 + 700_000, ev(200)),
      ...a.add(T0 + 760_000, ev(201)),
      ...a.add(T0 + 830_000, ev(202)),
    ];
    expect(discards(out)).toHaveLength(1);
    expect(minutes(out)).toHaveLength(1);
  });

  it("counts event-ID gaps as missing IDs without adding them to n", () => {
    const a = make();
    const out: AggregatorOutput[] = [];
    for (let s = 0; s < 190; s++) {
      if (s === 100 || s === 101) continue; // two lost lines in minute 1
      out.push(...a.add(T0 + s * 1000, ev(s)));
    }
    const m1 = minutes(out)[0];
    expect(m1?.kind === "minute" && m1.record.n).toBe(58);
    expect(m1?.kind === "minute" && m1.record.quality.eventIdGaps).toBe(2);
  });

  it("omits temperature and pressure when the device reports no valid reading (absent is not zero)", () => {
    const a = make();
    const out: AggregatorOutput[] = [];
    for (let s = 0; s < 130; s++) {
      const noTemp: ParsedEvent = ev(s, { pressureHpa: 0 });
      delete noTemp.temperatureC;
      out.push(...a.add(T0 + s * 1000, noTemp));
    }
    const m = minutes(out)[0];
    expect(m?.kind === "minute" && m.record.temperatureC).toBeUndefined();
    expect(m?.kind === "minute" && m.record.pressureHpa).toBeUndefined();
  });

  it("uses tau for a device without a counter and nominal when no tau is declared", () => {
    const tauType: v2.DeviceType = {
      ...v2.MUNRA,
      deadTimeSemantics: { kind: "none" },
      defaults: { tauUs: 200 },
    };
    const a = make(tauType);
    const out = run(a, 0, 130);
    const m = minutes(out)[0];
    expect(m?.kind === "minute" && m.record.liveSource).toBe("tau");
    expect(m?.kind === "minute" && m.record.liveMs).toBeCloseTo(60_000 - (60 * 200) / 1000, 6);
    const nominalType: v2.DeviceType = {
      ...v2.MUNRA,
      deadTimeSemantics: { kind: "none" },
      defaults: {},
    };
    const b = make(nominalType);
    const m2 = minutes(run(b, 0, 130))[0];
    expect(m2?.kind === "minute" && m2.record.liveSource).toBe("nominal");
  });

  it("builds histograms in the device type's fixed bins with saturated events separate", () => {
    const a = make(v2.COSMICWATCH_V3X);
    const out: AggregatorOutput[] = [];
    for (let s = 0; s < 130; s++) {
      const amp = s % 10 === 0 ? 190 : 100 + (s % 5);
      out.push(...a.add(T0 + s * 1000, ev(s, { amplitude: { value: amp, unit: "mV" } })));
    }
    const m = minutes(out)[0];
    expect(m?.kind).toBe("minute");
    if (m?.kind === "minute") {
      const total = (m.aux.histogram ?? []).reduce((x, y) => x + y, 0);
      expect(total + (m.aux.saturated ?? 0)).toBe(m.record.n);
      expect(m.aux.saturated).toBe(6);
      expect(m.aux.histogram).toHaveLength(100);
    }
  });
});

describe("hour summaries", () => {
  function rows(n: number, withHist = true): MinuteRow[] {
    return Array.from({ length: n }, (_, i) => ({
      streamId: "s",
      ts: T0 + i * 60_000,
      sessionId: "x",
      record: {
        schemaVersion: 2,
        ts: T0 + i * 60_000,
        sessionId: "x",
        n: 10,
        liveSource: "counter",
        liveMs: 59_900,
        deadMs: 100,
        amplitude: { mean: 100, min: 90, max: 110, unit: "mV" },
        pressureHpa: 768,
        quality: { eventIdGaps: 0, clockAnomalies: 0 },
      } as v2.MinuteRecord,
      aux: {
        pressureSum: 768,
        pressureCount: 1,
        ...(withHist ? { histogram: [10, ...new Array<number>(99).fill(0)], saturated: 0 } : {}),
      },
    }));
  }

  it("sums counts and live time, averages pressure as a time mean", () => {
    const e = buildHourEntry(T0, rows(3), 100);
    expect(e).toMatchObject({
      completeMinutes: 3,
      n: 30,
      liveSource: "counter",
      pressureMinutes: 3,
    });
    expect(e?.liveMs).toBeCloseTo(179_700);
    expect(e?.pressureHpa).toBeCloseTo(768);
    expect(e?.histogram?.[0]).toBe(30);
  });

  it("gives no entry for an hour with no complete minute", () => {
    expect(buildHourEntry(T0, [], 100)).toBeNull();
  });

  it("omits the histogram when minutes lack bins rather than inventing one", () => {
    expect(buildHourEntry(T0, rows(2, false), 100)?.histogram).toBeUndefined();
  });
});
