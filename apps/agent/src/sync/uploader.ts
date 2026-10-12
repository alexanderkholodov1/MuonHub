/**
 * Durable outbox uploader (spec 0087 FR10, FR12). The outbox is the only queue: the SDK's own offline
 * queue is not relied on. Per kind, items go in order with at most ONE write in flight.
 *
 * Outcomes:
 *  - transient (network, 5xx, quota)  → exponential backoff with jitter, max 5 min;
 *  - unknown (timeout, lost ack)      → the item stays pending; before any retry the record is read
 *    back: identical → uploaded, absent → retry, different → parked as a conflict;
 *  - PERMISSION_DENIED                → the auth state is checked FIRST: signed out or invalid token
 *    pauses the whole outbox (nothing parked); a check that cannot answer (offline) backs off and
 *    retries; only with a confirmed valid session is it permanent;
 *  - permanent (denied with a valid session, validation) → the item is parked, counted, logged at
 *    error level, never retried blindly, never dropped, and it does not block later items.
 *
 * Read-backs only ever see the server (the provider refuses cache reads and documents with pending
 * SDK writes), so a write that is still only in the SDK's local cache is never marked uploaded; an
 * item whose outcome is unknown keeps its `unknown` mark through transient failures until a
 * read-back settles it. Recomputed revisions (hour summaries, session counters) are sent newest
 * only: an older revision is marked superseded, so it can never overwrite a newer one.
 */
import { v2 as dp } from "@muonhub/data-provider";
import { v2 } from "@muonhub/shared";
import type { Reporter } from "../reporter.js";
import { hourStartOf, dayAndHour } from "../aggregation/summary.js";
import { OUTBOX_KINDS, type LocalStore, type OutboxItem, type OutboxKind } from "../store/types.js";
import type { AuthManager } from "./auth.js";

const MINUTE_BATCH = 50;
const MAX_BATCHES_PER_CYCLE = 40;
const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 5 * 60_000;
export const PARKED_ALARM_MS = 60 * 60_000;

export interface UploaderStatus {
  paused: boolean;
  pausedReason: string | null;
  lastSuccessAt: number | null;
  lastRejected: { kind: OutboxKind; ts: number; code: string; at: number } | null;
  rejectedCount: number;
  inFlight: OutboxKind[];
}

export interface UploaderOptions {
  store: LocalStore;
  provider: dp.DataProviderV2;
  auth: AuthManager;
  reporter: Reporter;
  streamId: string;
  now?: () => number;
  random?: () => number;
  /** Interval of the flush loop (default 5 s). */
  intervalMs?: number;
}

/** `isolate`: a rejected batch is being narrowed to single items; keep going within the cycle. */
type Outcome = "uploaded" | "retry" | "parked" | "paused" | "isolate";

const SIGNED_OUT = "signed out — data stored locally";

class Permanent extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

export class Uploader {
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly inFlight = new Set<OutboxKind>();
  private readonly failures = new Map<OutboxKind, { count: number; until: number }>();
  /** Kinds in single-item mode after a rejected batch: how many single sends remain. */
  private readonly isolate = new Map<OutboxKind, number>();
  /** Items settled during the current send without being uploaded (parked, superseded). */
  private settled = new Set<number>();
  /** Auth re-check backoff (signed-out pause, or a session check that could not answer). */
  private authFailures = 0;
  private authRetryAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private paused: string | null = null;
  private lastSuccessAt: number | null = null;
  private lastRejected: UploaderStatus["lastRejected"] = null;
  private rejected = 0;
  private cycle: Promise<void> | null = null;

  constructor(private readonly o: UploaderOptions) {
    this.now = o.now ?? Date.now;
    this.random = o.random ?? Math.random;
  }

  get status(): UploaderStatus {
    return {
      paused: this.paused !== null,
      pausedReason: this.paused,
      lastSuccessAt: this.lastSuccessAt,
      lastRejected: this.lastRejected,
      rejectedCount: this.rejected,
      inFlight: [...this.inFlight],
    };
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => void this.flushOnce(), this.o.intervalMs ?? 5000);
    this.timer.unref();
    this.o.auth.onChange((state) => {
      if (state === "signed-in") {
        this.resume();
        void this.flushOnce();
      }
    });
  }

  async stop(): Promise<void> {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    await this.cycle?.catch(() => undefined);
  }

  /** Clears the signed-out pause (after a new sign-in or a successful session check). */
  resume(): void {
    this.authFailures = 0;
    this.authRetryAt = 0;
    if (this.paused === null) return;
    this.paused = null;
    this.failures.clear();
    this.o.reporter.clear("outbox-paused");
  }

  /** One pass over every kind. Re-entrant calls wait for the running pass. */
  flushOnce(): Promise<void> {
    if (this.cycle !== null) return this.cycle;
    this.cycle = this.run().finally(() => {
      this.cycle = null;
    });
    return this.cycle;
  }

  private async run(): Promise<void> {
    try {
      if (!this.o.auth.isSignedIn()) {
        this.pause(SIGNED_OUT);
        return;
      }
      // While paused (or after a session check that could not answer) the session is re-checked
      // with backoff — never every cycle, so the "paused" alert does not flap.
      if (this.authRetryAt > this.now()) return;
      const auth = await this.o.auth.validate();
      if (auth !== "valid") {
        if (auth === "invalid") this.pause(SIGNED_OUT);
        this.deferAuth();
        return;
      }
      // Probe: the pause is lifted for this pass, but the alert stays until a whole pass runs
      // without being paused again (no raise/clear flapping on a persistent denial).
      this.paused = null;
      for (const kind of OUTBOX_KINDS) {
        if (this.paused !== null) return;
        await this.flushKind(kind);
      }
      if (this.paused === null) {
        this.authFailures = 0;
        this.authRetryAt = 0;
        this.o.reporter.clear("outbox-paused");
      }
    } catch (error) {
      // Nothing may escape the loop: log and carry on at the next interval.
      this.o.reporter.report("error", "flush-failed", "unexpected error in the outbox flush", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private pause(reason: string): void {
    this.paused = reason;
    this.o.reporter.raise("outbox-paused", reason);
  }

  /** The next session re-check waits with exponential backoff. */
  private deferAuth(): void {
    this.authFailures += 1;
    this.authRetryAt = this.now() + this.jittered(this.authFailures);
  }

  private jittered(count: number): number {
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (count - 1));
    return Math.round(base * (0.5 + this.random() * 0.5));
  }

  private backoff(kind: OutboxKind): number {
    const f = this.failures.get(kind) ?? { count: 0, until: 0 };
    f.count += 1;
    f.until = this.now() + this.jittered(f.count);
    this.failures.set(kind, f);
    return f.until;
  }

  /** The retry note keeps an `unknown` outcome marked until a read-back settles it. */
  private note(items: readonly OutboxItem[], text: string): string {
    return items.some((i) => i.lastError?.startsWith("unknown") === true)
      ? `unknown: ${text}`
      : `transient: ${text}`;
  }

  private async flushKind(kind: OutboxKind): Promise<void> {
    if (this.inFlight.has(kind)) return;
    this.inFlight.add(kind);
    try {
      for (let batches = 0; batches < MAX_BATCHES_PER_CYCLE; batches++) {
        const until = this.failures.get(kind)?.until ?? 0;
        if (until > this.now()) return;
        const limit = kind === "minute" && !this.isolate.has(kind) ? MINUTE_BATCH : 1;
        const items = this.eligible(kind, this.o.store.pendingItems(kind, this.now(), limit));
        if (items.length === 0) return;
        const outcome = await this.send(kind, items);
        if (outcome !== "uploaded" && outcome !== "parked" && outcome !== "isolate") return;
        if (outcome === "uploaded") this.failures.delete(kind);
      }
    } finally {
      this.inFlight.delete(kind);
    }
  }

  /** A session's end waits until all its minutes are uploaded (they must reach it while open). */
  private eligible(kind: OutboxKind, items: OutboxItem[]): OutboxItem[] {
    if (kind !== "session-end") return items;
    return items.filter(
      (i) => i.sessionId === null || !this.o.store.hasPending("minute", i.sessionId),
    );
  }

  private async send(kind: OutboxKind, items: OutboxItem[]): Promise<Outcome> {
    const { store } = this.o;
    this.settled = new Set();
    try {
      const readBackFirst = items.some((i) => i.lastError?.startsWith("unknown") === true);
      let uploaded: number[];
      if (kind === "minute") uploaded = await this.sendMinutes(items, readBackFirst);
      else if (kind === "hour")
        uploaded = await this.sendHour(items[0] as OutboxItem, readBackFirst);
      else if (kind === "session-start")
        uploaded = await this.sendSessionStart(items[0] as OutboxItem);
      else if (kind === "session-counters")
        uploaded = await this.sendCounters(items[0] as OutboxItem);
      else uploaded = await this.sendSessionEnd(items[0] as OutboxItem);
      store.markUploaded(uploaded, this.now());
      if (uploaded.length > 0) this.lastSuccessAt = this.now();
      this.isolated(kind, items.length);
      const remaining = items.filter((i) => !uploaded.includes(i.id) && !this.settled.has(i.id));
      if (remaining.length > 0) return "retry";
      return uploaded.length > 0 ? "uploaded" : "parked";
    } catch (error) {
      return this.classify(kind, items, error);
    }
  }

  private async classify(kind: OutboxKind, items: OutboxItem[], error: unknown): Promise<Outcome> {
    const { store, reporter } = this.o;
    if (error instanceof Permanent) {
      return this.parkOrIsolate(kind, items, error.code, error.message);
    }
    const err = dp.mapError(error);
    const ids = items.map((i) => i.id);
    // Progress reported by a partially failed chunked write is honoured.
    const done = err.partial?.writtenSoFar;
    if (done !== undefined && kind === "minute") {
      const doneIds = items.filter((i) => done.includes(i.ts)).map((i) => i.id);
      store.markUploaded(doneIds, this.now());
    }
    const pending = items.filter((i) => !(done?.includes(i.ts) ?? false));
    const pendingIds = pending.map((i) => i.id);
    switch (err.code) {
      case "permission-denied":
      case "unauthenticated": {
        const auth = err.code === "permission-denied" ? await this.o.auth.validate() : "invalid";
        if (auth === "invalid") {
          this.pause(SIGNED_OUT);
          this.deferAuth();
          return "paused";
        }
        if (auth === "unknown") {
          // Cannot tell a revoked session from a real denial right now: never park on a guess.
          const next = this.backoff(kind);
          store.markRetry(pendingIds, this.note(pending, `${err.code}, session unchecked`), next);
          reporter.report("warn", "upload-denied-unchecked", "write denied; session check failed", {
            kind,
          });
          return "retry";
        }
        return this.parkOrIsolate(kind, pending, err.code, err.message);
      }
      case "unavailable":
      case "rate-limited": {
        const next = this.backoff(kind);
        store.markRetry(pendingIds, this.note(pending, err.code), next);
        reporter.report("warn", "upload-transient", `upload failed (${err.code}); retrying`, {
          kind,
        });
        return "retry";
      }
      case "outcome-unknown": {
        // The write may have landed. Mark the items so the next attempt reads back first.
        const next = this.backoff(kind);
        store.markRetry(pendingIds, "unknown: no acknowledgement", next);
        reporter.report(
          "warn",
          "upload-unknown",
          "no acknowledgement; will read back before retrying",
          { kind },
        );
        // Try the read-back right away: a lost ack is usually reconcilable now.
        try {
          const fresh = store
            .pendingItems(kind, Number.MAX_SAFE_INTEGER, items.length)
            .filter((i) => ids.includes(i.id));
          const uploaded = await this.reconcile(kind, fresh);
          store.markUploaded(uploaded, this.now());
          if (uploaded.length > 0) {
            this.lastSuccessAt = this.now();
            this.failures.delete(kind);
          }
        } catch {
          // still unknown: it stays pending with its backoff
        }
        return "retry";
      }
      case "invalid-argument":
      case "invalid-data":
      case "conflict":
      case "already-exists":
        return this.parkOrIsolate(kind, pending, err.code, err.message);
      default: {
        const next = this.backoff(kind);
        store.markRetry(pendingIds, this.note(pending, err.code), next);
        reporter.report("warn", "upload-failed", `upload failed (${err.code}); retrying`, { kind });
        return "retry";
      }
    }
  }

  /**
   * A rejected batch is narrowed to single items so only the offender is parked. Single-item mode
   * lasts until the rejected batch has been walked (each single send, successful or parked, counts)
   * or the offender is parked — it never sticks.
   */
  private parkOrIsolate(
    kind: OutboxKind,
    items: OutboxItem[],
    code: string,
    message: string,
  ): Outcome {
    if (items.length > 1) {
      this.isolate.set(kind, items.length);
      return "isolate";
    }
    const item = items[0];
    if (item === undefined) return "retry";
    this.parkSingle(item, code, message);
    this.isolate.delete(kind);
    return "parked";
  }

  /** One single send in single-item mode is done. */
  private isolated(kind: OutboxKind, sent: number): void {
    const left = this.isolate.get(kind);
    if (left === undefined) return;
    if (sent > 1 || left <= 1) this.isolate.delete(kind);
    else this.isolate.set(kind, left - 1);
  }

  /** A record that fails validation before sending: quarantined, parked, counted, logged. */
  private rejectInvalid(item: OutboxItem, reason: string): void {
    this.o.store.quarantine(item.kind, reason, item.payload, this.now());
    this.parkSingle(item, "invalid-data", `failed validation before send: ${reason}`);
  }

  /** An older revision of a recomputed record: never sent (it would overwrite a newer one). */
  private supersededBy(item: OutboxItem): boolean {
    if (!this.o.store.hasNewerRevision(item)) return false;
    this.o.store.supersede(item.id, this.now());
    this.settled.add(item.id);
    return true;
  }

  // ── per-kind writers (each returns the outbox ids confirmed uploaded) ─────────────────────────

  private async sendMinutes(items: OutboxItem[], readBackFirst: boolean): Promise<number[]> {
    const { streamId } = this.o;
    const valid: { item: OutboxItem; record: v2.MinuteRecord }[] = [];
    for (const item of items) {
      const parsed = v2.MinuteRecordSchema.safeParse(safeParse(item.payload));
      if (!parsed.success) {
        // Fails validation before sending: set aside, counted, never thrown into the loop.
        this.rejectInvalid(item, parsed.error.message);
        continue;
      }
      valid.push({ item, record: parsed.data });
    }
    if (valid.length === 0) return [];
    const confirmed: number[] = [];
    let toWrite = valid;
    if (readBackFirst) {
      const found = await this.readMinutes(valid.map((v) => v.record));
      toWrite = [];
      for (const v of valid) {
        const stored = found.get(v.record.ts);
        if (stored === undefined) toWrite.push(v);
        else if (sameJson(stored, v.record)) confirmed.push(v.item.id);
        else throw new Permanent("stored minute differs from the local one", "conflict");
      }
    }
    if (toWrite.length > 0) {
      const result = await this.o.provider.writeMinutes(
        streamId,
        toWrite.map((v) => v.record),
      );
      const existing = new Map(result.existing.map((e) => [e.ts, e.sessionId]));
      for (const v of toWrite) {
        if (!result.alreadyExisted.includes(v.record.ts)) {
          confirmed.push(v.item.id);
          continue;
        }
        // Already there: our own earlier write (same session) is a harmless replay; anything else
        // is a conflicting minute and is never overwritten (write-once, ADR-006).
        if (existing.get(v.record.ts) === v.record.sessionId) confirmed.push(v.item.id);
        else {
          this.parkSingle(v.item, "conflict", "a minute from another session exists at this time");
        }
      }
    }
    return confirmed;
  }

  private parkSingle(item: OutboxItem, code: string, message: string): void {
    this.o.store.park(item.id, `${code}: ${message}`, this.now());
    this.settled.add(item.id);
    this.rejected += 1;
    this.lastRejected = { kind: item.kind, ts: item.ts, code, at: this.now() };
    this.o.reporter.report("error", "write-rejected", `write rejected (${code}); item parked`, {
      kind: item.kind,
      ts: item.ts,
      code,
    });
  }

  private async readMinutes(
    records: readonly v2.MinuteRecord[],
  ): Promise<Map<number, v2.MinuteRecord>> {
    const first = Math.min(...records.map((r) => r.ts));
    const last = Math.max(...records.map((r) => r.ts));
    const out = new Map<number, v2.MinuteRecord>();
    let cursor: string | null = null;
    do {
      const page: dp.Page<v2.MinuteRecord> = await this.o.provider.readMinutes(this.o.streamId, {
        fromTs: first,
        toTs: last + 1,
        cursor,
      });
      for (const m of page.items) out.set(m.ts, m);
      cursor = page.nextCursor;
    } while (cursor !== null);
    return out;
  }

  private async sendHour(item: OutboxItem, readBackFirst: boolean): Promise<number[]> {
    // Always the newest revision of an hour: an older one (e.g. unparked, or delayed by a backoff)
    // would overwrite a newer entry on the server.
    if (this.supersededBy(item)) return [];
    const entry = v2.HourEntrySchema.safeParse(safeParse(item.payload));
    if (!entry.success) {
      this.rejectInvalid(item, entry.error.message);
      return [];
    }
    const { day, hh } = dayAndHour(item.ts);
    const current = await this.o.provider.getDaySummary(this.o.streamId, day);
    if (readBackFirst || current !== null) {
      const stored = current?.hours[hh];
      if (stored !== undefined && sameJson(stored, entry.data)) return [item.id];
    }
    // Merge this one hour into the day document: the other hours are kept as stored.
    const summary: v2.DaySummary = {
      schemaVersion: 2,
      streamId: this.o.streamId,
      day,
      hours: { ...(current?.hours ?? {}), [hh]: entry.data },
      updatedAt: this.now(),
    };
    await this.o.provider.putDaySummary(summary);
    return [item.id];
  }

  private async sendSessionStart(item: OutboxItem): Promise<number[]> {
    const session = v2.SessionSchema.safeParse(safeParse(item.payload));
    if (!session.success) {
      this.rejectInvalid(item, session.error.message);
      return [];
    }
    try {
      await this.o.provider.startSession(session.data);
    } catch (error) {
      const err = dp.mapError(error);
      if (
        err.code !== "already-exists" &&
        err.code !== "conflict" &&
        err.code !== "outcome-unknown"
      )
        throw err;
      const found = await this.findSession(session.data.id);
      if (found === null)
        throw err.code === "outcome-unknown"
          ? err
          : new Permanent("session exists but cannot be read back", err.code);
      if (found.startedAt !== session.data.startedAt)
        throw new Permanent("a different session has this id", "conflict");
    }
    return [item.id];
  }

  /** Read-back of one session by id (server only). */
  private findSession(id: string): Promise<v2.Session | null> {
    return this.o.provider.getSession(this.o.streamId, id);
  }

  private async sendCounters(item: OutboxItem): Promise<number[]> {
    if (this.supersededBy(item)) return [];
    const counters = v2.SessionCountersSchema.safeParse(safeParse(item.payload));
    if (!counters.success || item.sessionId === null) {
      this.rejectInvalid(item, counters.success ? "no session id" : counters.error.message);
      return [];
    }
    try {
      await this.o.provider.updateSessionCounters(this.o.streamId, item.sessionId, counters.data);
    } catch (error) {
      const err = dp.mapError(error);
      // The session may already be closed by its (later) end item: stale counters are superseded.
      if (err.code === "conflict") return [item.id];
      throw err;
    }
    return [item.id];
  }

  private async sendSessionEnd(item: OutboxItem): Promise<number[]> {
    const end = parseSessionEnd(safeParse(item.payload));
    if (typeof end === "string" || item.sessionId === null) {
      this.rejectInvalid(item, typeof end === "string" ? end : "no session id");
      return [];
    }
    try {
      await this.o.provider.endSession(this.o.streamId, item.sessionId, end);
    } catch (error) {
      const err = dp.mapError(error);
      if (err.code !== "conflict" && err.code !== "outcome-unknown") throw err;
      const found = await this.findSession(item.sessionId);
      if (found?.endedAt === end.endedAt && found.endReason === end.endReason) return [item.id];
      if (found === null || err.code === "outcome-unknown") throw err;
      throw new Permanent("the session was closed with different values", "conflict");
    }
    return [item.id];
  }

  /** Read-back of items whose outcome is unknown; returns the ids confirmed uploaded. */
  private async reconcile(kind: OutboxKind, items: OutboxItem[]): Promise<number[]> {
    if (items.length === 0) return [];
    if (kind === "minute") {
      const records = items
        .map((i) => v2.MinuteRecordSchema.safeParse(safeParse(i.payload)))
        .flatMap((p) => (p.success ? [p.data] : []));
      if (records.length === 0) return [];
      const found = await this.readMinutes(records);
      return items
        .filter((i) => {
          const r = found.get(i.ts);
          return r !== undefined && sameJson(r, safeParse(i.payload));
        })
        .map((i) => i.id);
    }
    if (kind === "hour") {
      const item = items[0] as OutboxItem;
      const { day, hh } = dayAndHour(item.ts);
      const stored = (await this.o.provider.getDaySummary(this.o.streamId, day))?.hours[hh];
      return stored !== undefined && sameJson(stored, safeParse(item.payload)) ? [item.id] : [];
    }
    return [];
  }

  /** Queue depth per kind and parked count (status). */
  depth(): { pending: Record<OutboxKind, number>; parked: number } {
    const c = this.o.store.outboxCounts();
    return { pending: c.pending, parked: c.parked };
  }
}

/** The `session-end` payload, or why it is invalid. */
function parseSessionEnd(
  value: unknown,
): { endedAt: number; endReason: v2.EndReason; counters: v2.SessionCounters } | string {
  if (value === null || typeof value !== "object") return "not an object";
  const v = value as Record<string, unknown>;
  const endedAt = v["endedAt"];
  if (typeof endedAt !== "number" || !Number.isSafeInteger(endedAt) || endedAt < 0)
    return "endedAt is not a timestamp";
  const reason = v2.EndReasonSchema.safeParse(v["endReason"]);
  if (!reason.success) return `endReason: ${reason.error.message}`;
  const counters = v2.SessionCountersSchema.safeParse(v["counters"]);
  if (!counters.success) return `counters: ${counters.error.message}`;
  return { endedAt, endReason: reason.data, counters: counters.data };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Structural equality of two JSON-like values independent of key order. */
export function sameJson(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export { hourStartOf };
