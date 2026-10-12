/**
 * Rules v2 — Realtime Database authorization mirror: stationAccess and streamStation
 * (spec 0084 FR15; acceptance criterion CA5b).
 */
import { afterAll, beforeAll, beforeEach, it, describe } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  ST_OTHER,
  ST_PRIV,
  S_PRIV,
  UID,
  dbAs,
  emulatorOn,
  initEnv,
  seed,
  stationAccess,
  type Who,
} from "./fixtures.js";

const describeEmu = emulatorOn ? describe : describe.skip;
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initEnv();
});
beforeEach(async () => {
  await seed(env);
});
afterAll(async () => {
  await env?.cleanup();
});

const acc = (who: Who, path = "") =>
  dbAs(env, who).ref(`stationAccess/${ST_PRIV}${path === "" ? "" : `/${path}`}`);

describeEmu("stationAccess/{stationId} — create and rewrite", () => {
  it("a user creates the mirror of a new station they own", async () => {
    await assertSucceeds(
      dbAs(env, "stranger")
        .ref("stationAccess/stNew")
        .set(stationAccess(UID.stranger, false, [], [])),
    );
  });
  it("denies a mirror created for someone else, or with a pending owner", async () => {
    const db = dbAs(env, "stranger");
    await assertFails(db.ref("stationAccess/stNew").set(stationAccess(UID.owner, false, [], [])));
    await assertFails(
      db.ref("stationAccess/stNew").set({
        ...stationAccess(UID.stranger, false, [], []),
        pendingOwner: UID.owner,
      }),
    );
  });
  it("denies unknown keys, missing keys, or a non-boolean public flag", async () => {
    const db = dbAs(env, "stranger");
    const base = stationAccess(UID.stranger, false, [], []);
    await assertFails(db.ref("stationAccess/stNew").set({ ...base, admins: { x: true } }));
    await assertFails(db.ref("stationAccess/stNew").set({ ownerUid: UID.stranger }));
    await assertFails(db.ref("stationAccess/stNew").set({ ...base, public: "yes" }));
  });
  it("denies a stranger overwriting an existing mirror (station takeover)", async () => {
    await assertFails(acc("stranger").set(stationAccess(UID.stranger, false, [], [])));
  });
  it("the owner rewrites the whole mirror, keeping ownership", async () => {
    await assertSucceeds(acc("owner").set(stationAccess(UID.owner, false, [UID.agent], [])));
  });
  it("denies the owner handing ownership over directly (only via pendingOwner)", async () => {
    await assertFails(acc("owner").set(stationAccess(UID.recipient, false)));
    await assertFails(acc("owner", "ownerUid").set(UID.recipient));
  });
  it("denies deleting the mirror (its station id could then be re-claimed)", async () => {
    await assertFails(acc("owner").remove());
  });
});

describeEmu("stationAccess/{stationId} — members and flags", () => {
  it("the owner adds and removes an editor", async () => {
    await assertSucceeds(acc("owner", `editors/${UID.stranger}`).set(true));
    await assertSucceeds(acc("owner", `editors/${UID.stranger}`).remove());
  });
  it("the owner adds a viewer and makes the station public", async () => {
    await assertSucceeds(acc("owner", `viewers/${UID.stranger}`).set(true));
    await assertSucceeds(acc("owner", "public").set(true));
  });
  it("denies an editor adding members or changing the public flag", async () => {
    await assertFails(acc("editor", `editors/${UID.stranger}`).set(true));
    await assertFails(acc("editor", `viewers/${UID.stranger}`).set(true));
    await assertFails(acc("editor", "public").set(true));
  });
  it("denies a viewer promoting themselves to editor", async () => {
    await assertFails(acc("viewer", `editors/${UID.viewer}`).set(true));
  });
  it("denies a stranger adding themselves", async () => {
    await assertFails(acc("stranger", `viewers/${UID.stranger}`).set(true));
    await assertFails(acc("stranger", `editors/${UID.stranger}`).set(true));
  });
  it("denies the owner listing themselves as editor, and non-true values", async () => {
    await assertFails(acc("owner", `editors/${UID.owner}`).set(true));
    await assertFails(acc("owner", `editors/${UID.stranger}`).set("admin"));
  });
  it("a member leaves (removes their own entry); cannot remove others", async () => {
    await assertSucceeds(acc("viewer", `viewers/${UID.viewer}`).remove());
    await assertFails(acc("editor", `editors/${UID.agent}`).remove());
  });
  it("only the owner (and a pending owner) reads the mirror", async () => {
    await assertSucceeds(acc("owner").once("value"));
    for (const who of ["editor", "viewer", "stranger", "anon"] as const) {
      await assertFails(acc(who).once("value"));
    }
  });
});

describeEmu("stationAccess/{stationId} — transfer hand-over", () => {
  it("the owner sets a pending owner; editors cannot", async () => {
    await assertFails(acc("editor", "pendingOwner").set(UID.editor));
    await assertSucceeds(acc("owner", "pendingOwner").set(UID.recipient));
  });
  it("the pending owner reads and claims the mirror (ownerUid + clear pendingOwner)", async () => {
    await assertSucceeds(acc("owner", "pendingOwner").set(UID.recipient));
    await assertSucceeds(acc("recipient").once("value"));
    await assertSucceeds(acc("recipient").update({ ownerUid: UID.recipient, pendingOwner: null }));
  });
  it("denies a claim that leaves pendingOwner in place", async () => {
    await assertSucceeds(acc("owner", "pendingOwner").set(UID.recipient));
    await assertFails(acc("recipient", "ownerUid").set(UID.recipient));
  });
  it("denies a claim by anyone but the pending owner", async () => {
    await assertSucceeds(acc("owner", "pendingOwner").set(UID.recipient));
    await assertFails(acc("editor").update({ ownerUid: UID.editor, pendingOwner: null }));
    await assertFails(acc("stranger").update({ ownerUid: UID.stranger, pendingOwner: null }));
  });
  it("denies a claim without a pending transfer", async () => {
    await assertFails(acc("recipient").update({ ownerUid: UID.recipient, pendingOwner: null }));
  });
  it("denies the pending owner changing members before claiming", async () => {
    await assertSucceeds(acc("owner", "pendingOwner").set(UID.recipient));
    await assertFails(acc("recipient", `editors/${UID.stranger}`).set(true));
  });
  it("the owner cancels a pending transfer", async () => {
    await assertSucceeds(acc("owner", "pendingOwner").set(UID.recipient));
    await assertSucceeds(acc("owner", "pendingOwner").remove());
  });
});

describeEmu("streamStation/{streamId}", () => {
  const map = (who: Who, streamId: string, stationId = ST_PRIV) =>
    dbAs(env, who).ref(`streamStation/${streamId}`).set(stationId);

  it("the owner registers a stream id carrying their uid", async () => {
    await assertSucceeds(map("owner", "ownerA_newstream01"));
  });
  it("the agent (editor) registers a stream id carrying the station owner's uid", async () => {
    await assertSucceeds(map("agent", "ownerA_newstream02"));
  });
  it("denies an editor registering a stream id with their own prefix", async () => {
    await assertFails(map("editor", "editorE_newstream01"));
  });
  it("denies a stranger claiming a stream id of another user", async () => {
    await assertFails(map("stranger", "ownerA_newstream01"));
  });
  it("denies a stranger mapping their own prefix onto someone else's station", async () => {
    await assertFails(map("stranger", "strangerS_newstream01"));
  });
  it("denies re-pointing an existing stream to another station", async () => {
    await assertFails(map("owner", S_PRIV, "stPub"));
    await assertFails(map("stranger", S_PRIV, ST_OTHER));
  });
  it("denies deleting a mapping", async () => {
    await assertFails(dbAs(env, "owner").ref(`streamStation/${S_PRIV}`).remove());
  });
  it("denies a malformed stream id or a viewer registering a stream", async () => {
    await assertFails(map("owner", "ownerA_short"));
    await assertFails(map("viewer", "ownerA_newstream03"));
  });
  it("members read a mapping; anonymous and strangers cannot", async () => {
    await assertSucceeds(dbAs(env, "viewer").ref(`streamStation/${S_PRIV}`).once("value"));
    await assertFails(dbAs(env, "anon").ref(`streamStation/${S_PRIV}`).once("value"));
    await assertFails(dbAs(env, "stranger").ref(`streamStation/${S_PRIV}`).once("value"));
    await assertFails(dbAs(env, "owner").ref("streamStation").once("value"));
  });
});
