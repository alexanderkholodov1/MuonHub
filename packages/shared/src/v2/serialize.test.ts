import { describe, expect, it } from "vitest";
import { deserializeMinute, minuteKey, serializeMinute } from "./serialize.js";
import type { MinuteRecord } from "./records.js";

/** Deterministic PRNG (mulberry32) for the property test. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomMinute(rand: () => number, i: number): MinuteRecord {
  const n = rand() < 0.05 ? 0 : Math.floor(rand() * 400);
  const liveSource = (["counter", "tau", "nominal"] as const)[Math.floor(rand() * 3)]!;
  const record: MinuteRecord = {
    schemaVersion: 2,
    ts: Date.UTC(2026, 0, 1) + i * 60_000,
    sessionId: `s${Math.floor(rand() * 10)}`,
    n,
    liveSource,
    quality: { eventIdGaps: Math.floor(rand() * 3), clockAnomalies: Math.floor(rand() * 2) },
  };
  if (n > 0) {
    const min = rand() * 10;
    const max = min + 1 + rand() * 200;
    record.amplitude = {
      min,
      max,
      mean: min + rand() * (max - min),
      unit: rand() < 0.5 ? "mV" : "adc",
    };
  }
  if (liveSource !== "nominal") record.liveMs = 59_000 + rand() * 1_000;
  if (liveSource === "counter") record.deadMs = 60_000 - (record.liveMs ?? 60_000);
  if (rand() < 0.7) record.pressureHpa = 750 + rand() * 30;
  if (rand() < 0.8) record.temperatureC = 15 + rand() * 20;
  if (rand() < 0.3) record.coincidences = Math.floor(rand() * 20);
  return record;
}

describe("compact minute serializer (CA3)", () => {
  it("round-trips 10 000 generated records losslessly", () => {
    const rand = mulberry32(20261007);
    for (let i = 0; i < 10_000; i++) {
      const record = randomMinute(rand, i);
      const { key, value } = serializeMinute(record);
      expect(deserializeMinute(key, value)).toEqual(record);
    }
  });
  it("omits absent fields instead of writing zeros", () => {
    const { value } = serializeMinute({
      schemaVersion: 2,
      ts: Date.UTC(2026, 0, 1),
      sessionId: "s",
      n: 0,
      liveSource: "nominal",
      quality: { eventIdGaps: 0, clockAnomalies: 0 },
    });
    expect(Object.keys(value).sort()).toEqual(["l", "n", "qc", "qg", "s", "v"]);
  });
  it("keys sort in time order", () => {
    expect(minuteKey(60_000) < minuteKey(1_791_037_620_000)).toBe(true);
    expect(minuteKey(1_791_037_620_000)).toHaveLength(13);
  });
});
