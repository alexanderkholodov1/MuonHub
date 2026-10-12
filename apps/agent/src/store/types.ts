/**
 * The agent's local store (spec 0087 FR9). One interface; implementations: `node:sqlite` (default)
 * and `better-sqlite3` (fallback). The interface is synchronous: both drivers are, and a minute and
 * its outbox item must be one transaction.
 *
 * Layer 0 (`raw_lines`) is append-only: the schema forbids UPDATE and DELETE on it (ADR-006).
 */
import type { v2 } from "@muonhub/shared";

export const RAW_FLAG_LOSSY = 1;
export const RAW_FLAG_SPLIT = 2;
export const RAW_FLAG_TRUNCATED = 4;

export interface RawLineRow {
  deviceId: string;
  sessionId: string | null;
  hostTs: number;
  monotonicNs: string;
  text: string;
  byteLength: number;
  /** The original bytes, kept only when decoding was lossy or the line was truncated. */
  rawBytes?: Uint8Array;
  flags: number;
}

export type OutboxKind = "session-start" | "minute" | "hour" | "session-counters" | "session-end";
export const OUTBOX_KINDS: readonly OutboxKind[] = [
  "session-start",
  "minute",
  "hour",
  "session-counters",
  "session-end",
];

/**
 * `superseded`: an older revision (hour summary, session counters) that a newer revision of the
 * same key replaces; it is never sent, so it can never overwrite the newer one.
 */
export type OutboxState = "pending" | "uploaded" | "parked" | "superseded";

export interface OutboxItem {
  id: number;
  streamId: string;
  kind: OutboxKind;
  /** Minute start / hour start / session start (ms). */
  ts: number;
  /** Revision: 0 for write-once kinds, increasing for recomputed hours and session counters. */
  rev: number;
  sessionId: string | null;
  payload: string;
  state: OutboxState;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  createdAt: number;
  parkedAt: number | null;
}

export interface NewOutboxItem {
  streamId: string;
  kind: OutboxKind;
  ts: number;
  rev?: number;
  sessionId?: string | null;
  payload: string;
}

export interface FullSessionCounters extends v2.SessionCounters {
  quarantinedRecords: number;
  clockAnomalies: number;
  droppedLiveBatches: number;
  droppedHeartbeats: number;
  parkedItems: number;
  restarts: number;
}

export interface SessionRow {
  id: string;
  streamId: string;
  startedAt: number;
  endedAt: number | null;
  endReason: v2.EndReason | null;
  agentVersion: string;
  deviceTypeId: string;
  deviceTypeVersion: number;
  calibrationVersion: number | null;
  timeProvenance: v2.TimeProvenance;
  synthetic: boolean;
  counters: FullSessionCounters;
  /** Timestamp of the last raw line committed in this session (crash recovery). */
  lastRawTs: number | null;
}

export interface MinuteRow {
  streamId: string;
  ts: number;
  sessionId: string;
  record: v2.MinuteRecord;
  /** Local-only per-minute aggregates the hour summary is rebuilt from. */
  aux: MinuteAux;
}

export interface MinuteAux {
  /** Counts per fixed bin of the device type; absent when the type declares no edges. */
  histogram?: number[];
  saturated?: number;
  /** Sum of valid pressure readings (hPa) and how many. */
  pressureSum?: number;
  pressureCount?: number;
  temperatureSum?: number;
  temperatureCount?: number;
}

export type EventLevel = "info" | "warn" | "error";

export interface EventLogRow {
  id: number;
  at: number;
  level: EventLevel;
  code: string;
  message: string;
  data: string | null;
}

export interface OutboxCounts {
  pending: Record<OutboxKind, number>;
  parked: number;
  uploaded: number;
}

export interface LocalStore {
  readonly driver: string;
  /** Appends a batch of raw lines in one transaction; returns how many were stored. */
  appendRawLines(rows: readonly RawLineRow[]): number;
  rawLineCount(): number;
  /** Raw lines with `fromTs <= hostTs < toTs`, oldest first (tests, export). */
  rawLinesBetween(fromTs: number, toTs: number, limit?: number): RawLineRow[];

  upsertSession(session: SessionRow): void;
  getSession(id: string): SessionRow | null;
  openSessions(): SessionRow[];
  listSessions(streamId: string, limit: number): SessionRow[];

  /**
   * A minute and its outbox item in ONE transaction. Returns "duplicate" (nothing stored) when a
   * minute with the same key exists: a minute is never replaced locally either.
   */
  commitMinute(row: MinuteRow, item: NewOutboxItem): "stored" | "duplicate";
  minutesInRange(streamId: string, fromTs: number, toTs: number): MinuteRow[];
  minuteCount(streamId: string): number;

  saveSummary(streamId: string, hourStart: number, rev: number, entry: v2.HourEntry): void;
  latestSummary(streamId: string, hourStart: number): { rev: number; entry: v2.HourEntry } | null;

  /** Re-enqueueing an existing key (stream, kind, ts, rev) is a no-op: returns false. */
  enqueue(item: NewOutboxItem): boolean;
  /** Pending items of one kind due at `now`, in (ts, rev, id) order. */
  pendingItems(kind: OutboxKind, now: number, limit: number): OutboxItem[];
  /** All pending items of a kind regardless of backoff (status). */
  hasPending(kind: OutboxKind, sessionId?: string): boolean;
  markUploaded(ids: readonly number[], at: number): void;
  /** Keeps the item pending: records the error and the next attempt time. */
  markRetry(ids: readonly number[], error: string, nextAttemptAt: number): void;
  park(id: number, reason: string, at: number): void;
  /** True when a later revision of the item's key (stream, kind, ts, session) exists in any state. */
  hasNewerRevision(item: OutboxItem): boolean;
  /** Marks an older revision as replaced by a newer one (never sent, never unparked). */
  supersede(id: number, at: number): void;
  unparkAll(): number;
  parkedItems(limit: number): OutboxItem[];
  outboxCounts(): OutboxCounts;
  oldestParkedAt(): number | null;

  quarantine(kind: string, reason: string, payload: string, at: number): void;
  quarantineCount(): number;

  logEvent(level: EventLevel, code: string, message: string, data: unknown, at: number): void;
  recentEvents(limit: number): EventLogRow[];

  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  /** Runs `fn` in a transaction; rolls back when it throws. */
  transaction<T>(fn: () => T): T;
  /** Size of the database files on disk (status). */
  close(): void;
}
