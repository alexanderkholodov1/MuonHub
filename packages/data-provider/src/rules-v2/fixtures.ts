/**
 * Shared fixture for the security-rules v2 test matrix (spec 0084 FR20).
 *
 * Every test starts from the same seeded world, written with rules disabled; the assertions then
 * run with REAL client identities (anonymous, signed-in users), never the admin target.
 * Run only through `pnpm --filter @muonhub/data-provider test:emulator`
 * (Auth + Firestore + Realtime Database emulators).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, type Firestore } from "firebase/firestore";
import { v2 } from "@muonhub/shared";

/** True inside `firebase emulators:exec` (Firestore and Realtime Database emulators running). */
export const emulatorOn =
  Boolean(process.env["FIRESTORE_EMULATOR_HOST"]) &&
  Boolean(process.env["FIREBASE_DATABASE_EMULATOR_HOST"]);

const rulesFile = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../../infra/firebase/${name}`, import.meta.url)),
    "utf8",
  );

export function initEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: "demo-muonhub",
    firestore: { rules: rulesFile("firestore.rules") },
    database: { rules: rulesFile("database.rules.json") },
  });
}

/** Copy of `obj` without `keys` (to build documents with a required field missing). */
export function omit<T extends object>(obj: T, ...keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
}

// ── Identities ───────────────────────────────────────────────────────────────────────────────

export const UID = {
  owner: "ownerA",
  editor: "editorE",
  viewer: "viewerV",
  stranger: "strangerS",
  admin: "adminX",
  /** The agent's dedicated per-machine account, an editor of the owner's stations (FR23). */
  agent: "agentEd",
  /** Recipient of an ownership transfer. */
  recipient: "recipientN",
} as const;

export type Who = keyof typeof UID | "anon";

function context(env: RulesTestEnvironment, who: Who): RulesTestContext {
  return who === "anon" ? env.unauthenticatedContext() : env.authenticatedContext(UID[who]);
}

/** Firestore client for an identity (the compat instance works with the modular API). */
export function fsAs(env: RulesTestEnvironment, who: Who): Firestore {
  return context(env, who).firestore() as unknown as Firestore;
}

/** Firestore client for an arbitrary signed-in uid (e.g. a brand-new account). */
export function fsUid(env: RulesTestEnvironment, uid: string): Firestore {
  return env.authenticatedContext(uid).firestore() as unknown as Firestore;
}

export type Rtdb = ReturnType<RulesTestContext["database"]>;

export function dbAs(env: RulesTestEnvironment, who: Who): Rtdb {
  return context(env, who).database();
}

// ── Ids ──────────────────────────────────────────────────────────────────────────────────────

export const ST_PUB = "stPub";
export const ST_PRIV = "stPriv";
export const ST_OTHER = "stOther";
export const DEV_PUB = "devPub";
export const DEV_PRIV = "devPriv";
export const DEV_OTHER = "devOther";
export const S_PUB = "ownerA_pubstream01";
export const S_PRIV = "ownerA_privstream1";
export const S_OTHER = "strangerS_otherstream1";
export const SESSION_OPEN = "sessOpen";
export const SESSION_CLOSED = "sessClosed";
export const DAY = "2026-10-01";
export const OLD_TRANSFER = "stPriv_oldtransfer1";

// ── Time ─────────────────────────────────────────────────────────────────────────────────────

export const now = (): number => Date.now();
/** Fixed creation time of seeded documents, so a test can rewrite a whole document unchanged. */
const T_SEED = Date.now() - 3_600_000;
/** Start of the last complete minute before now. */
export const lastMinute = (): number => Math.floor(Date.now() / 60_000) * 60_000 - 60_000;
export const minuteKey = (ts: number): string => v2.minuteKey(ts);

// ── Builders (valid v2 documents; tests derive invalid ones from them) ─────────────────────

export function user(uid: string, username: string): v2.User {
  return v2.UserSchema.parse({
    schemaVersion: 2,
    uid,
    displayName: `User ${uid}`,
    username,
    email: `${uid.toLowerCase()}@example.org`,
    createdAt: now() - 86_400_000,
  });
}

export const usernameOf = (uid: string): string => uid.toLowerCase();

export function station(
  id: string,
  ownerUid: string,
  visibility: v2.Visibility,
  publicPrecision: v2.PublicPrecision,
): v2.Station {
  const t = T_SEED;
  return v2.StationSchema.parse({
    schemaVersion: 2,
    id,
    ownerUid,
    name: `Station ${id}`,
    location: { lat: -0.19637, lon: -78.43611, altitudeM: 2850, city: "Quito", countryCode: "EC" },
    publicPrecision,
    visibility,
    timezone: "America/Guayaquil",
    createdAt: t,
    updatedAt: t,
  });
}

/** Same rounding as the data layer: floor to 0.1 degree, then 6 decimals. */
function approximate(value: number): number {
  return Math.round(Math.floor(value / 0.1 + 1e-9) * 0.1 * 1e6) / 1e6;
}

export function projection(s: v2.Station, deviceCount = 1): v2.PublicStation {
  const base = {
    schemaVersion: 2 as const,
    id: s.id,
    name: s.name,
    precision: s.publicPrecision,
    deviceCount,
    active: true,
    updatedAt: now() - 1000,
  };
  const { lat, lon, city, countryCode } = s.location;
  const extra: Partial<v2.PublicStation> =
    s.publicPrecision === "exact"
      ? { point: { lat, lon }, city, countryCode }
      : s.publicPrecision === "approximate"
        ? { point: { lat: approximate(lat), lon: approximate(lon) }, city, countryCode }
        : s.publicPrecision === "city"
          ? { city, countryCode }
          : s.publicPrecision === "country"
            ? { countryCode }
            : {};
  return v2.PublicStationSchema.parse({ ...base, ...extra });
}

export function member(uid: string, role: v2.MemberRole, addedBy: string = UID.owner) {
  return v2.StationMemberSchema.parse({ uid, role, addedBy, addedAt: now() - 60_000 });
}

export function device(id: string, stationId: string, ownerUid: string): v2.Device {
  return v2.DeviceSchema.parse({
    schemaVersion: 2,
    id,
    ownerUid,
    stationId,
    deviceType: { id: "cosmicwatch-v3x", version: 1 },
    label: `CosmicWatch ${id}`,
    geometry: {
      activeAreaCm2: 25,
      thicknessCm: 1,
      material: "plastic scintillator",
      orientation: "horizontal",
    },
    saturation: { value: 3300, unit: "mV" },
    status: "active",
    createdAt: T_SEED,
  });
}

export function deviceType(
  id: string,
  status: v2.DeviceTypeStatus,
  authorUid?: string,
  version = 1,
): v2.DeviceType {
  return v2.DeviceTypeSchema.parse({
    schemaVersion: 2,
    id,
    version,
    name: `Type ${id}`,
    status,
    ...(authorUid === undefined ? {} : { authorUid }),
    channels: 1,
    transport: { baud: 9600, lineTerminator: "LF", encoding: "ascii" },
    parser: {
      kind: "columns",
      separator: "whitespace",
      fields: [{ source: 0, quantity: "eventId", unit: "count" }],
    },
    timeSource: { kind: "deviceMs", rolloverBits: 32 },
    counterSemantics: "eventId",
    deadTimeSemantics: { kind: "cumulative", unit: "ms" },
    defaults: { histogramEdges: [0, 100, 200] },
    createdAt: now() - 86_400_000,
  });
}

export function calibration(deviceId: string, version: number, authorUid: string): v2.Calibration {
  return v2.CalibrationSchema.parse({
    schemaVersion: 2,
    deviceId,
    version,
    validFrom: now() - 1000,
    parameters: {
      threshold: { value: 25, unit: "mV", origin: "manual", locked: false },
    },
    authorUid,
    createdAt: now() - 1000,
  });
}

export function assembly(stationId: string): v2.Assembly {
  return v2.AssemblySchema.parse({
    schemaVersion: 2,
    stationId,
    members: [{ deviceId: DEV_PRIV, position: { x: 0, y: 0, z: 0 }, tiltDeg: 0 }],
    updatedAt: now() - 1000,
  });
}

export function stream(
  id: string,
  stationId: string,
  deviceId: string,
  ownerUid: string,
): v2.Stream {
  // Built without the schema's prefix refine so tests can construct deliberately wrong ids.
  return {
    schemaVersion: 2,
    id,
    ownerUid,
    stationId,
    deviceId,
    status: "active",
    createdAt: T_SEED,
  };
}

export function session(streamId: string, id: string, closed = false): v2.Session {
  const startedAt = T_SEED;
  return v2.SessionSchema.parse({
    schemaVersion: 2,
    id,
    streamId,
    startedAt,
    ...(closed ? { endedAt: startedAt + 60_000, endReason: "stop" } : {}),
    agentVersion: "6.0.0-alpha.1.6",
    deviceTypeVersion: 1,
    timeProvenance: { source: "ntp", offsetMs: 2, measuredAt: startedAt },
    counters: {
      completeMinutes: 5,
      discardedPartialMinutes: 1,
      quarantinedLines: 0,
      eventIdGaps: 0,
    },
  });
}

export function hour(day: string, hh: number): v2.HourEntry {
  return v2.HourEntrySchema.parse({
    hourStart: Date.parse(`${day}T00:00:00Z`) + hh * 3_600_000,
    completeMinutes: 60,
    n: 2400,
    liveSource: "counter",
    liveMs: 3_500_000,
    pressureHpa: 727.5,
    pressureMinutes: 60,
    temperatureC: 21.5,
    temperatureMinutes: 60,
    histogram: [1200, 800, 400],
    saturated: 3,
  });
}

/** A day summary with every hour present (the most expensive document for the rules). */
export function daySummary(streamId: string, day: string, hours = 24): v2.DaySummary {
  const entries: Record<string, v2.HourEntry> = {};
  for (let hh = 0; hh < hours; hh++) entries[String(hh).padStart(2, "0")] = hour(day, hh);
  return v2.DaySummarySchema.parse({
    schemaVersion: 2,
    streamId,
    day,
    hours: entries,
    updatedAt: now() - 1000,
  });
}

export function transfer(id: string, stationId: string, from: string, to: string) {
  return v2.OwnershipTransferSchema.parse({
    schemaVersion: 2,
    id,
    stationId,
    from,
    to,
    createdAt: now(),
  });
}

export function audit(id: string, actorUid: string, action: string = "membershipChange") {
  return {
    schemaVersion: 2,
    id,
    action,
    actorUid,
    targetId: ST_PRIV,
    details: { role: "viewer" },
    createdAt: now(),
  };
}

/** Compact RTDB minute record (spec 0083 FR17) for a complete minute. */
export function minute(ts: number, overrides: Record<string, unknown> = {}) {
  const { value } = v2.serializeMinute({
    schemaVersion: 2,
    ts,
    sessionId: SESSION_OPEN,
    n: 40,
    amplitude: { mean: 120.5, min: 30, max: 900, unit: "mV" },
    liveSource: "counter",
    liveMs: 59_500,
    deadMs: 500,
    pressureHpa: 727.4,
    quality: { eventIdGaps: 0, clockAnomalies: 0 },
  });
  return { ...value, ...overrides };
}

export function stationAccess(
  ownerUid: string,
  isPublic: boolean,
  editors: readonly string[] = [UID.editor, UID.agent],
  viewers: readonly string[] = [UID.viewer],
) {
  const set = (uids: readonly string[]) => Object.fromEntries(uids.map((u) => [u, true]));
  return v2.StationAccessSchema.parse({
    ownerUid,
    ...(editors.length > 0 ? { editors: set(editors) } : {}),
    ...(viewers.length > 0 ? { viewers: set(viewers) } : {}),
    public: isPublic,
  });
}

// ── The seeded world ─────────────────────────────────────────────────────────────────────────
//
//  stPub   public  (approximate precision) — owner ownerA; editors editorE, agentEd; viewer viewerV
//  stPriv  private (exact precision)       — same membership
//  stOther private                          — owner strangerS, no members
//  Streams ownerA_pubstream01 (stPub/devPub), ownerA_privstream1 (stPriv/devPriv),
//          strangerS_otherstream1 (stOther/devOther). admins: adminX.

export const stPub = (): v2.Station => station(ST_PUB, UID.owner, "public", "approximate");
export const stPriv = (): v2.Station => station(ST_PRIV, UID.owner, "private", "exact");
export const stOther = (): v2.Station => station(ST_OTHER, UID.stranger, "private", "city");

export const OLD_LIVE_KEY = "old0001";
export const FRESH_LIVE_KEY = "fresh0001";

export async function seed(env: RulesTestEnvironment): Promise<void> {
  await env.clearFirestore();
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore() as unknown as Firestore;
    const put = (path: string, data: object) => setDoc(doc(fs, path), data);
    const writes: Promise<void>[] = [];
    for (const uid of Object.values(UID)) {
      writes.push(put(`users/${uid}`, user(uid, usernameOf(uid))));
      writes.push(put(`usernames/${usernameOf(uid)}`, { uid, createdAt: now() - 86_400_000 }));
    }
    writes.push(
      put(`admins/${UID.admin}`, { uid: UID.admin, addedBy: UID.admin, addedAt: now() - 1000 }),
    );
    for (const s of [stPub(), stPriv(), stOther()]) writes.push(put(`stations/${s.id}`, s));
    writes.push(put(`publicStations/${ST_PUB}`, projection(stPub())));
    for (const sid of [ST_PUB, ST_PRIV]) {
      writes.push(put(`stations/${sid}/members/${UID.editor}`, member(UID.editor, "editor")));
      writes.push(put(`stations/${sid}/members/${UID.agent}`, member(UID.agent, "editor")));
      writes.push(put(`stations/${sid}/members/${UID.viewer}`, member(UID.viewer, "viewer")));
    }
    writes.push(put(`devices/${DEV_PUB}`, device(DEV_PUB, ST_PUB, UID.owner)));
    writes.push(put(`devices/${DEV_PRIV}`, device(DEV_PRIV, ST_PRIV, UID.owner)));
    writes.push(put(`devices/${DEV_OTHER}`, device(DEV_OTHER, ST_OTHER, UID.stranger)));
    writes.push(put(`devices/${DEV_PRIV}/calibrations/1`, calibration(DEV_PRIV, 1, UID.owner)));
    writes.push(put(`assemblies/${ST_PRIV}`, assembly(ST_PRIV)));
    writes.push(put(`streams/${S_PUB}`, stream(S_PUB, ST_PUB, DEV_PUB, UID.owner)));
    writes.push(put(`streams/${S_PRIV}`, stream(S_PRIV, ST_PRIV, DEV_PRIV, UID.owner)));
    writes.push(put(`streams/${S_OTHER}`, stream(S_OTHER, ST_OTHER, DEV_OTHER, UID.stranger)));
    writes.push(put(`streams/${S_PRIV}/sessions/${SESSION_OPEN}`, session(S_PRIV, SESSION_OPEN)));
    writes.push(
      put(`streams/${S_PRIV}/sessions/${SESSION_CLOSED}`, session(S_PRIV, SESSION_CLOSED, true)),
    );
    writes.push(put(`streams/${S_PUB}/days/${DAY}`, daySummary(S_PUB, DAY, 3)));
    writes.push(put(`streams/${S_PRIV}/days/${DAY}`, daySummary(S_PRIV, DAY, 3)));
    writes.push(put("deviceTypes/cosmicwatch-v3x", deviceType("cosmicwatch-v3x", "builtin")));
    writes.push(
      put("deviceTypes/cosmicwatch-v3x/versions/1", deviceType("cosmicwatch-v3x", "builtin")),
    );
    writes.push(put("deviceTypes/myDraft", deviceType("myDraft", "draft", UID.stranger)));
    writes.push(put("deviceTypes/inReview", deviceType("inReview", "review", UID.stranger)));
    writes.push(
      put(`ownershipTransfers/${OLD_TRANSFER}`, {
        ...transfer(OLD_TRANSFER, ST_PRIV, UID.owner, UID.recipient),
        createdAt: now() - 86_400_000,
      }),
    );
    writes.push(put("audit/entry1", audit("entry1", UID.owner)));
    await Promise.all(writes);

    const db = ctx.database();
    await db.ref().set({
      stationAccess: {
        [ST_PUB]: stationAccess(UID.owner, true),
        [ST_PRIV]: stationAccess(UID.owner, false),
        [ST_OTHER]: stationAccess(UID.stranger, false, [], []),
      },
      streamStation: { [S_PUB]: ST_PUB, [S_PRIV]: ST_PRIV, [S_OTHER]: ST_OTHER },
      minutes: {
        [S_PRIV]: { [minuteKey(lastMinute() - 60_000)]: minute(lastMinute() - 60_000) },
        [S_PUB]: { [minuteKey(lastMinute() - 60_000)]: minute(lastMinute() - 60_000) },
      },
      live: {
        [S_PRIV]: {
          events: {
            [OLD_LIVE_KEY]: { t: now() - 700_000, a: 120 },
            [FRESH_LIVE_KEY]: { t: now() - 5_000, a: 140 },
          },
        },
      },
      status: {
        [S_PUB]: { lastSeenAt: now() - 1000, agentOnline: true, rawRatePerMin: 40 },
        [S_PRIV]: { lastSeenAt: now() - 1000, agentOnline: true, rawRatePerMin: 40 },
      },
      statusPublic: {
        [S_PUB]: { lastSeenAt: now() - 1000, agentOnline: true },
        [S_PRIV]: { lastSeenAt: now() - 1000, agentOnline: true },
      },
    });
  });
}
