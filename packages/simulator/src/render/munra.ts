/**
 * MuNRa (USFQ) variant renderer: `Event TimeStamp[ms] ADC1 ADC2 SiPM[mV] Pressure[Pa] Temp[C]
 * DeadTime[us] Coincident COSMIC`.
 *
 * ASSUMPTIONS until the capture of M1 step 9 (SERIAL-FORMATS §2, backlog B-M1-10): the dead-time
 * column meaning/unit (default: cumulative µs; configurable) and the content of ADC2 (rendered as
 * a copy of ADC1 here).
 */
import type { DeviceConfig } from "../config.js";
import type { RecordedEvent } from "../scenario.js";
import { adcCounts, counterMs, deadTimeValue } from "./common.js";

/** The header the device prints at start-up (SERIAL-FORMATS §2). */
export const MUNRA_HEADER =
  "Event TimeStamp[ms] ADC1 ADC2 SiPM[mV] Pressure[Pa] Temp[C] DeadTime[us] Coincident COSMIC";

/** One data line without terminator, tab-separated. */
export function renderMunraLine(event: RecordedEvent, device: DeviceConfig): string {
  const adc = adcCounts(event, device);
  return [
    String(event.eventId),
    String(counterMs(event, device)),
    String(adc),
    String(adc),
    event.amplitude.toFixed(2),
    (event.pressureHpa * 100).toFixed(1),
    event.temperatureC.toFixed(1),
    String(deadTimeValue(event, device, device.render?.deadTimeColumn ?? "cumulativeUs")),
    String(event.coincidenceFlag),
    "COSMIC",
  ].join("\t");
}
