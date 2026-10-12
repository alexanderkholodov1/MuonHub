/** Shared helpers for the line renderers (spec 0086 FR8). */
import type { DeviceConfig, DeadTimeColumn } from "../config.js";
import { wrapCounter } from "../clock.js";
import type { RecordedEvent } from "../scenario.js";

/** Default ADC scale: a 12-bit converter spanning 3.3 V. */
export const DEFAULT_ADC_MV_PER_COUNT = 3300 / 4096;
export const ADC_MAX = 4095;

export function adcCounts(event: RecordedEvent, device: DeviceConfig): number {
  const scale = device.render?.adcMvPerCount ?? DEFAULT_ADC_MV_PER_COUNT;
  return Math.min(ADC_MAX, Math.max(0, Math.round(event.amplitude / scale)));
}

/** Device counter reading (ms), wrapped to the configured counter width. */
export function counterMs(event: RecordedEvent, device: DeviceConfig): number {
  return wrapCounter(event.deviceMs, device.clock?.rolloverBits ?? 32);
}

/** Value of a dead-time column for `column` semantics (cumulative counters or per-event). */
export function deadTimeValue(
  event: RecordedEvent,
  device: DeviceConfig,
  column: DeadTimeColumn,
): number {
  switch (column) {
    case "cumulativeUs":
      return Math.round(event.cumulativeDeadMs * 1000);
    case "cumulativeMs":
      return Number(event.cumulativeDeadMs.toFixed(3));
    case "cumulativeS":
      return Number((event.cumulativeDeadMs / 1000).toFixed(6));
    case "perEventUs":
      return Math.round(device.deadTimeUs);
  }
}
