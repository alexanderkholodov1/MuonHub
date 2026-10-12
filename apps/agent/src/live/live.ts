/**
 * Live window batching, pruning and the status heartbeat (spec 0087 FR13). Everything here is
 * BEST EFFORT and deliberately outside the durable outbox: a failed batch is dropped and counted
 * (`droppedLiveBatches`, `droppedHeartbeats`) and logged at warn level, never retried into the past.
 * Failures are never treated as "no data": counters and the status make them visible.
 */
import { v2 as dp } from "@muonhub/data-provider";
import type { v2 } from "@muonhub/shared";
import type { Reporter } from "../reporter.js";
import type { AuthManager } from "../sync/auth.js";

export const LIVE_BATCH_MS = 5000;
export const HEARTBEAT_MS = 60_000;
export const PRUNE_MS = 60_000;
const BUFFER_CAP = 5000;

export interface LiveCounters {
  droppedLiveBatches: number;
  droppedHeartbeats: number;
  staleLiveEvents: number;
  overflowLiveEvents: number;
  pruneErrors: number;
  lastHeartbeatAt: number | null;
}

export interface LiveOptions {
  provider: dp.DataProviderV2;
  auth: AuthManager;
  reporter: Reporter;
  streamId: string;
  now?: () => number;
  /** Publish the public subset (`statusPublic`); off until ADR-005 §6 is decided (step 10). */
  publishPublic?: boolean;
  /** Snapshot for the heartbeat. */
  heartbeat: () => { lastMinuteTs?: number; rawRatePerMin?: number };
  /** Counts a dropped item against the active session (spec 0087 counters). */
  onDropped?: (what: "liveBatch" | "heartbeat") => void;
}

export class LivePublisher {
  private buffer: v2.LiveEvent[] = [];
  private timers: NodeJS.Timeout[] = [];
  private batchInFlight = false;
  private readonly now: () => number;
  readonly counters: LiveCounters = {
    droppedLiveBatches: 0,
    droppedHeartbeats: 0,
    staleLiveEvents: 0,
    overflowLiveEvents: 0,
    pruneErrors: 0,
    lastHeartbeatAt: null,
  };

  constructor(private readonly o: LiveOptions) {
    this.now = o.now ?? Date.now;
  }

  push(event: v2.LiveEvent): void {
    this.buffer.push(event);
    if (this.buffer.length > BUFFER_CAP) {
      this.buffer.splice(0, this.buffer.length - BUFFER_CAP);
      this.counters.overflowLiveEvents += 1;
    }
  }

  start(): void {
    if (this.timers.length > 0) return;
    const every = (fn: () => Promise<void>, ms: number): void => {
      const t = setInterval(() => void fn(), ms);
      t.unref();
      this.timers.push(t);
    };
    every(() => this.flushBatch(), LIVE_BATCH_MS);
    every(() => this.heartbeat(true), HEARTBEAT_MS);
    every(() => this.prune(), PRUNE_MS);
  }

  async stop(): Promise<void> {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    await this.heartbeat(false);
  }

  /** Writes the buffered events; a failure drops the batch (counted), never retries it. */
  async flushBatch(): Promise<void> {
    if (this.batchInFlight || this.buffer.length === 0) return;
    const cutoff = this.now() - dp.LIVE_RETENTION_MS + 30_000;
    const fresh = this.buffer.filter((e) => e.t >= cutoff);
    this.counters.staleLiveEvents += this.buffer.length - fresh.length;
    this.buffer = [];
    if (fresh.length === 0) return;
    if (!this.o.auth.isSignedIn()) {
      this.dropBatch("signed out");
      return;
    }
    this.batchInFlight = true;
    try {
      await this.o.provider.pushLiveEvents(this.o.streamId, fresh);
    } catch (error) {
      this.dropBatch(error instanceof Error ? error.message : String(error));
    } finally {
      this.batchInFlight = false;
    }
  }

  private dropBatch(why: string): void {
    this.counters.droppedLiveBatches += 1;
    this.o.onDropped?.("liveBatch");
    this.o.reporter.report("warn", "live-batch-dropped", "a live batch was dropped", { why });
  }

  async heartbeat(online: boolean): Promise<void> {
    if (!this.o.auth.isSignedIn()) {
      if (online) this.dropHeartbeat("signed out");
      return;
    }
    const snap = this.o.heartbeat();
    const status: v2.StreamStatus = {
      lastSeenAt: this.now(),
      agentOnline: online,
      ...(snap.lastMinuteTs === undefined ? {} : { lastMinuteTs: snap.lastMinuteTs }),
      ...(snap.rawRatePerMin === undefined ? {} : { rawRatePerMin: snap.rawRatePerMin }),
    };
    try {
      await this.o.provider.setStatus(this.o.streamId, status, {
        publish: this.o.publishPublic === true,
      });
      this.counters.lastHeartbeatAt = status.lastSeenAt;
    } catch (error) {
      this.dropHeartbeat(error instanceof Error ? error.message : String(error));
    }
  }

  private dropHeartbeat(why: string): void {
    this.counters.droppedHeartbeats += 1;
    this.o.onDropped?.("heartbeat");
    this.o.reporter.report("warn", "heartbeat-dropped", "a status heartbeat was not written", {
      why,
    });
  }

  async prune(): Promise<void> {
    if (!this.o.auth.isSignedIn()) return;
    try {
      await this.o.provider.pruneLive(this.o.streamId);
    } catch (error) {
      this.counters.pruneErrors += 1;
      this.o.reporter.report("warn", "live-prune-failed", "live window pruning failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
