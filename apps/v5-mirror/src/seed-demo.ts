#!/usr/bin/env node
/**
 * Seeds the M2 demo on the Firebase emulators (never a real project): an owner account, the
 * station, device and stream that mirror the running v5 detector, and a machine account the owner
 * adds as an editor. Idempotent: an existing, still-valid state file is kept.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { v2 as dp } from "@muonhub/data-provider";
import { v2 } from "@muonhub/shared";
import {
  STATE_FILE,
  emulatorAdminPut,
  emulatorProvider,
  env,
  loadState,
  type DemoState,
} from "./env.js";

/**
 * "valid": the saved demo exists; "empty": the emulators hold no demo (fresh data); "unknown": the
 * check itself failed (slow or unreachable emulator) — then nothing is re-created, the service retries.
 */
async function existing(): Promise<"valid" | "empty" | "unknown"> {
  if (!existsSync(STATE_FILE)) return "empty";
  const s = loadState();
  const p = emulatorProvider("seed-check");
  try {
    await p.signInWithEmail(s.ownerEmail, s.ownerPassword);
  } catch (error) {
    return error instanceof dp.DataProviderError && error.code === "invalid-credentials"
      ? "empty"
      : "unknown";
  }
  try {
    return (await p.getStream(s.streamId)) !== null ? "valid" : "empty";
  } catch {
    return "unknown";
  } finally {
    await p.signOut().catch(() => undefined);
  }
}

async function account(
  appName: string,
  email: string,
  password: string,
  displayName: string,
  username: string,
): Promise<{ provider: dp.DataProviderV2; uid: string }> {
  const provider = emulatorProvider(appName);
  const user = await provider.createAccount(email, password);
  await provider.createUserProfile({
    schemaVersion: 2,
    uid: user.uid,
    displayName,
    username,
    email,
    createdAt: Date.now(),
  });
  return { provider, uid: user.uid };
}

/**
 * The public projection (device count, map point) is refreshed by the owner only. It is cosmetic for
 * the demo, so a failure is logged and never stops the mirror from starting.
 */
async function refreshProjection(state: DemoState): Promise<void> {
  const p = emulatorProvider("seed-projection");
  try {
    await p.signInWithEmail(state.ownerEmail, state.ownerPassword);
    await p.refreshPublicProjection(state.stationId);
    process.stdout.write("public projection refreshed\n");
  } catch (error) {
    process.stderr.write(
      `public projection not refreshed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  } finally {
    await p.signOut().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const found = await existing();
  if (found === "valid") {
    process.stdout.write(`demo already seeded (${STATE_FILE})\n`);
    await refreshProjection(loadState());
    return;
  }
  if (found === "unknown") throw new Error("could not check the emulators; not re-seeding");
  const password = (): string => randomBytes(9).toString("base64url");
  const state: DemoState = {
    stationId: dp.newStationId(),
    deviceId: "cosmicwatch-leopard-test",
    streamId: dp.newStreamId(),
    ownerEmail: process.env["DEMO_EMAIL"] ?? "demo@muonhub.test",
    ownerPassword: process.env["DEMO_PASSWORD"] ?? password(),
    mirrorEmail: "v5-mirror@muonhub.test",
    mirrorPassword: password(),
  };
  const owner = await account(
    "seed-owner",
    state.ownerEmail,
    state.ownerPassword,
    "LEOPARD Lab",
    "leopardlab",
  );
  const mirror = await account(
    "seed-mirror",
    state.mirrorEmail,
    state.mirrorPassword,
    "v5 mirror",
    "v5mirror",
  );
  const now = Date.now();
  await owner.provider.createStation(
    v2.StationSchema.parse({
      schemaVersion: 2,
      id: state.stationId,
      ownerUid: owner.uid,
      name: "LEOPARD Lab — USFQ",
      location: { lat: -0.1965, lon: -78.435, altitudeM: 2400, city: "Quito", countryCode: "EC" },
      publicPrecision: "city",
      visibility: "public",
      timezone: "America/Guayaquil",
      createdAt: now,
      updatedAt: now,
    }),
  );
  await owner.provider.createDevice(
    v2.DeviceSchema.parse({
      schemaVersion: 2,
      id: state.deviceId,
      ownerUid: owner.uid,
      stationId: state.stationId,
      deviceType: { id: "munra", version: 1 },
      label: "CosmicWatch (MuNRa) — LEOPARD-TEST",
      geometry: {
        activeAreaCm2: 25,
        thicknessCm: 1,
        material: "EJ-200",
        orientation: "horizontal",
      },
      status: "active",
      createdAt: now,
    }),
  );
  await owner.provider.createStream(
    v2.StreamSchema.parse({
      schemaVersion: 2,
      id: state.streamId,
      ownerUid: owner.uid,
      stationId: state.stationId,
      deviceId: state.deviceId,
      status: "active",
      createdAt: now,
    }),
  );
  await owner.provider.addMember(state.stationId, mirror.uid, "editor");
  // The rules accept minutes from `since` on; the mirror back-fills env.backfillHours (+1 day).
  await emulatorAdminPut(`streamStation/${state.streamId}`, {
    stationId: state.stationId,
    since: now - (env.backfillHours + 24) * 3_600_000,
  });
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
  process.stdout.write(`demo seeded: ${STATE_FILE}\n`);
  await refreshProjection(state);
  await owner.provider.signOut();
  await mirror.provider.signOut();
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(
      `seed failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exit(1);
  },
);
