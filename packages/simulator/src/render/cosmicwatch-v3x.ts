/**
 * CosmicWatch v3X renderer, official column order (SERIAL-FORMATS §0):
 * `Event, Timestamp[s], Flag(coinc 0/1), ADC[12b], SiPM[mV], Deadtime[s] (cumulative), Temp[C],
 * Press[Pa]`, tab-separated; accelerometer/gyroscope columns optional zeros.
 */
import type { DeviceConfig } from "../config.js";
import type { RecordedEvent } from "../scenario.js";
import { adcCounts, counterMs } from "./common.js";

export const V3X_HEADER =
  "Event\tTimestamp[s]\tFlag\tADC[12b]\tSiPM[mV]\tDeadtime[s]\tTemp[C]\tPress[Pa]";
export const V3X_IMU_HEADER = "\tAccel_X\tAccel_Y\tAccel_Z\tGyro_X\tGyro_Y\tGyro_Z";

export interface V3xOptions {
  /** Append six zero accelerometer/gyroscope columns. */
  readonly imuZeros?: boolean;
}

export function v3xHeader(options: V3xOptions = {}): string {
  return options.imuZeros ? V3X_HEADER + V3X_IMU_HEADER : V3X_HEADER;
}

/** One data line without terminator. The dead-time column is always cumulative seconds. */
export function renderV3xLine(
  event: RecordedEvent,
  device: DeviceConfig,
  options: V3xOptions = {},
): string {
  const cols = [
    String(event.eventId),
    (counterMs(event, device) / 1000).toFixed(3),
    String(event.coincidenceFlag),
    String(adcCounts(event, device)),
    event.amplitude.toFixed(2),
    (event.cumulativeDeadMs / 1000).toFixed(6),
    event.temperatureC.toFixed(1),
    (event.pressureHpa * 100).toFixed(2),
  ];
  if (options.imuZeros) cols.push("0", "0", "0", "0", "0", "0");
  return cols.join("\t");
}
