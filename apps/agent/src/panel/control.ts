/**
 * Local control socket (`<runtimeDir>/control.sock`, mode 0660, group muonhub): `muonhub-agent
 * status` reads the daemon status here, so it never needs the panel token or TCP. It serves exactly
 * one read-only route and nothing else; access is decided by the file permissions of the socket and
 * of `/run/muonhub` (0750, group muonhub).
 */
import { chmodSync, existsSync, statSync, unlinkSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { Reporter } from "../reporter.js";
import type { AgentStatus } from "../status.js";

export class ControlServer {
  private server: Server | null = null;

  constructor(
    private readonly o: { path: string; status: () => AgentStatus; reporter: Reporter },
  ) {}

  start(): Promise<void> {
    return new Promise((resolve) => {
      try {
        if (existsSync(this.o.path) && statSync(this.o.path).isSocket()) unlinkSync(this.o.path);
      } catch (error) {
        this.fail(error);
      }
      const server = createServer((req, res) => {
        if (req.method === "GET" && req.url === "/status.json") {
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify(this.o.status()));
        } else {
          res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
        }
      });
      server.on("clientError", (_e, socket) => socket.destroy());
      server.on("error", (error) => {
        this.fail(error);
        resolve();
      });
      server.listen(this.o.path, () => {
        try {
          chmodSync(this.o.path, 0o660);
        } catch (error) {
          this.fail(error);
        }
        this.server = server;
        resolve();
      });
    });
  }

  private fail(error: unknown): void {
    this.o.reporter.report("error", "control-socket-error", "control socket failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (server === null) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
