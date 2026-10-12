/**
 * `LineSource` and the virtual detector (spec 0086 FR11). Spec 0087 adopts `LineSource` as the
 * agent's input interface, so the agent cannot tell a virtual detector from a serial port.
 */
import { z } from "zod";
import { v2 } from "@muonhub/shared";
import { hostTimeFor } from "./scenario.js";
import { simulate, type DeviceSimulation, type SimulationResult } from "./scenario.js";
import { parseScenario, type MalformedKind, type ScenarioConfig } from "./config.js";
import { encodeLines, fragment, type RenderedLine } from "./disruptions.js";
import { MUNRA_HEADER, renderMunraLine } from "./render/munra.js";
import { renderV3xLine, v3xHeader } from "./render/cosmicwatch-v3x.js";

export interface SourceLine {
  /** Exactly what a serial port would deliver (may be a fragment). */
  readonly bytes: Uint8Array;
  /** Host clock at reception (ms). */
  readonly hostReceivedAtMs: number;
}

export interface LineSource extends AsyncIterable<SourceLine> {
  close(): Promise<void>;
}

/** Comment line printed first by every virtual detector (contains no digits: parsers skip it). */
export const SYNTHETIC_COMMENT = "# MuonHub virtual detector - synthetic data, not a real device";

/** Device-type ids this package can render, taken from the v2 built-in device types. */
export const RENDERABLE_DEVICE_TYPES: readonly string[] = v2.BUILTIN_DEVICE_TYPES.map(
  (t) => t.id,
).filter((id) => id === "cosmicwatch-v3x" || id === "munra");

/** Render every line a device delivers, in order, with host reception times. */
export function renderDeviceLines(sim: SimulationResult, deviceIndex = 0): SourceLine[] {
  const dev: DeviceSimulation | undefined = sim.devices[deviceIndex];
  if (!dev) throw new RangeError(`no device at index ${deviceIndex}`);
  const cfg = dev.config;
  const rng = dev.renderRng;
  const header = cfg.deviceType === "munra" ? MUNRA_HEADER : v3xHeader();
  const usb = (cfg.disruptions?.gaps ?? []).filter((g) => g.kind === "usb");
  const inUsbGap = (t: number): boolean => usb.some((g) => t >= g.startMs && t < g.endMs);

  const lines: (RenderedLine & { data: boolean })[] = [
    { text: SYNTHETIC_COMMENT, hostMs: hostTimeFor(sim.config.startMs, cfg, rng), data: false },
  ];
  let lastHost = lines[0]?.hostMs ?? 0;
  const push = (text: string, trueMs: number, data: boolean): void => {
    lastHost = Math.max(lastHost, hostTimeFor(trueMs, cfg, rng));
    lines.push({ text, hostMs: lastHost, data });
  };
  let k = 0;
  for (const s of dev.sessions) {
    push(header, s.startTrueMs, false);
    while (k < dev.recorded.length && (dev.recorded[k]?.sessionIndex ?? -1) === s.index) {
      const e = dev.recorded[k];
      k++;
      if (!e || !e.delivered || inUsbGap(e.trueMs)) continue;
      push(
        cfg.deviceType === "munra" ? renderMunraLine(e, cfg) : renderV3xLine(e, cfg),
        e.trueMs,
        true,
      );
    }
  }
  const malformed = new Map<number, MalformedKind>();
  for (const m of cfg.disruptions?.malformed ?? []) malformed.set(m.lineIndex, m.kind);
  const out: SourceLine[] = [];
  for (const l of encodeLines(lines, cfg.render?.terminator ?? "LF", malformed)) {
    for (const part of fragment(l.bytes, cfg.render?.fragmentBytes)) {
      out.push({ bytes: part, hostReceivedAtMs: l.hostMs });
    }
  }
  return out;
}

export interface Pacing {
  /** Simulated seconds per wall-clock second (> 0). */
  readonly speed: number;
  /** Wall-clock reading in ms (injected; no timer access in the core). */
  readonly nowMs: () => number;
  /** Resolve after `ms` of wall-clock time (injected). */
  readonly sleep: (ms: number) => Promise<void>;
}

export interface VirtualDetectorConfig {
  /** Scenario (validated with zod). */
  readonly scenario: ScenarioConfig;
  /** Which device of the assembly to expose (default: the first). */
  readonly deviceId?: string;
  /** Omit for fast mode (as fast as possible, simulated host times). */
  readonly pacing?: Pacing;
}

export interface VirtualDetector extends LineSource {
  /** Always true: the agent propagates this into session metadata (spec 0087). */
  readonly synthetic: true;
  readonly deviceId: string;
}

const PacingSchema = z.object({
  speed: z.number().positive().finite(),
  nowMs: z.custom<() => number>((v) => typeof v === "function"),
  sleep: z.custom<(ms: number) => Promise<void>>((v) => typeof v === "function"),
});

/** A wall-clock pacing helper for live runs. The only place that touches `Date`/timers. */
export function realTimePacing(speed = 1): Pacing {
  return {
    speed,
    nowMs: () => Date.now(),
    sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms))),
  };
}

export function createVirtualDetector(config: VirtualDetectorConfig): VirtualDetector {
  const scenario = parseScenario(config.scenario);
  if (config.pacing) PacingSchema.parse(config.pacing);
  const index =
    config.deviceId === undefined ? 0 : scenario.devices.findIndex((d) => d.id === config.deviceId);
  if (index < 0) throw new RangeError(`unknown device id ${config.deviceId ?? ""}`);
  const deviceId = scenario.devices[index]?.id ?? "";
  let closed = false;
  const pacing = config.pacing;

  async function* generate(): AsyncGenerator<SourceLine> {
    const lines = renderDeviceLines(simulate(scenario), index);
    const simStart = lines[0]?.hostReceivedAtMs ?? 0;
    const wallStart = pacing?.nowMs() ?? 0;
    for (const line of lines) {
      if (closed) return;
      if (!pacing) {
        yield line;
        continue;
      }
      const due = wallStart + (line.hostReceivedAtMs - simStart) / pacing.speed;
      const wait = due - pacing.nowMs();
      if (wait > 0) await pacing.sleep(wait);
      if (closed) return;
      yield { bytes: line.bytes, hostReceivedAtMs: due };
    }
  }

  return {
    synthetic: true,
    deviceId,
    [Symbol.asyncIterator]: () => generate(),
    close: () => {
      closed = true;
      return Promise.resolve();
    },
  };
}
