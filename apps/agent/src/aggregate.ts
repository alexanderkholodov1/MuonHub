import { MinuteRecordSchema, type MinuteRecord } from "@muonhub/shared";
import type { RawReading } from "./parsers/index.js";

const MINUTE_MS = 60_000;

export interface AggregateMinuteOptions {
  minuteStartTs?: number;
}

function average(total: number, count: number, fieldName: string): number {
  if (count === 0) {
    throw new Error(`Cannot aggregate minute record without ${fieldName} readings.`);
  }

  return total / count;
}

function minuteStart(timestamp: number): number {
  return Math.floor(timestamp / MINUTE_MS) * MINUTE_MS;
}

export function aggregateMinuteReadings(
  readings: readonly RawReading[],
  options: AggregateMinuteOptions = {},
): MinuteRecord {
  if (readings.length === 0) {
    throw new Error("Cannot aggregate an empty minute window.");
  }

  const ts = options.minuteStartTs ?? minuteStart(readings[0]?.timestamp ?? 0);
  const windowEnd = ts + MINUTE_MS;
  const windowMinutes = (windowEnd - ts) / MINUTE_MS;

  let eventTotal = 0;
  let coincidenceTotal = 0;
  let sipmTotal = 0;
  let sipmMin = Number.POSITIVE_INFINITY;
  let sipmMax = Number.NEGATIVE_INFINITY;
  let tempTotal = 0;
  let tempCount = 0;
  let pressurePaTotal = 0;
  let pressureCount = 0;
  let deadtimeTotal = 0;
  let deadtimeCount = 0;

  for (const reading of readings) {
    if (reading.timestamp < ts || reading.timestamp >= windowEnd) {
      throw new Error("Cannot aggregate readings from outside the requested minute window.");
    }

    eventTotal += reading.eventCount;
    coincidenceTotal += reading.coincident;
    sipmTotal += reading.sipmMv;
    sipmMin = Math.min(sipmMin, reading.sipmMv);
    sipmMax = Math.max(sipmMax, reading.sipmMv);

    if (reading.tempC !== undefined) {
      tempTotal += reading.tempC;
      tempCount += 1;
    }

    if (reading.pressurePa !== undefined) {
      pressurePaTotal += reading.pressurePa;
      pressureCount += 1;
    }

    if (reading.deadtimePercent !== undefined) {
      deadtimeTotal += reading.deadtimePercent;
      deadtimeCount += 1;
    }
  }

  // ec/cc are event rates (counts per minute); measurement fields remain time-averages.
  return MinuteRecordSchema.parse({
    ts,
    ec: eventTotal / windowMinutes,
    cc: coincidenceTotal / windowMinutes,
    sm: average(sipmTotal, readings.length, "SiPM amplitude"),
    sx: sipmMax,
    sn: sipmMin,
    tp: average(tempTotal, tempCount, "temperature"),
    pr: average(pressurePaTotal, pressureCount, "pressure") / 100,
    dt: average(deadtimeTotal, deadtimeCount, "dead-time"),
  });
}
