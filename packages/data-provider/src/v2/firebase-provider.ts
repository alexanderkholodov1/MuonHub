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
  initializeAuth,
  reload,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type Auth,
  type Persistence,
  type User as FbUser,
} from "firebase/auth";
import {
  collection,
  collectionGroup,
  connectFirestoreEmulator,
  deleteDoc,
  deleteField,
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
  endAt,
  endBefore,
  get as rtGet,
  getDatabase,
  limitToFirst,
  onChildAdded,
  onValue,
  orderByKey,
  query as rtQuery,
  ref as rtRef,
  set as rtSet,
  startAfter as rtStartAfter,
  startAt,
  update as rtUpdate,
  type Database,
} from "firebase/database";
import { v2 } from "@muonhub/shared";
import {
  DEFAULT_TIMEOUT_MS,
  DataProviderError,
  guard as baseGuard,
  mapError,
  withDeadline,
} from "./errors.js";
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
  MAX_CLOCK_SKEW_MS,
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
  createRestorablePersistence,
  exchangeRefreshToken,
  idTokenClaims,
  type RestorablePersistence,
} from "./session-restore.js";
import { writeMinutesChunked } from "./minute-writer.js";
import { buildMinutePage, planMinuteRange, type MinuteRangeQuery } from "./pagination.js";
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
  /**
   * Deadline for one provider operation (one chunk for chunked writes), in ms; default 15000.
   * On expiry the call fails with `outcome-unknown` (the write may still land). `0` disables it.
   */
  timeoutMs?: number;
  /**
   * Enables `signInWithRefreshToken` (Node.js agents): the Auth instance is created with a custom
   * persistence instead of the default. Needs a fresh app name. See `session-restore.ts`.
   */
  sessionRestore?: boolean;
  /** Local emulators; never set in production. */
  emulators?: { auth?: string; firestore?: HostPort; database?: HostPort };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_SESSION_LIMIT = 50;
const MAX_SESSION_LIMIT = 500;
/** The security rules reject list queries asking for more than 100 documents. */
const MAX_LIST_LIMIT = 100;

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
  const restorer: RestorablePersistence | null =
    fresh && config.sessionRestore === true ? createRestorablePersistence() : null;
  const auth: Auth =
    restorer === null
      ? getAuth(app)
      : initializeAuth(app, {
          persistence: restorer.persistence as unknown as Persistence,
        });
  const fs: Firestore = getFirestore(app);
  const rt: Database = getDatabase(app);
  if (fresh && config.emulators !== undefined) {
    const { auth: a, firestore: f, database: d } = config.emulators;
    if (a !== undefined) connectAuthEmulator(auth, a, { disableWarnings: true });
    if (f !== undefined) connectFirestoreEmulator(fs, f.host, f.port);
    if (d !== undefined) connectDatabaseEmulator(rt, d.host, d.port);
  }

  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  /** Every provider operation runs under the deadline and rethrows as a DataProviderError. */
  const guard = <T>(operation: () => Promise<T>): Promise<T> =>
    baseGuard(() => withDeadline(operation(), timeoutMs));
  /** One I/O step with its own deadline (for chunked operations that report partial progress). */
  const io = <T>(operation: () => Promise<T>): Promise<T> => withDeadline(operation(), timeoutMs);

  const nextNonce = createNonceSource();
  const now = (): number => Date.now();

  const requireUid = (): string => {
    const uid = auth.currentUser?.uid;
    if (uid === undefined) throw new DataProviderError("unauthenticated");
    return uid;
  };

  // ── Firestore helpers ──────────────────────────────────────────────────────────────────────

  const docRef = (...path: [string, ...string[]]) => doc(fs, ...path);

  /**
   * True when the document exists. The security rules answer a read of a missing document with
   * `permission-denied` (they read `resource.data`), so a denied probe means "not visible to this
   * user", which for a create is treated as absent; the write itself is still checked by the rules.
   */
  async function probeExists(ref: ReturnType<typeof docRef>): Promise<boolean> {
    try {
      return (await getDoc(ref)).exists();
    } catch (error) {
      const mapped = mapError(error);
      if (mapped.code === "permission-denied") return false;
      throw mapped;
    }
  }

  /**
   * Create-only write of one or more documents, atomic; `already-exists` if the first exists.
   *
   * A transaction (read, then set) closes the check-then-set race. The rules, however, answer a
   * read of a missing document with `permission-denied` (they read `resource.data`), so a denied
   * READ inside the transaction cannot tell "absent" from "hidden". Only in that case do we fall
   * back to a plain batch: the rules still decide the write (a create over an existing document
   * is an update, which they deny), and its denial, if any, is thrown as is. Any other failure,
   * and any denial of the write itself, is never swallowed.
   */
  async function createStrict(
    writes: readonly [ref: ReturnType<typeof docRef>, data: object][],
  ): Promise<void> {
    const first = writes[0];
    if (first === undefined) return;
    let readDenied = false;
    try {
      await fsRunTransaction(fs, async (tx) => {
        try {
          if ((await tx.get(first[0])).exists()) throw new DataProviderError("already-exists");
        } catch (error) {
          if (mapError(error).code === "permission-denied") readDenied = true;
          throw error;
        }
        for (const [ref, data] of writes) tx.set(ref, stripUndefined(data));
      });
      return;
    } catch (error) {
      if (!readDenied) throw mapError(error);
    }
    const batch = writeBatch(fs);
    for (const [ref, data] of writes) batch.set(ref, stripUndefined(data));
    await batch.commit();
  }

  /**
   * Runs `first`, then `second`; if `second` fails, undoes `first` and rethrows the original error.
   * If the undo fails too, the failure says so (the desync is then the caller's to repair).
   */
  async function ordered(
    first: () => Promise<void>,
    second: () => Promise<void>,
    undoFirst: () => Promise<void>,
  ): Promise<void> {
    await first();
    try {
      await second();
    } catch (error) {
      try {
        await undoFirst();
      } catch (undoError) {
        throw new DataProviderError("internal", {
          message: "A two-step write failed and the first step could not be rolled back.",
          cause: new AggregateError([error, undoError]),
        });
      }
      throw mapError(error);
    }
  }

  const memberMirror = (stationId: string, uid: string, role: v2.MemberRole | null) => async () => {
    await rtUpdate(rtRef(rt, `stationAccess/${stationId}`), {
      [`editors/${uid}`]: role === "editor" ? true : null,
      [`viewers/${uid}`]: role === "viewer" ? true : null,
    });
  };

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
   * is the original error. (RTDB rules make the set itself the atomic create-once check; the read
   * only disambiguates a retry, so no transaction is needed here.)
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

  async function countDevices(
    stationId: string,
  ): Promise<{ deviceCount: number; active: boolean }> {
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
      guard(async () =>
        toAuthUser((await createUserWithEmailAndPassword(auth, email, password)).user),
      ),
    signOut: () => guard(() => fbSignOut(auth)),
    getRefreshToken() {
      const token = auth.currentUser?.refreshToken;
      return token === undefined || token === "" ? null : token;
    },
    signInWithRefreshToken: (token) =>
      guard(async () => {
        if (restorer === null) {
          throw invalid("Session restore is not enabled (set sessionRestore on a fresh app).");
        }
        await auth.authStateReady();
        const fresh = await exchangeRefreshToken(config.apiKey, token, config.emulators?.auth);
        const claims = idTokenClaims(fresh.idToken);
        await restorer.seed({
          uid: fresh.uid,
          ...(claims.email === undefined ? {} : { email: claims.email }),
          emailVerified: claims.emailVerified,
          isAnonymous: false,
          providerData: [],
          stsTokenManager: {
            refreshToken: fresh.refreshToken,
            accessToken: fresh.idToken,
            expirationTime: Date.now() + fresh.expiresInSec * 1000,
          },
          apiKey: config.apiKey,
          appName,
        });
        const user = auth.currentUser;
        if (user === null || user.uid !== fresh.uid) {
          throw new DataProviderError("internal", { message: "Session restore did not complete." });
        }
        await reload(user); // fills the profile and proves the account still exists
        return toAuthUser(user);
      }),
    async checkSession() {
      const user = auth.currentUser;
      if (user === null) return false;
      try {
        await user.getIdToken(true);
        return true;
      } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        if (
          code === "auth/user-token-expired" ||
          code === "auth/user-disabled" ||
          code === "auth/user-not-found" ||
          code === "auth/invalid-user-token"
        ) {
          return false;
        }
        throw mapError(error);
      }
    },

    // Identity ------------------------------------------------------------------------------
    createUserProfile: (user) =>
      guard(async () => {
        const profile = parseOrInvalid(v2.UserSchema, user, "user profile");
        const nameRef = docRef("usernames", profile.username);
        if (await probeExists(nameRef)) throw new DataProviderError("already-exists");
        await createStrict([
          [docRef("users", profile.uid), profile],
          [nameRef, { uid: profile.uid, createdAt: profile.createdAt }],
        ]);
      }),
    getUser: (uid) => guard(() => getParsed(docRef("users", uid), v2.UserSchema)),
    updateDisplayName: (uid, displayName) =>
      guard(async () => {
        const name = parseOrInvalid(v2.UserSchema.shape.displayName, displayName, "display name");
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
        await createStrict([
          [docRef("stations", station.id), station],
          ...(isPublic(station)
            ? [
                [
                  docRef("publicStations", station.id),
                  buildPublicStation(station, { deviceCount: 0, active: false }, station.updatedAt),
                ] as [ReturnType<typeof docRef>, object],
              ]
            : []),
        ]);
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
        type Row = { key: string; error: string } | { station: v2.Station; role: v2.MemberRole };
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
                if (mapped.code === "permission-denied") return "denied" as const;
                throw mapped;
              },
            );
            if (station === "denied") {
              return {
                key: stationId,
                error: "access denied (the access mirror may be out of sync)",
              };
            }
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
          if (
            value !== undefined &&
            JSON.stringify(value) !== JSON.stringify(current[key as keyof v2.Station])
          ) {
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
        const batch = writeBatch(fs);
        batch.update(
          docRef("stations", stationId),
          stripUndefined({ ...changed, updatedAt: nextAt }),
        );
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
        const commit = async (): Promise<void> => {
          await batch.commit();
        };
        const wasPublic = isPublic(current);
        const willBePublic = isPublic(next);
        const setMirror = (value: boolean) => async (): Promise<void> => {
          await rtUpdate(rtRef(rt, `stationAccess/${stationId}`), { public: value });
        };
        if (wasPublic === willBePublic) {
          await commit();
        } else if (willBePublic) {
          // Grant (becoming public): Firestore first, then the mirror; undo Firestore on failure.
          const undo = async (): Promise<void> => {
            const back = writeBatch(fs);
            const previous: Record<string, unknown> = { updatedAt: current.updatedAt };
            for (const key of Object.keys(changed)) {
              const old = current[key as keyof v2.Station];
              previous[key] = old === undefined ? deleteField() : old;
            }
            back.update(docRef("stations", stationId), previous);
            back.delete(projectionRef);
            await back.commit();
          };
          await ordered(commit, setMirror(true), undo);
        } else {
          // Revocation (leaving public): mirror first, then Firestore; restore the mirror on failure.
          await ordered(setMirror(false), commit, setMirror(true));
        }
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
    listPublicStations: (options) =>
      guard(async (): Promise<Page<v2.PublicStation>> => {
        const n = options?.limit ?? MAX_LIST_LIMIT;
        if (!Number.isInteger(n) || n < 1 || n > MAX_LIST_LIMIT) {
          throw invalid(`Page size must be an integer between 1 and ${MAX_LIST_LIMIT}.`);
        }
        const cursor = options?.cursor ?? null;
        const snap = await getDocs(
          fsQuery(
            collection(fs, "publicStations"),
            fsOrderBy(documentId()),
            ...(cursor === null ? [] : [fsStartAfter(cursor)]),
            fsLimit(n),
          ),
        );
        const parsed = parseEntries(
          snap.docs.map((d) => [d.id, d.data()] as const),
          (_key, value) => v2.PublicStationSchema.parse(value),
        );
        const last = snap.docs[snap.docs.length - 1];
        return {
          ...parsed,
          nextCursor: snap.docs.length === n && last !== undefined ? last.id : null,
        };
      }),

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
        // Grant: Firestore first (create-only; the rules decide who may), then the mirror; the
        // member document is removed again if the mirror cannot be written.
        await ordered(
          () => createStrict([[memberRef, member]]),
          memberMirror(stationId, uid, role),
          async () => {
            await deleteDoc(memberRef);
          },
        );
      }),
    changeMemberRole: (stationId, uid, role) =>
      guard(async () => {
        parseOrInvalid(v2.MemberRoleSchema, role, "role");
        const memberRef = docRef("stations", stationId, "members", uid);
        // A plain read: a denied read is a real `permission-denied` (the owner may read members),
        // and only a readable-but-missing document is `not-found`.
        const snap = await getDoc(memberRef);
        if (!snap.exists()) throw new DataProviderError("not-found");
        const previous = v2.StationMemberSchema.parse(snap.data()).role;
        if (previous === role) return;
        const writeDoc = async (value: v2.MemberRole): Promise<void> => {
          await updateDoc(memberRef, { role: value });
        };
        if (role === "editor") {
          // Upgrade is a grant: Firestore first, then the mirror.
          await ordered(
            () => writeDoc(role),
            memberMirror(stationId, uid, role),
            () => writeDoc(previous),
          );
        } else {
          // Downgrade is a revocation: mirror first, then Firestore.
          await ordered(
            memberMirror(stationId, uid, role),
            () => writeDoc(role),
            memberMirror(stationId, uid, previous),
          );
        }
      }),
    removeMember: (stationId, uid) =>
      guard(async () => {
        const memberRef = docRef("stations", stationId, "members", uid);
        const snap = await getDoc(memberRef);
        const previous = snap.exists() ? v2.StationMemberSchema.parse(snap.data()).role : null;
        // Revocation: mirror first, then Firestore; the mirror is restored if the delete fails.
        await ordered(
          memberMirror(stationId, uid, null),
          async () => {
            await deleteDoc(memberRef);
          },
          memberMirror(stationId, uid, previous),
        );
      }),
    leaveStation: (stationId) =>
      guard(async () => {
        const me = requireUid();
        // Own mirror entries first (the rules allow self-removal). No rollback: a member cannot
        // re-grant themselves, and a lost right is the safe direction; the owner can repair it.
        await memberMirror(stationId, me, null)();
        await deleteDoc(docRef("stations", stationId, "members", me));
      }),
    transferOwnership: (stationId, toUid) =>
      guard(async () => {
        const me = requireUid();
        parseOrInvalid(v2.UidSchema, toUid, "recipient uid");
        if (toUid === me) throw invalid("The recipient already owns the station.");
        const transferId = newTransferId();
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
        // The mirror lock goes first. The rules let nobody cancel it from the owner's side, so a
        // failed transfer is NOT rolled back: the lock stays, a retry with the same recipient
        // completes it, and the recipient can decline by clearing `pendingOwner`.
        await rtUpdate(accessRef, { pendingOwner: toUid });
        await fsRunTransaction(fs, async (tx) => {
          const snap = await tx.get(stationRef);
          if (!snap.exists()) throw new DataProviderError("not-found");
          const station = stationSchema.parse(snap.data());
          if (station.ownerUid !== me) throw new DataProviderError("permission-denied");
          tx.set(docRef("ownershipTransfers", transferId), transfer);
          tx.update(stationRef, { ownerUid: toUid, transferId, updatedAt: at });
        });
        return transferId;
      }),
    claimStationMirror: (stationId) =>
      guard(async () => {
        const me = requireUid();
        // The rules require a clean node on hand-over (no editors/viewers): take over, then
        // re-share from the Firestore members, which are the source of truth.
        await rtUpdate(rtRef(rt, `stationAccess/${stationId}`), {
          ownerUid: me,
          pendingOwner: null,
          editors: null,
          viewers: null,
        });
        const members = await listParsed(
          collection(fs, "stations", stationId, "members"),
          v2.StationMemberSchema,
        );
        if (members.quarantine.count > 0) {
          throw new DataProviderError("invalid-data", {
            message: "Some memberships are invalid; the mirror was not fully restored.",
          });
        }
        const grants: Record<string, true> = {};
        for (const m of members.items) {
          if (m.uid !== me)
            grants[`${m.role === "editor" ? "editors" : "viewers"}/${m.uid}`] = true;
        }
        if (Object.keys(grants).length > 0) {
          await rtUpdate(rtRef(rt, `stationAccess/${stationId}`), grants);
        }
      }),
    getTransfer: (id) =>
      guard(() => getParsed(docRef("ownershipTransfers", id), v2.OwnershipTransferSchema)),

    // Devices -------------------------------------------------------------------------------
    createDevice: (input) =>
      guard(async () => {
        const device = parseOrInvalid(v2.DeviceSchema, input, "device");
        await createStrict([[docRef("devices", device.id), device]]);
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
        if (await probeExists(versionRef)) throw new DataProviderError("already-exists");
        const parent = await getDoc(parentRef).catch((error: unknown) => {
          const mapped = mapError(error);
          if (mapped.code === "permission-denied") return null;
          throw mapped;
        });
        if (parent?.exists() === true) {
          const current = (parent.data() as { version?: unknown }).version;
          if (typeof current === "number" && current > type.version) {
            throw new DataProviderError("conflict");
          }
        }
        const batch = writeBatch(fs);
        batch.set(versionRef, stripUndefined(type));
        batch.set(parentRef, stripUndefined(type));
        await batch.commit();
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
        await createStrict([[docRef("devices", c.deviceId, "calibrations", String(c.version)), c]]);
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
          // `since` bounds the minutes the rules accept for this stream (never before creation).
          { stationId: stream.stationId, since: stream.createdAt },
          (existing) =>
            (existing as { stationId?: unknown } | null)?.stationId === stream.stationId,
        );
        await createStrict([[docRef("streams", stream.id), stream]]);
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
        await createStrict([[docRef("streams", s.streamId, "sessions", s.id), s]]);
      }),
    updateSessionCounters: (streamId, sessionId, counters) =>
      guard(async () => {
        const valid = parseOrInvalid(v2.SessionCountersSchema, counters, "session counters");
        const ref = docRef("streams", streamId, "sessions", sessionId);
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new DataProviderError("not-found");
        if (v2.SessionSchema.parse(snap.data()).endedAt !== undefined) {
          throw new DataProviderError("conflict");
        }
        await updateDoc(ref, { counters: valid });
      }),
    endSession: (streamId, sessionId, end: SessionEnd) =>
      guard(async () => {
        const ref = docRef("streams", streamId, "sessions", sessionId);
        await fsRunTransaction(fs, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) throw new DataProviderError("not-found");
          const current = v2.SessionSchema.parse(snap.data());
          if (current.endedAt !== undefined) throw new DataProviderError("conflict");
          const closed = parseOrInvalid(v2.SessionSchema, { ...current, ...end }, "session end");
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
    // Chunked, with a deadline per I/O step (so a timeout reports which chunks are done).
    writeMinutes: (streamId, records) =>
      baseGuard(async (): Promise<WriteMinutesResult> => {
        requireUid();
        const prepared = records.map((r) => ({
          ts: r.ts,
          ...v2.serializeMinute(r),
        }));
        if (new Set(prepared.map((p) => p.key)).size !== prepared.length) {
          throw invalid("Two records share the same minute.");
        }
        if (prepared.length === 0) return { written: 0, alreadyExisted: [], existing: [] };
        const base = rtRef(rt, `minutes/${streamId}`);
        return writeMinutesChunked(prepared, {
          // Write-once: the rules deny any overwrite, so existing minutes are found first (one
          // bounded ranged read per chunk) and left out of the write.
          readExisting: (firstKey, lastKey) =>
            io(async () => {
              const snap = await rtGet(
                rtQuery(base, orderByKey(), startAt(firstKey), endAt(lastKey)),
              );
              const found = new Map<string, string | null>();
              snap.forEach((child) => {
                if (child.key === null) return;
                const s = (child.val() as { s?: unknown } | null)?.s;
                found.set(child.key, typeof s === "string" ? s : null);
              });
              return found;
            }),
          writeChunk: (entries) =>
            io(() =>
              rtUpdate(
                base,
                Object.fromEntries(entries.map((p) => [p.key, stripUndefined(p.value)])),
              ),
            ),
        });
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
        const n = options?.limit ?? MAX_LIST_LIMIT;
        if (!Number.isInteger(n) || n < 1 || n > MAX_LIST_LIMIT)
          throw invalid("Invalid page size.");
        const cursor = options?.cursor ?? null;
        if (cursor !== null && !DAY.test(cursor)) throw invalid("Invalid pagination cursor.");
        const constraints = [
          where(documentId(), ">=", fromDay),
          where(documentId(), "<=", toDay),
          fsOrderBy(documentId()),
          ...(cursor === null ? [] : [fsStartAfter(cursor)]),
          fsLimit(n),
        ];
        const snap = await getDocs(
          fsQuery(collection(fs, "streams", streamId, "days"), ...constraints),
        );
        const taken = snap.docs;
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
          nextCursor: taken.length === n && last !== undefined ? last.id : null,
        };
      }),

    // Live window ---------------------------------------------------------------------------
    pushLiveEvents: (streamId, events) =>
      baseGuard(async () => {
        requireUid();
        const entries = events.map((e) => {
          const value = toLiveValue(parseOrInvalid(v2.LiveEventSchema, e, "live event"));
          return [liveKey(value.t, nextNonce()), value] as const;
        });
        const base = rtRef(rt, `live/${streamId}/events`);
        let pushed = 0;
        for (const part of chunk(entries, LIVE_BATCH_SIZE)) {
          try {
            await io(() => rtUpdate(base, Object.fromEntries(part)));
          } catch (error) {
            throw mapError(error).withPartial({
              writtenSoFar: entries.slice(0, pushed).map(([, v]) => v.t),
              pending: entries.slice(pushed).map(([, v]) => v.t),
            });
          }
          pushed += part.length;
        }
        return { pushed };
      }),
    pruneLive: (streamId, requestedNowMs = now()) =>
      baseGuard(async (): Promise<PruneResult> => {
        requireUid();
        if (!Number.isFinite(requestedNowMs)) throw invalid("nowMs must be a finite number.");
        // A far-future `nowMs` would delete live data; never trust it beyond the allowed skew.
        const nowMs = Math.min(requestedNowMs, now() + MAX_CLOCK_SKEW_MS);
        const base = rtRef(rt, `live/${streamId}/events`);
        const snap = await io(() =>
          rtGet(rtQuery(base, orderByKey(), endBefore(pruneEndKey(nowMs)))),
        );
        const entries: (readonly [string, unknown])[] = [];
        snap.forEach((child) => {
          entries.push([child.key, child.val()] as const);
        });
        const { remove, skipped } = selectPrunable(entries, nowMs);
        let removed = 0;
        for (const part of chunk(remove, LIVE_BATCH_SIZE)) {
          try {
            await io(() => rtUpdate(base, Object.fromEntries(part.map((k) => [k, null]))));
          } catch (error) {
            throw mapError(error).withPartial({ removed });
          }
          removed += part.length;
        }
        return { removed, skipped };
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
        requireUid();
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
