import { describe, it, expect } from "vitest";
import { MinuteRecordSchema, RealtimeRecordSchema } from "./records.js";

const validMinute = {
  ts: 1_717_200_000_000,
  ec: 12,
  cc: 0,
  sm: 1.2,
  sx: 3.4,
  sn: 0.5,
  tp: 21.5,
  pr: 1013.2,
  dt: 4.6,
};

describe("MinuteRecordSchema", () => {
  it("accepts a valid canonical minute record", () => {
    expect(MinuteRecordSchema.parse(validMinute)).toMatchObject(validMinute);
  });

  it("treats derived fields as optional", () => {
    const r = MinuteRecordSchema.parse({ ...validMinute, ecDt: 12.1, ecCorr: 12.0, flux: 0.9 });
    expect(r.ecCorr).toBe(12.0);
  });

  it("rejects dead-time above 100%", () => {
    expect(MinuteRecordSchema.safeParse({ ...validMinute, dt: 101 }).success).toBe(false);
  });

  it("rejects negative counts", () => {
    expect(MinuteRecordSchema.safeParse({ ...validMinute, ec: -1 }).success).toBe(false);
  });

  it("enforces SiPM ordering sn <= sm <= sx", () => {
    expect(MinuteRecordSchema.safeParse({ ...validMinute, sn: 5, sm: 1, sx: 3 }).success).toBe(
      false,
    );
  });

  it("allows negative temperature", () => {
    expect(MinuteRecordSchema.safeParse({ ...validMinute, tp: -8.3 }).success).toBe(true);
  });

  it("rejects unknown keys (strict)", () => {
    expect(MinuteRecordSchema.safeParse({ ...validMinute, muons: 5 }).success).toBe(false);
  });
});

describe("RealtimeRecordSchema", () => {
  it("accepts a minimal event", () => {
    expect(RealtimeRecordSchema.parse({ ts: 1, sipmMv: 2.5 }).sipmMv).toBe(2.5);
  });

  it("rejects a negative SiPM amplitude", () => {
    expect(RealtimeRecordSchema.safeParse({ ts: 1, sipmMv: -1 }).success).toBe(false);
  });
});
