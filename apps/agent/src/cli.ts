#!/usr/bin/env node
/**
 * muonhub-agent — the headless daemon and its tools (spec 0087).
 *   run                   start the daemon (what the systemd unit runs)
 *   capture ...           baud scan, hex dump, column statistics, proposed device type, fixture
 *   panel-url             print the local panel address with its access token (sudo)
 *   status                print the status of the running daemon
 *   outbox list|retry|export   inspect parked items
 *   version
 */
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { loadConfig, DEFAULT_CONFIG_PATH } from "./config.js";
import { runCapture } from "./capture/capture.js";
import { fetchControlStatus } from "./panel/control-client.js";
import { verifyPanelListener } from "./panel/listener-check.js";
import { readPanelToken } from "./panel/token.js";
import { createShutdown } from "./shutdown.js";
import { buildDaemon, AGENT_VERSION, stateFile } from "./runtime.js";
import { openLocalStore } from "./store/sqlite.js";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function configPath(args: string[]): string {
  return flag(args, "--config") ?? process.env["MUONHUB_AGENT_CONFIG"] ?? DEFAULT_CONFIG_PATH;
}

const out = (line: string): void => {
  process.stdout.write(line + "\n");
};

async function run(args: string[]): Promise<number> {
  // A bug must never leave a half-working daemon: log and exit so systemd restarts it.
  const die = (what: string, error: unknown): void => {
    process.stderr.write(
      `<3>[fatal] ${what}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exit(1);
  };
  process.on("unhandledRejection", (e) => die("unhandled rejection", e));
  process.on("uncaughtException", (e) => die("uncaught exception", e));
  let shutdown: ((reason: string) => void) | null = null;
  const { daemon } = await buildDaemon(configPath(args), {
    // After a binding the daemon restarts to pick it up: flush first, then exit (systemd restarts it).
    // The short delay lets the panel finish answering the request that saved the binding.
    onRestartRequested: () => {
      setTimeout(() => shutdown?.("binding saved, restarting"), 1500);
    },
  });
  shutdown = createShutdown({
    stop: () => daemon.stop(),
    exit: (code) => process.exit(code),
    log: out,
  });
  const stop = shutdown;
  process.on("SIGTERM", () => stop("received SIGTERM"));
  process.on("SIGINT", () => stop("received SIGINT"));
  await daemon.start();
  await daemon.agentFinished();
  // A finite (virtual) source ended: shut down cleanly.
  await daemon.stop();
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...args] = argv;
  switch (cmd) {
    case "run":
      return run(args);
    case "version":
      out(AGENT_VERSION);
      return 0;
    case "capture": {
      const baud = flag(args, "--baud") ?? "auto";
      return runCapture({
        ...(flag(args, "--port") === undefined ? {} : { port: flag(args, "--port") as string }),
        baud: baud === "auto" ? "auto" : Number(baud),
        minutes: Number(flag(args, "--minutes") ?? "1"),
        ...(flag(args, "--from-socket") === undefined
          ? {}
          : { fromSocket: flag(args, "--from-socket") as string }),
        ...(flag(args, "--out") === undefined ? {} : { out: flag(args, "--out") as string }),
        print: out,
      });
    }
    case "panel-url": {
      const config = await loadConfig(configPath(args));
      // Without socket activation, make sure the process on the port is the service before
      // revealing the token. (Under muonhub-agent-panel.socket systemd itself holds the port.)
      if (!args.includes("--skip-listener-check")) {
        const check = verifyPanelListener(config.panel.port);
        if (!check.ok) {
          process.stderr.write(
            `refusing to print the panel token: ${check.reason}\n(for a development run use --skip-listener-check)\n`,
          );
          return 1;
        }
      }
      const token = readPanelToken(stateFile(config, "panel-token"));
      out(`http://127.0.0.1:${String(config.panel.port)}/auth?token=${token}`);
      out("From another machine: ssh -L 8787:localhost:8787 <host>, then open the address above.");
      return 0;
    }
    case "status": {
      // Over the Unix control socket: no TCP, no token.
      const config = await loadConfig(configPath(args));
      out(await fetchControlStatus(join(config.runtimeDir, "control.sock")));
      return 0;
    }
    case "outbox": {
      if (process.getuid?.() === 0 && !args.includes("--allow-root")) {
        out(
          "run this as the service user so the database files keep their owner: sudo -u muonhub muonhub-agent outbox ...",
        );
        return 2;
      }
      const config = await loadConfig(configPath(args));
      const store = await openLocalStore({
        path: stateFile(config, "agent.db"),
        driver: config.storage.driver,
      });
      const sub = args[0];
      if (sub === "retry") out(`${String(store.unparkAll())} parked items queued for retry`);
      else if (sub === "export") {
        const w = args[1] === undefined ? process.stdout : createWriteStream(args[1]);
        for (const i of store.parkedItems(100000)) {
          w.write(
            JSON.stringify({
              kind: i.kind,
              ts: i.ts,
              rev: i.rev,
              sessionId: i.sessionId,
              error: i.lastError,
              payload: JSON.parse(i.payload) as unknown,
            }) + "\n",
          );
        }
      } else {
        const c = store.outboxCounts();
        out(JSON.stringify(c));
        for (const i of store.parkedItems(100))
          out(`parked ${i.kind} ${new Date(i.ts).toISOString()} ${i.lastError ?? ""}`);
      }
      store.close();
      return 0;
    }
    default:
      out("usage: muonhub-agent <run|capture|panel-url|status|outbox|version> [--config path]");
      return cmd === undefined || cmd === "help" ? 0 : 2;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    if (code !== 0) process.exit(code);
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  },
);
