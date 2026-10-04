/**
 * Security-rules tests for the Phase A deny-by-default ruleset
 * (`infra/firebase/database.rules.json`), run against the RTDB emulator.
 *
 * Executed only via `pnpm test:emulator` (firebase emulators:exec). Excluded from the
 * default `pnpm test`. Covers spec 0007 acceptance criterion 5.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, beforeAll, afterAll } from "vitest";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

const emulatorOn = Boolean(process.env["FIREBASE_DATABASE_EMULATOR_HOST"]);
const describeEmu = emulatorOn ? describe : describe.skip;

const rulesPath = fileURLToPath(
  new URL("../../../infra/firebase/database.rules.json", import.meta.url),
);

const PUBLIC = "stations/pub_station";
const PRIVATE = "stations/priv_station";
const OWNED = "stations/owned_station";
const MINUTE = "stations/owned_station/detectors/d1/minutes/000001700000000000";

describeEmu("database security rules", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-muonhub",
      database: { rules: readFileSync(rulesPath, "utf8") },
    });

    // Seed with rules disabled.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.database();
      await db.ref(PUBLIC).set({ name: "Pub", ownerUid: "owner1", visibility: "public" });
      await db.ref(PRIVATE).set({ name: "Priv", ownerUid: "owner1", visibility: "private" });
      await db.ref(OWNED).set({
        name: "Owned",
        ownerUid: "owner1",
        visibility: "private",
        shares: { editorUser: "editor" },
      });
      // For the detector_index hijack test: a station the attacker owns, plus an existing
      // index entry pointing a detector at the victim's (owner1's) station.
      await db.ref("stations/attacker_station").set({
        name: "Attacker",
        ownerUid: "attacker",
        visibility: "private",
      });
      await db.ref("detector_index/d_victim").set("owned_station");
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("lets anyone read a public station", async () => {
    const db = testEnv.unauthenticatedContext().database();
    await assertSucceeds(db.ref(PUBLIC).once("value"));
  });

  it("denies an anonymous read of a private station", async () => {
    const db = testEnv.unauthenticatedContext().database();
    await assertFails(db.ref(PRIVATE).once("value"));
  });

  it("denies a non-owner writing to an existing station", async () => {
    const db = testEnv.authenticatedContext("rando").database();
    await assertFails(db.ref(OWNED).update({ name: "hijacked" }));
  });

  it("lets an editor push a minute record under a shared station", async () => {
    const db = testEnv.authenticatedContext("editorUser").database();
    await assertSucceeds(
      db.ref(MINUTE).set({ ts: 1_700_000_000_000, ec: 10, cc: 0, sm: 5, sx: 9, sn: 2, tp: 21, pr: 1013, dt: 1 }),
    );
  });

  it("denies a stranger pushing a minute record", async () => {
    const db = testEnv.authenticatedContext("stranger").database();
    await assertFails(
      db.ref(MINUTE).set({ ts: 1_700_000_000_001, ec: 10, cc: 0, sm: 5, sx: 9, sn: 2, tp: 21, pr: 1013, dt: 1 }),
    );
  });

  it("denies hijacking a detector_index entry to a station the writer does not own", async () => {
    // The attacker owns attacker_station but not the current target (owned_station),
    // so re-pointing the victim's detector must fail.
    const db = testEnv.authenticatedContext("attacker").database();
    await assertFails(db.ref("detector_index/d_victim").set("attacker_station"));
  });

  it("lets a station owner index a detector to their own station", async () => {
    const db = testEnv.authenticatedContext("owner1").database();
    await assertSucceeds(db.ref("detector_index/d_new").set("owned_station"));
  });
});
