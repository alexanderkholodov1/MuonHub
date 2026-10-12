/**
 * Rules v2 — stations, members, public projection, ownership transfers
 * (spec 0084 FR7, FR8, FR13; acceptance criteria CA4, CA5b).
 */
import { afterAll, beforeAll, beforeEach, expect, it, describe } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  NEW_STATION,
  OLD_TRANSFER,
  ST_OTHER,
  ST_PRIV,
  ST_PUB,
  UID,
  emulatorOn,
  fsAs,
  initEnv,
  member,
  now,
  omit,
  projection,
  seed,
  station,
  stPriv,
  stPub,
  transfer,
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

describeEmu("stations/{id} — reads and queries", () => {
  for (const who of ["owner", "editor", "viewer", "agent", "admin"] as const) {
    it(`${who} reads a private station`, async () => {
      await assertSucceeds(getDoc(doc(fsAs(env, who), `stations/${ST_PRIV}`)));
    });
  }
  for (const who of ["anon", "stranger", "recipient"] as const) {
    it(`denies ${who} reading the full station record (private and public)`, async () => {
      await assertFails(getDoc(doc(fsAs(env, who), `stations/${ST_PRIV}`)));
      await assertFails(getDoc(doc(fsAs(env, who), `stations/${ST_PUB}`)));
    });
  }
  it("my stations: `where ownerUid == me` is allowed", async () => {
    const fs = fsAs(env, "owner");
    const snap = await assertSucceeds(
      getDocs(query(collection(fs, "stations"), where("ownerUid", "==", UID.owner))),
    );
    expect(snap.size).toBe(2);
  });
  it("denies an unconstrained station list (rules are not filters)", async () => {
    await assertFails(getDocs(collection(fsAs(env, "owner"), "stations")));
  });
  it("denies listing another user's stations", async () => {
    const fs = fsAs(env, "stranger");
    await assertFails(
      getDocs(query(collection(fs, "stations"), where("ownerUid", "==", UID.owner))),
    );
  });
  it("stations I belong to: collection-group query `where uid == me`", async () => {
    const fs = fsAs(env, "viewer");
    const snap = await assertSucceeds(
      getDocs(query(collectionGroup(fs, "members"), where("uid", "==", UID.viewer))),
    );
    expect(snap.docs.map((d) => d.ref.parent.parent?.id).sort()).toEqual([ST_PRIV, ST_PUB]);
  });
  it("denies a collection-group query for someone else's memberships", async () => {
    const fs = fsAs(env, "viewer");
    await assertFails(
      getDocs(query(collectionGroup(fs, "members"), where("uid", "==", UID.editor))),
    );
    await assertFails(getDocs(collectionGroup(fs, "members")));
  });
  it("denies an anonymous membership query", async () => {
    const fs = fsAs(env, "anon");
    await assertFails(
      getDocs(query(collectionGroup(fs, "members"), where("uid", "==", UID.viewer))),
    );
  });
});

describeEmu("stations/{id} — create", () => {
  const NEW = NEW_STATION;
  const fresh = (vis: "public" | "private", id = NEW) => station(id, UID.stranger, vis, "city");

  it("a signed-in user creates a private station they own", async () => {
    await assertSucceeds(setDoc(doc(fsAs(env, "stranger"), `stations/${NEW}`), fresh("private")));
  });
  it("a public station is created together with its projection", async () => {
    const fs = fsAs(env, "stranger");
    const b = writeBatch(fs);
    b.set(doc(fs, `stations/${NEW}`), fresh("public"));
    b.set(doc(fs, `publicStations/${NEW}`), projection(fresh("public"), 0));
    await assertSucceeds(b.commit());
  });
  it("denies a public station without its projection", async () => {
    await assertFails(setDoc(doc(fsAs(env, "stranger"), `stations/${NEW}`), fresh("public")));
  });
  it("denies a station owned by someone else", async () => {
    await assertFails(
      setDoc(doc(fsAs(env, "stranger"), `stations/${NEW}`), {
        ...fresh("private"),
        ownerUid: UID.owner,
      }),
    );
  });
  it("denies a station without visibility (no default)", async () => {
    const noVisibility = omit(fresh("private"), "visibility");
    await assertFails(setDoc(doc(fsAs(env, "stranger"), `stations/${NEW}`), noVisibility));
  });
  it("denies unknown keys, a transferId, a mismatched id, or a future createdAt", async () => {
    const ref = doc(fsAs(env, "stranger"), `stations/${NEW}`);
    await assertFails(setDoc(ref, { ...fresh("private"), members: { x: "editor" } }));
    await assertFails(setDoc(ref, { ...fresh("private"), transferId: "xferNewD6hLp3QsWz8YvKt" }));
    await assertFails(setDoc(ref, { ...fresh("private"), id: "other" }));
    const t = now() + 3_600_000;
    await assertFails(setDoc(ref, { ...fresh("private"), createdAt: t, updatedAt: t }));
  });
  it("denies creating over an existing station id (no overwrite, no takeover)", async () => {
    // ST_OTHER already exists and belongs to someone else.
    await assertFails(
      setDoc(
        doc(fsAs(env, "owner"), `stations/${ST_OTHER}`),
        station(ST_OTHER, UID.owner, "private", "city"),
      ),
    );
    const fs = fsAs(env, "owner");
    const b = writeBatch(fs);
    b.set(doc(fs, `stations/${ST_OTHER}`), station(ST_OTHER, UID.owner, "public", "approximate"));
    b.set(
      doc(fs, `publicStations/${ST_OTHER}`),
      projection(station(ST_OTHER, UID.owner, "public", "approximate"), 0),
    );
    await assertFails(b.commit());
  });
  it("a public projection and its station id contain no uid", async () => {
    const s = fresh("public");
    expect(NEW).not.toContain(UID.stranger);
    expect(JSON.stringify(projection(s, 0))).not.toContain(UID.stranger);
    const fs = fsAs(env, "stranger");
    const b = writeBatch(fs);
    b.set(doc(fs, `stations/${NEW}`), s);
    b.set(doc(fs, `publicStations/${NEW}`), projection(s, 0));
    await assertSucceeds(b.commit());
    const read = await getDoc(doc(fsAs(env, "anon"), `publicStations/${NEW}`));
    expect(JSON.stringify(read.data())).not.toContain(UID.stranger);
  });
  it("denies a station id outside the random-id scheme", async () => {
    for (const id of [
      "stNew",
      "short_id_with_underscore_xx",
      `${UID.stranger}_stationnew1`,
      "x".repeat(65),
    ]) {
      await assertFails(
        setDoc(doc(fsAs(env, "stranger"), `stations/${id}`), { ...fresh("private"), id }),
      );
    }
  });
  it("denies an invalid location", async () => {
    const s = fresh("private");
    await assertFails(
      setDoc(doc(fsAs(env, "stranger"), `stations/${NEW}`), {
        ...s,
        location: { ...s.location, lat: 91 },
      }),
    );
  });
  it("denies an anonymous create and overwriting an existing station", async () => {
    await assertFails(setDoc(doc(fsAs(env, "anon"), `stations/${NEW}`), fresh("private")));
    await assertFails(
      setDoc(doc(fsAs(env, "stranger"), `stations/${ST_PRIV}`), {
        ...stPriv(),
        ownerUid: UID.stranger,
      }),
    );
  });
});

describeEmu("stations/{id} — update", () => {
  const ref = (who: Who, id = ST_PRIV) => doc(fsAs(env, who), `stations/${id}`);

  it("the owner renames a private station", async () => {
    await assertSucceeds(updateDoc(ref("owner"), { name: "Lab 2", updatedAt: now() }));
  });
  for (const who of ["editor", "agent"] as const) {
    it(`${who} renames a private station (metadata)`, async () => {
      await assertSucceeds(
        updateDoc(ref(who), { name: "Lab 2", timezone: "UTC", updatedAt: now() }),
      );
    });
  }
  it("denies an editor taking over the station (ownerUid)", async () => {
    await assertFails(updateDoc(ref("editor"), { ownerUid: UID.editor }));
  });
  it("denies an editor changing visibility, precision, location, or institution", async () => {
    await assertFails(updateDoc(ref("editor"), { visibility: "public" }));
    await assertFails(updateDoc(ref("editor"), { publicPrecision: "hidden" }));
    await assertFails(updateDoc(ref("editor"), { "location.lat": 0 }));
    await assertFails(updateDoc(ref("editor"), { institutionId: "usfq" }));
  });
  for (const who of ["viewer", "stranger", "anon", "admin"] as const) {
    it(`denies ${who} updating a station`, async () => {
      await assertFails(updateDoc(ref(who), { name: "Hijacked" }));
    });
  }
  it("denies the owner changing ownerUid without a transfer record", async () => {
    await assertFails(updateDoc(ref("owner"), { ownerUid: UID.recipient }));
  });
  it("denies changing createdAt or id, and unknown keys", async () => {
    await assertFails(updateDoc(ref("owner"), { createdAt: 1 }));
    await assertFails(updateDoc(ref("owner"), { id: "x" }));
    await assertFails(updateDoc(ref("owner"), { shares: { x: "editor" } }));
  });
  it("the owner moves a public station and updates its projection in the same batch", async () => {
    const fs = fsAs(env, "owner");
    const moved = { ...stPub(), location: { ...stPub().location, lat: -2.17, lon: -79.92 } };
    const b = writeBatch(fs);
    b.set(doc(fs, `stations/${ST_PUB}`), moved);
    b.set(doc(fs, `publicStations/${ST_PUB}`), projection(moved));
    await assertSucceeds(b.commit());
  });
  it("denies moving a public station without updating its projection", async () => {
    await assertFails(updateDoc(ref("owner", ST_PUB), { "location.lat": -2.17 }));
  });
  it("denies an editor renaming a public station (the projection is owner-written)", async () => {
    const fs = fsAs(env, "editor");
    const b = writeBatch(fs);
    b.update(doc(fs, `stations/${ST_PUB}`), { name: "Renamed" });
    b.set(doc(fs, `publicStations/${ST_PUB}`), projection({ ...stPub(), name: "Renamed" }));
    await assertFails(b.commit());
  });
  it("denies a station leaving `public` without deleting its projection", async () => {
    await assertFails(updateDoc(ref("owner", ST_PUB), { visibility: "private" }));
  });
  it("a station leaves `public` and its projection is deleted in the same batch", async () => {
    const fs = fsAs(env, "owner");
    const b = writeBatch(fs);
    b.update(doc(fs, `stations/${ST_PUB}`), { visibility: "private" });
    b.delete(doc(fs, `publicStations/${ST_PUB}`));
    await assertSucceeds(b.commit());
  });
  it("a private station becomes public with its projection", async () => {
    const fs = fsAs(env, "owner");
    const pub = { ...stPriv(), visibility: "public" as const };
    const b = writeBatch(fs);
    b.set(doc(fs, `stations/${ST_PRIV}`), pub);
    b.set(doc(fs, `publicStations/${ST_PRIV}`), projection(pub));
    await assertSucceeds(b.commit());
  });
  it("denies a projection with exact coordinates for an approximate-precision station", async () => {
    const fs = fsAs(env, "owner");
    const pub = {
      ...stPriv(),
      visibility: "public" as const,
      publicPrecision: "approximate" as const,
    };
    const exact = projection({ ...pub, publicPrecision: "exact" });
    const b = writeBatch(fs);
    b.set(doc(fs, `stations/${ST_PRIV}`), pub);
    b.set(doc(fs, `publicStations/${ST_PRIV}`), { ...exact, precision: "approximate" });
    await assertFails(b.commit());
  });
});

describeEmu("stations/{id} — delete", () => {
  it("denies an editor or viewer deleting a station", async () => {
    await assertFails(deleteDoc(doc(fsAs(env, "editor"), `stations/${ST_PRIV}`)));
    await assertFails(deleteDoc(doc(fsAs(env, "viewer"), `stations/${ST_PRIV}`)));
  });
  it("the owner deletes a private station", async () => {
    await assertSucceeds(deleteDoc(doc(fsAs(env, "owner"), `stations/${ST_PRIV}`)));
  });
  it("denies deleting a public station while its projection remains", async () => {
    await assertFails(deleteDoc(doc(fsAs(env, "owner"), `stations/${ST_PUB}`)));
  });
  it("the owner deletes a public station together with its projection", async () => {
    const fs = fsAs(env, "owner");
    const b = writeBatch(fs);
    b.delete(doc(fs, `stations/${ST_PUB}`));
    b.delete(doc(fs, `publicStations/${ST_PUB}`));
    await assertSucceeds(b.commit());
  });
});

describeEmu("stations/{id}/members/{uid}", () => {
  const ref = (who: Who, uid: string, sid = ST_PRIV) =>
    doc(fsAs(env, who), `stations/${sid}/members/${uid}`);

  it("the owner shares the station with a viewer and changes the role", async () => {
    await assertSucceeds(setDoc(ref("owner", UID.stranger), member(UID.stranger, "viewer")));
    await assertSucceeds(updateDoc(ref("owner", UID.stranger), { role: "editor" }));
  });
  it("denies an editor adding a member", async () => {
    await assertFails(
      setDoc(ref("editor", UID.stranger), member(UID.stranger, "editor", UID.editor)),
    );
  });
  it("denies a viewer promoting themselves to editor", async () => {
    await assertFails(updateDoc(ref("viewer", UID.viewer), { role: "editor" }));
  });
  it("denies an editor changing their own role or another member's", async () => {
    await assertFails(
      updateDoc(ref("editor", UID.editor), { role: "viewer", addedBy: UID.editor }),
    );
    await assertFails(
      updateDoc(ref("editor", UID.viewer), { role: "editor", addedBy: UID.editor }),
    );
  });
  it("denies a stranger adding themselves (self-membership)", async () => {
    await assertFails(
      setDoc(ref("stranger", UID.stranger), member(UID.stranger, "editor", UID.stranger)),
    );
  });
  it("denies the owner adding themselves as a member", async () => {
    await assertFails(setDoc(ref("owner", UID.owner), member(UID.owner, "editor")));
  });
  it("denies an invalid role, unknown keys, or a forged addedBy", async () => {
    await assertFails(
      setDoc(ref("owner", UID.stranger), { ...member(UID.stranger, "viewer"), role: "owner" }),
    );
    await assertFails(
      setDoc(ref("owner", UID.stranger), { ...member(UID.stranger, "viewer"), email: "a@b.c" }),
    );
    await assertFails(
      setDoc(ref("owner", UID.stranger), member(UID.stranger, "viewer", UID.admin)),
    );
  });
  it("the owner lists members; an editor and a stranger cannot", async () => {
    await assertSucceeds(getDocs(collection(fsAs(env, "owner"), `stations/${ST_PRIV}/members`)));
    await assertFails(getDocs(collection(fsAs(env, "editor"), `stations/${ST_PRIV}/members`)));
    await assertFails(getDocs(collection(fsAs(env, "stranger"), `stations/${ST_PRIV}/members`)));
  });
  it("a member reads their own membership; not someone else's", async () => {
    await assertSucceeds(getDoc(ref("viewer", UID.viewer)));
    await assertFails(getDoc(ref("viewer", UID.editor)));
  });
  it("denies anonymous membership reads", async () => {
    await assertFails(getDoc(ref("anon", UID.viewer)));
  });
  it("a viewer leaves the station", async () => {
    await assertSucceeds(deleteDoc(ref("viewer", UID.viewer)));
  });
  it("denies a member removing someone else; the owner removes a member", async () => {
    await assertFails(deleteDoc(ref("viewer", UID.editor)));
    await assertFails(deleteDoc(ref("editor", UID.viewer)));
    await assertSucceeds(deleteDoc(ref("owner", UID.editor)));
  });
});

describeEmu("publicStations/{id}", () => {
  it("anyone reads and lists public stations, without personal data", async () => {
    const fs = fsAs(env, "anon");
    const one = await assertSucceeds(getDoc(doc(fs, `publicStations/${ST_PUB}`)));
    const all = await assertSucceeds(getDocs(query(collection(fs, "publicStations"), limit(100))));
    expect(all.size).toBe(1);
    const data = one.data() as Record<string, unknown>;
    const point = data["point"] as { lat: number; lon: number };
    const exact = stPub().location;
    // CA4: no email, uid, member list, or exact coordinates.
    expect(Object.keys(data).sort()).toEqual(
      [
        "active",
        "city",
        "countryCode",
        "deviceCount",
        "id",
        "name",
        "point",
        "precision",
        "schemaVersion",
        "updatedAt",
      ].sort(),
    );
    // The id is random and the fixture's name repeats it; no field carries a uid or personal data.
    expect(JSON.stringify({ ...data, name: null })).not.toMatch(
      /@|ownerUid|ownerA|editorE|viewerV/,
    );
    expect(point.lat).not.toBe(exact.lat);
    expect(point.lon).not.toBe(exact.lon);
  });
  it("denies an unbounded or oversized public-station list query (anonymous and signed in)", async () => {
    for (const who of ["anon", "stranger"] as const) {
      const fs = fsAs(env, who);
      await assertFails(getDocs(collection(fs, "publicStations")));
      await assertFails(getDocs(query(collection(fs, "publicStations"), limit(101))));
    }
  });
  it("the owner refreshes the projection (device count, active flag)", async () => {
    await assertSucceeds(
      setDoc(doc(fsAs(env, "owner"), `publicStations/${ST_PUB}`), {
        ...projection(stPub(), 3),
        active: false,
      }),
    );
  });
  it("an admin refreshes a projection", async () => {
    await assertSucceeds(
      setDoc(doc(fsAs(env, "admin"), `publicStations/${ST_PUB}`), projection(stPub(), 2)),
    );
  });
  for (const who of ["editor", "viewer", "stranger", "anon"] as const) {
    it(`denies ${who} writing the projection`, async () => {
      await assertFails(
        setDoc(doc(fsAs(env, who), `publicStations/${ST_PUB}`), projection(stPub(), 5)),
      );
    });
  }
  it("denies a projection with exact coordinates for an approximate station", async () => {
    const exact = projection({ ...stPub(), publicPrecision: "exact" });
    await assertFails(
      setDoc(doc(fsAs(env, "owner"), `publicStations/${ST_PUB}`), {
        ...exact,
        precision: "approximate",
      }),
    );
  });
  it("denies personal fields in the projection", async () => {
    const ref = doc(fsAs(env, "owner"), `publicStations/${ST_PUB}`);
    await assertFails(setDoc(ref, { ...projection(stPub()), ownerUid: UID.owner }));
    await assertFails(setDoc(ref, { ...projection(stPub()), email: "ownera@example.org" }));
  });
  it("denies a projection whose name or precision does not match the station", async () => {
    const ref = doc(fsAs(env, "owner"), `publicStations/${ST_PUB}`);
    await assertFails(setDoc(ref, { ...projection(stPub()), name: "Other" }));
    await assertFails(
      updateDoc(ref, { city: deleteField(), point: deleteField(), precision: "country" }),
    );
  });
  it("denies a projection for a private station", async () => {
    await assertFails(
      setDoc(doc(fsAs(env, "owner"), `publicStations/${ST_PRIV}`), projection(stPriv())),
    );
  });
  it("denies a stranger publishing someone else's station", async () => {
    await assertFails(
      setDoc(
        doc(fsAs(env, "stranger"), `publicStations/${ST_OTHER}`),
        projection({ ...stPriv(), id: ST_OTHER }),
      ),
    );
  });
  it("denies deleting the projection while the station stays public", async () => {
    await assertFails(deleteDoc(doc(fsAs(env, "owner"), `publicStations/${ST_PUB}`)));
  });
});

describeEmu("ownershipTransfers/{id}", () => {
  const TID = "xferNonceG2sMb9TqXw5RyHc";

  it("the owner transfers: transfer record + station owner change in one batch", async () => {
    const fs = fsAs(env, "owner");
    const b = writeBatch(fs);
    b.set(doc(fs, `ownershipTransfers/${TID}`), transfer(TID, ST_PRIV, UID.owner, UID.recipient));
    b.update(doc(fs, `stations/${ST_PRIV}`), {
      ownerUid: UID.recipient,
      transferId: TID,
      updatedAt: now(),
    });
    await assertSucceeds(b.commit());
  });
  it("denies a transfer without a matching transfer document", async () => {
    await assertFails(
      updateDoc(doc(fsAs(env, "owner"), `stations/${ST_PRIV}`), {
        ownerUid: UID.recipient,
        transferId: TID,
      }),
    );
  });
  it("denies a transfer record whose recipient differs from the new owner", async () => {
    const fs = fsAs(env, "owner");
    const b = writeBatch(fs);
    b.set(doc(fs, `ownershipTransfers/${TID}`), transfer(TID, ST_PRIV, UID.owner, UID.stranger));
    b.update(doc(fs, `stations/${ST_PRIV}`), { ownerUid: UID.recipient, transferId: TID });
    await assertFails(b.commit());
  });
  it("denies a transfer record without the station update", async () => {
    await assertFails(
      setDoc(
        doc(fsAs(env, "owner"), `ownershipTransfers/${TID}`),
        transfer(TID, ST_PRIV, UID.owner, UID.recipient),
      ),
    );
  });
  it("denies a transfer to an account without a user document", async () => {
    const fs = fsAs(env, "owner");
    const b = writeBatch(fs);
    b.set(doc(fs, `ownershipTransfers/${TID}`), transfer(TID, ST_PRIV, UID.owner, "ghostUser"));
    b.update(doc(fs, `stations/${ST_PRIV}`), { ownerUid: "ghostUser", transferId: TID });
    await assertFails(b.commit());
  });
  it("denies an editor transferring the station to themselves", async () => {
    const fs = fsAs(env, "editor");
    const b = writeBatch(fs);
    b.set(doc(fs, `ownershipTransfers/${TID}`), transfer(TID, ST_PRIV, UID.editor, UID.editor));
    b.update(doc(fs, `stations/${ST_PRIV}`), { ownerUid: UID.editor, transferId: TID });
    await assertFails(b.commit());
  });
  it("denies reusing an existing transfer record", async () => {
    await assertFails(
      updateDoc(doc(fsAs(env, "owner"), `stations/${ST_PRIV}`), {
        ownerUid: UID.recipient,
        transferId: OLD_TRANSFER,
      }),
    );
  });
  it("denies a transfer id outside the random-id scheme", async () => {
    const fs = fsAs(env, "owner");
    const bad = `${ST_PRIV}_nonce12345`;
    const b = writeBatch(fs);
    b.set(doc(fs, `ownershipTransfers/${bad}`), {
      ...transfer(TID, ST_PRIV, UID.owner, UID.recipient),
      id: bad,
    });
    b.update(doc(fs, `stations/${ST_PRIV}`), { ownerUid: UID.recipient, transferId: bad });
    await assertFails(b.commit());
  });
  it("denies updating or deleting a transfer record (owner and admin)", async () => {
    await assertFails(
      updateDoc(doc(fsAs(env, "owner"), `ownershipTransfers/${OLD_TRANSFER}`), { to: UID.owner }),
    );
    await assertFails(deleteDoc(doc(fsAs(env, "owner"), `ownershipTransfers/${OLD_TRANSFER}`)));
    await assertFails(deleteDoc(doc(fsAs(env, "admin"), `ownershipTransfers/${OLD_TRANSFER}`)));
  });
  it("the parties and admins read a transfer; others cannot", async () => {
    for (const who of ["owner", "recipient", "admin"] as const) {
      await assertSucceeds(getDoc(doc(fsAs(env, who), `ownershipTransfers/${OLD_TRANSFER}`)));
    }
    for (const who of ["editor", "stranger", "anon"] as const) {
      await assertFails(getDoc(doc(fsAs(env, who), `ownershipTransfers/${OLD_TRANSFER}`)));
    }
  });
  it("transfers to me: `where to == me` is allowed; unconstrained is not", async () => {
    const fs = fsAs(env, "recipient");
    const snap = await assertSucceeds(
      getDocs(query(collection(fs, "ownershipTransfers"), where("to", "==", UID.recipient))),
    );
    expect(snap.size).toBe(1);
    await assertFails(getDocs(collection(fs, "ownershipTransfers")));
  });
});
