/**
 * The agent (spec 0087 FR6): owns source → framer → classifier → pipeline → store → outbox and the
 * supporting loops (clock, disk, live, heartbeat). Everything with I/O is injected, so the same
 * object runs against a serial port, the virtual detector, a fake source, and an in-memory provider.
 */
import type { v2 as dp } from "@muonhub/data-provider";
import type { v2 } from "@muonhub/shared";
import { MinuteAggregator } from "./aggregation/aggregator.js";
import { ClockGate, CLOCK_POLL_MS, type ClockProbe } from "./clock/clock.js";
import { classifyDisk, type DiskLevel, type DiskProbe } from "./disk.js";
import { LineFramer, type FramedLine } from "./framing/framer.js";
import { LivePublisher } from "./live/live.js";
import { createParser, type LineParser } from "./parsing/parser.js";
import type { Reporter } from "./reporter.js";
import { LineClassifier } from "./session/classifier.js";
import { Pipeline, newSessionId } from "./session/pipeline.js";
import { recoverOpenSessions } from "./session/recovery.js";
import { SourceSupervisor } from "./sources/supervisor.js";
import type { SourceFactory } from "./sources/types.js";
import { deviceLabel, type AgentStatus } from "./status.js";
import type { LocalStore } from "./store/types.js";
import { AuthManager, type RefreshTokenSupport } from "./sync/auth.js";
import type { CredentialStore } from "./sync/credentials.js";
import { PARKED_ALARM_MS, Uploader } from "./sync/uploader.js";

export interface AgentDeps {
  version: string;
  deviceType: v2.DeviceType;
  /** Null until the setup wizard has bound a stream: only the raw layer is written meanwhile. */
  streamId: string | null;
  deviceId: string;
  store: LocalStore;
  reporter: Reporter;
  factory: SourceFactory;
  provider: dp.DataProviderV2 | null;
  refresh: RefreshTokenSupport | null;
  credentials: CredentialStore;
  clockProbe: ClockProbe;
  diskProbe: DiskProbe;
  saturation?: { value: number; unit: v2.AmplitudeUnit } | undefined;
  silenceWindowMs: number;
  disk: { lowBytes: number; floorBytes: number };
  /** Hold minute output until NTP is synchronized (boot). Off for synthetic sources. */
  holdForClock: boolean;
  synthetic: boolean;
  bootTimeMs: number;
  now?: () => number;
  /** Test knobs. */
  intervals?: {
    uploaderMs?: number;
    diskMs?: number;
    clockMs?: number;
    backoffMinMs?: number;
    backoffMaxMs?: number;
  };
  publishPublic?: boolean;
  clockHoldMs?: number;
}

export class Agent {
  readonly reporter: Reporter;
  readonly store: LocalStore;
  readonly auth: AuthManager | null;
  readonly uploader: Uploader | null;
  readonly live: LivePublisher | null;
  readonly supervisor: SourceSupervisor;
  readonly pipeline: Pipeline;
  readonly gate: ClockGate;
  readonly parser: LineParser;
  /** Resolves when a finite source (virtual detector) has ended and everything is flushed. */
  readonly finished: Promise<void>;

  private readonly now: () => number;
  private readonly classifier: LineClassifier;
  private framer: LineFramer;
  private readonly startedAt: number;
  private restarts = 0;
  private timers: NodeJS.Timeout[] = [];
  private lastMinute: AgentStatus["lastMinute"] = null;
  private storageHalted = false;
  private diskLevel: DiskLevel = "ok";
  private diskFree: number | null = null;
  private stopping = false;
  private resolveFinished!: () => void;
  private readonly rawListeners = new Set<(line: FramedLine) => void>();
  private readonly extraStatus = new Map<string, () => unknown>();

  constructor(private readonly d: AgentDeps) {
    this.now = d.now ?? Date.now;
    this.startedAt = this.now();
    this.reporter = d.reporter;
    this.store = d.store;
    this.reporter.attachStore(d.store);
    this.finished = new Promise<void>((resolve) => {
      this.resolveFinished = resolve;
    });
    this.gate = new ClockGate(this.now, {
      hold: d.holdForClock,
      ...(d.clockHoldMs === undefined ? {} : { holdMs: d.clockHoldMs }),
    });
    this.parser = createParser(d.deviceType);
    this.framer = new LineFramer({ recordMarker: d.deviceType.parser.recordMarker });
    this.classifier = new LineClassifier({
      deviceId: d.deviceId,
      parser: this.parser,
      deviceType: d.deviceType,
      newSessionId,
      provenance: () => this.gate.provenance(),
      synthetic: d.synthetic,
      gapMs: d.silenceWindowMs,
    });
    this.pipeline = new Pipeline({
      store: d.store,
      reporter: d.reporter,
      aggregator: new MinuteAggregator({ deviceType: d.deviceType, saturation: d.saturation }),
      streamId: d.streamId ?? "unbound",
      deviceType: d.deviceType,
      agentVersion: d.version,
      gate: this.gate,
      now: this.now,
      restarts: 0,
      rawOnly: d.streamId === null,
      onMinute: (record) => {
        this.lastMinute = { ts: record.ts, n: record.n, liveSource: record.liveSource };
      },
      onLiveEvent: (e) => this.live?.push(e),
      onStorageError: (error) => void this.storageStop(`write failed: ${errorText(error)}`, true),
    });
    if (d.provider !== null && d.streamId !== null) {
      this.auth = new AuthManager(d.provider, d.refresh, d.credentials, d.reporter);
      this.uploader = new Uploader({
        store: d.store,
        provider: d.provider,
        auth: this.auth,
        reporter: d.reporter,
        streamId: d.streamId,
        now: this.now,
        ...(d.intervals?.uploaderMs === undefined ? {} : { intervalMs: d.intervals.uploaderMs }),
      });
      this.live = new LivePublisher({
        provider: d.provider,
        auth: this.auth,
        reporter: d.reporter,
        streamId: d.streamId,
        now: this.now,
        publishPublic: d.publishPublic === true,
        heartbeat: () => ({
          ...(this.lastMinute === null
            ? {}
            : { lastMinuteTs: this.lastMinute.ts, rawRatePerMin: this.lastMinute.n }),
        }),
        onDropped: (what) => {
          const c = this.pipeline.activeSession?.counters;
          if (c === undefined) return;
          if (what === "liveBatch") c.droppedLiveBatches += 1;
          else c.droppedHeartbeats += 1;
        },
      });
    } else {
      this.auth = null;
      this.uploader = null;
      this.live = null;
    }
    this.supervisor = new SourceSupervisor(
      {
        factory: d.factory,
        silenceMs: d.silenceWindowMs,
        now: this.now,
        ...(d.intervals?.backoffMinMs === undefined
          ? {}
          : { backoffMinMs: d.intervals.backoffMinMs }),
        ...(d.intervals?.backoffMaxMs === undefined
          ? {}
          : { backoffMaxMs: d.intervals.backoffMaxMs }),
      },
      {
        onConnected: () => this.onConnected(),
        onChunk: (chunk, host, mono) => this.onChunk(chunk.bytes, host, mono),
        onLost: (reason, kind) => this.onLost(reason, kind),
        onSilent: (ms) => this.onSilent(ms),
        onRecovered: () => this.reporter.clear("device-silent"),
        onEnded: () => void this.onEnded(),
        onOpenFailed: (error, retryMs) => {
          this.reporter.report(
            "warn",
            "device-open-failed",
            `cannot open the device: ${error.message}`,
            { retryMs },
          );
        },
        onHandlerError: (error) => {
          this.reporter.report("error", "handler-error", "unexpected error handling device data", {
            error: errorText(error),
          });
        },
      },
    );
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const { store, reporter } = this.d;
    // Crash recovery first: nothing new is recorded until the old session is closed.
    if (this.d.streamId !== null) {
      recoverOpenSessions({
        store,
        reporter,
        parser: this.parser,
        deviceType: this.d.deviceType,
        bootTimeMs: this.d.bootTimeMs,
        now: this.now,
      });
    }
    this.restarts = Number(store.getMeta("restarts") ?? "0") + 1;
    store.setMeta("restarts", String(this.restarts));
    reporter.report(
      "info",
      "agent-start",
      `agent ${this.d.version} started (restart #${String(this.restarts)})`,
      {
        deviceType: this.d.deviceType.id,
        source: this.d.factory.description,
      },
    );
    await this.pollClock();
    this.pipeline.start();
    this.supervisor.start();
    const every = (fn: () => Promise<void> | void, ms: number): void => {
      const t = setInterval(() => void Promise.resolve(fn()).catch(() => undefined), ms);
      t.unref();
      this.timers.push(t);
    };
    every(() => this.pollClock(), this.d.intervals?.clockMs ?? CLOCK_POLL_MS);
    every(() => this.checkDisk(), this.d.intervals?.diskMs ?? 30_000);
    await this.checkDisk();
    if (this.auth !== null) {
      this.auth.start();
      // Restoring the session must never delay recording.
      void this.auth.restore().then(() => this.uploader?.flushOnce());
      this.uploader?.start();
      this.live?.start();
    }
  }

  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    await this.supervisor.stop();
    this.pipeline.push(this.classifier.end("stop", this.endTime()));
    await this.pipeline.stop();
    if (this.uploader !== null) {
      await Promise.race([
        this.uploader.flushOnce(),
        new Promise((r) => setTimeout(r, 5000).unref()),
      ]);
      await this.uploader.stop();
    }
    await this.live?.stop();
    this.auth?.stop();
    this.resolveFinished();
  }

  /** Commits buffered lines and runs one upload pass (tests, shutdown). */
  async drain(): Promise<void> {
    this.pipeline.flush();
    await this.uploader?.flushOnce();
  }

  private endTime(): number {
    return this.d.synthetic ? (this.classifier.lastHostTs ?? this.now()) : this.now();
  }

  // ── source handlers ────────────────────────────────────────────────────────────────────────

  private onConnected(): void {
    this.framer = new LineFramer({ recordMarker: this.d.deviceType.parser.recordMarker });
    this.classifier.connected(this.now());
    this.reporter.report("info", "device-connected", `connected to ${this.d.factory.description}`);
    void this.pollClock();
  }

  private onChunk(bytes: Uint8Array, host: number, mono: bigint): void {
    if (this.reporter.has("device-silent")) this.reporter.clear("device-silent");
    const lines = this.framer.push(bytes, host, mono.toString());
    if (lines.length === 0) return;
    for (const line of lines) {
      for (const fn of this.rawListeners) {
        try {
          fn(line);
        } catch (error) {
          this.reporter.report("warn", "tap-failed", "a raw-line listener failed", {
            error: errorText(error),
          });
        }
      }
      this.pipeline.push(this.classifier.classify(line));
    }
  }

  private onLost(reason: string, kind: "error" | "silence" | "closed"): void {
    this.framer.discardPending();
    this.pipeline.push(this.classifier.end("usbLoss", this.endTime()));
    this.pipeline.flush();
    this.reporter.report("error", "device-lost", `device lost (${kind}): ${reason}`, { kind });
  }

  private onSilent(ms: number): void {
    this.reporter.raise(
      "device-silent",
      `device silent: no data for ${String(Math.round(ms / 1000))} s`,
    );
  }

  private async onEnded(): Promise<void> {
    this.pipeline.push(this.classifier.end("stop", this.endTime()));
    await this.drain();
    this.resolveFinished();
  }

  // ── clock ──────────────────────────────────────────────────────────────────────────────────

  private async pollClock(): Promise<void> {
    try {
      const before = this.gate.holding;
      this.gate.update(await this.d.clockProbe.read());
      this.gate.evaluate();
      const session = this.pipeline.activeSession;
      if (session !== null && !this.d.synthetic) {
        const now = this.gate.provenance();
        if (now.source !== session.timeProvenance.source) {
          if (before) {
            // Still inside the boot hold: the clock became synchronized, no session split needed.
            session.timeProvenance = now;
          } else {
            this.reporter.report(
              "warn",
              "clock-provenance-changed",
              "clock provenance changed; starting a new session",
              {
                from: session.timeProvenance.source,
                to: now.source,
              },
            );
            this.pipeline.push(this.classifier.end("configChange", this.endTime()));
            this.pipeline.flush();
          }
        }
      }
    } catch (error) {
      this.reporter.report("warn", "clock-probe-failed", "clock probe failed", {
        error: errorText(error),
      });
    }
  }

  // ── disk and storage errors ────────────────────────────────────────────────────────────────

  private async checkDisk(): Promise<void> {
    let free: number;
    try {
      free = await this.d.diskProbe.freeBytes();
    } catch (error) {
      this.reporter.report("warn", "disk-probe-failed", "cannot read free disk space", {
        error: errorText(error),
      });
      return;
    }
    this.diskFree = free;
    const level = classifyDisk(free, this.d.disk.lowBytes, this.d.disk.floorBytes);
    this.diskLevel = level;
    if (level === "ok") this.reporter.clear("disk-low");
    else
      this.reporter.raise("disk-low", `disk low: ${String(Math.round(free / 1e6))} MB free`, {
        free,
      });
    if (level === "floor" && !this.storageHalted) {
      await this.storageStop(
        `free space ${String(Math.round(free / 1e6))} MB is below the hard floor`,
        false,
      );
    } else if (level === "ok" && this.storageHalted) {
      await this.tryResume();
    }
  }

  /** Ends the session with `storageError` and stops acquisition cleanly (no restart loop). */
  private async storageStop(reason: string, writeFailed: boolean): Promise<void> {
    if (this.storageHalted || this.stopping) return;
    this.storageHalted = true;
    this.reporter.raise("storage-stopped", `acquisition stopped: ${reason}`);
    const at = this.endTime();
    const ops = this.classifier.end("storageError", at);
    // Disk floor (the store still works): the normal path ends the session.
    if (!writeFailed) {
      this.pipeline.push(ops);
      this.pipeline.flush();
    }
    // A failing store (or a flush that just failed): the pipeline closes whatever is still open —
    // the partial minute and held minutes are counted, the end and its outbox item go in one
    // transaction, and if even that fails the session stays open in SQLite for recovery.
    this.pipeline.abortSession(at);
    this.pipeline.halt();
    await this.supervisor.stop();
  }

  private async tryResume(): Promise<void> {
    try {
      this.store.setMeta("resume-probe", String(this.now()));
      // Records a session end the failing store could not take (or throws: still not writable).
      this.pipeline.resume();
    } catch (error) {
      this.reporter.report("warn", "resume-failed", "the local store is still not writable", {
        error: errorText(error),
      });
      return;
    }
    this.reporter.clear("storage-stopped");
    this.storageHalted = false;
    this.supervisor.start();
    this.reporter.report(
      "info",
      "acquisition-resumed",
      "disk space available again; acquisition resumed",
    );
  }

  // ── taps and status ────────────────────────────────────────────────────────────────────────

  /** Every raw line, as soon as it is framed (mirror, bridge). A failing listener never stops acquisition. */
  onRawLine(fn: (line: FramedLine) => void): () => void {
    this.rawListeners.add(fn);
    return () => this.rawListeners.delete(fn);
  }

  /** Lets the panel/bridge add their state to the status without the agent knowing them. */
  registerStatus(name: string, fn: () => unknown): void {
    this.extraStatus.set(name, fn);
  }

  /** Extra status contributed by a registered component. */
  extra(name: string): unknown {
    return this.extraStatus.get(name)?.();
  }

  status(): AgentStatus {
    const now = this.now();
    const session = this.pipeline.activeSession;
    const counts = this.store.outboxCounts();
    if (session !== null) session.counters.parkedItems = counts.parked;
    const oldest = this.store.oldestParkedAt();
    const up = this.uploader?.status;
    const prov = this.gate.provenance();
    const sourceState = this.supervisor.status;
    const signedIn = this.auth?.isSignedIn() ?? false;
    const label =
      this.auth === null
        ? "cloud sync not configured — data stored locally"
        : !signedIn
          ? "signed out — data stored locally"
          : up?.paused === true
            ? (up.pausedReason ?? "paused")
            : "signed in";
    const bridge = this.extra("bridge") as { state: string; clients: number } | undefined;
    const panel = this.extra("panel") as { state: string } | undefined;
    return {
      version: this.d.version,
      startedAt: this.startedAt,
      restarts: this.restarts,
      now,
      device: {
        description: this.supervisor.description,
        baud: this.supervisor.baud,
        label: this.storageHalted ? "stopped" : deviceLabel(sourceState),
        lastDataAt: this.supervisor.lastDataAt === 0 ? null : this.supervisor.lastDataAt,
        synthetic: this.d.synthetic,
      },
      deviceType: { id: this.d.deviceType.id, version: this.d.deviceType.version },
      streamId: this.d.streamId,
      session:
        session === null
          ? null
          : { id: session.id, startedAt: session.startedAt, counters: { ...session.counters } },
      lastMinute: this.lastMinute,
      rawRatePerMin: this.lastMinute?.n ?? null,
      heldMinutes: this.pipeline.heldMinutes,
      queue: {
        pending: counts.pending,
        parked: counts.parked,
        oldestParkedAgeMs: oldest === null ? null : now - oldest,
      },
      parkedAlarm: oldest !== null && now - oldest > PARKED_ALARM_MS,
      sync: {
        label,
        signedIn,
        paused: up?.paused ?? false,
        lastSuccessAt: up?.lastSuccessAt ?? null,
        lastRejected: up?.lastRejected ?? null,
        rejectedCount: up?.rejectedCount ?? 0,
      },
      live: {
        droppedLiveBatches: this.live?.counters.droppedLiveBatches ?? 0,
        droppedHeartbeats: this.live?.counters.droppedHeartbeats ?? 0,
        pruneErrors: this.live?.counters.pruneErrors ?? 0,
        lastHeartbeatAt: this.live?.counters.lastHeartbeatAt ?? null,
      },
      clock: {
        synchronized: this.gate.synchronized,
        source: prov.source,
        offsetMs: prov.offsetMs,
        holding: this.gate.holding,
      },
      disk: { freeBytes: this.diskFree, level: this.diskLevel },
      rawLines: this.store.rawLineCount(),
      conditions: this.reporter.list(),
      panel: { enabled: panel !== undefined, state: panel?.state ?? "off" },
      bridge: {
        enabled: bridge !== undefined,
        state: bridge?.state ?? "off",
        clients: bridge?.clients ?? 0,
      },
    };
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
