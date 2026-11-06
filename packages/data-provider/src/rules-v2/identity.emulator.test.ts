/**
 * Rules v2 — users, usernames, admins, audit (spec 0084 FR6, FR9, FR14).
 */
import { afterAll, beforeAll, beforeEach, it, describe } from "vitest";
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
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import {
  OLD_TRANSFER,
  ST_PRIV,
  UID,
  audit,
  emulatorOn,
  fsAs,
  fsUid,
  initEnv,
  now,
  omit,
  seed,
  user,
  usernameOf,
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

describeEmu("users/{uid}", () => {
  it("owner reads their own user document", async () => {
    await assertSucceeds(getDoc(doc(fsAs(env, "owner"), `users/${UID.owner}`)));
  });
  it("admin reads a user document", async () => {
    await assertSucceeds(getDoc(doc(fsAs(env, "admin"), `users/${UID.owner}`)));
  });
  it("admin lists users", async () => {
    await assertSucceeds(getDocs(collection(fsAs(env, "admin"), "users")));
  });
  it("denies an anonymous read of a user document (email is private)", async () => {
    await assertFails(getDoc(doc(fsAs(env, "anon"), `users/${UID.owner}`)));
  });
  it("denies a stranger reading another user's document", async () => {
    await assertFails(getDoc(doc(fsAs(env, "stranger"), `users/${UID.owner}`)));
  });
  it("denies an editor reading the owner's user document", async () => {
    await assertFails(getDoc(doc(fsAs(env, "editor"), `users/${UID.owner}`)));
  });
  it("denies a non-admin listing users", async () => {
    await assertFails(getDocs(collection(fsAs(env, "owner"), "users")));
  });

  it("a new user creates the profile and the username claim in one batch", async () => {
    const me = fsUid(env, "newUser1");
    const b = writeBatch(me);
    b.set(doc(me, "users/newUser1"), user("newUser1", "newbie"));
    b.set(doc(me, "usernames/newbie"), { uid: "newUser1", createdAt: now() });
    await assertSucceeds(b.commit());
  });
  it("denies a profile whose username claim is missing", async () => {
    const me = fsUid(env, "newUser1");
    await assertFails(setDoc(doc(me, "users/newUser1"), user("newUser1", "newbie")));
  });
  it("denies a profile that names a username claimed by someone else", async () => {
    const me = fsUid(env, "newUser1");
    await assertFails(setDoc(doc(me, "users/newUser1"), user("newUser1", usernameOf(UID.owner))));
  });
  it("denies creating a user document for another uid", async () => {
    const fs = fsAs(env, "stranger");
    const b = writeBatch(fs);
    b.set(doc(fs, "users/someoneElse"), user("someoneElse", "someone"));
    b.set(doc(fs, "usernames/someone"), { uid: "someoneElse", createdAt: now() });
    await assertFails(b.commit());
  });
  it("denies a role field in the user document (self-escalation)", async () => {
    await assertFails(
      updateDoc(doc(fsAs(env, "stranger"), `users/${UID.stranger}`), { role: "admin" }),
    );
  });
  it("denies a user document with schemaVersion 1", async () => {
    await assertFails(
      updateDoc(doc(fsAs(env, "stranger"), `users/${UID.stranger}`), { schemaVersion: 1 }),
    );
  });
  it("a user updates their display name", async () => {
    await assertSucceeds(
      updateDoc(doc(fsAs(env, "stranger"), `users/${UID.stranger}`), { displayName: "S. Trange" }),
    );
  });
  it("denies changing the immutable uid or createdAt", async () => {
    const ref = doc(fsAs(env, "stranger"), `users/${UID.stranger}`);
    await assertFails(updateDoc(ref, { createdAt: 1 }));
    await assertFails(updateDoc(ref, { uid: UID.owner }));
  });
  it("denies a stranger updating another user's document", async () => {
    await assertFails(
      updateDoc(doc(fsAs(env, "stranger"), `users/${UID.owner}`), { displayName: "Hacked" }),
    );
  });
  it("a rename claims the new name and releases the old one in one batch", async () => {
    const fs = fsAs(env, "stranger");
    const b = writeBatch(fs);
    b.update(doc(fs, `users/${UID.stranger}`), { username: "renamed" });
    b.set(doc(fs, "usernames/renamed"), { uid: UID.stranger, createdAt: now() });
    b.delete(doc(fs, `usernames/${usernameOf(UID.stranger)}`));
    await assertSucceeds(b.commit());
  });
  it("denies a rename that keeps the old name claimed (two names for one user)", async () => {
    const fs = fsAs(env, "stranger");
    const b = writeBatch(fs);
    b.update(doc(fs, `users/${UID.stranger}`), { username: "renamed" });
    b.set(doc(fs, "usernames/renamed"), { uid: UID.stranger, createdAt: now() });
    await assertFails(b.commit());
  });
  it("a user deletes their own document with its username claim; a stranger cannot", async () => {
    await assertFails(deleteDoc(doc(fsAs(env, "stranger"), `users/${UID.owner}`)));
    const fs = fsAs(env, "stranger");
    const b = writeBatch(fs);
    b.delete(doc(fs, `users/${UID.stranger}`));
    b.delete(doc(fs, `usernames/${usernameOf(UID.stranger)}`));
    await assertSucceeds(b.commit());
  });
  it("denies deleting the user document while its username claim remains", async () => {
    await assertFails(deleteDoc(doc(fsAs(env, "stranger"), `users/${UID.stranger}`)));
  });
});

describeEmu("usernames/{username}", () => {
  it("a signed-in user resolves a username", async () => {
    await assertSucceeds(getDoc(doc(fsAs(env, "stranger"), `usernames/${usernameOf(UID.owner)}`)));
  });
  it("denies an anonymous username lookup", async () => {
    await assertFails(getDoc(doc(fsAs(env, "anon"), `usernames/${usernameOf(UID.owner)}`)));
  });
  it("denies listing usernames (no enumeration)", async () => {
    await assertFails(getDocs(collection(fsAs(env, "stranger"), "usernames")));
  });
  it("denies a second username for the same user", async () => {
    await assertFails(
      setDoc(doc(fsAs(env, "stranger"), "usernames/second-name"), {
        uid: UID.stranger,
        createdAt: now(),
      }),
    );
  });
  it("denies claiming a username for another uid", async () => {
    await assertFails(
      setDoc(doc(fsAs(env, "stranger"), "usernames/stolen"), { uid: UID.owner, createdAt: now() }),
    );
  });
  it("denies an invalid (upper-case) username", async () => {
    const fs = fsAs(env, "stranger");
    const b = writeBatch(fs);
    b.update(doc(fs, `users/${UID.stranger}`), { username: "BadName" });
    b.set(doc(fs, "usernames/BadName"), { uid: UID.stranger, createdAt: now() });
    b.delete(doc(fs, `usernames/${usernameOf(UID.stranger)}`));
    await assertFails(b.commit());
  });
  it("denies updating a claim", async () => {
    await assertFails(
      updateDoc(doc(fsAs(env, "stranger"), `usernames/${usernameOf(UID.stranger)}`), {
        createdAt: now(),
      }),
    );
  });
  it("denies releasing a name the user document still uses", async () => {
    await assertFails(
      deleteDoc(doc(fsAs(env, "stranger"), `usernames/${usernameOf(UID.stranger)}`)),
    );
  });
  it("denies deleting someone else's claim", async () => {
    await assertFails(deleteDoc(doc(fsAs(env, "stranger"), `usernames/${usernameOf(UID.owner)}`)));
  });
});

describeEmu("publicProfiles/{uid}", () => {
  // The seeded profiles: users/{uid} with displayName `User ${uid}` and username uid.toLowerCase().
  const projection = (uid: string, extra: Record<string, unknown> = {}) => ({
    schemaVersion: 2,
    uid,
    displayName: `User ${uid}`,
    username: usernameOf(uid),
    updatedAt: now(),
    ...extra,
  });
  const publish = async (who: Who, uid: string) => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore() as unknown as Firestore, `publicProfiles/${uid}`),
        projection(uid),
      );
    });
    return fsAs(env, who);
  };

  it("a user publishes their own projection, a copy of their profile", async () => {
    const fs = fsAs(env, "owner");
    await assertSucceeds(setDoc(doc(fs, `publicProfiles/${UID.owner}`), projection(UID.owner)));
  });
  it("a new user writes profile, username claim and projection in one batch", async () => {
    const me = fsUid(env, "newUser2");
    const b = writeBatch(me);
    b.set(doc(me, "users/newUser2"), user("newUser2", "newbie2"));
    b.set(doc(me, "usernames/newbie2"), { uid: "newUser2", createdAt: now() });
    b.set(doc(me, "publicProfiles/newUser2"), {
      ...projection("newUser2"),
      displayName: "User newUser2",
      username: "newbie2",
    });
    await assertSucceeds(b.commit());
  });
  it("a display-name change updates profile and projection together", async () => {
    const fs = await publish("owner", UID.owner);
    const b = writeBatch(fs);
    b.update(doc(fs, `users/${UID.owner}`), { displayName: "Dr. Owner" });
    b.set(
      doc(fs, `publicProfiles/${UID.owner}`),
      projection(UID.owner, { displayName: "Dr. Owner" }),
    );
    await assertSucceeds(b.commit());
  });
  it("any signed-in user reads one projection", async () => {
    const fs = await publish("stranger", UID.owner);
    await assertSucceeds(getDoc(doc(fs, `publicProfiles/${UID.owner}`)));
  });
  it("denies an anonymous read", async () => {
    await publish("owner", UID.owner);
    await assertFails(getDoc(doc(fsAs(env, "anon"), `publicProfiles/${UID.owner}`)));
  });
  it("denies listing projections (no enumeration), even to their users", async () => {
    await publish("owner", UID.owner);
    await assertFails(getDocs(collection(fsAs(env, "owner"), "publicProfiles")));
  });
  it("denies writing another user's projection", async () => {
    const fs = fsAs(env, "stranger");
    await assertFails(setDoc(doc(fs, `publicProfiles/${UID.owner}`), projection(UID.owner)));
  });
  it("denies a display name that is not the user's own (impersonation)", async () => {
    const fs = fsAs(env, "stranger");
    await assertFails(
      setDoc(
        doc(fs, `publicProfiles/${UID.stranger}`),
        projection(UID.stranger, { displayName: `User ${UID.owner}` }),
      ),
    );
  });
  it("denies a username that is not the user's own", async () => {
    const fs = fsAs(env, "stranger");
    await assertFails(
      setDoc(
        doc(fs, `publicProfiles/${UID.stranger}`),
        projection(UID.stranger, { username: usernameOf(UID.owner) }),
      ),
    );
  });
  it("denies the email or any other extra field in a projection", async () => {
    const fs = fsAs(env, "owner");
    const path = `publicProfiles/${UID.owner}`;
    await assertFails(
      setDoc(doc(fs, path), projection(UID.owner, { email: "ownera@example.org" })),
    );
    await assertFails(setDoc(doc(fs, path), projection(UID.owner, { role: "admin" })));
  });
  it("denies a projection with a missing field, schemaVersion 1 or a future time", async () => {
    const fs = fsAs(env, "owner");
    const path = `publicProfiles/${UID.owner}`;
    await assertFails(setDoc(doc(fs, path), omit(projection(UID.owner), "username")));
    await assertFails(setDoc(doc(fs, path), projection(UID.owner, { schemaVersion: 1 })));
    await assertFails(
      setDoc(doc(fs, path), projection(UID.owner, { updatedAt: now() + 3_600_000 })),
    );
  });
  it("denies a projection for a user without a profile", async () => {
    const fs = fsUid(env, "noProfile9");
    await assertFails(
      setDoc(doc(fs, "publicProfiles/noProfile9"), {
        ...projection("noProfile9"),
        username: "noprofile9",
      }),
    );
  });
  it("denies anonymous listing and deletion of projections", async () => {
    await publish("owner", UID.owner);
    await assertFails(getDocs(collection(fsAs(env, "anon"), "publicProfiles")));
    await assertFails(deleteDoc(doc(fsAs(env, "anon"), `publicProfiles/${UID.owner}`)));
  });
  it("denies tampering with an existing projection through a partial update", async () => {
    const fs = await publish("owner", UID.owner);
    const path = `publicProfiles/${UID.owner}`;
    await assertFails(updateDoc(doc(fs, path), { displayName: "Spoofed" }));
    await assertFails(updateDoc(doc(fs, path), { username: usernameOf(UID.stranger) }));
    await assertFails(updateDoc(doc(fs, path), { email: "ownera@example.org" }));
    await assertFails(updateDoc(doc(fsAs(env, "stranger"), path), { updatedAt: now() }));
  });
  it("denies changing the profile while the published projection keeps the old name", async () => {
    const fs = await publish("owner", UID.owner);
    await assertFails(updateDoc(doc(fs, `users/${UID.owner}`), { displayName: "Dr. Owner" }));
  });
  it("denies a rename that leaves the projection advertising the released username", async () => {
    const fs = await publish("owner", UID.owner);
    const b = writeBatch(fs);
    b.update(doc(fs, `users/${UID.owner}`), { username: "renamed-owner" });
    b.set(doc(fs, "usernames/renamed-owner"), { uid: UID.owner, createdAt: now() });
    b.delete(doc(fs, `usernames/${usernameOf(UID.owner)}`));
    await assertFails(b.commit());
    const ok = writeBatch(fs);
    ok.update(doc(fs, `users/${UID.owner}`), { username: "renamed-owner" });
    ok.set(doc(fs, "usernames/renamed-owner"), { uid: UID.owner, createdAt: now() });
    ok.delete(doc(fs, `usernames/${usernameOf(UID.owner)}`));
    ok.set(
      doc(fs, `publicProfiles/${UID.owner}`),
      projection(UID.owner, { username: "renamed-owner" }),
    );
    await assertSucceeds(ok.commit());
  });
  it("a user without a projection still changes their display name alone", async () => {
    const fs = fsAs(env, "owner");
    await assertSucceeds(updateDoc(doc(fs, `users/${UID.owner}`), { displayName: "Dr. Owner" }));
  });
  it("a user deletes their projection; a stranger cannot", async () => {
    await publish("owner", UID.owner);
    await assertFails(deleteDoc(doc(fsAs(env, "stranger"), `publicProfiles/${UID.owner}`)));
    await assertSucceeds(deleteDoc(doc(fsAs(env, "owner"), `publicProfiles/${UID.owner}`)));
  });
  it("denies deleting the account while its projection remains readable", async () => {
    const fs = await publish("stranger", UID.stranger);
    const b = writeBatch(fs);
    b.delete(doc(fs, `users/${UID.stranger}`));
    b.delete(doc(fs, `usernames/${usernameOf(UID.stranger)}`));
    await assertFails(b.commit());
    const all = writeBatch(fs);
    all.delete(doc(fs, `users/${UID.stranger}`));
    all.delete(doc(fs, `usernames/${usernameOf(UID.stranger)}`));
    all.delete(doc(fs, `publicProfiles/${UID.stranger}`));
    await assertSucceeds(all.commit());
  });
});

describeEmu("admins/{uid}", () => {
  const entry = (uid: string, addedBy: string) => ({ uid, addedBy, addedAt: now() });

  it("denies a user making themselves admin", async () => {
    await assertFails(
      setDoc(
        doc(fsAs(env, "stranger"), `admins/${UID.stranger}`),
        entry(UID.stranger, UID.stranger),
      ),
    );
  });
  it("denies a station owner making themselves admin", async () => {
    await assertFails(
      setDoc(doc(fsAs(env, "owner"), `admins/${UID.owner}`), entry(UID.owner, UID.owner)),
    );
  });
  it("an admin adds another admin", async () => {
    await assertSucceeds(
      setDoc(doc(fsAs(env, "admin"), `admins/${UID.owner}`), entry(UID.owner, UID.admin)),
    );
  });
  it("denies an admin entry with a forged addedBy", async () => {
    await assertFails(
      setDoc(doc(fsAs(env, "admin"), `admins/${UID.owner}`), entry(UID.owner, UID.owner)),
    );
  });
  it("a user reads their own (absent) admin entry", async () => {
    await assertSucceeds(getDoc(doc(fsAs(env, "owner"), `admins/${UID.owner}`)));
  });
  it("denies a non-admin reading another admin entry", async () => {
    await assertFails(getDoc(doc(fsAs(env, "owner"), `admins/${UID.admin}`)));
  });
  it("denies an anonymous read of admins", async () => {
    await assertFails(getDoc(doc(fsAs(env, "anon"), `admins/${UID.admin}`)));
  });
  it("only admins list admins", async () => {
    await assertFails(getDocs(collection(fsAs(env, "owner"), "admins")));
    await assertSucceeds(getDocs(collection(fsAs(env, "admin"), "admins")));
  });
  it("denies a non-admin removing an admin; an admin can", async () => {
    await assertFails(deleteDoc(doc(fsAs(env, "owner"), `admins/${UID.admin}`)));
    await assertSucceeds(deleteDoc(doc(fsAs(env, "admin"), `admins/${UID.admin}`)));
  });
});

describeEmu("audit/{id}", () => {
  const put = (who: Who, entry: Record<string, unknown>) =>
    setDoc(doc(fsAs(env, who), `audit/${String(entry["id"])}`), entry);

  it("a signed-in user appends an entry for their own action", async () => {
    await assertSucceeds(put("owner", audit("a1", UID.owner)));
  });
  it("denies an undefined action type", async () => {
    await assertFails(put("owner", audit("a1", UID.owner, "deleteEverything")));
  });
  it("denies an entry attributed to another user", async () => {
    await assertFails(put("owner", audit("a1", UID.stranger)));
  });
  it("denies an anonymous entry", async () => {
    await assertFails(put("anon", audit("a1", UID.owner)));
  });
  it("denies an entry not stamped with the current time", async () => {
    await assertFails(put("owner", { ...audit("a1", UID.owner), createdAt: 1000 }));
  });
  it("denies an unbounded payload, oversized values, missing details, and unknown keys", async () => {
    const details = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, i]));
    await assertFails(put("owner", { ...audit("a1", UID.owner), details }));
    await assertFails(
      put("owner", {
        ...audit("a1", UID.owner),
        details: { memberUid: UID.viewer, role: "viewer", note: "x".repeat(100_000) },
      }),
    );
    await assertFails(
      put("owner", {
        ...audit("a1", UID.owner),
        details: { memberUid: "x".repeat(100_000), role: "viewer" },
      }),
    );
    await assertFails(put("owner", omit(audit("a1", UID.owner), "details")));
    await assertFails(put("owner", { ...audit("a2", UID.owner), extra: true }));
  });

  // Each action is tied to the state of its target after the batch (getAfter).
  it("membershipChange: denies a role the membership does not have", async () => {
    const forged = { memberUid: UID.viewer, role: "editor" };
    await assertFails(put("owner", audit("a1", UID.owner, "membershipChange", ST_PRIV, forged)));
  });
  it("membershipChange: denies a stranger logging a change of someone else's station", async () => {
    const d = { memberUid: UID.viewer, role: "viewer" };
    await assertFails(put("stranger", audit("a1", UID.stranger, "membershipChange", ST_PRIV, d)));
  });
  it("membershipChange: the owner logs a removal together with the deletion", async () => {
    const fs = fsAs(env, "owner");
    const d = { memberUid: UID.editor, role: "removed" };
    const b = writeBatch(fs);
    b.delete(doc(fs, `stations/${ST_PRIV}/members/${UID.editor}`));
    b.set(doc(fs, "audit/a1"), audit("a1", UID.owner, "membershipChange", ST_PRIV, d));
    await assertSucceeds(b.commit());
    await assertFails(
      put(
        "owner",
        audit("a2", UID.owner, "membershipChange", ST_PRIV, { ...d, memberUid: UID.viewer }),
      ),
    );
  });
  it("membershipChange: a member logs leaving", async () => {
    const fs = fsAs(env, "viewer");
    const d = { memberUid: UID.viewer, role: "removed" };
    const b = writeBatch(fs);
    b.delete(doc(fs, `stations/${ST_PRIV}/members/${UID.viewer}`));
    b.set(doc(fs, "audit/a1"), audit("a1", UID.viewer, "membershipChange", ST_PRIV, d));
    await assertSucceeds(b.commit());
  });
  it("visibilityChange: must match the station's visibility after the batch", async () => {
    await assertSucceeds(
      put("owner", audit("a1", UID.owner, "visibilityChange", ST_PRIV, { visibility: "private" })),
    );
    await assertFails(
      put("owner", audit("a2", UID.owner, "visibilityChange", ST_PRIV, { visibility: "public" })),
    );
    await assertFails(
      put(
        "editor",
        audit("a3", UID.editor, "visibilityChange", ST_PRIV, { visibility: "private" }),
      ),
    );
  });
  it("ownershipTransfer: must name a transfer record created by the actor", async () => {
    const d = { stationId: ST_PRIV, to: UID.recipient };
    await assertSucceeds(
      put("owner", audit("a1", UID.owner, "ownershipTransfer", OLD_TRANSFER, d)),
    );
    await assertFails(
      put(
        "owner",
        audit("a2", UID.owner, "ownershipTransfer", OLD_TRANSFER, { ...d, to: UID.stranger }),
      ),
    );
    await assertFails(
      put("recipient", audit("a3", UID.recipient, "ownershipTransfer", OLD_TRANSFER, d)),
    );
    await assertFails(
      put("owner", audit("a4", UID.owner, "ownershipTransfer", "xferNoSuchK9sTb4RqWe7YpLz", d)),
    );
  });
  it("adminChange: only an admin, matching the admins collection after the batch", async () => {
    await assertSucceeds(
      put("admin", audit("a1", UID.admin, "adminChange", UID.admin, { change: "added" })),
    );
    await assertFails(
      put("admin", audit("a2", UID.admin, "adminChange", UID.owner, { change: "added" })),
    );
    await assertFails(
      put("owner", audit("a3", UID.owner, "adminChange", UID.owner, { change: "removed" })),
    );
  });
  it("deviceTypeStatusChange: must match the device type's status after the batch", async () => {
    await assertSucceeds(
      put(
        "admin",
        audit("a1", UID.admin, "deviceTypeStatusChange", "inReview", { status: "review" }),
      ),
    );
    await assertFails(
      put(
        "admin",
        audit("a2", UID.admin, "deviceTypeStatusChange", "inReview", { status: "verified" }),
      ),
    );
    await assertFails(
      put(
        "owner",
        audit("a3", UID.owner, "deviceTypeStatusChange", "inReview", { status: "review" }),
      ),
    );
  });

  it("denies updating or deleting an entry, even as admin", async () => {
    await assertFails(updateDoc(doc(fsAs(env, "owner"), "audit/entry1"), { targetId: "x" }));
    await assertFails(deleteDoc(doc(fsAs(env, "admin"), "audit/entry1")));
  });
  it("only admins read the audit log", async () => {
    await assertSucceeds(getDocs(collection(fsAs(env, "admin"), "audit")));
    await assertFails(getDoc(doc(fsAs(env, "owner"), "audit/entry1")));
    await assertFails(getDoc(doc(fsAs(env, "anon"), "audit/entry1")));
  });
});
