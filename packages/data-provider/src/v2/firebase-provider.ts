/**
 * Firebase implementation of {@link DataProviderV2} (client SDK, modular): Firestore for metadata,
 * catalogue, summaries and calibrations; a flat Realtime Database for minutes, the live window and
 * status. This package is the only place in the monorepo that imports Firebase SDKs.
 *
 * Write ordering follows spec 0084: whenever rights shrink or are created, the RTDB authorization
 * mirror is updated FIRST, so a desync can only leave rights removed, never granted.
 */
import { deleteApp, getApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type Auth,
  type User as FbUser,
} from "firebase/auth";
import {
  collection,
  collectionGroup,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  getFirestore,
  limit as fsLimit,
  orderBy as fsOrderBy,
  query as fsQuery,
  runTransaction as fsRunTransaction,
  setDoc,
  startAfter as fsStartAfter,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type Query,
} from "firebase/firestore";
import {
  connectDatabaseEmulator,
  endBefore,
  get as rtGet,
  getDatabase,
  limitToFirst,
  onChildAdded,
  onValue,
  orderByKey,
  query as rtQuery,
  ref as rtRef,
  runTransaction as rtRunTransaction,
  set as rtSet,
  startAfter as rtStartAfter,
  startAt,
  update as rtUpdate,
  type Database,
} from "firebase/database";
import { v2 } from "@muonhub/shared";
import { DataProviderError, guard, mapError } from "./errors.js";
import type {
  AuthUser,
  DataProviderV2,
  DeviceMetadataPatch,
  PruneResult,
  SessionEnd,
  StationOwnerPatch,
  SubscriptionHandlers,
  Unsubscribe,
  WriteMinutesResult,
} from "./interface.js";
import {
  LIVE_BATCH_SIZE,
  chunk,
  createNonceSource,
  fromLiveValue,
  liveKey,
  pruneEndKey,
  selectPrunable,
  toLiveValue,
  windowStartKey,
} from "./live-window.js";
import {
  buildMinutePage,
  planMinuteRange,
  type MinuteRangeQuery,
} from "./pagination.js";
import {
  buildPublicStation,
  buildStationAccess,
  isPublic,
  newTransferId,
  stripUndefined,
} from "./public-station.js";
import {
  QuarantineCollector,
  describeFailure,
  parseEntries,
  type ListResult,
  type Page,
} from "./quarantine.js";

export interface HostPort {
  host: string;
  port: number;
}

export interface FirebaseV2Config {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  databaseURL: string;
  appId?: string;
  /** Distinct names let one process hold several identities (tests). Default `"muonhub-v2"`. */
  appName?: string;
  /** Local emulators; never set in production. */
  emulators?: { auth?: string; firestore?: HostPort; database?: HostPort };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const WRITE_CONCURRENCY = 8;
const DEFAULT_SESSION_LIMIT = 50;
const MAX_SESSION_LIMIT = 500;

function invalid(message: string): DataProviderError {
  return new DataProviderError("invalid-argument", { message });
}

function parseOrInvalid<T>(schema: { parse(value: unknown): T }, value: unknown, what: string): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new DataProviderError("invalid-argument", {
      message: `Invalid ${what}: ${describeFailure(error)}`,
      cause: error,
    });
  }
}

function toAuthUser(user: FbUser): AuthUser {
  return { uid: user.uid, email: user.email };
}

async function mapLimit<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export function createFirebaseProviderV2(config: FirebaseV2Config): DataProviderV2 {
  const appName = config.appName ?? "muonhub-v2";
  let app: FirebaseApp;
  let fresh = false;
  try {
    app = getApp(appName);
  } catch {
    app = initializeApp(
      {
        apiKey: config.apiKey,
        projectId: config.projectId,
        databaseURL: config.databaseURL,
        ...(config.authDomain === undefined ? {} : { authDomain: config.authDomain }),
        ...(config.appId === undefined ? {} : { appId: config.appId }),
      },
      appName,
    );
    fresh = true;
  }
  const auth: Auth = getAuth(app);
  const fs: Firestore = getFirestore(app);
  const rt: Database = getDatabase(app);
  if (fresh && config.emulators !== undefined) {
    const { auth: a, firestore: f, database: d } = config.emulators;
    if (a !== undefined) connectAuthEmulator(auth, a, { disableWarnings: true });
    if (f !== undefined) connectFirestoreEmulator(fs, f.host, f.port);
    if (d !== undefined) connectDatabaseEmulator(rt, d.host, d.port);
  }

  const nextNonce = createNonceSource();
  const now = (): number => Date.now();

  const requireUid = (): string => {
    const uid = auth.currentUser?.uid;
    if (uid === undefined) throw new DataProviderError("unauthenticated");
    return uid;
  };

  // ── Firestore helpers ──────────────────────────────────────────────────────────────────────

  const docRef = (...path: [string, ...string[]]) => doc(fs, ...path);

  async function createStrict(ref: ReturnType<typeof docRef>, data: object): Promise<void> {
    await fsRunTransaction(fs, async (tx) => {
      if ((await tx.get(ref)).exists()) throw new DataProviderError("already-exists");
      tx.set(ref, stripUndefined(data));
    });
  }

  async function getParsed<T>(
    ref: ReturnType<typeof docRef>,
    schema: { parse(value: unknown): T },
  ): Promise<T | null> {
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    try {
      return schema.parse(snap.data());
    } catch (error) {
      throw new DataProviderError("invalid-data", { cause: error });
    }
  }

  async function listParsed<T>(
    q: Query,
    schema: { parse(value: unknown): T },
  ): Promise<ListResult<T>> {
    const snap = await getDocs(q);
    return parseEntries(
      snap.docs.map((d) => [d.id, d.data()] as const),
      (_key, value) => schema.parse(value),
    );
  }

  // ── RTDB helpers ───────────────────────────────────────────────────────────────────────────

  /**
   * Creates a create-once mirror node. If the create is denied because the node already exists
   * with the expected value (a retry after a later step failed), that is success; anything else
   * is the original error.
   */
  async function createMirrorNode(
    path: string,
    value: unknown,
    matches: (existing: unknown) => boolean,
  ): Promise<void> {
    try {
      await rtSet(rtRef(rt, path), value);
    } catch (error) {
      const mapped = mapError(error);
      if (mapped.code !== "permission-denied") throw mapped;
      let existing: unknown;
      try {
        existing = (await rtGet(rtRef(rt, path))).val();
      } catch {
        throw mapped;
      }
      if (!matches(existing)) throw mapped;
    }
  }

  async function countDevices(stationId: string): Promise<{ deviceCount: number; active: boolean }> {
    const devices = collection(fs, "devices");
    const [all, active] = await Promise.all([
      getCountFromServer(fsQuery(devices, where("stationId", "==", stationId))),
      getCountFromServer(
        fsQuery(devices, where("stationId", "==", stationId), where("status", "==", "active")),
      ),
    ]);
    return { deviceCount: all.data().count, active: active.data().count > 0 };
  }

  const stationSchema = v2.StationSchema;

  // ── The provider ───────────────────────────────────────────────────────────────────────────

  const provider: DataProviderV2 = {
    // Auth ----------------------------------------------------------------------------------
    currentUser() {
      return auth.currentUser === null ? null : toAuthUser(auth.currentUser);
    },
    onAuthChange(handlers) {
      return onAuthStateChanged(
        auth,
        (user) => handlers.onChange(user === null ? null : toAuthUser(user)),
        (error) => handlers.onError(mapError(error)),
      );
    },
    signInWithEmail: (email, password) =>
      guard(async () => toAuthUser((await signInWithEmailAndPassword(auth, email, password)).user)),
    createAccount: (email, password) =>
      guard(
        async () => toAuthUser((await createUserWithEmailAndPassword(auth, email, password)).user),
      ),
    signOut: () => guard(() => fbSignOut(auth)),

    // Identity ------------------------------------------------------------------------------
    createUserProfile: (user) =>
      guard(async () => {
        const profile = parseOrInvalid(v2.UserSchema, user, "user profile");
        const userRef = docRef("users", profile.uid);
        const nameRef = docRef("usernames", profile.username);
        await fsRunTransaction(fs, async (tx) => {
          const [u, n] = await Promise.all([tx.get(userRef), tx.get(nameRef)]);
          if (u.exists() || n.exists()) throw new DataProviderError("already-exists");
          tx.set(userRef, stripUndefined(profile));
          tx.set(nameRef, { uid: profile.uid, createdAt: profile.createdAt });
        });
      }),
    getUser: (uid) => guard(() => getParsed(docRef("users", uid), v2.UserSchema)),
    updateDisplayName: (uid, displayName) =>
      guard(async () => {
        const name = parseOrInvalid(
          v2.UserSchema.shape.displayName,
          displayName,
          "display name",
        );
        await updateDoc(docRef("users", uid), { displayName: name });
      }),
    findUidByUsername: (username) =>
      guard(async () => {
        const claim = await getParsed(docRef("usernames", username), v2.UsernameClaimSchema);
        return claim === null ? null : claim.uid;
      }),

    // Stations ------------------------------------------------------------------------------
    createStation: (input) =>
      guard(async () => {
        const station = parseOrInvalid(stationSchema, input, "station");
        const access = buildStationAccess(station, []);
        await createMirrorNode(
          `stationAccess/${station.id}`,
          stripUndefined(access),
          (existing) => (existing as { ownerUid?: unknown } | null)?.ownerUid === station.ownerUid,
        );
        const stationRef = docRef("stations", station.id);
        const projectionRef = docRef("publicStations", station.id);
        await fsRunTransaction(fs, async (tx) => {
          if ((await tx.get(stationRef)).exists()) throw new DataProviderError("already-exists");
          tx.set(stationRef, stripUndefined(station));
          if (isPublic(station)) {
            tx.set(
              projectionRef,
              stripUndefined(
                buildPublicStation(station, { deviceCount: 0, active: false }, station.updatedAt),
              ),
            );
          }
        });
      }),
    getStation: (id) => guard(() => getParsed(docRef("stations", id), stationSchema)),
    listMyStations: () =>
      guard(() =>
        listParsed(
          fsQuery(collection(fs, "stations"), where("ownerUid", "==", requireUid())),
          stationSchema,
        ),
      ),
    listSharedWithMe: () =>
      guard(async () => {
        const uid = requireUid();
        const memberships = await getDocs(
          fsQuery(collectionGroup(fs, "members"), where("uid", "==", uid)),
        );
        const quarantine = new QuarantineCollector();
        const items: { station: v2.Station; role: v2.MemberRole }[] = [];
        type Row =
          | { key: string; error: string }
          | { station: v2.Station; role: v2.MemberRole };
        const rows: Row[] = await Promise.all(
          memberships.docs.map(async (m): Promise<Row> => {
            const stationId = m.ref.parent.parent?.id;
            if (stationId === undefined) return { key: m.id, error: "membership without station" };
            const parsedMember = v2.StationMemberSchema.safeParse(m.data());
            if (!parsedMember.success) return { key: stationId, error: "invalid membership" };
            const station = await getParsed(docRef("stations", stationId), stationSchema).catch(
              (error: unknown) => {
                const mapped = mapError(error);
                if (mapped.code === "invalid-data") return undefined;
                throw mapped;
              },
            );
            if (station === undefined) return { key: stationId, error: "invalid station record" };
            if (station === null) return { key: stationId, error: "station not found" };
            return { station, role: parsedMember.data.role };
          }),
        );
        for (const row of rows) {
          if ("error" in row) quarantine.add(row.key, row.error);
          else items.push(row);
        }
        return { items, quarantine: quarantine.result() };
      }),
    updateStation: (stationId, patch: StationOwnerPatch) =>
      guard(async () => {
        const current = await getParsed(docRef("stations", stationId), stationSchema);
        if (current === null) throw new DataProviderError("not-found");
        const changed: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(patch)) {
          if (value !== undefined && JSON.stringify(value) !== JSON.stringify(current[key as keyof v2.Station])) {
            changed[key] = value;
          }
        }
        if (Object.keys(changed).length === 0) return;
        const nextAt = now();
        const next = parseOrInvalid(
          stationSchema,
          { ...current, ...changed, updatedAt: nextAt },
          "station update",
        );
        // Mirror first: rights must never be granted by a lagging mirror.
        if ("visibility" in changed) {
          await rtUpdate(rtRef(rt, `stationAccess/${stationId}`), { public: isPublic(next) });
        }
        const batch = writeBatch(fs);
        batch.update(docRef("stations", stationId), stripUndefined({ ...changed, updatedAt: nextAt }));
        const projectionRef = docRef("publicStations", stationId);
        const affectsProjection = ["name", "location", "publicPrecision", "visibility"].some(
          (k) => k in changed,
        );
        if (isPublic(next)) {
          if (affectsProjection) {
            const stats = await countDevices(stationId);
            batch.set(projectionRef, stripUndefined(buildPublicStation(next, stats, nextAt)));
          }
        } else if (isPublic(current)) {
          batch.delete(projectionRef);
        }
        await batch.commit();
      }),
    refreshPublicProjection: (stationId) =>
      guard(async () => {
        const station = await getParsed(docRef("stations", stationId), stationSchema);
        if (station === null) throw new DataProviderError("not-found");
        if (!isPublic(station)) throw invalid("The station is not public; it has no projection.");
        const stats = await countDevices(stationId);
        await setDoc(
          docRef("publicStations", stationId),
          stripUndefined(buildPublicStation(station, stats, now())),
        );
      }),
    listPublicStations: () =>
      guard(() => listParsed(collection(fs, "publicStations"), v2.PublicStationSchema)),

    // Members and transfers -----------------------------------------------------------------
    listMembers: (stationId) =>
      guard(() =>
        listParsed(collection(fs, "stations", stationId, "members"), v2.StationMemberSchema),
      ),
    addMember: (stationId, uid, role) =>
      guard(async () => {
        const by = requireUid();
        const member = parseOrInvalid(
          v2.StationMemberSchema,
          { uid, role, addedBy: by, addedAt: now() },
          "member",
        );
        const memberRef = docRef("stations", stationId, "members", uid);
        if ((await getDoc(memberRef)).exists()) throw new DataProviderError("already-exists");
        await rtUpdate(rtRef(rt, `stationAccess/${stationId}`), {
          [`editors/${uid}`]: role === "editor" ? true : null,
          [`viewers/${uid}`]: role === "viewer" ? true : null,
        });
        await createStrict(memberRef, member);
      }),
    changeMemberRole: (stationId, uid, role) =>
      guard(async () => {
        parseOrInvalid(v2.MemberRoleSchema, role, "role");
        const memberRef = docRef("stations", stationId, "members", uid);
        if (!(await getDoc(memberRef)).exists()) throw new DataProviderError("not-found");
        await rtUpdate(rtRef(rt, `stationAccess/${stationId}`), {
          [`editors/${uid}`]: role === "editor" ? true : null,
          [`viewers/${uid}`]: role === "viewer" ? true : null,
        });
        await updateDoc(memberRef, { role });
      }),
    removeMember: (stationId, uid) =>
      guard(async () => {
        await rtUpdate(rtRef(rt, `stationAccess/${stationId}`), {
          [`editors/${uid}`]: null,
          [`viewers/${uid}`]: null,
        });
        await deleteDoc(docRef("stations", stationId, "members", uid));
      }),
    leaveStation: (stationId) =>
      guard(() => deleteDoc(docRef("stations", stationId, "members", requireUid()))),
    transferOwnership: (stationId, toUid) =>
      guard(async () => {
        const me = requireUid();
        parseOrInvalid(v2.UidSchema, toUid, "recipient uid");
        if (toUid === me) throw invalid("The recipient already owns the station.");
        const transferId = newTransferId(stationId);
        const stationRef = docRef("stations", stationId);
        const accessRef = rtRef(rt, `stationAccess/${stationId}`);
        const at = now();
        const transfer: v2.OwnershipTransfer = {
          schemaVersion: 2,
          id: transferId,
          stationId,
          from: me,
          to: toUid,
          createdAt: at,
        };
        await rtUpdate(accessRef, { pendingOwner: toUid });
        try {
          await fsRunTransaction(fs, async (tx) => {
            const snap = await tx.get(stationRef);
            if (!snap.exists()) throw new DataProviderError("not-found");
            const station = stationSchema.parse(snap.data());
            if (station.ownerUid !== me) throw new DataProviderError("permission-denied");
            tx.set(docRef("ownershipTransfers", transferId), transfer);
            tx.update(stationRef, { ownerUid: toUid, transferId, updatedAt: at });
          });
        } catch (error) {
          try {
            await rtUpdate(accessRef, { pendingOwner: null });
          } catch (rollbackError) {
            throw new DataProviderError("internal", {
              message: "Transfer failed and the pending owner could not be cleared.",
              cause: new AggregateError([error, rollbackError]),
            });
          }
          throw mapError(error);
        }
        return transferId;
      }),
    claimStationMirror: (stationId) =>
      guard(() =>
        rtUpdate(rtRef(rt, `stationAccess/${stationId}`), {
          ownerUid: requireUid(),
          pendingOwner: null,
        }),
      ),
    getTransfer: (id) =>
      guard(() => getParsed(docRef("ownershipTransfers", id), v2.OwnershipTransferSchema)),

    // Devices -------------------------------------------------------------------------------
    createDevice: (input) =>
      guard(async () => {
        const device = parseOrInvalid(v2.DeviceSchema, input, "device");
        await createStrict(docRef("devices", device.id), device);
      }),
    getDevice: (id) => guard(() => getParsed(docRef("devices", id), v2.DeviceSchema)),
    listDevices: (stationId) =>
      guard(() =>
        listParsed(
          fsQuery(collection(fs, "devices"), where("stationId", "==", stationId)),
          v2.DeviceSchema,
        ),
      ),
    updateDevice: (deviceId, patch: DeviceMetadataPatch) =>
      guard(async () => {
        const schema = v2.DeviceSchema.pick({
          label: true,
          serial: true,
          geometry: true,
          saturation: true,
          status: true,
        }).partial();
        const valid = stripUndefined(parseOrInvalid(schema, patch, "device update"));
        if (Object.keys(valid).length === 0) return;
        await updateDoc(docRef("devices", deviceId), valid);
      }),

    publishDeviceType: (input) =>
      guard(async () => {
        const type = parseOrInvalid(v2.DeviceTypeSchema, input, "device type");
        const parentRef = docRef("deviceTypes", type.id);
        const versionRef = docRef("deviceTypes", type.id, "versions", String(type.version));
        await fsRunTransaction(fs, async (tx) => {
          const [parent, existing] = await Promise.all([tx.get(parentRef), tx.get(versionRef)]);
          if (existing.exists()) throw new DataProviderError("already-exists");
          if (parent.exists()) {
            const current = (parent.data() as { version?: unknown }).version;
            if (typeof current === "number" && current > type.version) {
              throw new DataProviderError("conflict");
            }
          }
          tx.set(versionRef, stripUndefined(type));
          tx.set(parentRef, stripUndefined(type));
        });
      }),
    getDeviceType: (id, version) =>
      guard(() =>
        getParsed(
          version === undefined
            ? docRef("deviceTypes", id)
            : docRef("deviceTypes", id, "versions", String(version)),
          v2.DeviceTypeSchema,
        ),
      ),
    listDeviceTypes: () =>
      guard(() => listParsed(collection(fs, "deviceTypes"), v2.DeviceTypeSchema)),

    addCalibration: (input) =>
      guard(async () => {
        const c = parseOrInvalid(v2.CalibrationSchema, input, "calibration");
        await createStrict(docRef("devices", c.deviceId, "calibrations", String(c.version)), c);
      }),
    listCalibrations: (deviceId) =>
      guard(async () => {
        const result = await listParsed(
          collection(fs, "devices", deviceId, "calibrations"),
          v2.CalibrationSchema,
        );
        return { ...result, items: result.items.sort((a, b) => a.version - b.version) };
      }),

    getAssembly: (stationId) =>
      guard(() => getParsed(docRef("assemblies", stationId), v2.AssemblySchema)),
    putAssembly: (input) =>
      guard(async () => {
        const a = parseOrInvalid(v2.AssemblySchema, input, "assembly");
        await setDoc(docRef("assemblies", a.stationId), stripUndefined(a));
      }),

    // Streams and sessions ------------------------------------------------------------------
    createStream: (input) =>
      guard(async () => {
        const stream = parseOrInvalid(v2.StreamSchema, input, "stream");
        await createMirrorNode(
          `streamStation/${stream.id}`,
          stream.stationId,
          (existing) => existing === stream.stationId,
        );
        await createStrict(docRef("streams", stream.id), stream);
      }),
    getStream: (id) => guard(() => getParsed(docRef("streams", id), v2.StreamSchema)),
    listStreams: (stationId) =>
      guard(() =>
        listParsed(
          fsQuery(collection(fs, "streams"), where("stationId", "==", stationId)),
          v2.StreamSchema,
        ),
      ),
    setStreamStatus: (streamId, status) =>
      guard(async () => {
        if (status !== "active" && status !== "stopped") throw invalid("Invalid stream status.");
        await updateDoc(docRef("streams", streamId), { status });
      }),

    startSession: (input) =>
      guard(async () => {
        const s = parseOrInvalid(v2.SessionSchema, input, "session");
        await createStrict(docRef("streams", s.streamId, "sessions", s.id), s);
      }),
    endSession: (streamId, sessionId, end: SessionEnd) =>
      guard(async () => {
        const ref = docRef("streams", streamId, "sessions", sessionId);
        await fsRunTransaction(fs, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) throw new DataProviderError("not-found");
          const current = v2.SessionSchema.parse(snap.data());
          if (current.endedAt !== undefined) throw new DataProviderError("conflict");
          const closed = parseOrInvalid(
            v2.SessionSchema,
            { ...current, ...end },
            "session end",
          );
          tx.update(
            ref,
            stripUndefined({
              endedAt: closed.endedAt,
              endReason: closed.endReason,
              counters: closed.counters,
            }),
          );
        });
      }),
    listSessions: (streamId, options) =>
      guard(async () => {
        const n = options?.limit ?? DEFAULT_SESSION_LIMIT;
        if (!Number.isInteger(n) || n < 1 || n > MAX_SESSION_LIMIT) {
          throw invalid(`Session limit must be an integer between 1 and ${MAX_SESSION_LIMIT}.`);
        }
        return listParsed(
          fsQuery(
            collection(fs, "streams", streamId, "sessions"),
            fsOrderBy("startedAt", "desc"),
            fsLimit(n),
          ),
          v2.SessionSchema,
        );
      }),

    // Minutes -------------------------------------------------------------------------------
    writeMinutes: (streamId, records) =>
      guard(async (): Promise<WriteMinutesResult> => {
        const prepared = records.map((r) => ({
          ts: r.ts,
          ...v2.serializeMinute(r),
        }));
        const outcomes = await mapLimit(prepared, WRITE_CONCURRENCY, async (p) => {
          const result = await rtRunTransaction(
            rtRef(rt, `minutes/${streamId}/${p.key}`),
            (current: unknown) => (current === null ? stripUndefined(p.value) : undefined),
            { applyLocally: false },
          );
          return { ts: p.ts, committed: result.committed };
        });
        return {
          written: outcomes.filter((o) => o.committed).length,
          alreadyExisted: outcomes.filter((o) => !o.committed).map((o) => o.ts),
        };
      }),
    readMinutes: (streamId, query: MinuteRangeQuery) =>
      guard(async (): Promise<Page<v2.MinuteRecord>> => {
        const plan = planMinuteRange(query);
        const base = rtRef(rt, `minutes/${streamId}`);
        const snap = await rtGet(
          rtQuery(
            base,
            orderByKey(),
            plan.startExclusive ? rtStartAfter(plan.startKey) : startAt(plan.startKey),
            endBefore(plan.endKey),
            limitToFirst(plan.fetchLimit),
          ),
        );
        const entries: (readonly [string, unknown])[] = [];
        snap.forEach((child) => {
          entries.push([child.key, child.val()] as const);
        });
        return buildMinutePage(entries, plan);
      }),

    // Day summaries -------------------------------------------------------------------------
    putDaySummary: (input) =>
      guard(async () => {
        const s = parseOrInvalid(v2.DaySummarySchema, input, "day summary");
        await setDoc(docRef("streams", s.streamId, "days", s.day), stripUndefined(s));
      }),
    getDaySummary: (streamId, day) =>
      guard(async () => {
        if (!DAY.test(day)) throw invalid("Day must be YYYY-MM-DD.");
        return getParsed(docRef("streams", streamId, "days", day), v2.DaySummarySchema);
      }),
    listDaySummaries: (streamId, fromDay, toDay, options) =>
      guard(async (): Promise<Page<v2.DaySummary>> => {
        if (!DAY.test(fromDay) || !DAY.test(toDay) || toDay < fromDay) {
          throw invalid("Day range must be YYYY-MM-DD with fromDay <= toDay.");
        }
        const n = options?.limit ?? 400;
        if (!Number.isInteger(n) || n < 1 || n > 1000) throw invalid("Invalid page size.");
        const cursor = options?.cursor ?? null;
        if (cursor !== null && !DAY.test(cursor)) throw invalid("Invalid pagination cursor.");
        const constraints = [
          where(documentId(), ">=", fromDay),
          where(documentId(), "<=", toDay),
          fsOrderBy(documentId()),
          ...(cursor === null ? [] : [fsStartAfter(cursor)]),
          fsLimit(n + 1),
        ];
        const snap = await getDocs(
          fsQuery(collection(fs, "streams", streamId, "days"), ...constraints),
        );
        const taken = snap.docs.slice(0, n);
        const parsed = parseEntries(
          taken.map((d) => [d.id, d.data()] as const),
          (key, value) => {
            const summary = v2.DaySummarySchema.parse(value);
            if (summary.day !== key || summary.streamId !== streamId) {
              throw new Error("summary does not match its path");
            }
            return summary;
          },
        );
        const last = taken[taken.length - 1];
        return {
          ...parsed,
          nextCursor: snap.docs.length > n && last !== undefined ? last.id : null,
        };
      }),

    // Live window ---------------------------------------------------------------------------
    pushLiveEvents: (streamId, events) =>
      guard(async () => {
        const entries = events.map((e) => {
          const value = toLiveValue(parseOrInvalid(v2.LiveEventSchema, e, "live event"));
          return [liveKey(value.t, nextNonce()), value] as const;
        });
        const base = rtRef(rt, `live/${streamId}/events`);
        for (const part of chunk(entries, LIVE_BATCH_SIZE)) {
          await rtUpdate(base, Object.fromEntries(part));
        }
        return { pushed: entries.length };
      }),
    pruneLive: (streamId, nowMs = now()) =>
      guard(async (): Promise<PruneResult> => {
        const base = rtRef(rt, `live/${streamId}/events`);
        const snap = await rtGet(rtQuery(base, orderByKey(), endBefore(pruneEndKey(nowMs))));
        const entries: (readonly [string, unknown])[] = [];
        snap.forEach((child) => {
          entries.push([child.key, child.val()] as const);
        });
        const { remove, skipped } = selectPrunable(entries, nowMs);
        for (const part of chunk(remove, LIVE_BATCH_SIZE)) {
          await rtUpdate(base, Object.fromEntries(part.map((k) => [k, null])));
        }
        return { removed: remove.length, skipped };
      }),
    subscribeLive(streamId, handlers: SubscriptionHandlers<v2.LiveEvent>): Unsubscribe {
      const q = rtQuery(
        rtRef(rt, `live/${streamId}/events`),
        orderByKey(),
        startAt(windowStartKey(now())),
      );
      return onChildAdded(
        q,
        (snap) => {
          let event: v2.LiveEvent;
          try {
            event = fromLiveValue(snap.val());
          } catch (error) {
            handlers.onInvalid({ key: snap.key ?? "", reason: describeFailure(error) });
            return;
          }
          handlers.onData(event);
        },
        (error) => handlers.onError(mapError(error)),
      );
    },

    // Status --------------------------------------------------------------------------------
    setStatus: (streamId, status, options) =>
      guard(async () => {
        const s = stripUndefined(parseOrInvalid(v2.StreamStatusSchema, status, "status"));
        if (options?.publish === true) {
          await rtUpdate(rtRef(rt), {
            [`status/${streamId}`]: s,
            [`statusPublic/${streamId}`]: { lastSeenAt: s.lastSeenAt, agentOnline: s.agentOnline },
          });
        } else {
          await rtSet(rtRef(rt, `status/${streamId}`), s);
        }
      }),
    getStatus: (streamId) =>
      guard(async () => {
        const value = (await rtGet(rtRef(rt, `status/${streamId}`))).val() as unknown;
        if (value === null) return null;
        try {
          return v2.StreamStatusSchema.parse(value);
        } catch (error) {
          throw new DataProviderError("invalid-data", { cause: error });
        }
      }),
    subscribeStatus: (streamId, handlers) =>
      watchNode(rt, `status/${streamId}`, v2.StreamStatusSchema, handlers),
    getStatusPublic: (streamId) =>
      guard(async () => {
        const value = (await rtGet(rtRef(rt, `statusPublic/${streamId}`))).val() as unknown;
        if (value === null) return null;
        try {
          return v2.StreamStatusPublicSchema.parse(value);
        } catch (error) {
          throw new DataProviderError("invalid-data", { cause: error });
        }
      }),
    subscribeStatusPublic: (streamId, handlers) =>
      watchNode(rt, `statusPublic/${streamId}`, v2.StreamStatusPublicSchema, handlers),

    close: () => guard(() => deleteApp(app)),
  };
  return provider;
}

function watchNode<T>(
  rt: Database,
  path: string,
  schema: { parse(value: unknown): T },
  handlers: SubscriptionHandlers<T | null>,
): Unsubscribe {
  return onValue(
    rtRef(rt, path),
    (snap) => {
      const value = snap.val() as unknown;
      if (value === null) {
        handlers.onData(null);
        return;
      }
      let parsed: T;
      try {
        parsed = schema.parse(value);
      } catch (error) {
        handlers.onInvalid({ key: path, reason: describeFailure(error) });
        return;
      }
      handlers.onData(parsed);
    },
    (error) => handlers.onError(mapError(error)),
  );
}
