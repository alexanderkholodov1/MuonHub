/**
 * Where the mirror reads (a public v5 profile, read-only) and writes (the Firebase emulators only).
 * Writing anywhere but an emulator `demo-*` project is refused, so a mistake cannot reach a real
 * project.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { v2 as dp } from "@muonhub/data-provider";

export const STATE_FILE =
  process.env["MUONHUB_DEMO_STATE"] ?? join(homedir(), ".cache", "muonhub-demo", "demo.json");

export const env = {
  v5Url: process.env["V5_DATABASE_URL"] ?? "https://munhub-1-default-rtdb.firebaseio.com",
  v5Profile: process.env["V5_PROFILE"] ?? "leopard_test",
  backfillHours: Number(process.env["BACKFILL_HOURS"] ?? "72"),
  intervalS: Number(process.env["INTERVAL_S"] ?? "60"),
  project: process.env["DEMO_PROJECT"] ?? "demo-muonhub",
  host: process.env["EMULATOR_HOST"] ?? "127.0.0.1",
};

export interface DemoState {
  stationId: string;
  deviceId: string;
  streamId: string;
  ownerEmail: string;
  ownerPassword: string;
  mirrorEmail: string;
  mirrorPassword: string;
}

export function loadState(): DemoState {
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as DemoState;
}

export function assertEmulatorTarget(): void {
  if (!env.project.startsWith("demo-")) {
    throw new Error(`refusing to write to "${env.project}": only emulator demo-* projects`);
  }
}

export function emulatorProvider(appName: string): dp.DataProviderV2 {
  assertEmulatorTarget();
  return dp.createFirebaseProviderV2({
    apiKey: "demo-api-key",
    projectId: env.project,
    databaseURL: `https://${env.project}-default-rtdb.firebaseio.com`,
    appName,
    // A small demo machine under load answers slowly; the minutes are write-once, so a retry is safe.
    timeoutMs: 60_000,
    emulators: {
      auth: `http://${env.host}:9099`,
      firestore: { host: env.host, port: 8080 },
      database: { host: env.host, port: 9000 },
    },
  });
}

/** Admin write through the Realtime Database emulator's REST API (emulator only). */
export async function emulatorAdminPut(path: string, value: unknown): Promise<void> {
  assertEmulatorTarget();
  const res = await fetch(`http://${env.host}:9000/${path}.json?ns=${env.project}-default-rtdb`, {
    method: "PUT",
    headers: { Authorization: "Bearer owner" },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`emulator admin write failed: ${String(res.status)}`);
}
