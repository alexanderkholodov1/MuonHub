/**
 * Stage A of the pipeline (spec 0087 FR6, FR7b): turns framed lines into operations and decides the
 * session boundaries. Pure — the clock and the id generator are injected.
 *
 * A session ends and a new one starts on: a reset (event counter, device clock or dead-time counter
 * decreases — spec 0085), a clock step (the host wall clock and the monotonic clock disagree by more
 * than 2 s between two lines), and — decided by the caller — loss, configuration change and stop.
 * A session is only created when the first line arrives, so a port that opens and stays silent never
 * produces empty sessions.
 */
import type { v2 } from "@muonhub/shared";
import type { FramedLine } from "../framing/framer.js";
import type { LineParser, ParsedEvent } from "../parsing/parser.js";
import type { PipelineOp } from "./ops.js";

export interface ClassifierOptions {
  deviceId: string;
  parser: LineParser;
  deviceType: v2.DeviceType;
  newSessionId: () => string;
  provenance: () => v2.TimeProvenance;
  synthetic: boolean;
  /** Divergence between wall and monotonic deltas that counts as a clock step (default 2000 ms). */
  clockStepMs?: number;
  /** Silence between two event lines that breaks minute continuity (the watchdog window). */
  gapMs: number;
}

export class LineClassifier {
  private sessionId: string | null = null;
  private connectedAt = 0;
  private prevHost: number | null = null;
  private prevMono: bigint | null = null;
  private prevEventHost: number | null = null;
  private prevEvent: { eventId?: number; deviceTimeMs?: number; deadTimeUs?: number } | null = null;
  private timeOffsetMs = 0;
  private readonly stepMs: number;
  private readonly modulusMs: number | null;

  constructor(private readonly o: ClassifierOptions) {
    this.stepMs = o.clockStepMs ?? 2000;
    const bits = o.deviceType.timeSource.rolloverBits;
    this.modulusMs =
      bits === undefined
        ? null
        : 2 ** bits * (o.deviceType.timeSource.kind === "deviceS" ? 1000 : 1);
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }

  /** The source (re)connected: the next line opens a session. */
  connected(at: number): void {
    this.connectedAt = at;
  }

  /** Ends the open session (loss, stop, configuration change, storage error). */
  end(reason: v2.EndReason, at: number): PipelineOp[] {
    if (this.sessionId === null) return [];
    const op: PipelineOp = { t: "sessionEnd", sessionId: this.sessionId, at, reason };
    this.reset();
    return [op];
  }

  /** The time of the last line seen (session end time for synthetic sources). */
  get lastHostTs(): number | null {
    return this.prevHost;
  }

  private reset(): void {
    this.sessionId = null;
    this.prevHost = null;
    this.prevMono = null;
    this.prevEventHost = null;
    this.prevEvent = null;
    this.timeOffsetMs = 0;
  }

  private open(at: number): PipelineOp {
    const id = this.o.newSessionId();
    this.sessionId = id;
    return {
      t: "sessionStart",
      sessionId: id,
      at,
      provenance: this.o.provenance(),
      synthetic: this.o.synthetic,
    };
  }

  classify(line: FramedLine): PipelineOp[] {
    const ops: PipelineOp[] = [];
    const parsed = this.o.parser.parse(line.text);
    const mono = BigInt(line.monotonicNs);

    if (this.sessionId === null) {
      ops.push(this.open(Math.min(this.connectedAt || line.hostTs, line.hostTs)));
    } else if (this.prevHost !== null && this.prevMono !== null) {
      const dWall = line.hostTs - this.prevHost;
      const dMono = Number(mono - this.prevMono) / 1e6;
      if (Math.abs(dWall - dMono) > this.stepMs) {
        // Wall clock jumped: nothing derived across the jump can be trusted. The ended session
        // keeps its raw lines; its minute in progress is discarded (spec 0087 FR7b).
        ops.push(...this.end("clockStep", this.prevHost));
        ops.push(this.open(line.hostTs));
      }
    }

    let event: ParsedEvent | null = null;
    if (parsed.kind === "event") {
      event = parsed.event;
      const unwrapped = this.unwrap(event);
      if (this.isReset(unwrapped)) {
        ops.push(...this.end("reset", this.prevHost ?? line.hostTs));
        ops.push(this.open(line.hostTs));
        this.timeOffsetMs = 0;
      } else if (this.prevEventHost !== null && line.hostTs - this.prevEventHost > this.o.gapMs) {
        ops.push({ t: "gap" });
      }
    }

    const sessionId = this.sessionId;
    ops.push({
      t: "line",
      parsed:
        event !== null && this.timeOffsetMs !== 0 && event.deviceTimeMs !== undefined
          ? {
              kind: "event",
              event: { ...event, deviceTimeMs: event.deviceTimeMs + this.timeOffsetMs },
            }
          : parsed,
      row: {
        deviceId: this.o.deviceId,
        sessionId,
        hostTs: line.hostTs,
        monotonicNs: line.monotonicNs,
        text: line.text,
        byteLength: line.byteLength,
        flags: line.flags,
        ...(line.rawBytes === undefined ? {} : { rawBytes: line.rawBytes }),
      },
    });

    this.prevHost = line.hostTs;
    this.prevMono = mono;
    if (event !== null) {
      this.prevEventHost = line.hostTs;
      this.prevEvent = {
        ...(event.eventId === undefined ? {} : { eventId: event.eventId }),
        ...(event.deviceTimeMs === undefined
          ? {}
          : { deviceTimeMs: event.deviceTimeMs + this.timeOffsetMs }),
        ...(event.deadTimeUs === undefined ? {} : { deadTimeUs: event.deadTimeUs }),
      };
    }
    return ops;
  }

  /** Adds the rollover offset of a wrapped device millisecond counter (e.g. Arduino millis()). */
  private unwrap(e: ParsedEvent): ParsedEvent {
    if (
      this.modulusMs === null ||
      e.deviceTimeMs === undefined ||
      this.prevEvent?.deviceTimeMs === undefined
    ) {
      return e;
    }
    const prevRaw = this.prevEvent.deviceTimeMs - this.timeOffsetMs;
    if (
      e.deviceTimeMs < prevRaw &&
      prevRaw > 0.75 * this.modulusMs &&
      e.deviceTimeMs < 0.25 * this.modulusMs
    ) {
      this.timeOffsetMs += this.modulusMs;
    }
    return { ...e, deviceTimeMs: e.deviceTimeMs + this.timeOffsetMs };
  }

  private isReset(e: ParsedEvent): boolean {
    const p = this.prevEvent;
    if (p === null) return false;
    if (e.eventId !== undefined && p.eventId !== undefined && e.eventId < p.eventId) return true;
    if (
      e.deviceTimeMs !== undefined &&
      p.deviceTimeMs !== undefined &&
      e.deviceTimeMs < p.deviceTimeMs
    ) {
      return true;
    }
    if (
      this.o.deviceType.deadTimeSemantics.kind === "cumulative" &&
      e.deadTimeUs !== undefined &&
      p.deadTimeUs !== undefined &&
      e.deadTimeUs < p.deadTimeUs
    ) {
      return true;
    }
    return false;
  }
}
