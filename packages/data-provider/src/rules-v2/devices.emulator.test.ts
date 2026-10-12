/**
 * Rules v2 — device types, devices, calibrations, assemblies (spec 0084 FR10, FR11).
 */
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  DEV_PRIV,
  ST_OTHER,
  ST_PRIV,
  ST_PUB,
  UID,
  assembly,
  calibration,
  describeEmu,
  device,
  deviceType,
  fsAs,
  initEnv,
  seed,
  type Who,
} from "./fixtures.js";

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

describeEmu("deviceTypes/{id}", () => {
  const ref = (who: Who, id: string) => doc(fsAs(env, who), `deviceTypes/${id}`);

  it("anyone reads a built-in device type and its versions", async () => {
    await assertSucceeds(getDoc(ref("anon", "cosmicwatch-v3x")));
    await assertSucceeds(getDoc(doc(fsAs(env, "anon"), "deviceTypes/cosmicwatch-v3x/versions/1")));
    await assertSucceeds(
      getDocs(
        query(
          collection(fsAs(env, "anon"), "deviceTypes/cosmicwatch-v3x/versions"),
          where("status", "in", ["builtin", "verified"]),
        ),
      ),
    );
  });
  it("the public catalogue query (`status in [builtin, verified]`) is allowed anonymously", async () => {
    const fs = fsAs(env, "anon");
    const snap = await assertSucceeds(
      getDocs(query(collection(fs, "deviceTypes"), where("status", "in", ["builtin", "verified"]))),
    );
    expect(snap.size).toBe(1);
  });
  it("denies an unconstrained catalogue list (drafts are private)", async () => {
    await assertFails(getDocs(collection(fsAs(env, "anon"), "deviceTypes")));
  });
  it("a draft is readable by its author and admins only", async () => {
    await assertSucceeds(getDoc(ref("stranger", "myDraft")));
    await assertSucceeds(getDoc(ref("admin", "myDraft")));
    await assertFails(getDoc(ref("owner", "myDraft")));
    await assertFails(getDoc(ref("anon", "myDraft")));
  });
  it("a user creates a draft of their own", async () => {
    await assertSucceeds(
      setDoc(ref("owner", "newType"), deviceType("newType", "draft", UID.owner)),
    );
  });
  it("denies a user creating a builtin or verified type", async () => {
    await assertFails(setDoc(ref("owner", "newType"), deviceType("newType", "builtin", UID.owner)));
    await assertFails(
      setDoc(ref("owner", "newType"), deviceType("newType", "verified", UID.owner)),
    );
  });
  it("denies a draft attributed to another author", async () => {
    await assertFails(
      setDoc(ref("owner", "newType"), deviceType("newType", "draft", UID.stranger)),
    );
  });
  it("denies an invalid shape (unknown key, bad transport)", async () => {
    const t = deviceType("newType", "draft", UID.owner);
    await assertFails(setDoc(ref("owner", "newType"), { ...t, script: "rm -rf /" }));
    await assertFails(
      setDoc(ref("owner", "newType"), { ...t, transport: { ...t.transport, baud: -1 } }),
    );
  });
  it("the author edits the draft; cannot move it to review or verified", async () => {
    await assertSucceeds(updateDoc(ref("stranger", "myDraft"), { name: "Better name" }));
    await assertFails(updateDoc(ref("stranger", "myDraft"), { status: "review" }));
    await assertFails(updateDoc(ref("stranger", "myDraft"), { status: "verified" }));
  });
  it("denies the author editing a type under review", async () => {
    await assertFails(updateDoc(ref("stranger", "inReview"), { name: "Sneaky edit" }));
  });
  it("an admin verifies a type", async () => {
    await assertSucceeds(updateDoc(ref("admin", "inReview"), { status: "verified" }));
  });
  it("denies another user editing or deleting a draft; the author deletes it", async () => {
    await assertFails(updateDoc(ref("owner", "myDraft"), { name: "Mine now" }));
    await assertFails(deleteDoc(ref("owner", "myDraft")));
    await assertSucceeds(deleteDoc(ref("stranger", "myDraft")));
  });
  it("denies a user deleting a built-in type", async () => {
    await assertFails(deleteDoc(ref("owner", "cosmicwatch-v3x")));
  });
  it("an admin publishes a version; versions are immutable", async () => {
    const fs = fsAs(env, "admin");
    await assertSucceeds(
      setDoc(
        doc(fs, "deviceTypes/cosmicwatch-v3x/versions/2"),
        deviceType("cosmicwatch-v3x", "builtin", undefined, 2),
      ),
    );
    await assertFails(
      updateDoc(doc(fs, "deviceTypes/cosmicwatch-v3x/versions/1"), { name: "Changed" }),
    );
    await assertFails(deleteDoc(doc(fs, "deviceTypes/cosmicwatch-v3x/versions/1")));
  });
  it("denies a non-admin publishing a built-in version or a mismatched version id", async () => {
    await assertFails(
      setDoc(
        doc(fsAs(env, "owner"), "deviceTypes/cosmicwatch-v3x/versions/2"),
        deviceType("cosmicwatch-v3x", "builtin", undefined, 2),
      ),
    );
    await assertFails(
      setDoc(
        doc(fsAs(env, "admin"), "deviceTypes/cosmicwatch-v3x/versions/7"),
        deviceType("cosmicwatch-v3x", "builtin", undefined, 2),
      ),
    );
  });
});

describeEmu("devices/{id}", () => {
  const ref = (who: Who, id = DEV_PRIV) => doc(fsAs(env, who), `devices/${id}`);

  for (const who of ["owner", "editor", "viewer", "agent", "admin"] as const) {
    it(`${who} reads a device`, async () => {
      await assertSucceeds(getDoc(ref(who)));
    });
  }
  for (const who of ["anon", "stranger"] as const) {
    it(`denies ${who} reading a device`, async () => {
      await assertFails(getDoc(ref(who)));
    });
  }
  it("devices of a station: `where stationId == X` for a member", async () => {
    const fs = fsAs(env, "viewer");
    const snap = await assertSucceeds(
      getDocs(query(collection(fs, "devices"), where("stationId", "==", ST_PRIV))),
    );
    expect(snap.size).toBe(1);
  });
  it("denies the same query to a stranger, and an unconstrained list", async () => {
    const fs = fsAs(env, "stranger");
    await assertFails(getDocs(query(collection(fs, "devices"), where("stationId", "==", ST_PRIV))));
    await assertFails(getDocs(collection(fsAs(env, "owner"), "devices")));
  });
  for (const who of ["owner", "agent"] as const) {
    it(`${who} installs a device (owned by the station owner)`, async () => {
      await assertSucceeds(setDoc(ref(who, "devNew"), device("devNew", ST_PRIV, UID.owner)));
    });
  }
  it("denies an editor registering a device as their own", async () => {
    await assertFails(setDoc(ref("editor", "devNew"), device("devNew", ST_PRIV, UID.editor)));
  });
  for (const who of ["viewer", "stranger", "anon"] as const) {
    it(`denies ${who} installing a device in the owner's station`, async () => {
      await assertFails(setDoc(ref(who, "devNew"), device("devNew", ST_PRIV, UID.owner)));
    });
  }
  it("denies unknown keys and invalid geometry", async () => {
    const d = device("devNew", ST_PRIV, UID.owner);
    await assertFails(setDoc(ref("owner", "devNew"), { ...d, secret: 1 }));
    await assertFails(
      setDoc(ref("owner", "devNew"), { ...d, geometry: { ...d.geometry, activeAreaCm2: 0 } }),
    );
  });
  it("an editor updates the label; a viewer cannot", async () => {
    await assertSucceeds(updateDoc(ref("editor"), { label: "Top panel" }));
    await assertFails(updateDoc(ref("viewer"), { label: "Top panel" }));
  });
  it("denies changing createdAt or moving the device to a station the editor cannot write", async () => {
    await assertFails(updateDoc(ref("editor"), { createdAt: 5 }));
    await assertFails(updateDoc(ref("editor"), { stationId: ST_OTHER }));
  });
  it("only the station owner deletes a device", async () => {
    await assertFails(deleteDoc(ref("editor")));
    await assertSucceeds(deleteDoc(ref("owner")));
  });
});

describeEmu("devices/{id}/calibrations/{version}", () => {
  const ref = (who: Who, v: number) => doc(fsAs(env, who), `devices/${DEV_PRIV}/calibrations/${v}`);

  it("the agent appends a new calibration version", async () => {
    await assertSucceeds(setDoc(ref("agent", 2), calibration(DEV_PRIV, 2, UID.agent)));
  });
  it("denies updating or deleting an existing version (append-only)", async () => {
    await assertFails(updateDoc(ref("owner", 1), { note: "changed" }));
    await assertFails(setDoc(ref("owner", 1), calibration(DEV_PRIV, 1, UID.owner)));
    await assertFails(deleteDoc(ref("owner", 1)));
  });
  it("denies a viewer appending, a forged author, or a mismatched version id", async () => {
    await assertFails(setDoc(ref("viewer", 2), calibration(DEV_PRIV, 2, UID.viewer)));
    await assertFails(setDoc(ref("agent", 2), calibration(DEV_PRIV, 2, UID.owner)));
    await assertFails(setDoc(ref("agent", 3), calibration(DEV_PRIV, 2, UID.agent)));
  });
  it("members read and list calibrations; anonymous cannot", async () => {
    await assertSucceeds(getDoc(ref("viewer", 1)));
    await assertSucceeds(
      getDocs(collection(fsAs(env, "viewer"), `devices/${DEV_PRIV}/calibrations`)),
    );
    await assertFails(getDoc(ref("anon", 1)));
    await assertFails(getDoc(ref("stranger", 1)));
  });
});

describeEmu("assemblies/{stationId}", () => {
  const ref = (who: Who, sid = ST_PRIV) => doc(fsAs(env, who), `assemblies/${sid}`);

  it("an editor writes the assembly; a viewer cannot", async () => {
    await assertSucceeds(setDoc(ref("editor"), assembly(ST_PRIV)));
    await assertFails(setDoc(ref("viewer"), assembly(ST_PRIV)));
  });
  it("denies an assembly whose stationId differs from the document id", async () => {
    await assertFails(setDoc(ref("owner"), { ...assembly(ST_PRIV), stationId: ST_OTHER }));
  });
  it("members read the assembly; anonymous and strangers cannot", async () => {
    await assertSucceeds(getDoc(ref("viewer")));
    await assertFails(getDoc(ref("anon")));
    await assertFails(getDoc(ref("stranger")));
  });
  it("only the owner deletes the assembly", async () => {
    await assertFails(deleteDoc(ref("editor")));
    await assertSucceeds(deleteDoc(ref("owner")));
  });
  it("denies a stranger writing the assembly of a public station", async () => {
    await assertFails(setDoc(doc(fsAs(env, "stranger"), `assemblies/${ST_PUB}`), assembly(ST_PUB)));
  });
});
