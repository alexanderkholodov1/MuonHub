import { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { Server } from "node:net";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { DEFAULT_BRIDGE_ORIGINS } from "./config.js";
import { Daemon } from "./daemon.js";
import { adoptListenFd } from "./panel/activation.js";
import { fetchControlStatus } from "./panel/control-client.js";
import { listeningInodes, uidOfUser, verifyPanelListener } from "./panel/listener-check.js";
import { PanelServer } from "./panel/server.js";
import { Reporter } from "./reporter.js";
import { memoryLogger } from "./log.js";
import { createShutdown } from "./shutdown.js";
import { makeHarness, scriptedFactory, until } from "./testing/harness.js";

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const c of cleanups.splice(0).reverse()) await c();
});
const quick = { uploaderMs: 1e9, diskMs: 1e9, clockMs: 1e9, backoffMinMs: 5, backoffMaxMs: 20 };

async function daemonWith(
  o: { panel?: boolean; bridge?: boolean; failDelayMs?: number; origins?: string[] } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "mh-sec-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const h = await makeHarness({ factory: scriptedFactory(), intervals: quick });
  const daemon = new Daemon({
    agent: h.agent,
    config: {
      stateDir: dir,
      runtimeDir: dir,
      panel: { enabled: o.panel ?? true, port: 0 },
      bridge: {
        enabled: o.bridge ?? false,
        port: 0,
        allowedOrigins: o.origins ?? ["https://munhub-lab.web.app"],
      },
      mirror: { enabled: false },
    },
    panelToken: "t".repeat(64),
    setup: null,
    panelFailDelayMs: o.failDelayMs ?? 0,
    retryMs: 40,
  });
  cleanups.push(() => daemon.stop());
  await daemon.start();
  return { daemon, dir };
}

function get(port: number, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end();
  });
}

describe("bridge Origin policy", () => {
  it('the default allowlist has no "null" origin', () => {
    expect(DEFAULT_BRIDGE_ORIGINS).not.toContain("null");
  });

  it('refuses a missing Origin and "null" unless explicitly allowed', async () => {
    const { daemon } = await daemonWith({ bridge: true });
    await until(() => daemon.bridge?.state === "listening");
    const url = `ws://127.0.0.1:${String(daemon.bridge!.port)}`;
    const open = (origin?: string): Promise<void> =>
      new Promise((resolve, reject) => {
        const s = new WebSocket(url, origin === undefined ? {} : { origin });
        s.on("open", () => {
          s.terminate();
          resolve();
        });
        s.on("unexpected-response", (_q, res) =>
          reject(new Error(`HTTP ${String(res.statusCode)}`)),
        );
        s.on("error", reject);
      });
    await expect(open()).rejects.toThrow(/403/);
    await expect(open("null")).rejects.toThrow(/403/);
    expect(daemon.bridge!.counters.rejectedOrigin).toBe(2);
    await expect(open("https://munhub-lab.web.app")).resolves.toBeUndefined();
  });

  it('accepts "null" when the administrator opts in explicitly', async () => {
    const { daemon } = await daemonWith({ bridge: true, origins: ["null"] });
    await until(() => daemon.bridge?.state === "listening");
    await new Promise<void>((resolve, reject) => {
      const s = new WebSocket(`ws://127.0.0.1:${String(daemon.bridge!.port)}`, { origin: "null" });
      s.on("open", () => {
        s.terminate();
        resolve();
      });
      s.on("error", reject);
    });
  });
});

describe("panel authentication", () => {
  it("has no global lockout: many wrong tokens never block the right one", async () => {
    const { daemon } = await daemonWith();
    await until(() => daemon.panel?.state === "listening");
    const port = daemon.panel!.port;
    for (let i = 0; i < 30; i++) expect(await get(port, `/auth?token=wrong${String(i)}`)).toBe(403);
    expect(await get(port, `/auth?token=${"t".repeat(64)}`)).toBe(303);
  });

  it("delays each wrong token a little, per connection", async () => {
    const { daemon } = await daemonWith({ failDelayMs: 150 });
    await until(() => daemon.panel?.state === "listening");
    const port = daemon.panel!.port;
    const t0 = Date.now();
    await Promise.all([get(port, "/auth?token=a"), get(port, "/auth?token=b")]);
    const dt = Date.now() - t0;
    expect(dt).toBeGreaterThanOrEqual(140);
    expect(dt).toBeLessThan(290); // concurrent: the delay is per connection, not serialised
    const t1 = Date.now();
    expect(await get(port, `/auth?token=${"t".repeat(64)}`)).toBe(303);
    expect(Date.now() - t1).toBeLessThan(140);
  });
});

describe("control socket and status", () => {
  it("status is served over a Unix socket (mode 0660), without the panel and without the token", async () => {
    const { daemon, dir } = await daemonWith({ panel: false });
    expect(daemon.panel).toBeNull();
    const path = join(dir, "control.sock");
    expect(statSync(path).mode & 0o777).toBe(0o660);
    const text = await fetchControlStatus(path);
    const status = JSON.parse(text) as { device?: unknown };
    expect(status.device).toBeDefined();
    expect(text).not.toContain("t".repeat(64));
  });

  it("serves nothing but GET /status.json", async () => {
    const { dir } = await daemonWith({ panel: false });
    const code = await new Promise<number>((resolve, reject) => {
      const req = request({ socketPath: join(dir, "control.sock"), path: "/outbox" }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end();
    });
    expect(code).toBe(404);
  });

  it("reports a missing daemon clearly", async () => {
    await expect(fetchControlStatus("/nonexistent/control.sock")).rejects.toThrow(
      /cannot reach the daemon/,
    );
  });
});

describe("systemd socket activation", () => {
  it("adopts fd 3 only when LISTEN_PID is this process and LISTEN_FDS >= 1, and clears the variables", () => {
    const env = { LISTEN_PID: "4242", LISTEN_FDS: "1", LISTEN_FDNAMES: "panel" };
    expect(adoptListenFd(env, 4242)).toBe(3);
    expect(env).toEqual({});
    expect(adoptListenFd({ LISTEN_PID: "1", LISTEN_FDS: "1" }, 4242)).toBeNull();
    expect(adoptListenFd({ LISTEN_PID: "4242", LISTEN_FDS: "0" }, 4242)).toBeNull();
    expect(adoptListenFd({ LISTEN_PID: "4242" }, 4242)).toBeNull();
    expect(adoptListenFd({ LISTEN_PID: "x", LISTEN_FDS: "1" }, 4242)).toBeNull();
    expect(adoptListenFd({}, 4242)).toBeNull();
  });

  it("the panel listens on the passed descriptor instead of binding the port", async () => {
    const calls: unknown[][] = [];
    vi.spyOn(Server.prototype, "listen").mockImplementation(function (
      this: Server,
      ...args: unknown[]
    ) {
      calls.push(args);
      const cb = args.find((a) => typeof a === "function") as (() => void) | undefined;
      queueMicrotask(() => cb?.());
      return this;
    });
    const panel = new PanelServer({
      port: 8787,
      listenFd: 3,
      token: "t".repeat(64),
      reporter: new Reporter(memoryLogger()),
      status: () => ({}) as never,
      outbox: { parked: () => [], retryAll: () => 0 },
      setup: null,
    });
    panel.start();
    await until(() => panel.state === "listening");
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toEqual({ fd: 3 });
    await panel.stop();
  });
});

describe("panel-url listener verification", () => {
  const tcp = (inode: string, port = 8787): string =>
    "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n" +
    `   0: 0100007F:${port.toString(16).toUpperCase()} 00000000:0000 0A 00000000:00000000 00:00000000 00000000   999        0 ${inode} 1 0000000000000000 100 0 0 10 0\n`;

  function fakeProc(holders: { pid: string; uid: number; inode: string }[], inode = "555") {
    const root = mkdtempSync(join(tmpdir(), "mh-proc-"));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, "net"));
    writeFileSync(join(root, "net", "tcp"), tcp(inode));
    for (const h of holders) {
      mkdirSync(join(root, h.pid, "fd"), { recursive: true });
      symlinkSync(`socket:[${h.inode}]`, join(root, h.pid, "fd", "7"));
      writeFileSync(
        join(root, h.pid, "status"),
        `Name:\tx\nUid:\t${String(h.uid)}\t${String(h.uid)}\n`,
      );
    }
    const passwd = join(root, "passwd");
    writeFileSync(
      passwd,
      "root:x:0:0::/root:/bin/sh\nmuonhub:x:999:999::/var/lib/muonhub:/sbin/nologin\n",
    );
    return { root, passwd };
  }

  it("parses /proc/net/tcp and /etc/passwd", () => {
    expect(listeningInodes(tcp("555"), 8787)).toEqual(["555"]);
    expect(listeningInodes(tcp("555"), 8788)).toEqual([]);
    expect(uidOfUser("a:x:5:5\nmuonhub:x:999:999\n", "muonhub")).toBe(999);
  });

  it("accepts a listener held by the service user, alone or with systemd (pid 1)", () => {
    const a = fakeProc([{ pid: "300", uid: 999, inode: "555" }]);
    expect(verifyPanelListener(8787, "muonhub", a.root, a.passwd).ok).toBe(true);
    const b = fakeProc([
      { pid: "1", uid: 0, inode: "555" },
      { pid: "300", uid: 999, inode: "555" },
    ]);
    expect(verifyPanelListener(8787, "muonhub", b.root, b.passwd).ok).toBe(true);
  });

  it("refuses a listener held by another user, even next to the service", () => {
    const a = fakeProc([{ pid: "400", uid: 1000, inode: "555" }]);
    const r = verifyPanelListener(8787, "muonhub", a.root, a.passwd);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/uid 1000/);
    const b = fakeProc([
      { pid: "400", uid: 1000, inode: "555" },
      { pid: "300", uid: 999, inode: "555" },
    ]);
    expect(verifyPanelListener(8787, "muonhub", b.root, b.passwd).ok).toBe(false);
  });

  it("refuses when nothing listens or no service process holds the socket", () => {
    const a = fakeProc([{ pid: "300", uid: 999, inode: "999999" }]);
    expect(verifyPanelListener(8787, "muonhub", a.root, a.passwd).ok).toBe(false);
    expect(verifyPanelListener(9999, "muonhub", a.root, a.passwd).ok).toBe(false);
  });
});

describe("graceful shutdown (restart after a binding)", () => {
  it("stops the daemon (flushing buffered lines) before exiting, once", async () => {
    const order: string[] = [];
    let release: () => void = () => undefined;
    const shutdown = createShutdown({
      stop: () =>
        new Promise<void>((resolve) => {
          order.push("stop-begin");
          release = () => {
            order.push("stop-end");
            resolve();
          };
        }),
      exit: (code) => order.push(`exit-${String(code)}`),
      log: () => undefined,
    });
    shutdown("binding saved, restarting");
    shutdown("SIGTERM");
    await Promise.resolve();
    expect(order).toEqual(["stop-begin"]);
    release();
    await until(() => order.includes("exit-0"));
    expect(order).toEqual(["stop-begin", "stop-end", "exit-0"]);
  });

  it("exits even when stop() fails or hangs", async () => {
    const codes: number[] = [];
    createShutdown({
      stop: () => Promise.reject(new Error("boom")),
      exit: (c) => codes.push(c),
      log: () => undefined,
    })("x");
    await until(() => codes.length > 0);
    const hung: number[] = [];
    createShutdown({
      stop: () => new Promise<void>(() => undefined),
      exit: (c) => hung.push(c),
      log: () => undefined,
      hardTimeoutMs: 30,
    })("x");
    await until(() => hung.length > 0);
    expect(hung).toEqual([0]);
  });
});
