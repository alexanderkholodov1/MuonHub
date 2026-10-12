/**
 * Source supervisor (spec 0087 FR4, FR4b): opens a source, feeds its chunks to the pipeline,
 * reports every loss, retries with backoff (1 s → 30 s), and watches for silence. A silent port is
 * never mistaken for a quiet detector: after one window the state is "silent" (and logged), after a
 * second the port is closed and reopened (the session ends with `usbLoss`).
 */
import type { AgentChunk, AgentLineSource, SourceFactory } from "./types.js";

export type SourceState =
  "connecting" | "connected" | "disconnected" | "silent" | "ended" | "stopped";

export interface SupervisorHandlers {
  onConnected(source: AgentLineSource): void;
  /** Called for every chunk with the host and monotonic stamps. */
  onChunk(chunk: AgentChunk, hostTs: number, monotonicNs: bigint): void;
  /** The source was lost (error, unplug, silence). The pipeline ends the session with usbLoss. */
  onLost(reason: string, kind: "error" | "silence" | "closed"): void;
  /** The port is open but silent for a whole window. */
  onSilent(silentForMs: number): void;
  onRecovered?(): void;
  /** A finite source reached its end (virtual detector). */
  onEnded(): void;
  onOpenFailed?(error: Error, nextRetryMs: number): void;
  onHandlerError(error: unknown): void;
}

export interface SupervisorOptions {
  factory: SourceFactory;
  silenceMs: number;
  backoffMinMs?: number;
  backoffMaxMs?: number;
  now?: () => number;
  monotonicNs?: () => bigint;
  sleep?: (ms: number) => Promise<void>;
}

export class SourceSupervisor {
  private state: SourceState = "connecting";
  private stopped = false;
  private current: AgentLineSource | null = null;
  private wake: (() => void) | null = null;
  private runPromise: Promise<void> | null = null;
  private lastChunkAt = 0;
  private firstMonoNs: bigint | null = null;
  private firstHostMs: number | null = null;

  constructor(
    private readonly options: SupervisorOptions,
    private readonly handlers: SupervisorHandlers,
  ) {}

  get status(): SourceState {
    return this.state;
  }

  get description(): string {
    return this.options.factory.description;
  }

  get baud(): number | null {
    return this.options.factory.baud;
  }

  /** Starts the loop (idempotent). */
  start(): void {
    if (this.runPromise !== null) return;
    this.stopped = false;
    this.runPromise = this.run();
  }

  /** Stops and waits for the loop to finish (idempotent). */
  async stop(): Promise<void> {
    this.stopped = true;
    this.wake?.();
    const src = this.current;
    if (src !== null) await src.close().catch(() => undefined);
    await this.runPromise;
    this.runPromise = null;
    this.state = "stopped";
  }

  /** Resolves when the loop ended (finite source) or was stopped. */
  done(): Promise<void> {
    return this.runPromise ?? Promise.resolve();
  }

  private sleep(ms: number): Promise<void> {
    if (this.options.sleep !== undefined) return this.options.sleep(ms);
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      t.unref();
      this.wake = (): void => {
        clearTimeout(t);
        resolve();
      };
    });
  }

  private stamp(chunk: AgentChunk): { host: number; mono: bigint } {
    // Host times are whole milliseconds (a simulated source reports fractions).
    const host = Math.round(chunk.hostReceivedAtMs);
    if (chunk.monotonicNs !== undefined) return { host, mono: chunk.monotonicNs };
    // A source without its own monotonic clock (the virtual detector): derive one from the host
    // time it reports, so wall and monotonic deltas agree and no clock step is invented.
    this.firstHostMs ??= host;
    this.firstMonoNs ??= this.options.monotonicNs?.() ?? 0n;
    return { host, mono: this.firstMonoNs + BigInt(Math.round((host - this.firstHostMs) * 1e6)) };
  }

  private async run(): Promise<void> {
    const min = this.options.backoffMinMs ?? 1000;
    const max = this.options.backoffMaxMs ?? 30_000;
    let delay = min;
    while (!this.stopped) {
      this.state = "connecting";
      let source: AgentLineSource;
      try {
        source = await this.options.factory.open();
      } catch (error) {
        this.state = "disconnected";
        const err = error instanceof Error ? error : new Error(String(error));
        this.safely(() => this.handlers.onOpenFailed?.(err, delay));
        await this.sleep(delay);
        delay = Math.min(max, delay * 2);
        continue;
      }
      this.current = source;
      this.state = "connected";
      this.firstHostMs = null;
      this.firstMonoNs = null;
      this.lastChunkAt = (this.options.now ?? Date.now)();
      this.safely(() => this.handlers.onConnected(source));
      const outcome = await this.pump(source);
      this.current = null;
      await source.close().catch(() => undefined);
      if (this.stopped) break;
      if (outcome.kind === "end" && !this.options.factory.reconnect) {
        this.state = "ended";
        this.safely(() => this.handlers.onEnded());
        return;
      }
      this.state = "disconnected";
      if (outcome.gotData) delay = min;
      this.safely(() =>
        this.handlers.onLost(
          outcome.reason,
          outcome.kind === "silence" ? "silence" : outcome.kind === "error" ? "error" : "closed",
        ),
      );
      await this.sleep(delay);
      delay = Math.min(max, delay * 2);
    }
    this.state = "stopped";
  }

  private async pump(
    source: AgentLineSource,
  ): Promise<{ kind: "end" | "error" | "silence"; reason: string; gotData: boolean }> {
    const iterator = source[Symbol.asyncIterator]();
    let gotData = false;
    let silentStage = 0;
    let abandon: ((v: "silence") => void) | null = null;
    const abandoned = new Promise<"silence">((resolve) => {
      abandon = resolve;
    });
    const timers: { t: NodeJS.Timeout | null } = { t: null };
    const arm = (): void => {
      if (timers.t !== null) clearTimeout(timers.t);
      timers.t = setTimeout(() => {
        silentStage += 1;
        if (silentStage === 1) {
          this.state = "silent";
          this.safely(() => this.handlers.onSilent(this.options.silenceMs));
          arm();
        } else {
          abandon?.("silence");
        }
      }, this.options.silenceMs);
      timers.t.unref();
    };
    arm();
    try {
      for (;;) {
        const next = iterator.next();
        const result = await Promise.race([next, abandoned]);
        if (result === "silence") {
          void next.catch(() => undefined);
          return {
            kind: "silence",
            reason: `no data for ${String(2 * this.options.silenceMs)} ms`,
            gotData,
          };
        }
        if (result.done === true) {
          return { kind: "end", reason: "source closed", gotData };
        }
        gotData = true;
        if (silentStage > 0) {
          silentStage = 0;
          this.state = "connected";
          this.safely(() => this.handlers.onRecovered?.());
        }
        arm();
        this.lastChunkAt = (this.options.now ?? Date.now)();
        const { host, mono } = this.stamp(result.value);
        this.safely(() => this.handlers.onChunk(result.value, host, mono));
        if (this.stopped) return { kind: "end", reason: "stopped", gotData };
      }
    } catch (error) {
      return {
        kind: "error",
        reason: error instanceof Error ? error.message : String(error),
        gotData,
      };
    } finally {
      if (timers.t !== null) clearTimeout(timers.t);
    }
  }

  private safely(fn: () => void): void {
    try {
      fn();
    } catch (error) {
      try {
        this.handlers.onHandlerError(error);
      } catch {
        // a failing error handler must not kill the loop
      }
    }
  }

  get lastDataAt(): number {
    return this.lastChunkAt;
  }
}
