/**
 * Ground truth (spec 0086 FR10): what was planted, to compare with what software recovers.
 * Per event: true time, true amplitude, noise flag, saturation flag, lost-to-dead-time flag,
 * coincidence group id. Per minute: true rate, `liveMs`, `pressureHpa` (names as in spec 0083).
 */
import type {
  DeviceSimulation,
  IntervalTruth,
  SessionTruth,
  SimulationResult,
  TruthEvent,
} from "./scenario.js";

export type { IntervalTruth, SessionTruth, TruthEvent };

export interface DeviceGroundTruth {
  readonly deviceId: string;
  readonly events: readonly TruthEvent[];
  readonly intervals: readonly IntervalTruth[];
  readonly sessions: readonly SessionTruth[];
  readonly counts: {
    /** All arrivals while the device was powered (signal + noise). */
    readonly arrived: number;
    readonly recorded: number;
    readonly lostToDeadTime: number;
    readonly noise: number;
    readonly saturated: number;
    /** Recorded but not delivered to the host (USB gap). */
    readonly undelivered: number;
    /** Arrived while the device was powered off. */
    readonly off: number;
  };
}

export function groundTruthOf(device: DeviceSimulation): DeviceGroundTruth {
  let lost = 0;
  let noise = 0;
  let saturated = 0;
  let undelivered = 0;
  let off = 0;
  for (const e of device.truth) {
    if (e.off) {
      off++;
      continue;
    }
    if (e.lost) lost++;
    if (e.noise) noise++;
    if (e.saturated) saturated++;
    if (e.undelivered) undelivered++;
  }
  const arrived = device.truth.length - off;
  return {
    deviceId: device.id,
    events: device.truth,
    intervals: device.intervals,
    sessions: device.sessions,
    counts: {
      arrived,
      recorded: arrived - lost,
      lostToDeadTime: lost,
      noise,
      saturated,
      undelivered,
      off,
    },
  };
}

export function groundTruth(sim: SimulationResult): DeviceGroundTruth[] {
  return sim.devices.map(groundTruthOf);
}
