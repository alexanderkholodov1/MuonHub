/**
 * Input sources (spec 0087 FR2). Every input is a `LineSource` (spec 0086 FR11) so the agent cannot
 * tell a virtual detector from a serial port.
 */
import type { LineSource, SourceLine } from "@muonhub/simulator";

export type { LineSource, SourceLine };

/** A read, optionally carrying the monotonic time taken by the source at receipt (ns). */
export interface AgentChunk extends SourceLine {
  readonly monotonicNs?: bigint;
}

export interface AgentLineSource extends AsyncIterable<AgentChunk> {
  close(): Promise<void>;
  /** True for the virtual detector: the session is labelled synthetic (spec 0086). */
  readonly synthetic?: boolean;
}

/** Opens a source; rejects when the device is not available (the supervisor retries). */
export interface SourceFactory {
  /** Human-readable description for status (path or "virtual detector"). */
  readonly description: string;
  readonly baud: number | null;
  /** Serial ports reconnect forever; a finite virtual source ends the daemon's input. */
  readonly reconnect: boolean;
  open(): Promise<AgentLineSource>;
}
