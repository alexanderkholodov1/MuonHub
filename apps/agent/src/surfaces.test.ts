import { mkdtempSync, rmSync, readFileSync, statSync } from "node:fs";
import { createServer, createConnection, type Server } from "node:net";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { Daemon } from "./daemon.js";
import { loadOrCreatePanelToken } from "./panel/token.js";
import { RawMirror } from "./mirror/mirror.js";
import { Reporter } from "./reporter.js";
import { memoryLogger } from "./log.js";
import { analyzeCapture, baudScore, hexDump } from "./capture/analyze.js";
import {
  dataChunks,
  makeHarness,
  scriptedFactory,
  T0,
  until,
  type Harness,
  munraLine,
} from "./testing/harness.js";

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

const quick = { uploaderMs: 1e9, diskMs: 1e9, clockMs: 1e9, backoffMinMs: 5, backoffMaxMs: 20 };

async function daemonWith(
  opts: { bridgePort?: number; bridge?: boolean; panel?: boolean; mirror?: boolean } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "mh-surf-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const factory = scriptedFactory();
  const h = await makeHarness({ factory, intervals: quick });
  const token = loadOrCreatePanelToken(join(dir, "panel-token"));
  const daemon = new Daemon({
    agent: h.agent,
    config: {
      stateDir: dir,
      runtimeDir: dir,
      panel: { enabled: opts.panel ?? true, port: 0 },
      bridge: {
        enabled: opts.bridge ?? true,
        port: opts.bridgePort ?? 0,
        allowedOrigins: ["https://munhub-lab.web.app", "null"],
      },
      mirror: { enabled: opts.mirror ?? true },
    },
    panelToken: token,
    setup: null,
    mirrorSocket: join(dir, "raw.sock"),
    retryMs: 40,
  });
  cleanups.push(() => daemon.stop());
  await daemon.start();
  await until(() => factory.sources.length > 0);
  return { daemon, h, factory, src: factory.sources[0]!, dir, token };
}

function ws(url: string, origin?: string): Promise<{ socket: WebSocket; messages: unknown[] }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, origin === undefined ? {} : { origin });
    const messages: unknown[] = [];
    socket.on("message", (d) => messages.push(JSON.parse(String(d))));
    socket.on("open", () => resolve({ socket, messages }));
    socket.on("unexpected-response", (_req, res) =>
      reject(new Error(`HTTP ${String(res.statusCode)}`)),
    );
    socket.on("error", reject);
    cleanups.push(() => socket.terminate());
  });
}

describe("CA6: v5 bridge protocol", () => {
  it("sends bridge_info, one serial_data per raw line with the v5 field names, and answers ping and status", async () => {
    const { daemon, src } = await daemonWith({ panel: false, mirror: false });
    await until(() => daemon.bridge?.state === "listening");
    const { socket, messages } = await ws(`ws://127.0.0.1:${String(daemon.bridge!.port)}`);
    await until(() => messages.length >= 1);
    expect(messages[0]).toEqual({
      type: "bridge_info",
      version: "1.1",
      serial_port: "fake device",
      baud_rate: 9600,
      os: "Linux",
      message: "MuNRa Serial Bridge connected",
    });
    src.push(...dataChunks({ fromHost: T0, count: 3, firstId: 1 }));
    await until(() => messages.length >= 4);
    const data = messages.slice(1) as { type: string; line: string; ts: number }[];
    expect(data.map((m) => m.type)).toEqual(["serial_data", "serial_data", "serial_data"]);
    expect(Object.keys(data[0]!).sort()).toEqual(["line", "ts", "type"]);
    expect(data[0]!.line).toBe(munraLine(1, 1000, { amp: 101, term: "" }));
    expect(data[0]!.ts).toBe(T0);
    socket.send(JSON.stringify({ type: "ping" }));
    await until(() => messages.some((m) => (m as { type: string }).type === "pong"));
    socket.send(JSON.stringify({ type: "status" }));
    await until(() => messages.some((m) => (m as { type: string }).type === "status"));
    expect(messages.find((m) => (m as { type: string }).type === "status")).toEqual({
      type: "status",
      serial_connected: true,
      clients: 1,
      serial_port: "fake device",
    });
    const pong = messages.find((m) => (m as { type: string }).type === "pong") as { ts: number };
    expect(typeof pong.ts).toBe("number");
  });
});

describe("CA16: bridge port in use", () => {
  it("keeps recording, shows 'v5 bridge port busy', and starts the bridge once the port is freed", async () => {
    const occupier: Server = createServer();
    await new Promise<void>((r) => occupier.listen(0, "127.0.0.1", r));
    const port = (occupier.address() as { port: number }).port;
    const { daemon, h, src } = await daemonWith({ bridgePort: port, panel: false, mirror: false });
    await until(() => daemon.bridge?.state === "v5 bridge port busy");
    expect(h.agent.status().bridge.state).toBe("v5 bridge port busy");
    expect(h.agent.status().conditions.some((c) => c.code === "bridge-port-busy")).toBe(true);
    expect(h.logger.lines.some((l) => l.code === "bridge-port-busy" && l.level === "error")).toBe(
      true,
    );
    // recording continues
    src.push(...dataChunks({ fromHost: T0, count: 130, firstId: 1 }));
    await until(() => h.store.rawLineCount() >= 120);
    h.agent.pipeline.flush();
    expect(h.store.minuteCount("agentTestStream0123456789")).toBeGreaterThanOrEqual(1);
    await new Promise<void>((r) => occupier.close(() => r()));
    await until(() => daemon.bridge?.state === "listening", 3000);
    expect(h.agent.status().conditions.some((c) => c.code === "bridge-port-busy")).toBe(false);
  });
});

describe("CA18: local surface", () => {
  it("the bridge rejects a disallowed Origin and a foreign Host, and ignores messages other than ping and status", async () => {
    const { daemon } = await daemonWith({ panel: false, mirror: false });
    await until(() => daemon.bridge?.state === "listening");
    const url = `ws://127.0.0.1:${String(daemon.bridge!.port)}`;
    await expect(ws(url, "https://evil.example")).rejects.toThrow(/403/);
    expect(daemon.bridge!.counters.rejectedOrigin).toBe(1);
    const ok = await ws(url, "https://munhub-lab.web.app");
    await until(() => ok.messages.length >= 1);
    ok.socket.send(JSON.stringify({ type: "shutdown" }));
    ok.socket.send("not json");
    ok.socket.send(JSON.stringify({ type: "ping" }));
    await until(() => ok.messages.some((m) => (m as { type: string }).type === "pong"));
    expect(ok.messages.map((m) => (m as { type: string }).type)).toEqual(["bridge_info", "pong"]);
    expect(daemon.bridge!.counters.ignored).toBe(2);
    // a foreign Host header (DNS rebinding) is refused
    const status = await new Promise<number>((resolve) => {
      const req = request({
        host: "127.0.0.1",
        port: daemon.bridge!.port,
        headers: {
          Host: "evil.example",
          Connection: "Upgrade",
          Upgrade: "websocket",
          "Sec-WebSocket-Version": "13",
          "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        },
      });
      req.on("upgrade", (res) => resolve(res.statusCode ?? 0));
      req.on("response", (res) => resolve(res.statusCode ?? 0));
      req.on("error", () => resolve(0));
      req.end();
    });
    expect(status).toBe(403);
  });

  it("the bridge caps frame size and client count", async () => {
    const { daemon } = await daemonWith({ panel: false, mirror: false });
    await until(() => daemon.bridge?.state === "listening");
    const url = `ws://127.0.0.1:${String(daemon.bridge!.port)}`;
    const big = await ws(url);
    const closed = new Promise<number>((r) => big.socket.on("close", (code) => r(code)));
    big.socket.send("x".repeat(5000));
    expect(await closed).toBe(1009);
    const clients = [];
    for (let i = 0; i < 4; i++) clients.push(await ws(url));
    await expect(ws(url)).rejects.toThrow(/503/);
    expect(daemon.bridge!.counters.rejectedFull).toBe(1);
  });

  async function http(
    port: number,
    path: string,
    o: { method?: string; host?: string; headers?: Record<string, string>; body?: string } = {},
  ): Promise<{
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }> {
    return new Promise((resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port,
          path,
          method: o.method ?? "GET",
          headers: {
            Host: o.host ?? `127.0.0.1:${String(port)}`,
            ...(o.body === undefined
              ? {}
              : {
                  "Content-Type": "application/x-www-form-urlencoded",
                  "Content-Length": String(Buffer.byteLength(o.body)),
                }),
            ...o.headers,
          },
        },
        (res) => {
          let body = "";
          res.on("data", (d: Buffer) => (body += d.toString()));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
        },
      );
      req.on("error", reject);
      if (o.body !== undefined) req.write(o.body);
      req.end();
    });
  }

  it("the panel rejects a wrong Host, a cross-origin POST, and a missing CSRF token; the token is exchanged once for an HttpOnly cookie", async () => {
    const { daemon, token, h } = await daemonWith({ bridge: false, mirror: false });
    await until(() => daemon.panel?.state === "listening");
    const port = daemon.panel!.port;
    // no session: refused
    expect((await http(port, "/")).status).toBe(401);
    // wrong Host (DNS rebinding)
    expect((await http(port, `/auth?token=${token}`, { host: "evil.example" })).status).toBe(403);
    // wrong token
    expect((await http(port, "/auth?token=nope")).status).toBe(403);
    // exchange
    const ex = await http(port, `/auth?token=${token}`);
    expect(ex.status).toBe(303);
    expect(ex.headers["location"]).toBe("/");
    const setCookie = String(ex.headers["set-cookie"]);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Strict/);
    const cookie = setCookie.split(";")[0]!;
    const page = await http(port, "/outbox", { headers: { cookie } });
    expect(page.status).toBe(200);
    expect(page.body).not.toContain(token);
    const csrf = /name="csrf" value="([0-9a-f]+)"/.exec(page.body)![1]!;
    const origin = `http://127.0.0.1:${String(port)}`;
    // cross-origin POST
    expect(
      (
        await http(port, "/outbox/retry", {
          method: "POST",
          headers: { cookie, Origin: "http://evil.example" },
          body: `csrf=${csrf}`,
        })
      ).status,
    ).toBe(403);
    // missing Origin
    expect(
      (
        await http(port, "/outbox/retry", {
          method: "POST",
          headers: { cookie },
          body: `csrf=${csrf}`,
        })
      ).status,
    ).toBe(403);
    // missing / wrong CSRF
    expect(
      (
        await http(port, "/outbox/retry", {
          method: "POST",
          headers: { cookie, Origin: origin },
          body: "x=1",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await http(port, "/outbox/retry", {
          method: "POST",
          headers: { cookie, Origin: origin },
          body: "csrf=wrong",
        })
      ).status,
    ).toBe(403);
    // all correct
    expect(
      (
        await http(port, "/outbox/retry", {
          method: "POST",
          headers: { cookie, Origin: origin },
          body: `csrf=${csrf}`,
        })
      ).status,
    ).toBe(200);
    // status never shows secrets and carries security headers
    const st = await http(port, "/status.json", { headers: { cookie } });
    expect(st.headers["cache-control"]).toBe("no-store");
    expect(st.body).not.toContain(token);
    expect(JSON.parse(st.body).device.label).toBeDefined();
    void h;
  });

  it("a panel port in use is shown, retried, and never stops recording", async () => {
    const occupier: Server = createServer();
    await new Promise<void>((r) => occupier.listen(0, "127.0.0.1", r));
    const port = (occupier.address() as { port: number }).port;
    const dir = mkdtempSync(join(tmpdir(), "mh-panel-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const factory = scriptedFactory();
    const h = await makeHarness({ factory, intervals: quick });
    const daemon = new Daemon({
      agent: h.agent,
      config: {
        stateDir: dir,
        runtimeDir: dir,
        panel: { enabled: true, port },
        bridge: { enabled: false, port: 0, allowedOrigins: [] },
        mirror: { enabled: false },
      },
      panelToken: "t".repeat(64),
      setup: null,
      retryMs: 30,
    });
    cleanups.push(() => daemon.stop());
    await daemon.start();
    await until(() => daemon.panel?.state === "port busy");
    expect(h.agent.status().conditions.some((c) => c.code === "panel-port-busy")).toBe(true);
    await until(() => factory.sources.length > 0);
    factory.sources[0]!.push(...dataChunks({ fromHost: T0, count: 10, firstId: 1 }));
    await until(() => h.agent.pipeline.flush() === undefined && h.store.rawLineCount() >= 10);
    await new Promise<void>((r) => occupier.close(() => r()));
    await until(() => daemon.panel?.state === "listening");
  });

  it("the panel token file is created with mode 0600", () => {
    const dir = mkdtempSync(join(tmpdir(), "mh-tok-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const p = join(dir, "panel-token");
    const t = loadOrCreatePanelToken(p);
    expect(statSync(p).mode & 0o777).toBe(0o600);
    expect(t).toHaveLength(64);
    expect(loadOrCreatePanelToken(p)).toBe(t);
  });
});

describe("raw mirror (FR16, CA18)", () => {
  it("tees every raw line to a daily log and to a socket; a slow reader is dropped without stalling", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mh-mirror-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const logger = memoryLogger();
    const mirror = new RawMirror({
      logDir: join(dir, "raw"),
      socketPath: join(dir, "raw.sock"),
      reporter: new Reporter(logger),
      bufferLimit: 64 * 1024,
    });
    await mirror.start();
    cleanups.push(() => mirror.stop());
    expect(statSync(join(dir, "raw.sock")).mode & 0o777).toBe(0o660);
    // a fast reader
    const fast = createConnection(join(dir, "raw.sock"));
    let received = "";
    fast.on("data", (d) => (received += d.toString()));
    // a reader that never reads
    const slow = createConnection(join(dir, "raw.sock"));
    slow.pause();
    await until(() => mirror.stats.clients === 2);
    const t0 = Date.now();
    const line = "x".repeat(1000);
    for (let i = 0; i < 4000; i++) {
      mirror.write(`${String(i)} ${line}`, T0);
      if (i % 20 === 0) await new Promise((r) => setImmediate(r)); // lines arrive over time
    }
    expect(Date.now() - t0).toBeLessThan(2000); // acquisition is never blocked
    await until(() => mirror.stats.droppedClients >= 1);
    expect(mirror.stats.clients).toBe(1);
    await until(() => received.includes("3999 "));
    fast.destroy();
    slow.destroy();
    await mirror.stop();
    const log = readFileSync(join(dir, "raw", "2026-01-01.log"), "utf8")
      .trim()
      .split("\n");
    expect(log).toHaveLength(4000);
    expect(log[0]).toMatch(/^2026-01-01T00:00:00.000Z\t0 x/);
  });
});

describe("capture analysis (FR17)", () => {
  it("scores text-like data above noise, dumps hex, and proposes the MuNRa type for MuNRa lines", () => {
    const text = new TextEncoder().encode(
      Array.from({ length: 30 }, (_, i) => munraLine(i + 1, (i + 1) * 400, { term: "\r\n" })).join(
        "",
      ),
    );
    const noise = Uint8Array.from({ length: 300 }, (_, i) => (i * 37 + 11) % 256);
    expect(baudScore(text)).toBeGreaterThan(0.9);
    expect(baudScore(noise)).toBeLessThan(0.3);
    expect(hexDump(text.subarray(0, 20))).toMatch(/^000000 {2}31 09 34/);
    const a = analyzeCapture(text);
    expect(a.columnCount).toBe(10);
    expect(a.columns[0]).toMatchObject({ numeric: true, monotonic: true, min: 1, max: 30 });
    expect(a.columns[2]).toMatchObject({ constant: true });
    expect(a.proposal?.deviceTypeId).toBe("munra");
  });

  it("proposes nothing when no built-in type fits", () => {
    const text = new TextEncoder().encode("a b c\r\nfoo bar\r\n" + "1;2;3\r\n".repeat(10));
    expect(analyzeCapture(text).proposal).toBeNull();
  });
});

void (null as unknown as Harness);
