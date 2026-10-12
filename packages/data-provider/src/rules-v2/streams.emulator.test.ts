/**
 * Rules v2 — streams, sessions, day summaries (spec 0084 FR11, FR12).
 */
import { afterAll, beforeAll, beforeEach, expect, it, describe } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  DAY,
  DEV_OTHER,
  DEV_PRIV,
  DEV_PUB,
  SESSION_CLOSED,
  SESSION_OPEN,
  ST_OTHER,
  ST_PRIV,
  S_PRIV,
  S_PUB,
  UID,
  daySummary,
  emulatorOn,
  fsAs,
  hour,
  initEnv,
  now,
  seed,
  session,
  stream,
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

const NEW_STREAM = "ownerA_newstream01";

describeEmu("streams/{id}", () => {
  const ref = (who: Who, id = S_PRIV) => doc(fsAs(env, who), `streams/${id}`);

  for (const who of ["owner", "editor", "viewer", "agent", "admin"] as const) {
    it(`${who} reads a stream`, async () => {
      await assertSucceeds(getDoc(ref(who)));
    });
  }
  for (const who of ["anon", "stranger"] as const) {
    it(`denies ${who} reading a stream`, async () => {
      await assertFails(getDoc(ref(who)));
      await assertFails(getDoc(ref(who, S_PUB)));
    });
  }
  it("streams of a station: `where stationId == X` for a member; unconstrained denied", async () => {
    const snap = await assertSucceeds(
      getDocs(query(collection(fsAs(env, "viewer"), "streams"), where("stationId", "==", ST_PRIV))),
    );
    expect(snap.size).toBe(1);
    await assertFails(getDocs(collection(fsAs(env, "owner"), "streams")));
  });
  for (const who of ["owner", "agent"] as const) {
    it(`${who} creates a stream id prefixed with the station owner's uid`, async () => {
      await assertSucceeds(
        setDoc(ref(who, NEW_STREAM), stream(NEW_STREAM, ST_PRIV, DEV_PRIV, UID.owner)),
      );
    });
  }
  it("denies an editor claiming a stream id with their own prefix", async () => {
    const id = "editorE_newstream01";
    await assertFails(setDoc(ref("editor", id), stream(id, ST_PRIV, DEV_PRIV, UID.editor)));
    await assertFails(setDoc(ref("editor", id), stream(id, ST_PRIV, DEV_PRIV, UID.owner)));
  });
  it("denies a stranger claiming a stream id with another user's prefix", async () => {
    await assertFails(
      setDoc(ref("stranger", NEW_STREAM), stream(NEW_STREAM, ST_PRIV, DEV_PRIV, UID.owner)),
    );
    // Even for the stranger's own station: the prefix must be the station owner's uid.
    await assertFails(
      setDoc(ref("stranger", NEW_STREAM), stream(NEW_STREAM, ST_OTHER, DEV_OTHER, UID.owner)),
    );
  });
  it("denies a stream for a device of another owner", async () => {
    await assertFails(
      setDoc(ref("owner", NEW_STREAM), stream(NEW_STREAM, ST_PRIV, DEV_OTHER, UID.owner)),
    );
  });
  it("denies a stream whose device is installed in another station", async () => {
    await assertFails(
      setDoc(ref("owner", NEW_STREAM), stream(NEW_STREAM, ST_PRIV, DEV_PUB, UID.owner)),
    );
  });
  it("denies a viewer creating a stream, and malformed ids or keys", async () => {
    await assertFails(
      setDoc(ref("viewer", NEW_STREAM), stream(NEW_STREAM, ST_PRIV, DEV_PRIV, UID.owner)),
    );
    await assertFails(
      setDoc(ref("owner", "ownerA_short"), stream("ownerA_short", ST_PRIV, DEV_PRIV, UID.owner)),
    );
    await assertFails(
      setDoc(ref("owner", NEW_STREAM), {
        ...stream(NEW_STREAM, ST_PRIV, DEV_PRIV, UID.owner),
        extra: true,
      }),
    );
  });
  it("an editor stops a stream; the station/device links are immutable", async () => {
    await assertSucceeds(updateDoc(ref("agent"), { status: "stopped" }));
    await assertFails(updateDoc(ref("agent"), { stationId: ST_OTHER }));
    await assertFails(updateDoc(ref("agent"), { deviceId: DEV_PUB }));
    await assertFails(updateDoc(ref("owner"), { ownerUid: UID.editor }));
  });
  it("denies a viewer updating and anyone deleting a stream", async () => {
    await assertFails(updateDoc(ref("viewer"), { status: "stopped" }));
    await assertFails(deleteDoc(ref("owner")));
  });
});

describeEmu("streams/{id}/sessions/{sid}", () => {
  const ref = (who: Who, sid: string) => doc(fsAs(env, who), `streams/${S_PRIV}/sessions/${sid}`);

  it("the agent starts a session", async () => {
    await assertSucceeds(setDoc(ref("agent", "sessNew"), session(S_PRIV, "sessNew")));
  });
  it("denies a viewer or stranger starting a session", async () => {
    await assertFails(setDoc(ref("viewer", "sessNew"), session(S_PRIV, "sessNew")));
    await assertFails(setDoc(ref("stranger", "sessNew"), session(S_PRIV, "sessNew")));
  });
  it("denies endedAt without endReason, and unknown keys", async () => {
    await assertFails(
      setDoc(ref("agent", "sessNew"), { ...session(S_PRIV, "sessNew"), endedAt: now() }),
    );
    await assertFails(
      setDoc(ref("agent", "sessNew"), { ...session(S_PRIV, "sessNew"), host: "lab-pc" }),
    );
  });
  it("the agent updates growing counters of an open session", async () => {
    await assertSucceeds(updateDoc(ref("agent", SESSION_OPEN), { "counters.completeMinutes": 10 }));
  });
  it("denies decreasing counters", async () => {
    await assertFails(updateDoc(ref("agent", SESSION_OPEN), { "counters.completeMinutes": 1 }));
  });
  it("the agent closes a session once; a closed session is frozen", async () => {
    await assertSucceeds(
      updateDoc(ref("agent", SESSION_OPEN), { endedAt: now(), endReason: "usbLoss" }),
    );
    await assertFails(updateDoc(ref("agent", SESSION_CLOSED), { endReason: "reset" }));
    await assertFails(updateDoc(ref("agent", SESSION_CLOSED), { "counters.completeMinutes": 9 }));
  });
  it("denies changing startedAt or other immutable fields", async () => {
    await assertFails(updateDoc(ref("agent", SESSION_OPEN), { startedAt: 0 }));
    await assertFails(updateDoc(ref("agent", SESSION_OPEN), { agentVersion: "9.9.9" }));
  });
  it("denies deleting a session", async () => {
    await assertFails(deleteDoc(ref("owner", SESSION_OPEN)));
  });
  it("members list sessions newest first; anonymous and strangers cannot", async () => {
    const q = (who: Who) =>
      getDocs(
        query(
          collection(fsAs(env, who), `streams/${S_PRIV}/sessions`),
          orderBy("startedAt", "desc"),
          limit(20),
        ),
      );
    expect((await assertSucceeds(q("viewer"))).size).toBe(2);
    await assertFails(q("anon"));
    await assertFails(q("stranger"));
  });
});

describeEmu("streams/{id}/days/{YYYY-MM-DD}", () => {
  const ref = (who: Who, streamId: string, day = DAY) =>
    doc(fsAs(env, who), `streams/${streamId}/days/${day}`);

  it("the agent writes a full 24-hour day summary (rules expression budget)", async () => {
    await assertSucceeds(
      setDoc(ref("agent", S_PRIV, "2026-10-02"), daySummary(S_PRIV, "2026-10-02")),
    );
  });
  it("the agent replaces an existing day summary", async () => {
    await assertSucceeds(setDoc(ref("agent", S_PRIV), daySummary(S_PRIV, DAY, 4)));
  });
  it("denies an hour key outside 00–23 and unknown hour fields", async () => {
    const d = daySummary(S_PRIV, DAY, 2);
    const h = hour(DAY, 0);
    await assertFails(setDoc(ref("agent", S_PRIV), { ...d, hours: { ...d.hours, "24": h } }));
    await assertFails(
      setDoc(ref("agent", S_PRIV), { ...d, hours: { "00": { ...h, email: "x" } } }),
    );
  });
  it("denies an hours value that is not a map, and an impossible calendar day", async () => {
    const d = daySummary(S_PRIV, DAY, 1);
    await assertFails(setDoc(ref("agent", S_PRIV), { ...d, hours: { "00": 5 } }));
    await assertFails(
      setDoc(ref("agent", S_PRIV, "2026-13-01"), { ...daySummary(S_PRIV, DAY), day: "2026-13-01" }),
    );
  });
  it("denies a day document whose id, stream, or keys do not match", async () => {
    await assertFails(setDoc(ref("agent", S_PRIV, "2026-10-03"), daySummary(S_PRIV, DAY)));
    await assertFails(setDoc(ref("agent", S_PRIV), daySummary(S_PUB, DAY)));
    await assertFails(setDoc(ref("agent", S_PRIV), { ...daySummary(S_PRIV, DAY), total: 1 }));
  });
  for (const who of ["viewer", "stranger", "anon"] as const) {
    it(`denies ${who} writing a day summary`, async () => {
      await assertFails(setDoc(ref(who, S_PRIV), daySummary(S_PRIV, DAY)));
    });
  }
  it("denies deleting a day summary", async () => {
    await assertFails(deleteDoc(ref("owner", S_PRIV)));
  });
  it("anyone reads day summaries of a public station, one by one and by range", async () => {
    await assertSucceeds(getDoc(ref("anon", S_PUB)));
    const snap = await assertSucceeds(
      getDocs(
        query(
          collection(fsAs(env, "anon"), `streams/${S_PUB}/days`),
          where(documentId(), ">=", "2026-09-01"),
          where(documentId(), "<=", "2026-10-31"),
        ),
      ),
    );
    expect(snap.size).toBe(1);
  });
  it("denies anonymous and stranger reads of a private station's days", async () => {
    await assertFails(getDoc(ref("anon", S_PRIV)));
    await assertFails(getDoc(ref("stranger", S_PRIV)));
    await assertFails(getDocs(collection(fsAs(env, "anon"), `streams/${S_PRIV}/days`)));
  });
  it("members read a private station's days by range", async () => {
    const snap = await assertSucceeds(
      getDocs(
        query(
          collection(fsAs(env, "viewer"), `streams/${S_PRIV}/days`),
          where(documentId(), ">=", "2026-09-01"),
        ),
      ),
    );
    expect(snap.size).toBe(1);
  });
});
