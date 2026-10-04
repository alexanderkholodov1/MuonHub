import { describe, expect, it } from "vitest";
import type { MinuteRecord } from "@muonhub/shared";
import {
  CANONICAL_SLIM_MINUTE_RECORD_FIELDS,
  toCanonicalSlimMinuteRecord,
} from "./slim-minute-record.js";
import { serializeMinuteRecord } from "./firebase-serializer.js";

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

describe("Firebase minute serializer", () => {
  it("stores only canonical slim minute fields", () => {
    const record: MinuteRecord = {
      ts: 1_717_200_000_000,
      ec: 12,
      cc: 0,
      sm: 5,
      sx: 9,
      sn: 2,
      tp: 21.5,
      pr: 1013.2,
      dt: 4.6,
      ecDt: 12.1,
      ecCorr: 12,
      flux: 0.9,
    };

    expect(serializeMinuteRecord(record)).toEqual(toCanonicalSlimMinuteRecord(record));
    expect(Object.keys(serializeMinuteRecord(record)).sort()).toEqual(
      [...CANONICAL_SLIM_MINUTE_RECORD_FIELDS].sort(),
    );
  });

  it("is materially smaller than the legacy full minute payload", () => {
    const record: MinuteRecord = {
      ts: 1_717_200_000_000,
      ec: 123.45,
      cc: 2,
      sm: 512.4,
      sx: 920.1,
      sn: 104.2,
      tp: 21.5,
      pr: 1013.2,
      dt: 4.6,
      ecDt: 124.01,
      ecCorr: 122.77,
      flux: 4.91,
    };
    const legacyPayload = {
      ...record,
      ts_iso: new Date(record.ts).toISOString(),
    };

    expect(jsonBytes(serializeMinuteRecord(record))).toBeLessThan(
      jsonBytes(legacyPayload) * 0.75,
    );
  });
});
