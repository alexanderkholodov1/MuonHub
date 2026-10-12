/** Builds the real daemon from the configuration file (serial or virtual source, Firebase provider). */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { uptime } from "node:os";
import { join } from "node:path";
import { v2 as dp } from "@muonhub/data-provider";
import { v2 } from "@muonhub/shared";
import { Agent } from "./agent.js";
import { createSystemClockProbe } from "./clock/clock.js";
import { BindingSchema, loadConfig, type AgentConfig, type Binding } from "./config.js";
import { Daemon } from "./daemon.js";
import { createStatfsProbe } from "./disk.js";
import { createLogger } from "./log.js";
import { loadOrCreatePanelToken } from "./panel/token.js";
import { createSetupApi } from "./panel/setup.js";
import { builtinDeviceType } from "./parsing/parser.js";
import { Reporter } from "./reporter.js";
import { createSerialFactory } from "./sources/serial.js";
import { createVirtualFactory } from "./sources/virtual.js";
import type { SourceFactory } from "./sources/types.js";
import { openLocalStore } from "./store/sqlite.js";
import type { RefreshTokenSupport } from "./sync/auth.js";
import { createFileCredentialStore } from "./sync/credentials.js";

export const AGENT_VERSION = "6.0.0-alpha.1.6";

export function stateFile(config: AgentConfig, name: string): string {
  return join(config.stateDir, name);
}

export function loadBinding(config: AgentConfig): Binding | null {
  if (config.binding !== undefined) return config.binding;
  const path = stateFile(config, "binding.json");
  if (!existsSync(path)) return null;
  return BindingSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export async function buildDaemon(
  configPath: string,
  hooks: { onRestartRequested?: () => void } = {},
): Promise<{ daemon: Daemon; config: AgentConfig }> {
  const config = await loadConfig(configPath);
  mkdirSync(config.stateDir, { recursive: true, mode: 0o700 });
  const logger = createLogger({ level: config.logLevel });
  const reporter = new Reporter(logger);
  const binding = loadBinding(config);
  const deviceType = builtinDeviceType(
    binding?.deviceTypeId ?? config.deviceType,
    v2.BUILTIN_DEVICE_TYPES,
  );
  const store = await openLocalStore({
    path: stateFile(config, "agent.db"),
    driver: config.storage.driver,
  });

  const factory: SourceFactory =
    config.source.kind === "serial"
      ? createSerialFactory({
          path: config.source.path,
          baud: config.source.baud ?? deviceType.transport.baud,
        })
      : createVirtualFactory({
          preset: config.source.preset,
          seed: config.source.seed,
          speed: config.source.speed,
        });
  const synthetic = config.source.kind === "virtual";

  const fb = config.firebase;
  const provider =
    fb === undefined
      ? null
      : dp.createFirebaseProviderV2({
          apiKey: fb.apiKey,
          projectId: fb.projectId,
          databaseURL: fb.databaseURL,
          ...(fb.authDomain === undefined ? {} : { authDomain: fb.authDomain }),
          ...(fb.appId === undefined ? {} : { appId: fb.appId }),
          ...(fb.emulators === undefined
            ? {}
            : {
                emulators: {
                  ...(fb.emulators.auth === undefined ? {} : { auth: fb.emulators.auth }),
                  ...(fb.emulators.firestore === undefined
                    ? {}
                    : { firestore: fb.emulators.firestore }),
                  ...(fb.emulators.database === undefined
                    ? {}
                    : { database: fb.emulators.database }),
                },
              }),
        });
  // Session restore needs refresh-token support in the provider; absent, the agent records locally.
  const maybe = provider as (dp.DataProviderV2 & Partial<RefreshTokenSupport>) | null;
  const refresh: RefreshTokenSupport | null =
    maybe !== null &&
    maybe.getRefreshToken !== undefined &&
    maybe.signInWithRefreshToken !== undefined
      ? (maybe as unknown as RefreshTokenSupport)
      : null;
  const credentials = createFileCredentialStore(stateFile(config, "credentials"));

  const agent = new Agent({
    version: AGENT_VERSION,
    deviceType,
    streamId: binding?.streamId ?? null,
    deviceId: binding?.deviceId ?? "unbound",
    store,
    reporter,
    factory,
    provider,
    refresh,
    credentials,
    clockProbe: createSystemClockProbe(),
    diskProbe: createStatfsProbe(config.stateDir),
    silenceWindowMs: config.silenceWindowSec * 1000,
    disk: config.disk,
    holdForClock: !synthetic,
    synthetic,
    bootTimeMs: Date.now() - uptime() * 1000,
  });
  const setup =
    provider !== null && agent.auth !== null
      ? createSetupApi({
          provider,
          auth: agent.auth,
          deviceTypes: v2.BUILTIN_DEVICE_TYPES,
          bindingPath: stateFile(config, "binding.json"),
          onBound: () => hooks.onRestartRequested?.(),
        })
      : null;
  const daemon = new Daemon({
    agent,
    config,
    panelToken: loadOrCreatePanelToken(stateFile(config, "panel-token")),
    setup,
  });
  return { daemon, config };
}
