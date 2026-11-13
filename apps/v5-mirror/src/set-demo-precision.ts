/**
 * Sets the demo station's public precision on the emulators (never a real project) and refreshes its
 * public projection, as its owner: `node dist/set-demo-precision.js approximate`.
 */
import { v2 } from "@muonhub/shared";
import { assertEmulatorTarget, emulatorProvider, loadState } from "./env.js";

async function main(): Promise<void> {
  assertEmulatorTarget();
  const precision = v2.PublicPrecisionSchema.parse(process.argv[2]);
  const state = loadState();
  const provider = emulatorProvider("set-demo-precision");
  await provider.signInWithEmail(state.ownerEmail, state.ownerPassword);
  try {
    await provider.updateStation(state.stationId, { publicPrecision: precision });
    await provider.refreshPublicProjection(state.stationId);
    process.stdout.write(`demo station precision: ${precision}\n`);
  } finally {
    await provider.signOut();
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(`failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  },
);
