import { describe, expect, it } from "vitest";
import { SourceSupervisor, type SupervisorHandlers } from "./supervisor.js";
import type { AgentChunk, AgentLineSource, SourceFactory } from "./types.js";

/** A source driven by the test: push chunks, end it, fail it, or leave it silent. */
function controllable(): {
  source: AgentLineSource;
  push(c: AgentChunk): void;
  end(): void;
  fail(e: Error): void;
  closed: () => boolean;
} {
  const queue: AgentChunk[] = [];
  let waiting: { res: (r: IteratorResult<AgentChunk>) => void; rej: (e: Error) => void } | null =
    null;
  let done = false;
  let err: Error | null = null;
  let closed = false;
  const settle = (): void => {
    if (waiting === null) return;
    if (queue.length > 0) {
      const w = waiting;
      waiting = null;
      w.res({ value: queue.shift() as AgentChunk, done: false });
    } else if (err !== null) {
      const w = waiting;
      waiting = null;
      w.rej(err);
    } else if (done) {
      const w = waiting;
      waiting = null;
      w.res({ value: undefined, done: true });
    }
  };
  return {
    source: {
      [Symbol.asyncIterator]: () => ({
        next: () =>
          new Promise<IteratorResult<AgentChunk>>((res, rej) => {
            waiting = { res, rej };
            settle();
          }),
      }),
      close: () => {
        closed = true;
        done = true;
        settle();
        return Promise.resolve();
      },
    },
    push: (c) => {
      queue.push(c);
      settle();
    },
    end: () => {
      done = true;
      settle();
    },
    fail: (e) => {
      err = e;
      settle();
    },
    closed: () => closed,
  };
}

function setup(silenceMs = 40) {
  const sources: ReturnType<typeof controllable>[] = [];
  let failOpen = 0;
  const factory: SourceFactory = {
    description: "fake",
    baud: 9600,
    reconnect: true,
    open: () => {
      if (failOpen > 0) {
        failOpen -= 1;
        return Promise.reject(new Error("ENOENT"));
      }
      const c = controllable();
      sources.push(c);
      return Promise.resolve(c.source);
    },
  };
  const events: string[] = [];
  const handlers: SupervisorHandlers = {
    onConnected: () => events.push("connected"),
    onChunk: (c) => events.push(`chunk:${new TextDecoder().decode(c.bytes)}`),
    onLost: (reason, kind) => events.push(`lost:${kind}`),
    onSilent: () => events.push("silent"),
    onRecovered: () => events.push("recovered"),
    onEnded: () => events.push("ended"),
    onOpenFailed: () => events.push("openFailed"),
    onHandlerError: (e) => events.push(`handlerError:${String(e)}`),
  };
  const sup = new SourceSupervisor(
    { factory, silenceMs, backoffMinMs: 5, backoffMaxMs: 20 },
    handlers,
  );
  return { sup, sources, events, failOpen: (n: number) => (failOpen = n) };
}

const chunk = (s: string): AgentChunk => ({
  bytes: new TextEncoder().encode(s),
  hostReceivedAtMs: Date.now(),
});
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("SourceSupervisor", () => {
  it("CA4: reports a loss, reconnects with backoff and starts again, with no unhandled rejection", async () => {
    const { sup, sources, events, failOpen } = setup(500);
    sup.start();
    await wait(10);
    sources[0]?.push(chunk("a"));
    await wait(5);
    sources[0]?.fail(new Error("device unplugged"));
    await wait(5);
    expect(sup.status).toBe("disconnected");
    expect(events).toContain("lost:error");
    failOpen(2);
    await wait(80);
    expect(events.filter((e) => e === "openFailed").length).toBeGreaterThanOrEqual(2);
    expect(sources).toHaveLength(2);
    expect(sup.status).toBe("connected");
    sources[1]?.push(chunk("b"));
    await wait(5);
    expect(events).toContain("chunk:b");
    await sup.stop();
  });

  it("CA17: an open but silent port is reported silent, then closed and reopened", async () => {
    const { sup, sources, events } = setup(30);
    sup.start();
    await wait(10);
    sources[0]?.push(chunk("x"));
    await wait(40);
    expect(events).toContain("silent");
    expect(sup.status).toBe("silent");
    await wait(60);
    expect(events).toContain("lost:silence");
    expect(sources[0]?.closed()).toBe(true);
    await wait(40);
    expect(sources.length).toBeGreaterThanOrEqual(2);
    await sup.stop();
  });

  it("recovers from silent when data returns", async () => {
    const { sup, sources, events } = setup(30);
    sup.start();
    await wait(45);
    expect(sup.status).toBe("silent");
    sources[0]?.push(chunk("y"));
    await wait(5);
    expect(events).toContain("recovered");
    expect(sup.status).toBe("connected");
    await sup.stop();
  });

  it("a throwing handler is reported and never kills the loop", async () => {
    const c = controllable();
    const errors: string[] = [];
    const sup = new SourceSupervisor(
      {
        factory: {
          description: "f",
          baud: null,
          reconnect: true,
          open: () => Promise.resolve(c.source),
        },
        silenceMs: 500,
      },
      {
        onConnected: () => undefined,
        onChunk: () => {
          throw new Error("boom");
        },
        onLost: () => undefined,
        onSilent: () => undefined,
        onEnded: () => undefined,
        onHandlerError: (e) => errors.push(String(e)),
      },
    );
    sup.start();
    await wait(10);
    c.push(chunk("1"));
    c.push(chunk("2"));
    await wait(10);
    expect(errors).toHaveLength(2);
    await sup.stop();
  });
});
