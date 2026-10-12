/**
 * Rules v2 — end-to-end ownership transfer and member removal across both databases
 * (spec 0084 FR8, FR15; acceptance criterion CA5).
 *
 * Order used by the data layer: mirror first (pendingOwner / member removal), then Firestore, so a
 * desync can only leave rights removed, never granted.
 */
import { afterAll, beforeAll, beforeEach, it, describe } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import {
  NEW_STREAM_1,
  NEW_STREAM_2,
  DEV_PRIV,
  SESSION_OPEN,
  ST_PRIV,
  S_PRIV,
  UID,
  dbAs,
  emulatorOn,
  device,
  fsAs,
  initEnv,
  lastMinute,
  member,
  minute,
  minuteKey,
  now,
  seed,
  session,
  stationAccess,
  stream,
  streamStation,
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

const TID = "xferHandoverJ3kPq8WsRb5TnXc";

async function transferToRecipient(): Promise<void> {
  // 1. Mirror first: the owner names the pending owner.
  await assertSucceeds(
    dbAs(env, "owner").ref(`stationAccess/${ST_PRIV}/pendingOwner`).set(UID.recipient),
  );
  // 2. Firestore: transfer record + station owner change in one batch.
  const fs = fsAs(env, "owner");
  const b = writeBatch(fs);
  b.set(doc(fs, `ownershipTransfers/${TID}`), transfer(TID, ST_PRIV, UID.owner, UID.recipient));
  b.update(doc(fs, `stations/${ST_PRIV}`), {
    ownerUid: UID.recipient,
    transferId: TID,
    updatedAt: now(),
  });
  await assertSucceeds(b.commit());
  // 3. The new owner claims the mirror; the claim drops the former owner's editors and viewers.
  await assertSucceeds(
    dbAs(env, "recipient")
      .ref(`stationAccess/${ST_PRIV}`)
      .update({ ownerUid: UID.recipient, pendingOwner: null, editors: null, viewers: null }),
  );
}

/** Steps 1–2 only: the Firestore transfer is committed, the mirror is not claimed yet. */
async function transferWithoutClaim(): Promise<void> {
  await assertSucceeds(
    dbAs(env, "owner").ref(`stationAccess/${ST_PRIV}/pendingOwner`).set(UID.recipient),
  );
  const fs = fsAs(env, "owner");
  const b = writeBatch(fs);
  b.set(doc(fs, `ownershipTransfers/${TID}`), transfer(TID, ST_PRIV, UID.owner, UID.recipient));
  b.update(doc(fs, `stations/${ST_PRIV}`), {
    ownerUid: UID.recipient,
    transferId: TID,
    updatedAt: now(),
  });
  await assertSucceeds(b.commit());
}

const writeMinute = (who: Who, ts = lastMinute()) =>
  dbAs(env, who)
    .ref(`minutes/${S_PRIV}/${minuteKey(ts)}`)
    .set(minute(ts));

describeEmu("ownership transfer — former owner loses every right", () => {
  it("denies the former owner writing the station", async () => {
    await transferToRecipient();
    await assertFails(
      updateDoc(doc(fsAs(env, "owner"), `stations/${ST_PRIV}`), { name: "Still mine" }),
    );
    await assertFails(deleteDoc(doc(fsAs(env, "owner"), `stations/${ST_PRIV}`)));
  });
  it("denies the former owner managing members", async () => {
    await transferToRecipient();
    await assertFails(
      setDoc(
        doc(fsAs(env, "owner"), `stations/${ST_PRIV}/members/${UID.stranger}`),
        member(UID.stranger, "editor", UID.owner),
      ),
    );
    await assertFails(
      deleteDoc(doc(fsAs(env, "owner"), `stations/${ST_PRIV}/members/${UID.editor}`)),
    );
  });
  it("denies the former owner writing the mirror", async () => {
    await transferToRecipient();
    const db = dbAs(env, "owner");
    await assertFails(db.ref(`stationAccess/${ST_PRIV}/public`).set(true));
    await assertFails(db.ref(`stationAccess/${ST_PRIV}/editors/${UID.owner}`).set(true));
    await assertFails(db.ref(`stationAccess/${ST_PRIV}/ownerUid`).set(UID.owner));
  });
  it("denies the former owner clearing pendingOwner after the Firestore transfer", async () => {
    await transferWithoutClaim();
    const db = dbAs(env, "owner");
    await assertFails(db.ref(`stationAccess/${ST_PRIV}/pendingOwner`).remove());
    await assertFails(db.ref(`stationAccess/${ST_PRIV}`).update({ pendingOwner: null }));
    await assertFails(db.ref(`stationAccess/${ST_PRIV}`).set(stationAccess(UID.owner, false)));
    await assertFails(db.ref(`stationAccess/${ST_PRIV}/pendingOwner`).set(UID.stranger));
    // The recipient can still claim.
    await assertSucceeds(
      dbAs(env, "recipient")
        .ref(`stationAccess/${ST_PRIV}`)
        .update({ ownerUid: UID.recipient, pendingOwner: null, editors: null, viewers: null }),
    );
  });
  it("denies the former owner adding editors or going public before the claim", async () => {
    await transferWithoutClaim();
    const db = dbAs(env, "owner");
    await assertFails(db.ref(`stationAccess/${ST_PRIV}/editors/${UID.stranger}`).set(true));
    await assertFails(db.ref(`stationAccess/${ST_PRIV}/public`).set(true));
  });
  it("denies the former owner writing or reading minutes", async () => {
    await transferToRecipient();
    await assertFails(writeMinute("owner"));
    await assertFails(dbAs(env, "owner").ref(`minutes/${S_PRIV}`).once("value"));
  });
  it("denies the former owner registering new streams for the station", async () => {
    await transferToRecipient();
    await assertFails(
      dbAs(env, "owner").ref(`streamStation/${NEW_STREAM_2}`).set(streamStation(ST_PRIV, now())),
    );
  });
  it("denies the former owner re-running the transfer back to themselves", async () => {
    await transferToRecipient();
    const fs = fsAs(env, "owner");
    const back = "xferTakebackV6dLm2YzHe9QgAo";
    const b = writeBatch(fs);
    b.set(doc(fs, `ownershipTransfers/${back}`), transfer(back, ST_PRIV, UID.recipient, UID.owner));
    b.update(doc(fs, `stations/${ST_PRIV}`), { ownerUid: UID.owner, transferId: back });
    await assertFails(b.commit());
  });
});

describeEmu("ownership transfer — the new owner takes over", () => {
  it("the new owner renames the station and manages members", async () => {
    await transferToRecipient();
    const fs = fsAs(env, "recipient");
    await assertSucceeds(updateDoc(doc(fs, `stations/${ST_PRIV}`), { name: "Handed over" }));
    await assertSucceeds(
      setDoc(
        doc(fs, `stations/${ST_PRIV}/members/${UID.stranger}`),
        member(UID.stranger, "viewer", UID.recipient),
      ),
    );
    await assertSucceeds(
      dbAs(env, "recipient").ref(`stationAccess/${ST_PRIV}/viewers/${UID.stranger}`).set(true),
    );
  });
  it("the agent writes again only after the new owner re-adds it from the Firestore members", async () => {
    await transferToRecipient();
    await assertSucceeds(writeMinute("recipient"));
    await assertFails(writeMinute("agent", lastMinute() - 120_000));
    await assertSucceeds(
      dbAs(env, "recipient").ref(`stationAccess/${ST_PRIV}/editors/${UID.agent}`).set(true),
    );
    await assertSucceeds(writeMinute("agent", lastMinute() - 120_000));
  });
  it("the new owner re-homes the device and starts a stream", async () => {
    await transferToRecipient();
    const fs = fsAs(env, "recipient");
    await assertSucceeds(
      setDoc(doc(fs, `devices/${DEV_PRIV}`), device(DEV_PRIV, ST_PRIV, UID.recipient)),
    );
    const id = NEW_STREAM_1;
    await assertSucceeds(
      dbAs(env, "recipient").ref(`streamStation/${id}`).set(streamStation(ST_PRIV, now())),
    );
    await assertSucceeds(
      setDoc(doc(fs, `streams/${id}`), stream(id, ST_PRIV, DEV_PRIV, UID.recipient)),
    );
  });
  it("before claiming, the recipient has no RTDB write rights", async () => {
    await assertSucceeds(
      dbAs(env, "owner").ref(`stationAccess/${ST_PRIV}/pendingOwner`).set(UID.recipient),
    );
    await assertFails(writeMinute("recipient"));
  });
});

describeEmu("removed editor", () => {
  async function removeEditor(): Promise<void> {
    // Mirror first, then Firestore.
    await assertSucceeds(
      dbAs(env, "owner").ref(`stationAccess/${ST_PRIV}/editors/${UID.editor}`).remove(),
    );
    await assertSucceeds(
      deleteDoc(doc(fsAs(env, "owner"), `stations/${ST_PRIV}/members/${UID.editor}`)),
    );
  }

  it("a removed editor can no longer write minutes, live events, or status", async () => {
    await removeEditor();
    await assertFails(writeMinute("editor"));
    await assertFails(dbAs(env, "editor").ref(`live/${S_PRIV}/events/k1`).set({ t: now(), a: 1 }));
    await assertFails(
      dbAs(env, "editor").ref(`status/${S_PRIV}`).set({ lastSeenAt: now(), agentOnline: true }),
    );
  });
  it("a removed editor can no longer write Firestore metadata or read the stream", async () => {
    await removeEditor();
    const fs = fsAs(env, "editor");
    await assertFails(
      setDoc(doc(fs, `streams/${S_PRIV}/sessions/sessX`), session(S_PRIV, "sessX")),
    );
    await assertFails(
      updateDoc(doc(fs, `streams/${S_PRIV}/sessions/${SESSION_OPEN}`), {
        "counters.completeMinutes": 99,
      }),
    );
    await assertFails(updateDoc(doc(fs, `stations/${ST_PRIV}`), { name: "Still here" }));
    await assertFails(dbAs(env, "editor").ref(`minutes/${S_PRIV}`).once("value"));
  });
  it("revoking the agent account stops its writes", async () => {
    await assertSucceeds(
      dbAs(env, "owner").ref(`stationAccess/${ST_PRIV}/editors/${UID.agent}`).remove(),
    );
    await assertFails(writeMinute("agent"));
  });
});
