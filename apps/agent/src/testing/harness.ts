/**
 * Test harness: an Agent wired to an in-memory SQLite store, the in-memory data provider (with
 * fault injection), a fake clock probe and disk probe, and a scripted or virtual source. Used by the
 * integration tests (CA2–CA5, CA11–CA17); it is not part of the runtime.
 */
import { v2 as dp } from "@muonhub/data-provider";
import { v2 } from "@muonhub/shared";
import { Agent, type AgentDeps } from "../agent.js";
import type { ClockProbe, ClockReading } from "../clock/clock.js";
import type { DiskProbe } from "../disk.js";
import { memoryLogger } from "../log.js";
import { Reporter } from "../reporter.js";
import type { AgentChunk, AgentLineSource, SourceFactory } from "../sources/types.js";
import { openLocalStore } from "../store/sqlite.js";
import type { LocalStore } from "../store/types.js";
import type { RefreshTokenSupport } from "../sync/auth.js";
import { createMemoryCredentialStore } from "../sync/credentials.js";

export const STREAM_ID = "agentTestStream0123456789";
export const DEVICE_ID = "device-1";
export const T0 = Date.UTC(2026, 0, 1);

export class FakeClockProbe implements ClockProbe {
  reading: ClockReading = { synchronized: true, offsetMs: 1.5, known: true };
  read(): Promise<ClockReading> {
    return Promise.resolve(this.reading);
  }
}

export class FakeDisk implements DiskProbe {
  free = 50_000_000_000;
  freeBytes(): Promise<number> {
    return Promise.resolve(this.free);
  }
}

/** A source the test drives chunk by chunk (or scripts fully in advance). */
export class ScriptedSource {
  private queue: AgentChunk[] = [];
  private waiting: ((r: IteratorResult<AgentChunk>) => void) | null = null;
  private failure: Error | null = null;
  private done = false;
  closed = false;

  push(...chunks: AgentChunk[]): void {
    this.queue.push(...chunks);
    this.settle();
  }
  end(): void {
    this.done = true;
    this.settle();
  }
  fail(error: Error): void {
    this.failure = error;
    this.settle();
  }
  private settle(): void {
    const w = this.waiting;
    if (w === null) return;
    const next = this.queue.shift();
    if (next !== undefined) {
      this.waiting = null;
      w({ value: next, done: false });
    } else if (this.failure !== null) {
      this.waiting = null;
      w({ value: undefined, done: true });
    } else if (this.done) {
      this.waiting = null;
      w({ value: undefined, done: true });
    }
  }
  readonly source: AgentLineSource = {
    [Symbol.asyncIterator]: () => ({
      next: () => {
        const next = this.queue.shift();
        if (next !== undefined) return Promise.resolve({ value: next, done: false });
        if (this.failure !== null) {
          const f = this.failure;
          this.failure = null;
          return Promise.reject(f);
        }
        if (this.done) return Promise.resolve({ value: undefined, done: true });
        return new Promise<IteratorResult<AgentChunk>>((res) => {
          this.waiting = res;
        });
      },
    }),
    close: () => {
      this.closed = true;
      this.done = true;
      this.settle();
      return Promise.resolve();
    },
  };
}

export interface FakeFactory extends SourceFactory {
  sources: ScriptedSource[];
  openFailures: number;
}

/** Each open() yields a new ScriptedSource, recorded in `sources`. */
export function scriptedFactory(reconnect = true): FakeFactory {
  const f: FakeFactory = {
    description: "fake device",
    baud: 9600,
    reconnect,
    sources: [],
    openFailures: 0,
    open() {
      if (f.openFailures > 0) {
        f.openFailures -= 1;
        return Promise.reject(new Error("ENOENT: no such device"));
      }
      const s = new ScriptedSource();
      f.sources.push(s);
      return Promise.resolve(s.source);
    },
  };
  return f;
}

/** MuNRa data line at `eventId` with a device clock in ms and cumulative dead time in µs. */
export function munraLine(
  eventId: number,
  deviceMs: number,
  extra: { amp?: number; deadUs?: number; term?: string } = {},
): string {
  const amp = extra.amp ?? 100;
  const dead = extra.deadUs ?? eventId * 200;
  return `${String(eventId)}\t${String(deviceMs)}\t60\t1881\t${String(amp)}\t76800.0\t24.0\t${String(dead)}\t0\tCOSMIC${extra.term ?? "\r\n"}`;
}

export const enc = new TextEncoder();
export const chunk = (text: string, hostMs: number, monoMs?: number): AgentChunk => ({
  bytes: enc.encode(text),
  hostReceivedAtMs: hostMs,
  ...(monoMs === undefined ? {} : { monotonicNs: BigInt(Math.round(monoMs * 1e6)) }),
});

export interface Harness {
  agent: Agent;
  store: LocalStore;
  provider: dp.DataProviderV2;
  memory: dp.MemoryStore;
  clock: FakeClockProbe;
  disk: FakeDisk;
  logger: ReturnType<typeof memoryLogger>;
  reporter: Reporter;
  credentials: ReturnType<typeof createMemoryCredentialStore>;
  refresh: RefreshTokenSupport & { revoked: boolean };
}

export interface HarnessOptions {
  factory: SourceFactory;
  deviceType?: v2.DeviceType;
  synthetic?: boolean;
  holdForClock?: boolean;
  signedIn?: boolean;
  withProvider?: boolean;
  silenceWindowMs?: number;
  store?: LocalStore;
  memory?: dp.MemoryStore;
  now?: () => number;
  bootTimeMs?: number;
  disk?: { lowBytes: number; floorBytes: number };
  intervals?: AgentDeps["intervals"];
  clockHoldMs?: number;
  wrapProvider?: (p: dp.DataProviderV2) => dp.DataProviderV2;
  credentials?: ReturnType<typeof createMemoryCredentialStore>;
  refresh?: Harness["refresh"];
}

export async function makeHarness(o: HarnessOptions): Promise<Harness> {
  const store = o.store ?? (await openLocalStore({ path: ":memory:" }));
  const memory = o.memory ?? new dp.MemoryStore();
  const provider = dp.createMemoryProviderV2({ store: memory });
  const logger = memoryLogger();
  const reporter = new Reporter(logger, o.now ?? Date.now);
  const credentials = o.credentials ?? createMemoryCredentialStore();
  const refresh: Harness["refresh"] = o.refresh ?? {
    revoked: false,
    getRefreshToken: () => "refresh-token-1",
    signInWithRefreshToken: async () => {
      if (refresh.revoked) throw new dp.DataProviderError("invalid-credentials");
      return provider.signInWithEmail("agent@example.org", "pw-pw-pw-1");
    },
    checkSession: () => Promise.resolve(!refresh.revoked && provider.currentUser() !== null),
  };
  if (o.signedIn !== false && o.withProvider !== false) {
    if (!memory.accounts.size) await provider.createAccount("agent@example.org", "pw-pw-pw-1");
    else await provider.signInWithEmail("agent@example.org", "pw-pw-pw-1");
    credentials.write("refresh-token-1");
  }
  const clock = new FakeClockProbe();
  const disk = new FakeDisk();
  const agent = new Agent({
    version: "6.0.0-test",
    deviceType: o.deviceType ?? v2.MUNRA,
    streamId: STREAM_ID,
    deviceId: DEVICE_ID,
    store,
    reporter,
    factory: o.factory,
    provider: o.withProvider === false ? null : (o.wrapProvider?.(provider) ?? provider),
    refresh,
    credentials,
    clockProbe: clock,
    diskProbe: disk,
    silenceWindowMs: o.silenceWindowMs ?? 120_000,
    disk: o.disk ?? { lowBytes: 2_000_000_000, floorBytes: 200_000_000 },
    holdForClock: o.holdForClock ?? false,
    synthetic: o.synthetic ?? false,
    bootTimeMs: o.bootTimeMs ?? 0,
    ...(o.now === undefined ? {} : { now: o.now }),
    ...(o.intervals === undefined ? {} : { intervals: o.intervals }),
    ...(o.clockHoldMs === undefined ? {} : { clockHoldMs: o.clockHoldMs }),
  });
  return { agent, store, provider, memory, clock, disk, logger, reporter, credentials, refresh };
}

/** Reads every minute written to the cloud for the test stream. */
export async function cloudMinutes(h: Harness): Promise<v2.MinuteRecord[]> {
  const out: v2.MinuteRecord[] = [];
  let cursor: string | null = null;
  do {
    const page: dp.Page<v2.MinuteRecord> = await h.provider.readMinutes(STREAM_ID, {
      fromTs: 0,
      toTs: Number.MAX_SAFE_INTEGER - 1,
      limit: 5000,
      cursor,
    });
    out.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return out;
}

export interface ChunkPlan {
  fromHost: number;
  count: number;
  firstId: number;
  stepMs?: number;
  /** Monotonic clock reading at the first line (ms). */
  monoStart?: number;
  /** Added to the wall clock only (a clock step). */
  wallShift?: number;
  amp?: number;
}

/** One MuNRa event line per `stepMs` (default 1 s → 60 events per minute). */
export function dataChunks(plan: ChunkPlan): AgentChunk[] {
  const step = plan.stepMs ?? 1000;
  const out: AgentChunk[] = [];
  for (let i = 0; i < plan.count; i++) {
    const id = plan.firstId + i;
    out.push(
      chunk(
        munraLine(id, id * step, { amp: plan.amp ?? 100 + (id % 5) }),
        plan.fromHost + i * step + (plan.wallShift ?? 0),
        (plan.monoStart ?? 0) + i * step,
      ),
    );
  }
  return out;
}

/** Waits until `fn` is true (polling the event loop), or fails after `ms`. */
export async function until(fn: () => boolean | Promise<boolean>, ms = 3000): Promise<void> {
  const t0 = Date.now();
  while (!(await fn())) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for a condition");
    await new Promise((r) => setTimeout(r, 5));
  }
}
