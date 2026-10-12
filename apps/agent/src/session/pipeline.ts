/**
 * Stage B of the pipeline (spec 0087 FR7–FR9): raw lines are committed to SQLite in batches (every
 * 1 s or 500 lines) BEFORE anything is derived from them; only then are sessions, minutes, counters
 * and outbox items written. A minute and its outbox item are one transaction. Any SQLite write error
 * stops acquisition cleanly (`storageError`) instead of crash-looping.
 */
import { randomUUID } from "node:crypto";
import { v2 } from "@muonhub/shared";
import type { MinuteAggregator } from "../aggregation/aggregator.js";
import { MINUTE_MS, type AggregatorOutput } from "../aggregation/aggregator.js";
import { enqueueHourSummary, hourStartOf } from "../aggregation/summary.js";
import type { ClockGate } from "../clock/clock.js";
import type { Reporter } from "../reporter.js";
import type {
  FullSessionCounters,
  LocalStore,
  MinuteRow,
  RawLineRow,
  SessionRow,
} from "../store/types.js";
import type { PipelineOp } from "./ops.js";

export const BATCH_LINES = 500;
export const BATCH_MS = 1000;

export interface PipelineOptions {
  store: LocalStore;
  reporter: Reporter;
  aggregator: MinuteAggregator;
  streamId: string;
  deviceType: v2.DeviceType;
  agentVersion: string;
  gate: ClockGate;
  now: () => number;
  restarts: number;
  /** Called after each stored minute (status, live rate). */
  onMinute?: (record: v2.MinuteRecord) => void;
  /** Called for every parsed event with an amplitude (live window batching). */
  onLiveEvent?: (event: v2.LiveEvent) => void;
  /** Called when a SQLite write fails: the daemon stops acquisition. */
  onStorageError: (error: unknown) => void;
  /** Called when a session starts or ends (status). */
  onSession?: (session: SessionRow | null) => void;
  /** Not bound to a stream yet: only the raw layer is written (local-first, spec 0087 FR18). */
  rawOnly?: boolean;
}

function zeroCounters(restarts: number): FullSessionCounters {
  return {
    completeMinutes: 0,
    discardedPartialMinutes: 0,
    quarantinedLines: 0,
    eventIdGaps: 0,
    quarantinedRecords: 0,
    clockAnomalies: 0,
    droppedLiveBatches: 0,
    droppedHeartbeats: 0,
    parkedItems: 0,
    restarts,
  };
}

/** The part of the counters the cloud contract carries (spec 0083 FR8). */
export function cloudCounters(c: FullSessionCounters): v2.SessionCounters {
  return {
    completeMinutes: c.completeMinutes,
    discardedPartialMinutes: c.discardedPartialMinutes,
    quarantinedLines: c.quarantinedLines,
    eventIdGaps: c.eventIdGaps,
  };
}

/** SQLite write failures (disk full, I/O error, locked) — as opposed to bugs in our own code. */
export function isStorageError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && (code.startsWith("ERR_SQLITE") || code.startsWith("SQLITE_")))
    return true;
  return error instanceof Error && /sqlite|disk i\/o|database or disk is full/i.test(error.message);
}

export class Pipeline {
  private buffer: PipelineOp[] = [];
  private bufferedLines = 0;
  private timer: NodeJS.Timeout | null = null;
  private current: SessionRow | null = null;
  private readonly rows = new Map<string, SessionRow>();
  private held: { row: MinuteRow; hourStart: number }[] = [];
  private lastMinuteHour: number | null = null;
  private halted = false;
  private lastEventHost: number | null = null;
  /** A `storageError` session end that could not be written yet (see {@link abortSession}). */
  private unrecordedEnd: SessionRow | null = null;

  constructor(private readonly o: PipelineOptions) {
    o.gate.onRelease((how) => {
      this.flush();
      this.releaseHeld(how);
    });
  }

  get activeSession(): SessionRow | null {
    return this.current;
  }

  get isHalted(): boolean {
    return this.halted;
  }

  start(): void {
    if (this.timer !== null) return;
    this.halted = false;
    this.timer = setInterval(() => this.flush(), BATCH_MS);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.flush();
  }

  /** Stops accepting data (after a storage error or below the disk floor). */
  halt(): void {
    this.halted = true;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Re-arms the pipeline after a storage halt (space available again). A session end that could
   * not be recorded when the store failed is written first; if that still fails the pipeline stays
   * halted and the error is thrown (the caller retries later; a restart's recovery closes it).
   */
  resume(): void {
    if (this.unrecordedEnd !== null) {
      this.recordEnd(this.unrecordedEnd);
      this.unrecordedEnd = null;
    }
    this.halted = false;
    this.start();
  }

  /**
   * The store failed (or the disk is below its floor) while a session was open: closes it with
   * `storageError`. The minute in progress and any minutes held for the clock are counted in
   * `discardedPartialMinutes` (their raw lines, where committed, remain). The session end and its
   * `session-end` outbox item are written in ONE transaction; if that fails the stored session
   * keeps `ended_at` NULL — so crash recovery closes it on the next start — and the end is retried
   * by {@link resume}. Either way the pipeline no longer has an active session.
   */
  abortSession(at: number): void {
    this.buffer = [];
    this.bufferedLines = 0;
    const row = this.current;
    const discarded = this.o.aggregator.end().filter((o) => o.kind === "discard").length;
    this.current = null;
    this.lastMinuteHour = null;
    if (row === null) return;
    this.rows.delete(row.id);
    const held = this.takeHeld(row.id);
    const ended: SessionRow = {
      ...row,
      endedAt: Math.max(at, row.startedAt),
      endReason: "storageError",
      counters: {
        ...row.counters,
        discardedPartialMinutes: row.counters.discardedPartialMinutes + discarded + held,
        eventIdGaps: this.o.aggregator.eventIdGapTotal,
      },
    };
    this.o.onSession?.(null);
    try {
      this.recordEnd(ended);
    } catch (error) {
      this.unrecordedEnd = ended;
      this.o.reporter.report(
        "error",
        "session-end-unrecorded",
        "the session end could not be stored; it is retried on resume, or closed by recovery",
        {
          sessionId: row.id,
          discardedMinutes: discarded + held,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /** The session row and its `session-end` outbox item, in one transaction. */
  private recordEnd(row: SessionRow): void {
    this.o.store.transaction(() => {
      this.o.store.upsertSession(row);
      this.o.store.enqueue({
        streamId: this.o.streamId,
        kind: "session-end",
        ts: row.startedAt,
        sessionId: row.id,
        payload: JSON.stringify({
          endedAt: row.endedAt,
          endReason: row.endReason,
          counters: cloudCounters(row.counters),
        }),
      });
    });
  }

  push(ops: readonly PipelineOp[]): void {
    if (this.halted) return;
    for (const op of ops) {
      this.buffer.push(op);
      if (op.t === "line") this.bufferedLines += 1;
    }
    if (this.bufferedLines >= BATCH_LINES) this.flush();
  }

  /** Commits the buffered raw lines, then applies the operations in order. Never throws. */
  flush(): void {
    if (this.buffer.length === 0 || this.halted) return;
    const ops = this.buffer;
    this.buffer = [];
    this.bufferedLines = 0;
    if (this.o.rawOnly === true) {
      try {
        this.o.store.appendRawLines(ops.flatMap((op) => (op.t === "line" ? [op.row] : [])));
      } catch (error) {
        this.fail(error);
      }
      return;
    }
    try {
      // Sessions first (so a committed raw line always has its session row), then raw lines.
      for (const op of ops) if (op.t === "sessionStart") this.persistSessionStart(op);
    } catch (error) {
      if (isStorageError(error)) {
        this.fail(error);
        return;
      }
      this.bug(error);
    }
    try {
      const rows: RawLineRow[] = [];
      for (const op of ops) if (op.t === "line") rows.push(op.row);
      this.o.store.appendRawLines(rows);
      for (const r of rows) {
        const sr = r.sessionId === null ? undefined : this.rows.get(r.sessionId);
        if (sr !== undefined) sr.lastRawTs = r.hostTs;
      }
    } catch (error) {
      // Raw lines are the one thing that must never be lost silently: stop acquisition cleanly.
      this.fail(error);
      return;
    }
    // From here the raw lines are committed: derived data may be built from them.
    try {
      for (const op of ops) {
        if (op.t === "sessionStart") this.activateSession(op);
        else if (op.t === "line") this.applyLine(op);
        else if (op.t === "gap") this.applyOutputs(this.o.aggregator.gap());
        else if (op.t === "sessionEnd") this.applySessionEnd(op);
      }
      if (this.current !== null) this.o.store.upsertSession(this.current);
    } catch (error) {
      if (isStorageError(error)) this.fail(error);
      else this.bug(error);
    }
  }

  /** A defect in derived-data code must not stop raw capture: log it and carry on. */
  private bug(error: unknown): void {
    this.o.reporter.report(
      "error",
      "pipeline-error",
      "error while deriving data; raw lines are safe",
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }

  private fail(error: unknown): void {
    this.halt();
    this.o.reporter.report(
      "error",
      "storage-error",
      "local store write failed; stopping acquisition",
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
    this.o.onStorageError(error);
  }

  // ── sessions ────────────────────────────────────────────────────────────────────────────────

  /** Stage 1: the session row and its outbox item are stored before any of its raw lines. */
  private persistSessionStart(op: Extract<PipelineOp, { t: "sessionStart" }>): void {
    const row: SessionRow = {
      id: op.sessionId,
      streamId: this.o.streamId,
      startedAt: op.at,
      endedAt: null,
      endReason: null,
      agentVersion: this.o.agentVersion,
      deviceTypeId: this.o.deviceType.id,
      deviceTypeVersion: this.o.deviceType.version,
      calibrationVersion: null,
      timeProvenance: op.provenance,
      synthetic: op.synthetic,
      counters: zeroCounters(this.o.restarts),
      lastRawTs: null,
    };
    this.o.store.transaction(() => {
      this.o.store.upsertSession(row);
      this.o.store.enqueue({
        streamId: this.o.streamId,
        kind: "session-start",
        ts: row.startedAt,
        sessionId: row.id,
        payload: JSON.stringify(sessionDocument(row)),
      });
    });
    this.rows.set(row.id, row);
  }

  /** Stage 2 (after the raw lines are committed): the session becomes the active one. */
  private activateSession(op: Extract<PipelineOp, { t: "sessionStart" }>): void {
    const row = this.rows.get(op.sessionId);
    if (row === undefined) return;
    // A minute still in progress belongs to the previous session: it is counted there, never lost.
    const leftover = this.o.aggregator.startSession(row.id);
    if (this.current !== null) this.applyOutputs(leftover);
    else if (leftover.length > 0) {
      this.o.reporter.report(
        "warn",
        "minute-discarded",
        "a partial minute without an open session was discarded",
        { count: leftover.length },
      );
    }
    this.current = row;
    this.lastMinuteHour = null;
    this.o.onSession?.(row);
  }

  private applySessionEnd(op: Extract<PipelineOp, { t: "sessionEnd" }>): void {
    const row = this.current;
    if (row === null || row.id !== op.sessionId) return;
    this.applyOutputs(this.o.aggregator.end());
    if (op.reason === "clockStep") row.counters.clockAnomalies += 1;
    // Minutes still held for the clock cannot reach a closed session: they are dropped and counted
    // on EVERY end (after a clock step their timestamps are untrustworthy anyway). Raw lines remain.
    this.dropHeld(row, op.reason);
    row.counters.eventIdGaps = this.o.aggregator.eventIdGapTotal;
    row.endedAt = Math.max(op.at, row.startedAt);
    row.endReason = op.reason;
    const finalHour = this.lastMinuteHour;
    this.o.store.transaction(() => {
      this.recordEnd(row);
      if (finalHour !== null) this.enqueueHourSummary(finalHour, row);
    });
    this.rows.delete(row.id);
    this.current = null;
    this.o.onSession?.(null);
  }

  // ── lines and minutes ───────────────────────────────────────────────────────────────────────

  private applyLine(op: Extract<PipelineOp, { t: "line" }>): void {
    const row = this.current;
    if (row === null) return;
    const parsed = op.parsed;
    if (parsed.kind === "malformed") {
      row.counters.quarantinedLines += 1;
      return;
    }
    if (parsed.kind !== "event") return;
    this.lastEventHost = op.row.hostTs;
    const e = parsed.event;
    if (e.amplitude !== undefined) {
      this.o.onLiveEvent?.({ t: op.row.hostTs, amplitude: e.amplitude.value });
    }
    this.applyOutputs(this.o.aggregator.add(op.row.hostTs, e));
    row.counters.eventIdGaps = this.o.aggregator.eventIdGapTotal;
  }

  private applyOutputs(outputs: readonly AggregatorOutput[]): void {
    const row = this.current;
    if (row === null) return;
    for (const out of outputs) {
      if (out.kind === "discard") {
        row.counters.discardedPartialMinutes += 1;
      } else if (out.kind === "invalid") {
        row.counters.quarantinedRecords += 1;
        this.o.store.quarantine("minute", out.reason, JSON.stringify({ ts: out.ts }), this.o.now());
        this.o.reporter.report(
          "warn",
          "minute-invalid",
          "a minute failed validation and was quarantined",
          {
            ts: out.ts,
            reason: out.reason,
          },
        );
      } else {
        const minute: MinuteRow = {
          streamId: this.o.streamId,
          ts: out.record.ts,
          sessionId: out.record.sessionId,
          record: out.record,
          aux: out.aux,
        };
        if (this.o.gate.holding) this.held.push({ row: minute, hourStart: hourStartOf(minute.ts) });
        else this.storeMinute(minute);
      }
    }
  }

  private storeMinute(minute: MinuteRow): void {
    const live = this.current?.id === minute.sessionId;
    const owner = live ? null : this.o.store.getSession(minute.sessionId);
    const counters = live ? this.current?.counters : owner?.counters;
    const hour = hourStartOf(minute.ts);
    const rollover = this.lastMinuteHour !== null && hour !== this.lastMinuteHour;
    const previousHour = this.lastMinuteHour;
    // The minute, its outbox item, the session counters and — when this minute opens a new hour —
    // the summary of the hour just completed are ONE transaction: a crash cannot keep one without
    // the other.
    const result = this.o.store.transaction(() => {
      const r = this.o.store.commitMinute(minute, {
        streamId: this.o.streamId,
        kind: "minute",
        ts: minute.ts,
        sessionId: minute.sessionId,
        payload: JSON.stringify(minute.record),
      });
      if (r === "duplicate") return r;
      if (counters !== undefined) counters.completeMinutes += 1;
      try {
        if (owner !== null) this.o.store.upsertSession(owner);
        if (rollover && previousHour !== null) this.enqueueHourSummary(previousHour, this.current);
      } catch (error) {
        if (counters !== undefined) counters.completeMinutes -= 1;
        throw error;
      }
      return r;
    });
    if (result === "duplicate") {
      // A minute is never replaced (ADR-006): the same minute produced again (e.g. after a clock
      // step back) is set aside with a record of why.
      this.o.store.quarantine(
        "duplicate-minute",
        "a minute with this timestamp already exists",
        JSON.stringify(minute.record),
        this.o.now(),
      );
      if (counters !== undefined) counters.quarantinedRecords += 1;
      this.o.reporter.report("warn", "minute-duplicate", "duplicate minute not stored", {
        ts: minute.ts,
      });
      return;
    }
    this.o.onMinute?.(minute.record);
    this.lastMinuteHour = hour;
  }

  // ── hold (NTP) ──────────────────────────────────────────────────────────────────────────────

  private releaseHeld(how: "synced" | "timeout"): void {
    const items = this.held;
    this.held = [];
    if (items.length > 0) {
      this.o.reporter.report(
        "info",
        "minutes-released",
        `releasing ${String(items.length)} held minutes`,
        { how },
      );
    }
    try {
      for (const h of items) this.storeMinute(h.row);
      if (this.current !== null) this.o.store.upsertSession(this.current);
    } catch (error) {
      if (isStorageError(error)) this.fail(error);
      else this.bug(error);
    }
  }

  /** Removes the held minutes of one session; returns how many. */
  private takeHeld(sessionId: string): number {
    const before = this.held.length;
    this.held = this.held.filter((h) => h.row.sessionId !== sessionId);
    return before - this.held.length;
  }

  /** Drops (and counts in `discardedPartialMinutes`) the minutes of `row` held for the clock. */
  private dropHeld(row: SessionRow, reason: v2.EndReason): void {
    const count = this.takeHeld(row.id);
    if (count === 0) return;
    row.counters.discardedPartialMinutes += count;
    this.o.reporter.report(
      "warn",
      "minutes-dropped",
      reason === "clockStep"
        ? "held minutes dropped after a clock step"
        : "held minutes dropped: the session ended before the clock was confirmed",
      { count, reason, sessionId: row.id },
    );
  }

  // ── summaries ───────────────────────────────────────────────────────────────────────────────

  enqueueHourSummary(hourStart: number, session: SessionRow | null): void {
    enqueueHourSummary(this.o.store, this.o.streamId, this.o.deviceType, hourStart, session);
  }

  get lastEventAt(): number | null {
    return this.lastEventHost;
  }

  get heldMinutes(): number {
    return this.held.length;
  }
}

/** The cloud session document (spec 0083 FR8) for a freshly started session. */
export function sessionDocument(row: SessionRow): v2.Session {
  return v2.SessionSchema.parse({
    schemaVersion: 2,
    id: row.id,
    streamId: row.streamId,
    startedAt: row.startedAt,
    agentVersion: row.agentVersion,
    deviceTypeVersion: row.deviceTypeVersion,
    ...(row.calibrationVersion === null ? {} : { calibrationVersion: row.calibrationVersion }),
    timeProvenance: row.timeProvenance,
    counters: cloudCounters(row.counters),
  });
}

export function newSessionId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 24);
}

export { MINUTE_MS };
