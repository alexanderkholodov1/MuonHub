/**
 * Agent configuration (spec 0087 FR1, FR2, FR9, FR15, FR19). Validated with zod; unknown keys are
 * rejected so a typo never silently falls back to a default.
 *
 * Two layers: the administrator's file (`/etc/muonhub/agent.json`, read-only for the service) and
 * the stream binding written by the setup wizard into the state directory (`binding.json`).
 */
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { v2 } from "@muonhub/shared";

const Port = z.number().int().min(1).max(65535);

export const SourceConfigSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("serial"),
    /** Stable path, e.g. `/dev/serial/by-id/usb-Arduino_...` (never `/dev/ttyACM0`). */
    path: z.string().min(1).max(512),
    /** Baud rate; default comes from the device type (v5 reads at 9600). */
    baud: z.number().int().positive().optional(),
  }),
  z.strictObject({
    kind: z.literal("virtual"),
    /** Name of a simulator preset (spec 0086). */
    preset: z.string().min(1).max(64).default("disruptions"),
    seed: z.number().int().optional(),
    /** Simulated seconds per wall-clock second; omitted = as fast as possible. */
    speed: z.number().positive().optional(),
  }),
]);

export const FirebaseConfigSchema = z.strictObject({
  apiKey: z.string().min(1),
  projectId: z.string().min(1),
  databaseURL: z.string().min(1),
  authDomain: z.string().optional(),
  appId: z.string().optional(),
  emulators: z
    .strictObject({
      auth: z.string().optional(),
      firestore: z.strictObject({ host: z.string(), port: Port }).optional(),
      database: z.strictObject({ host: z.string(), port: Port }).optional(),
    })
    .optional(),
});

/**
 * v5 site origins allowed to open the compatibility bridge (spec 0087 FR19). `"null"` (file:// pages
 * and sandboxed frames, which any web page can produce) is deliberately NOT here: an administrator
 * who needs it adds it explicitly to `bridge.allowedOrigins`.
 */
export const DEFAULT_BRIDGE_ORIGINS: readonly string[] = [
  "https://munhub-lab.web.app",
  "https://munhub-1.web.app",
  "https://munhub-1.firebaseapp.com",
];

export const AgentConfigSchema = z.strictObject({
  stateDir: z.string().min(1).default("/var/lib/muonhub"),
  runtimeDir: z.string().min(1).default("/run/muonhub"),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /** Built-in device type id (`cosmicwatch-v2`, `cosmicwatch-v3x`, `munra`). */
  deviceType: z.string().min(1).default("munra"),
  source: SourceConfigSchema,
  /** Silence window in seconds before "device silent" (default 120, derived from the rate). */
  silenceWindowSec: z.number().int().min(5).max(3600).default(120),
  /** Optional identity set by the administrator; otherwise `binding.json` from the wizard. */
  binding: z
    .strictObject({
      streamId: v2.StreamIdSchema,
      stationId: v2.StationIdSchema,
      deviceId: v2.IdSchema,
    })
    .optional(),
  firebase: FirebaseConfigSchema.optional(),
  panel: z
    .strictObject({ enabled: z.boolean().default(true), port: Port.default(8787) })
    .prefault({}),
  bridge: z
    .strictObject({
      enabled: z.boolean().default(false),
      port: Port.default(8765),
      allowedOrigins: z.array(z.string()).default([...DEFAULT_BRIDGE_ORIGINS]),
    })
    .prefault({}),
  mirror: z.strictObject({ enabled: z.boolean().default(true) }).prefault({}),
  disk: z
    .strictObject({
      lowBytes: z.number().int().positive().default(2_000_000_000),
      floorBytes: z.number().int().positive().default(200_000_000),
    })
    .prefault({}),
  storage: z
    .strictObject({ driver: z.enum(["node:sqlite", "better-sqlite3"]).default("node:sqlite") })
    .prefault({}),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type SourceConfig = z.infer<typeof SourceConfigSchema>;

export function parseConfig(raw: unknown): AgentConfig {
  const parsed = AgentConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`invalid agent configuration: ${detail}`);
  }
  if (parsed.data.disk.floorBytes >= parsed.data.disk.lowBytes) {
    throw new Error("invalid agent configuration: disk.floorBytes must be below disk.lowBytes");
  }
  return parsed.data;
}

export async function loadConfig(path: string): Promise<AgentConfig> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`cannot read configuration ${path}: ${(error as Error).message}`, {
      cause: error,
    });
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`configuration ${path} is not valid JSON: ${(error as Error).message}`, {
      cause: error,
    });
  }
  return parseConfig(json);
}

export const BindingSchema = z.strictObject({
  streamId: v2.StreamIdSchema,
  stationId: v2.StationIdSchema,
  deviceId: v2.IdSchema,
  deviceTypeId: z.string().min(1).optional(),
});
export type Binding = z.infer<typeof BindingSchema>;

export const DEFAULT_CONFIG_PATH = "/etc/muonhub/agent.json";
