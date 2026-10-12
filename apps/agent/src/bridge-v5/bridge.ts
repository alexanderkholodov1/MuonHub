/**
 * v5 compatibility bridge (spec 0087 FR19, decision B): `ws://localhost:8765` speaking exactly the
 * protocol of v5's `public/tools/serial_bridge.py`:
 *   on connect      {"type":"bridge_info","version","serial_port","baud_rate","os","message"}
 *   per raw line    {"type":"serial_data","line","ts"}            (ts in ms)
 *   ping            → {"type":"pong","ts"}
 *   status          → {"type":"status","serial_connected","clients","serial_port"}
 *
 * Safety: WebSockets ignore CORS, so a web page could otherwise read the detector — the `Origin`
 * header is checked against an allowlist and the `Host` header must be local (DNS rebinding); only
 * `ping` and `status` are accepted, frames are capped (4 KB), at most 4 clients, per-client send
 * buffer capped (slow clients are disconnected and counted). `EADDRINUSE` (e.g. the old Python
 * bridge still running) is reported, shown in status and retried; it never stops acquisition.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import type { Reporter } from "../reporter.js";

export const BRIDGE_VERSION = "1.1";
export const MAX_FRAME_BYTES = 4096;
export const MAX_CLIENTS = 4;
export const CLIENT_BUFFER_LIMIT = 64 * 1024;

export type BridgeState = "off" | "listening" | "v5 bridge port busy" | "error";

export interface BridgeOptions {
  port: number;
  allowedOrigins: readonly string[];
  reporter: Reporter;
  /** The REAL state of the serial port. */
  serial: () => { connected: boolean; port: string | null; baud: number | null };
  retryMs?: number;
  now?: () => number;
  host?: string;
}

export class V5Bridge {
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private retry: NodeJS.Timeout | null = null;
  private stopped = false;
  state: BridgeState = "off";
  readonly counters = {
    rejectedOrigin: 0,
    rejectedHost: 0,
    rejectedFull: 0,
    slowDropped: 0,
    ignored: 0,
  };

  constructor(private readonly o: BridgeOptions) {}

  get clients(): number {
    return this.wss?.clients.size ?? 0;
  }

  get port(): number {
    const addr = this.server?.address();
    return typeof addr === "object" && addr !== null ? addr.port : this.o.port;
  }

  start(): void {
    this.stopped = false;
    this.tryListen();
  }

  private tryListen(): void {
    if (this.stopped) return;
    const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
    const server = createServer((_req, res) => {
      res.writeHead(426, { "content-type": "text/plain" }).end("WebSocket only");
    });
    server.on("upgrade", (req, socket, head) => this.upgrade(wss, req, socket, head));
    server.on("error", (error: NodeJS.ErrnoException) => {
      wss.close();
      server.close();
      if (this.server === server) this.server = null;
      if (this.wss === wss) this.wss = null;
      if (error.code === "EADDRINUSE") {
        if (this.state !== "v5 bridge port busy") {
          this.o.reporter.raise(
            "bridge-port-busy",
            `v5 bridge port ${String(this.o.port)} busy; will retry`,
          );
        }
        this.state = "v5 bridge port busy";
      } else {
        this.state = "error";
        this.o.reporter.report("error", "bridge-error", "v5 bridge failed", {
          error: error.message,
        });
      }
      this.scheduleRetry();
    });
    server.listen(this.o.port, this.o.host ?? "127.0.0.1", () => {
      this.server = server;
      this.wss = wss;
      this.state = "listening";
      this.o.reporter.clear("bridge-port-busy");
      this.o.reporter.report(
        "info",
        "bridge-listening",
        `v5 bridge listening on port ${String(this.port)}`,
      );
    });
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retry !== null) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      this.tryListen();
    }, this.o.retryMs ?? 10_000);
    this.retry.unref();
  }

  private upgrade(wss: WebSocketServer, req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const reject = (code: number, text: string): void => {
      socket.end(`HTTP/1.1 ${String(code)} ${text}\r\nConnection: close\r\n\r\n`);
    };
    const host = req.headers.host ?? "";
    const port = String(this.port);
    if (host !== `localhost:${port}` && host !== `127.0.0.1:${port}`) {
      this.counters.rejectedHost += 1;
      reject(403, "Forbidden");
      return;
    }
    // Browsers always send Origin on WebSocket handshakes; a missing Origin is a non-browser client.
    const origin = req.headers.origin;
    if (origin !== undefined && !this.o.allowedOrigins.includes(origin)) {
      this.counters.rejectedOrigin += 1;
      this.o.reporter.report(
        "warn",
        "bridge-origin-rejected",
        "v5 bridge refused a disallowed Origin",
      );
      reject(403, "Forbidden");
      return;
    }
    if (wss.clients.size >= MAX_CLIENTS) {
      this.counters.rejectedFull += 1;
      reject(503, "Service Unavailable");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => this.connection(ws));
  }

  private connection(ws: WebSocket): void {
    const now = this.o.now ?? Date.now;
    const s = this.o.serial();
    ws.send(
      JSON.stringify({
        type: "bridge_info",
        version: BRIDGE_VERSION,
        serial_port: s.port ?? "unknown",
        baud_rate: s.baud ?? 9600,
        os: "Linux",
        message: "MuNRa Serial Bridge connected",
      }),
    );
    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        this.counters.ignored += 1;
        return;
      }
      let msg: unknown;
      try {
        msg = JSON.parse(String(data));
      } catch {
        this.counters.ignored += 1;
        return;
      }
      const type =
        typeof msg === "object" && msg !== null ? (msg as { type?: unknown }).type : undefined;
      if (type === "ping") {
        ws.send(JSON.stringify({ type: "pong", ts: now() }));
      } else if (type === "status") {
        const cur = this.o.serial();
        ws.send(
          JSON.stringify({
            type: "status",
            serial_connected: cur.connected,
            clients: this.clients,
            serial_port: cur.port,
          }),
        );
      } else {
        this.counters.ignored += 1;
      }
    });
    ws.on("error", () => ws.terminate());
  }

  /** One `serial_data` message per raw line. A slow client is disconnected, never buffered without bound. */
  broadcast(line: string, hostTs: number): void {
    const wss = this.wss;
    if (wss === null || wss.clients.size === 0) return;
    const text = line.trim();
    if (text.length === 0) return;
    const message = JSON.stringify({ type: "serial_data", line: text, ts: hostTs });
    for (const ws of wss.clients) {
      if (ws.readyState !== ws.OPEN) continue;
      if (ws.bufferedAmount > CLIENT_BUFFER_LIMIT) {
        this.counters.slowDropped += 1;
        this.o.reporter.report(
          "warn",
          "bridge-client-dropped",
          "a slow v5 bridge client was disconnected",
        );
        ws.terminate();
        continue;
      }
      ws.send(message);
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    for (const ws of this.wss?.clients ?? []) ws.terminate();
    this.wss?.close();
    await new Promise<void>((resolve) => {
      if (this.server === null) resolve();
      else this.server.close(() => resolve());
    });
    this.server = null;
    this.wss = null;
    this.state = "off";
  }
}
