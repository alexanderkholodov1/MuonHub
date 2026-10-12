/**
 * Scenario simulation: N stacked devices with true coincidences, dead time, amplitudes, clocks,
 * interruptions, and ground truth (spec 0086 FR2–FR10).
 *
 * Coincidence model (FR9): device 0 (top) receives true events at its rate R₀(t). Each true event of
 * device i also crosses device i+1 with probability f_i (acceptance × efficiency of the partner);
 * device i+1 additionally has independent singles at R_{i+1}(t) − f_i · R_i(t), so its total true
 * rate is R_{i+1}(t). The hardware coincidence flag is set when another device **recorded** an event
 * within the half-window τ_c (|Δt| ≤ τ_c).
 */
import { parseScenario, type DeviceConfig, type ScenarioConfig } from "./config.js";
import { deviceElapsedMs, hostReceivedAt, wrapCounter } from "./clock.js";
import { applyDeadTime, sampleNoiseAmplitude, sampleSignalAmplitude } from "./device.js";
import { baseRate } from "./flux.js";
import {
  createPressureSeries,
  createRateModel,
  createTemperatureSeries,
  poissonArrivals,
  type Series,
} from "./modulation.js";
import { Rng } from "./rng.js";

const MINUTE_MS = 60_000;

/** Ground truth of one true event at one device (FR10). */
export interface TruthEvent {
  readonly trueMs: number;
  readonly amplitude: number;
  readonly noise: boolean;
  readonly saturated: boolean;
  /** Lost to dead time. */
  readonly lost: boolean;
  /** Arrived while the device was powered off (power gap). */
  readonly off: boolean;
  /** Recorded by the device but its line was not delivered (USB gap). */
  readonly undelivered: boolean;
  /** Coincidence group id — shared by the same particle across devices. */
  readonly groupId: number;
}

/** An event recorded by the device, with everything needed to render its line. */
export interface RecordedEvent {
  readonly trueMs: number;
  readonly amplitude: number;
  readonly saturated: boolean;
  readonly noise: boolean;
  readonly groupId: number;
  readonly sessionIndex: number;
  /** Event counter as the device reports it (restarts at 1 in every session). */
  readonly eventId: number;
  /** Device clock reading (ms, unwrapped). */
  readonly deviceMs: number;
  /** Cumulative dead time before this event, since the session start (ms). */
  readonly cumulativeDeadMs: number;
  readonly pressureHpa: number;
  readonly temperatureC: number;
  coincidenceFlag: 0 | 1;
  readonly delivered: boolean;
}

export interface SessionTruth {
  readonly index: number;
  readonly startTrueMs: number;
  readonly endTrueMs: number;
  readonly endReason: "reset" | "powerLoss" | "end";
}

/** Per-minute truth (names follow spec 0083: `liveMs`, `pressureHpa`). */
export interface IntervalTruth {
  readonly minuteStartMs: number;
  /** True when the whole minute lies inside one session and the device was powered. */
  readonly complete: boolean;
  /** Mean true rate over the minute (s⁻¹). */
  readonly trueRatePerS: number;
  /** Events recorded in the minute. */
  readonly n: number;
  readonly liveMs: number;
  readonly pressureHpa: number;
}

export interface DeviceSimulation {
  readonly id: string;
  readonly config: DeviceConfig;
  readonly truth: readonly TruthEvent[];
  readonly recorded: readonly RecordedEvent[];
  readonly sessions: readonly SessionTruth[];
  readonly intervals: readonly IntervalTruth[];
  /** Deterministic stream for rendering/host-time draws. */
  readonly renderRng: Rng;
}

export interface SimulationResult {
  readonly config: ScenarioConfig;
  readonly devices: readonly DeviceSimulation[];
  readonly pressure: Series;
  readonly temperature: Series;
  readonly rates: readonly Series[];
}

interface Arrival {
  t: number;
  groupId: number;
  noise: boolean;
}

/** Run a scenario. Pure and deterministic for a given configuration. */
export function simulate(input: ScenarioConfig): SimulationResult {
  const config = parseScenario(input);
  const root = new Rng(config.seed);
  const start = config.startMs;
  const end = config.startMs + config.durationMs;
  const step = config.stepMs ?? 1000;
  const pressure = createPressureSeries(config.pressure, start);
  const temperature = createTemperatureSeries(config.temperature ?? { meanC: 25 });
  const p0 = config.p0Hpa ?? pressure(start);
  const rates = config.devices.map((d) =>
    createRateModel({
      baseRatePerS: baseRate(d.rate),
      ...(config.betaPercentPerHpa !== undefined ? { betaPercentPerHpa: config.betaPercentPerHpa } : {}),
      p0Hpa: p0,
      pressure,
      ...(config.diurnal ? { diurnal: config.diurnal } : {}),
      ...(config.forbush ? { forbush: config.forbush } : {}),
    }),
  );
  const fractions = config.coincidence?.fractions ?? [];
  for (let i = 0; i < fractions.length; i++) {
    const f = fractions[i] ?? 0;
    const upper = rates[i]?.(start) ?? 0;
    const lower = rates[i + 1]?.(start) ?? 0;
    if (lower + 1e-12 < f * upper) {
      throw new RangeError(
        `device ${i + 1} true rate ${lower} s⁻¹ is below the coincident rate f·R = ${f * upper} s⁻¹`,
      );
    }
  }

  // 1. True arrivals per device, with coincidence groups.
  let nextGroup = 0;
  const signals: Arrival[][] = [];
  for (let i = 0; i < config.devices.length; i++) {
    const arrivalsRng = root.fork(`device-${i}-arrivals`);
    let own: Arrival[];
    if (i === 0) {
      own = [];
      for (const t of poissonArrivals(arrivalsRng, rates[0] ?? (() => 0), start, end, step)) {
        own.push({ t, groupId: nextGroup++, noise: false });
      }
    } else {
      const f = fractions[i - 1] ?? 0;
      const upperRate = rates[i - 1] ?? (() => 0);
      const lowerRate = rates[i] ?? (() => 0);
      const singlesRate: Series = (t) => Math.max(0, lowerRate(t) - f * upperRate(t));
      const carryRng = root.fork(`device-${i}-carry`);
      const carried = (signals[i - 1] ?? []).filter(() => f > 0 && carryRng.chance(f));
      const singles: Arrival[] = [];
      for (const t of poissonArrivals(arrivalsRng, singlesRate, start, end, step)) {
        singles.push({ t, groupId: nextGroup++, noise: false });
      }
      own = mergeByTime(carried.map((a) => ({ ...a })), singles);
    }
    signals.push(own);
  }

  // 2. Per-device detection.
  const devices = config.devices.map((device, i) =>
    detectDevice(device, i, signals[i] ?? [], root, start, end, step, pressure, temperature, rates[i] ?? (() => 0)),
  );

  // 3. Hardware coincidence flags.
  const halfWindowMs = (config.coincidence?.halfWindowUs ?? 0) / 1000;
  if (config.coincidence && devices.length > 1) {
    for (let a = 0; a < devices.length; a++) {
      const own = devices[a]?.recorded ?? [];
      for (let b = 0; b < devices.length; b++) {
        if (a === b) continue;
        const other = (devices[b]?.recorded ?? []).map((e) => e.trueMs);
        let j = 0;
        for (const e of own) {
          while (j < other.length && (other[j] ?? 0) < e.trueMs - halfWindowMs) j++;
          if (j < other.length && Math.abs((other[j] ?? 0) - e.trueMs) <= halfWindowMs) e.coincidenceFlag = 1;
        }
      }
    }
  }

  return { config, devices, pressure, temperature, rates };
}

function mergeByTime(a: Arrival[], b: Arrival[]): Arrival[] {
  const out: Arrival[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const x = a[i];
    const y = b[j];
    if (y === undefined || (x !== undefined && x.t <= y.t)) {
      if (x) out.push(x);
      i++;
    } else {
      out.push(y);
      j++;
    }
  }
  return out;
}

function detectDevice(
  device: DeviceConfig,
  index: number,
  signal: Arrival[],
  root: Rng,
  start: number,
  end: number,
  step: number,
  pressure: Series,
  temperature: Series,
  rate: Series,
): DeviceSimulation {
  const ampRng = root.fork(`device-${index}-amplitude`);
  const noiseRng = root.fork(`device-${index}-noise`);
  const clockRng = root.fork(`device-${index}-clock`);
  const saturation = device.amplitude.saturation.value;

  // Noise triggers share the electronics, so they go through the same dead time.
  let arrivals = signal;
  if (device.noiseTriggers && device.noiseTriggers.ratePerS > 0) {
    const noiseRate = device.noiseTriggers.ratePerS;
    const noise: Arrival[] = [];
    for (const t of poissonArrivals(noiseRng, () => noiseRate, start, end, step)) {
      noise.push({ t, groupId: -1, noise: true });
    }
    arrivals = mergeByTime(signal, noise);
  }

  const gaps = [...(device.disruptions?.gaps ?? [])].sort((a, b) => a.startMs - b.startMs);
  const powerGaps = gaps.filter((g) => g.kind === "power");
  const usbGaps = gaps.filter((g) => g.kind === "usb");
  const inside = (gs: typeof gaps, t: number): boolean => gs.some((g) => t >= g.startMs && t < g.endMs);

  // Sessions: boundaries at explicit resets and at power gaps.
  const boundaries: { at: number; reason: "reset" | "powerLoss"; resume: number }[] = [
    ...(device.disruptions?.resets ?? []).map((t) => ({ at: t, reason: "reset" as const, resume: t })),
    ...powerGaps.map((g) => ({ at: g.startMs, reason: "powerLoss" as const, resume: g.endMs })),
  ]
    .filter((b) => b.at > start && b.at < end)
    .sort((a, b) => a.at - b.at);
  const sessions: SessionTruth[] = [];
  let sessionStart = start;
  for (const b of boundaries) {
    sessions.push({ index: sessions.length, startTrueMs: sessionStart, endTrueMs: b.at, endReason: b.reason });
    sessionStart = Math.min(end, b.resume);
  }
  sessions.push({ index: sessions.length, startTrueMs: sessionStart, endTrueMs: end, endReason: "end" });
  const sessionOf = (t: number): number => {
    for (const s of sessions) if (t >= s.startTrueMs && t < s.endTrueMs) return s.index;
    return -1;
  };

  // Dead time per session (the electronics restart with the session).
  const tauMs = device.deadTimeUs / 1000;
  const truth: TruthEvent[] = [];
  const recorded: RecordedEvent[] = [];
  const clock = device.clock ?? {};
  let current = -2;
  let busyUntil = -Infinity;
  let eventId = 0;
  let deadSoFar = 0;
  let sessionReading = 0;
  for (const a of arrivals) {
    const amp = a.noise
      ? sampleNoiseAmplitude(ampRng, device.noiseTriggers ?? { ratePerS: 0, meanAmplitude: 1 }, saturation)
      : sampleSignalAmplitude(ampRng, device.amplitude);
    const s = sessionOf(a.t);
    if (s < 0 || inside(powerGaps, a.t)) {
      truth.push({ trueMs: a.t, amplitude: amp.value, noise: a.noise, saturated: amp.saturated, lost: false, off: true, undelivered: false, groupId: a.groupId });
      continue;
    }
    if (s !== current) {
      current = s;
      busyUntil = -Infinity;
      eventId = 0;
      deadSoFar = 0;
      sessionReading = s === 0 ? (clock.offsetMs ?? 0) : 0;
    }
    const isRecorded = a.t >= busyUntil;
    const delivered = !inside(usbGaps, a.t);
    truth.push({
      trueMs: a.t,
      amplitude: amp.value,
      noise: a.noise,
      saturated: amp.saturated,
      lost: !isRecorded,
      off: false,
      undelivered: isRecorded && !delivered,
      groupId: a.groupId,
    });
    if (!isRecorded) continue;
    busyUntil = a.t + tauMs;
    eventId++;
    const session = sessions[s];
    recorded.push({
      trueMs: a.t,
      amplitude: amp.value,
      saturated: amp.saturated,
      noise: a.noise,
      groupId: a.groupId,
      sessionIndex: s,
      eventId,
      deviceMs: deviceElapsedMs(a.t, session?.startTrueMs ?? start, sessionReading, clock, clockRng),
      cumulativeDeadMs: deadSoFar,
      pressureHpa: pressure(a.t),
      temperatureC: temperature(a.t),
      coincidenceFlag: 0,
      delivered,
    });
    deadSoFar += tauMs;
  }

  const intervals = buildIntervals(start, end, step, recorded, sessions, powerGaps, tauMs, pressure, rate);
  return {
    id: device.id,
    config: device,
    truth,
    recorded,
    sessions,
    intervals,
    renderRng: root.fork(`device-${index}-render`),
  };
}

function buildIntervals(
  start: number,
  end: number,
  step: number,
  recorded: readonly RecordedEvent[],
  sessions: readonly SessionTruth[],
  powerGaps: readonly { startMs: number; endMs: number }[],
  tauMs: number,
  pressure: Series,
  rate: Series,
): IntervalTruth[] {
  const out: IntervalTruth[] = [];
  let k = 0;
  for (let m = Math.ceil(start / MINUTE_MS) * MINUTE_MS; m + MINUTE_MS <= end; m += MINUTE_MS) {
    const mEnd = m + MINUTE_MS;
    const complete =
      sessions.some((s) => s.startTrueMs <= m && s.endTrueMs >= mEnd) &&
      !powerGaps.some((g) => g.startMs < mEnd && g.endMs > m);
    let n = 0;
    let dead = 0;
    while (k < recorded.length && (recorded[k]?.trueMs ?? 0) < m - tauMs) k++;
    for (let i = k; i < recorded.length; i++) {
      const t = recorded[i]?.trueMs ?? 0;
      if (t >= mEnd) break;
      if (t >= m) n++;
      dead += Math.max(0, Math.min(mEnd, t + tauMs) - Math.max(m, t));
    }
    let rateSum = 0;
    let pressureSum = 0;
    let samples = 0;
    for (let t = m; t < mEnd; t += step) {
      const mid = t + Math.min(step, mEnd - t) / 2;
      rateSum += rate(mid);
      pressureSum += pressure(mid);
      samples++;
    }
    out.push({
      minuteStartMs: m,
      complete,
      trueRatePerS: rateSum / samples,
      n,
      liveMs: MINUTE_MS - dead,
      pressureHpa: pressureSum / samples,
    });
  }
  return out;
}

/** Device-clock counter value for rendering, with rollover for millisecond counters. */
export function deviceCounterMs(event: RecordedEvent, rolloverBits = 32): number {
  return wrapCounter(event.deviceMs, rolloverBits);
}

/** Host reception time of a line emitted at true time `trueMs`. */
export function hostTimeFor(trueMs: number, device: DeviceConfig, rng: Rng): number {
  return hostReceivedAt(trueMs, device.hostLatency ?? { meanMs: 2, jitterMs: 1 }, rng);
}
