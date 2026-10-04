import { MinuteRecordSchema } from "@muonhub/shared";
import { describe, expect, it } from "vitest";
import { aggregateMinuteReadings } from "./aggregate.js";
import type { RawReading } from "./parsers/index.js";

const MINUTE_START = 1_717_200_000_000;

function reading(overrides: Partial<RawReading>): RawReading {
  return {
    timestamp: MINUTE_START,
    eventCount: 1,
    sipmMv: 10,
    tempC: 20,
    pressurePa: 101_000,
    deadtimePercent: 1,
    coincident: 0,
    sourceFormat: "json",
    ...overrides,
  };
}

function readingWithoutTemp(overrides: Partial<RawReading>): RawReading {
  const base = reading(overrides);
  const { tempC: _tempC, ...withoutTemp } = base;
  void _tempC;
  return withoutTemp;
}

describe("aggregateMinuteReadings", () => {
  it("produces a schema-valid MinuteRecord with rates and averaged measurements", () => {
    const record = aggregateMinuteReadings(
      [
        reading({ timestamp: MINUTE_START + 1_000, eventCount: 2, sipmMv: 10, coincident: 0 }),
        reading({
          timestamp: MINUTE_START + 20_000,
          eventCount: 4,
          sipmMv: 20,
          tempC: 24,
          pressurePa: 102_000,
          deadtimePercent: 3,
          coincident: 1,
        }),
      ],
      { minuteStartTs: MINUTE_START },
    );

    expect(MinuteRecordSchema.parse(record)).toEqual(record);
    expect(record).toEqual({
      ts: MINUTE_START,
      ec: 6,
      cc: 1,
      sm: 15,
      sx: 20,
      sn: 10,
      tp: 22,
      pr: 1_015,
      dt: 2,
    });
  });

  it("stores one-minute event-driven counts as per-minute event rates", () => {
    const record = aggregateMinuteReadings(
      [
        reading({ timestamp: MINUTE_START + 1_000, eventCount: 1, sipmMv: 10, coincident: 1 }),
        reading({ timestamp: MINUTE_START + 2_000, eventCount: 1, sipmMv: 20, coincident: 0 }),
        reading({ timestamp: MINUTE_START + 3_000, eventCount: 1, sipmMv: 30, coincident: 1 }),
      ],
      { minuteStartTs: MINUTE_START },
    );

    // Event and coincidence fields are count-per-minute rates; measurements stay averages.
    expect(record.ec).toBe(3);
    expect(record.cc).toBe(2);
    expect(record.sm).toBe(20);
    expect(record.tp).toBe(20);
    expect(record.pr).toBe(1_010);
  });

  it("doubles ec and cc when the number of one-minute events doubles", () => {
    const baseReadings = [
      reading({ timestamp: MINUTE_START + 1_000, eventCount: 1, sipmMv: 11, coincident: 1 }),
      reading({ timestamp: MINUTE_START + 2_000, eventCount: 1, sipmMv: 13, coincident: 0 }),
    ];

    const original = aggregateMinuteReadings(baseReadings, { minuteStartTs: MINUTE_START });
    const duplicated = aggregateMinuteReadings([...baseReadings, ...baseReadings], {
      minuteStartTs: MINUTE_START,
    });

    expect(original.ec).toBe(2);
    expect(duplicated.ec).toBe(4);
    expect(duplicated.ec).toBe(original.ec * 2);
    expect(duplicated.cc).toBe(original.cc * 2);
    expect(duplicated.tp).toBe(original.tp);
    expect(duplicated.pr).toBe(original.pr);
  });

  it("keeps partial field completeness rate-correct while averaging available environment fields", () => {
    const record = aggregateMinuteReadings(
      [
        readingWithoutTemp({ timestamp: MINUTE_START + 1_000, eventCount: 6 }),
        reading({ timestamp: MINUTE_START + 2_000, eventCount: 6, tempC: 30 }),
      ],
      { minuteStartTs: MINUTE_START },
    );

    expect(record.ec).toBe(12);
    expect(record.tp).toBe(30);
  });

  it("rejects readings outside the minute window instead of silently filtering them", () => {
    expect(() =>
      aggregateMinuteReadings(
        [
          reading({ timestamp: MINUTE_START + 1_000 }),
          reading({ timestamp: MINUTE_START + 60_000 }),
        ],
        { minuteStartTs: MINUTE_START },
      ),
    ).toThrow("outside the requested minute window");
  });
});
