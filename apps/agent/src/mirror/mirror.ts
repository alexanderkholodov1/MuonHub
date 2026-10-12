/**
 * Raw mirror (spec 0087 FR16): every raw line is teed to a rotating daily text log
 * (`<stateDir>/raw/YYYY-MM-DD.log`) and to a Unix socket (`<runtimeDir>/raw.sock`, mode 0660) so the
 * port can be watched with `tail -f` or `socat` without stopping acquisition. The socket ignores
 * incoming data; each client has a bounded buffer (64 KB) and a slow reader is DROPPED (counted), so
 * acquisition never stalls. Mirror failures are logged and counted, never fatal.
 */
import { createServer, type Server, type Socket } from "node:net";
import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
  unlinkSync,
  type WriteStream,
} from "node:fs";
import { join } from "node:path";
import type { Reporter } from "../reporter.js";

export const SOCKET_BUFFER_LIMIT = 64 * 1024;
const MAX_CLIENTS = 16;

export interface MirrorStats {
  logErrors: number;
  socketErrors: number;
  droppedClients: number;
  clients: number;
}

export class RawMirror {
  private log: WriteStream | null = null;
  private logDay = "";
  private server: Server | null = null;
  private readonly clients = new Set<Socket>();
  readonly stats: MirrorStats = { logErrors: 0, socketErrors: 0, droppedClients: 0, clients: 0 };

  constructor(
    private readonly o: {
      logDir: string | null;
      socketPath: string | null;
      reporter: Reporter;
      now?: () => number;
      bufferLimit?: number;
    },
  ) {}

  async start(): Promise<void> {
    if (this.o.logDir !== null) {
      try {
        mkdirSync(this.o.logDir, { recursive: true, mode: 0o700 });
      } catch (error) {
        this.logFailure(error);
      }
    }
    if (this.o.socketPath !== null) await this.listen(this.o.socketPath);
  }

  private listen(path: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        // A stale socket file from a crashed run is removed; anything else at the path is left alone.
        if (existsSync(path) && statSync(path).isSocket()) unlinkSync(path);
      } catch (error) {
        this.socketFailure(error);
      }
      const server = createServer((socket) => {
        if (this.clients.size >= MAX_CLIENTS) {
          socket.destroy();
          return;
        }
        socket.on("data", () => undefined); // incoming data is ignored
        socket.on("error", () => this.drop(socket, false));
        socket.on("close", () => this.drop(socket, false));
        this.clients.add(socket);
        this.stats.clients = this.clients.size;
      });
      server.on("error", (error) => {
        this.socketFailure(error);
        resolve();
      });
      server.listen(path, () => {
        try {
          chmodSync(path, 0o660);
        } catch (error) {
          this.socketFailure(error);
        }
        this.server = server;
        resolve();
      });
    });
  }

  private drop(socket: Socket, slow: boolean): void {
    if (!this.clients.delete(socket)) return;
    this.stats.clients = this.clients.size;
    if (slow) {
      this.stats.droppedClients += 1;
      this.o.reporter.report(
        "warn",
        "mirror-client-dropped",
        "a slow raw-socket reader was dropped",
      );
    }
    socket.destroy();
  }

  /** Called for every raw line. Never throws. */
  write(text: string, hostTs: number): void {
    try {
      this.writeLog(text, hostTs);
    } catch (error) {
      this.logFailure(error);
    }
    if (this.clients.size === 0) return;
    const data = text + "\n";
    const limit = this.o.bufferLimit ?? SOCKET_BUFFER_LIMIT;
    for (const socket of [...this.clients]) {
      try {
        if (socket.writableLength > limit) this.drop(socket, true);
        else socket.write(data);
      } catch {
        this.drop(socket, false);
      }
    }
  }

  private writeLog(text: string, hostTs: number): void {
    if (this.o.logDir === null) return;
    const day = new Date(hostTs).toISOString().slice(0, 10);
    if (this.log === null || day !== this.logDay) {
      this.log?.end();
      this.logDay = day;
      this.log = createWriteStream(join(this.o.logDir, `${day}.log`), { flags: "a", mode: 0o600 });
      this.log.on("error", (error) => {
        this.logFailure(error);
        this.log = null;
      });
    }
    this.log.write(`${new Date(hostTs).toISOString()}\t${text}\n`);
  }

  private logFailure(error: unknown): void {
    this.stats.logErrors += 1;
    if (this.stats.logErrors === 1 || this.stats.logErrors % 1000 === 0) {
      this.o.reporter.report(
        "warn",
        "mirror-log-failed",
        "raw log write failed (acquisition continues)",
        {
          error: error instanceof Error ? error.message : String(error),
          count: this.stats.logErrors,
        },
      );
    }
  }

  private socketFailure(error: unknown): void {
    this.stats.socketErrors += 1;
    this.o.reporter.report(
      "warn",
      "mirror-socket-failed",
      "raw socket error (acquisition continues)",
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }

  async stop(): Promise<void> {
    for (const c of [...this.clients]) c.destroy();
    this.clients.clear();
    await new Promise<void>((resolve) => {
      if (this.server === null) resolve();
      else this.server.close(() => resolve());
    });
    this.server = null;
    await new Promise<void>((resolve) => {
      if (this.log === null) resolve();
      else this.log.end(() => resolve());
    });
    this.log = null;
  }
}
