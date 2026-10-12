/**
 * The daemon = the agent plus its local surfaces (raw mirror, v5 bridge, panel). The surfaces are
 * isolated from acquisition: each one logs and counts its own failures and retries; none of them can
 * stop recording.
 */
import { join } from "node:path";
import type { Agent } from "./agent.js";
import { V5Bridge } from "./bridge-v5/bridge.js";
import type { AgentConfig } from "./config.js";
import { RawMirror } from "./mirror/mirror.js";
import { PanelServer } from "./panel/server.js";
import type { SetupApi } from "./panel/setup.js";

export interface DaemonOptions {
  agent: Agent;
  config: Pick<AgentConfig, "stateDir" | "runtimeDir" | "panel" | "bridge" | "mirror">;
  panelToken: string;
  setup: SetupApi | null;
  /** Test knobs. */
  mirrorSocket?: string | null;
  mirrorLogDir?: string | null;
  retryMs?: number;
}

export class Daemon {
  readonly mirror: RawMirror | null;
  readonly bridge: V5Bridge | null;
  readonly panel: PanelServer | null;

  constructor(private readonly o: DaemonOptions) {
    const { agent, config } = o;
    this.mirror = config.mirror.enabled
      ? new RawMirror({
          logDir: o.mirrorLogDir === undefined ? join(config.stateDir, "raw") : o.mirrorLogDir,
          socketPath:
            o.mirrorSocket === undefined ? join(config.runtimeDir, "raw.sock") : o.mirrorSocket,
          reporter: agent.reporter,
        })
      : null;
    this.bridge = config.bridge.enabled
      ? new V5Bridge({
          port: config.bridge.port,
          allowedOrigins: config.bridge.allowedOrigins,
          reporter: agent.reporter,
          serial: () => ({
            connected:
              agent.supervisor.status === "connected" || agent.supervisor.status === "silent",
            port: agent.supervisor.description,
            baud: agent.supervisor.baud,
          }),
          ...(o.retryMs === undefined ? {} : { retryMs: o.retryMs }),
        })
      : null;
    this.panel = config.panel.enabled
      ? new PanelServer({
          port: config.panel.port,
          token: o.panelToken,
          reporter: agent.reporter,
          status: () => agent.status(),
          outbox: {
            parked: () => agent.store.parkedItems(500),
            retryAll: () => {
              const n = agent.store.unparkAll();
              void agent.uploader?.flushOnce();
              return n;
            },
          },
          setup: o.setup,
          ...(o.retryMs === undefined ? {} : { retryMs: o.retryMs }),
        })
      : null;
    if (this.bridge !== null) {
      agent.registerStatus("bridge", () => ({
        state: this.bridge?.state,
        clients: this.bridge?.clients,
      }));
    }
    if (this.panel !== null) agent.registerStatus("panel", () => ({ state: this.panel?.state }));
    agent.onRawLine((line) => {
      this.mirror?.write(line.text, line.hostTs);
      this.bridge?.broadcast(line.text, line.hostTs);
    });
  }

  async start(): Promise<void> {
    // Surfaces first or last? Recording matters most: start the agent, then the surfaces; a surface
    // that cannot start only logs and retries.
    await this.o.agent.start();
    await this.mirror?.start();
    this.bridge?.start();
    this.panel?.start();
  }

  /** Resolves when a finite source has ended (virtual detector) or the agent stopped. */
  agentFinished(): Promise<void> {
    return this.o.agent.finished;
  }

  async stop(): Promise<void> {
    await this.o.agent.stop();
    await Promise.allSettled([this.panel?.stop(), this.bridge?.stop(), this.mirror?.stop()]);
  }
}
