/**
 * Rules v2 — Realtime Database series: minutes, live window, status, public status
 * (spec 0084 FR16–FR19; acceptance criteria CA3, CA4).
 */
import { afterAll, beforeAll, beforeEach, expect, it, describe } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  FRESH_LIVE_KEY,
  OLD_LIVE_KEY,
  S_OTHER,
  S_PRIV,
  S_PUB,
  dbAs,
  emulatorOn,
  initEnv,
  lastMinute,
  minute,
  minuteKey,
  now,
  omit,
  seed,
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

const writeMinute = (who: Who, streamId: string, ts: number, value: object = minute(ts)) =>
  dbAs(env, who)
    .ref(`minutes/${streamId}/${minuteKey(ts)}`)
    .set(value);

describeEmu("minutes/{streamId}/{ts} — writes", () => {
  for (const who of ["owner", "editor", "agent"] as const) {
    it(`${who} writes a complete minute`, async () => {
      await assertSucceeds(writeMinute(who, S_PRIV, lastMinute()));
    });
  }
  it("the agent writes several minutes in one multi-path update", async () => {
    const t = lastMinute();
    const batch = Object.fromEntries(
      [t - 180_000, t - 120_000, t].map((ts) => [minuteKey(ts), minute(ts)]),
    );
    await assertSucceeds(dbAs(env, "agent").ref(`minutes/${S_PRIV}`).update(batch));
  });
  it("accepts a nominal minute with n = 0 (no amplitude, no live time)", async () => {
    const t = lastMinute();
    const rest = omit(minute(t), "am", "an", "ax", "au", "lm", "dm");
    await assertSucceeds(writeMinute("agent", S_PRIV, t, { ...rest, n: 0, l: "n" }));
  });
  for (const who of ["viewer", "stranger", "admin", "recipient", "anon"] as const) {
    it(`denies ${who} writing a minute`, async () => {
      await assertFails(writeMinute(who, S_PRIV, lastMinute()));
    });
  }
  it("denies the owner of another station writing into this stream", async () => {
    await assertFails(writeMinute("stranger", S_PUB, lastMinute()));
  });
  it("denies writing to a stream with no station mapping", async () => {
    await assertFails(writeMinute("owner", "ownerA_unmappedstream", lastMinute()));
  });

  it("denies overwriting an existing minute (write-once)", async () => {
    const ts = lastMinute() - 60_000;
    await assertFails(writeMinute("owner", S_PRIV, ts, minute(ts, { n: 41 })));
  });
  it("denies changing one field of an existing minute", async () => {
    const ts = lastMinute() - 60_000;
    await assertFails(
      dbAs(env, "owner")
        .ref(`minutes/${S_PRIV}/${minuteKey(ts)}/n`)
        .set(1),
    );
  });
  it("denies deleting an existing minute", async () => {
    const ts = lastMinute() - 60_000;
    await assertFails(
      dbAs(env, "owner")
        .ref(`minutes/${S_PRIV}/${minuteKey(ts)}`)
        .remove(),
    );
  });
  it("denies replacing a stream's whole minute map", async () => {
    const ts = lastMinute();
    await assertFails(
      dbAs(env, "owner")
        .ref(`minutes/${S_PRIV}`)
        .set({ [minuteKey(ts)]: minute(ts) }),
    );
  });

  it("denies a ts that is not on a minute boundary (partial minute)", async () => {
    const ts = lastMinute() + 30_000;
    await assertFails(writeMinute("agent", S_PRIV, ts, minute(lastMinute())));
    await assertFails(writeMinute("agent", S_PRIV, lastMinute() + 1, minute(lastMinute())));
  });
  it("accepts exactly the 10-second offsets that are whole minutes (key check)", async () => {
    // The key check works on the 13-digit string (RTDB rules cannot parse numbers): it must
    // accept ts % 60 000 == 0 and reject every other multiple of 10 000.
    const base = lastMinute() - 3_600_000;
    for (let j = 0; j < 24; j++) {
      const ts = base + j * 10_000;
      const write = writeMinute("agent", S_PRIV, ts, minute(lastMinute()));
      if (ts % 60_000 === 0) await assertSucceeds(write);
      else await assertFails(write);
    }
  });
  it("denies a minute key that is not 13 digits", async () => {
    await assertFails(
      dbAs(env, "agent")
        .ref(`minutes/${S_PRIV}/${String(lastMinute() / 60_000)}`)
        .set(minute(0)),
    );
  });
  it("denies a future minute", async () => {
    const ts = lastMinute() + 10 * 60_000;
    await assertFails(writeMinute("agent", S_PRIV, ts));
  });
  it("denies liveMs above 60 000 or not positive", async () => {
    const ts = lastMinute();
    await assertFails(writeMinute("agent", S_PRIV, ts, minute(ts, { lm: 60_001 })));
    await assertFails(writeMinute("agent", S_PRIV, ts, minute(ts, { lm: 0 })));
  });
  it("denies unknown keys", async () => {
    const ts = lastMinute();
    await assertFails(writeMinute("agent", S_PRIV, ts, minute(ts, { extra: 1 })));
  });
  it("denies a non-integer or negative count", async () => {
    const ts = lastMinute();
    await assertFails(writeMinute("agent", S_PRIV, ts, minute(ts, { n: 4.5 })));
    await assertFails(writeMinute("agent", S_PRIV, ts, minute(ts, { n: -1 })));
  });
  it("denies amplitude with n = 0 and a missing amplitude with n > 0", async () => {
    const ts = lastMinute();
    await assertFails(writeMinute("agent", S_PRIV, ts, minute(ts, { n: 0 })));
    const noAmplitude = omit(minute(ts), "am", "an", "ax", "au");
    await assertFails(writeMinute("agent", S_PRIV, ts, noAmplitude));
  });
  it("denies an amplitude summary with min > mean", async () => {
    const ts = lastMinute();
    await assertFails(writeMinute("agent", S_PRIV, ts, minute(ts, { an: 500 })));
  });
  it("denies live-time fields that contradict the live source", async () => {
    const ts = lastMinute();
    await assertFails(writeMinute("agent", S_PRIV, ts, minute(ts, { l: "n" })));
    const noDead = omit(minute(ts), "dm");
    await assertFails(writeMinute("agent", S_PRIV, ts, noDead));
  });
  it("denies a wrong schema version and missing required keys", async () => {
    const ts = lastMinute();
    await assertFails(writeMinute("agent", S_PRIV, ts, minute(ts, { v: 1 })));
    const noQuality = omit(minute(ts), "qg");
    await assertFails(writeMinute("agent", S_PRIV, ts, noQuality));
  });
});

describeEmu("minutes/{streamId} — reads and range queries", () => {
  const range = (who: Who, streamId: string) =>
    dbAs(env, who)
      .ref(`minutes/${streamId}`)
      .orderByKey()
      .startAt(minuteKey(lastMinute() - 3_600_000))
      .endAt(minuteKey(lastMinute()))
      .limitToFirst(500)
      .once("value");

  for (const who of ["owner", "editor", "viewer", "agent"] as const) {
    it(`${who} reads a minute range`, async () => {
      const snap = await assertSucceeds(range(who, S_PRIV));
      expect(snap.numChildren()).toBe(1);
    });
  }
  for (const who of ["anon", "stranger", "admin", "recipient"] as const) {
    it(`denies ${who} reading minutes of a private stream`, async () => {
      await assertFails(range(who, S_PRIV));
    });
  }
  it("denies anonymous reads of minutes even for a public station (day summaries only)", async () => {
    await assertFails(range("anon", S_PUB));
  });
  it("denies reading the whole minutes tree", async () => {
    await assertFails(dbAs(env, "owner").ref("minutes").once("value"));
  });
});

describeEmu("live/{streamId}/events", () => {
  const push = (who: Who, value: object, key = `k${Date.now()}`) =>
    dbAs(env, who).ref(`live/${S_PRIV}/events/${key}`).set(value);

  it("the agent pushes an event stamped now", async () => {
    await assertSucceeds(push("agent", { t: now(), a: 150.5 }));
  });
  it("the owner pushes a batch of events in one update", async () => {
    const t = now();
    await assertSucceeds(
      dbAs(env, "owner")
        .ref(`live/${S_PRIV}/events`)
        .update({ e1: { t, a: 1 }, e2: { t: t - 1000, a: 2 } }),
    );
  });
  it("denies events outside now ± 60 s", async () => {
    await assertFails(push("agent", { t: now() - 120_000, a: 1 }));
    await assertFails(push("agent", { t: now() + 120_000, a: 1 }));
  });
  it("denies unknown keys and missing amplitude", async () => {
    await assertFails(push("agent", { t: now(), a: 1, x: 2 }));
    await assertFails(push("agent", { t: now() }));
  });
  for (const who of ["viewer", "stranger", "anon"] as const) {
    it(`denies ${who} pushing an event`, async () => {
      await assertFails(push(who, { t: now(), a: 1 }));
    });
  }
  it("the agent prunes an entry older than 10 minutes", async () => {
    await assertSucceeds(dbAs(env, "agent").ref(`live/${S_PRIV}/events/${OLD_LIVE_KEY}`).remove());
  });
  it("denies pruning a fresh entry", async () => {
    await assertFails(dbAs(env, "agent").ref(`live/${S_PRIV}/events/${FRESH_LIVE_KEY}`).remove());
  });
  it("denies a viewer pruning an old entry", async () => {
    await assertFails(dbAs(env, "viewer").ref(`live/${S_PRIV}/events/${OLD_LIVE_KEY}`).remove());
  });
  it("denies rewriting an existing entry", async () => {
    await assertFails(
      dbAs(env, "agent").ref(`live/${S_PRIV}/events/${FRESH_LIVE_KEY}`).set({ t: now(), a: 9 }),
    );
  });
  it("the prune query (expired entries by t) is allowed for the agent", async () => {
    const snap = await assertSucceeds(
      dbAs(env, "agent")
        .ref(`live/${S_PRIV}/events`)
        .orderByChild("t")
        .endAt(now() - 600_000)
        .once("value"),
    );
    expect(snap.numChildren()).toBe(1);
  });
  for (const who of ["owner", "editor", "viewer"] as const) {
    it(`${who} reads the live window`, async () => {
      await assertSucceeds(dbAs(env, who).ref(`live/${S_PRIV}/events`).once("value"));
    });
  }
  for (const who of ["anon", "stranger"] as const) {
    it(`denies ${who} reading the live window`, async () => {
      await assertFails(dbAs(env, who).ref(`live/${S_PRIV}/events`).once("value"));
    });
  }
});

describeEmu("status/{streamId} and statusPublic/{streamId}", () => {
  const status = { lastSeenAt: 0, agentOnline: true, lastMinuteTs: 0, rawRatePerMin: 38 };
  const fresh = () => ({ ...status, lastSeenAt: now(), lastMinuteTs: lastMinute() });

  it("the agent writes status and its public part together", async () => {
    await assertSucceeds(
      dbAs(env, "agent")
        .ref()
        .update({
          [`status/${S_PUB}`]: fresh(),
          [`statusPublic/${S_PUB}`]: { lastSeenAt: now(), agentOnline: true },
        }),
    );
  });
  it("denies status with unknown keys or a lastMinuteTs off the minute", async () => {
    const db = dbAs(env, "agent");
    await assertFails(db.ref(`status/${S_PRIV}`).set({ ...fresh(), email: "x@y.z" }));
    await assertFails(
      db.ref(`status/${S_PRIV}`).set({ ...fresh(), lastMinuteTs: lastMinute() + 5 }),
    );
  });
  it("denies a future lastSeenAt", async () => {
    await assertFails(
      dbAs(env, "agent")
        .ref(`status/${S_PRIV}`)
        .set({ ...fresh(), lastSeenAt: now() + 3_600_000 }),
    );
  });
  it("denies private status fields in the public node", async () => {
    await assertFails(
      dbAs(env, "agent")
        .ref(`statusPublic/${S_PUB}`)
        .set({ lastSeenAt: now(), agentOnline: true, rawRatePerMin: 40 }),
    );
  });
  for (const who of ["viewer", "stranger", "anon"] as const) {
    it(`denies ${who} writing status`, async () => {
      await assertFails(dbAs(env, who).ref(`status/${S_PRIV}`).set(fresh()));
      await assertFails(
        dbAs(env, who).ref(`statusPublic/${S_PUB}`).set({ lastSeenAt: now(), agentOnline: true }),
      );
    });
  }
  for (const who of ["owner", "editor", "viewer"] as const) {
    it(`${who} reads status`, async () => {
      await assertSucceeds(dbAs(env, who).ref(`status/${S_PRIV}`).once("value"));
    });
  }
  it("denies anonymous and stranger reads of status, even of a public station", async () => {
    await assertFails(dbAs(env, "anon").ref(`status/${S_PUB}`).once("value"));
    await assertFails(dbAs(env, "stranger").ref(`status/${S_PRIV}`).once("value"));
  });
  it("anyone reads the public status of a public station", async () => {
    const snap = await assertSucceeds(dbAs(env, "anon").ref(`statusPublic/${S_PUB}`).once("value"));
    expect(Object.keys(snap.val() as object).sort()).toEqual(["agentOnline", "lastSeenAt"]);
  });
  it("denies anonymous reads of the public status of a private station", async () => {
    await assertFails(dbAs(env, "anon").ref(`statusPublic/${S_PRIV}`).once("value"));
    await assertFails(dbAs(env, "owner").ref(`statusPublic/${S_OTHER}`).once("value"));
  });
});

describeEmu("no other Realtime Database path", () => {
  it("denies reading the root, even for an owner", async () => {
    await assertFails(dbAs(env, "owner").ref().once("value"));
    await assertFails(dbAs(env, "anon").ref().once("value"));
  });
  for (const path of ["stations/x", "users/ownerA", "detector_index/d1", "showcase/x"]) {
    it(`denies first-attempt or unknown path ${path}`, async () => {
      await assertFails(dbAs(env, "owner").ref(path).set({ a: 1 }));
      await assertFails(dbAs(env, "owner").ref(path).once("value"));
    });
  }
});
