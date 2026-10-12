/**
 * The agent's status document (spec 0087 FR6, FR12). Shown by the panel and `muonhub-agent status`.
 * It never contains secrets. Human labels distinguish states that must never be confused:
 * "device disconnected" ≠ "device silent" ≠ a measured low rate.
 */
import type { Condition } from "./reporter.js";
import type { FullSessionCounters, OutboxKind } from "./store/types.js";

export type DeviceLabel =
  | "device connecting"
  | "device connected"
  | "device disconnected"
  | "device silent"
  | "input ended"
  | "stopped";

export interface AgentStatus {
  version: string;
  startedAt: number;
  restarts: number;
  now: number;
  device: {
    description: string;
    baud: number | null;
    label: DeviceLabel;
    lastDataAt: number | null;
    synthetic: boolean;
  };
  deviceType: { id: string; version: number };
  streamId: string | null;
  session: {
    id: string;
    startedAt: number;
    counters: FullSessionCounters;
  } | null;
  lastMinute: { ts: number; n: number; liveSource: string } | null;
  /** n of the last complete minute — raw and uncorrected. */
  rawRatePerMin: number | null;
  heldMinutes: number;
  queue: { pending: Record<OutboxKind, number>; parked: number; oldestParkedAgeMs: number | null };
  parkedAlarm: boolean;
  sync: {
    label: string;
    signedIn: boolean;
    paused: boolean;
    lastSuccessAt: number | null;
    lastRejected: { kind: string; ts: number; code: string; at: number } | null;
    rejectedCount: number;
  };
  live: {
    droppedLiveBatches: number;
    droppedHeartbeats: number;
    pruneErrors: number;
    lastHeartbeatAt: number | null;
  };
  clock: { synchronized: boolean; source: string; offsetMs: number; holding: boolean };
  disk: { freeBytes: number | null; level: "ok" | "low" | "floor" };
  rawLines: number;
  conditions: Condition[];
  panel: { enabled: boolean; state: string };
  bridge: { enabled: boolean; state: string; clients: number };
}

export function deviceLabel(state: string): DeviceLabel {
  switch (state) {
    case "connected":
      return "device connected";
    case "silent":
      return "device silent";
    case "disconnected":
      return "device disconnected";
    case "ended":
      return "input ended";
    case "stopped":
      return "stopped";
    default:
      return "device connecting";
  }
}
