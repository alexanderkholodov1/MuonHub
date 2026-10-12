/**
 * In-memory {@link DataProviderV2} for unit tests of consumers (agent, web).
 *
 * It reproduces the contract semantics that consumers rely on: strict create vs update,
 * write-once minutes, cursor pagination, quarantine of invalid stored records, time-based live
 * pruning with unique keys, subscriptions with an error channel, and the public projection. It does
 * NOT evaluate security rules (those are tested in the emulator): authorization is out of scope here.
 *
 * Several providers can share one {@link MemoryStore} to model several identities.
 */
import { v2 } from "@muonhub/shared";
import { DataProviderError, mapError } from "./errors.js";
import type {
  AuthUser,
  DataProviderV2,
  PruneResult,
  SubscriptionHandlers,
  Unsubscribe,
} from "./interface.js";
import {
  MAX_CLOCK_SKEW_MS,
  chunk,
  createNonceSource,
  fromLiveValue,
  liveKey,
  pruneEndKey,
  selectPrunable,
  toLiveValue,
  windowStartKey,
  LIVE_BATCH_SIZE,
} from "./live-window.js";
import { writeMinutesChunked } from "./minute-writer.js";
import { buildMinutePage, planMinuteRange } from "./pagination.js";
import { buildPublicStation, isOwnedStationId, isPublic, newTransferId } from "./public-station.js";
import { describeFailure, parseEntries, type ListResult, type Page } from "./quarantine.js";

type Listener = () => void;

/** What an injected fault looks like to the caller. */
export type FaultKind =
  | "permission-denied"
  | "unauthenticated"
  | "unavailable"
  /** RTDB's "Client is offline" (maps to `unavailable`). */
  | "offline"
  /** A deadline expiry: the operation may or may not have been applied (`outcome-unknown`). */
  | "timeout";

export interface MemoryFault {
  /**
   * Provider method name (`"writeMinutes"`, `"addMember"`, ...), `"writeMinutes.chunk"` for the
   * write of one minute chunk, or `"*"` for every method.
   */
  op: string;
  kind: FaultKind;
  /** How many matching calls fail (default 1; `Infinity` for a permanent outage). */
  times?: number;
  /** Matching calls that succeed first (default 0). */
  skip?: number;
}

function faultError(kind: FaultKind): DataProviderError {
  switch (kind) {
    case "permission-denied":
      return new DataProviderError("permission-denied");
    case "unauthenticated":
      return new DataProviderError("unauthenticated");
    case "unavailable":
      return new DataProviderError("unavailable");
    case "offline":
      return mapError(new Error("Client is offline."));
    case "timeout":
      return new DataProviderError("outcome-unknown");
  }
}

/** Shared state; create one per test and hand it to every provider that should see the same data. */
export class MemoryStore {
  readonly accounts = new Map<string, { uid: string; email: string; password: string }>();
  readonly docs = new Map<string, unknown>(); // Firestore-like: "collection/id/..." → document
  readonly rtdb = new Map<string, unknown>(); // flat RTDB-like: "minutes/{stream}/{key}" → value
  private readonly listeners = new Set<Listener>();
  private accountSeq = 0;

  nextUid(): string {
    this.accountSeq += 1;
    return `mem${String(this.accountSeq).padStart(6, "0")}`;
  }

  subscribe(listener: Listener): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(): void {
    for (const listener of [...this.listeners]) listener();
  }

  private faults: { fault: MemoryFault; skip: number; left: number }[] = [];

  /** Failure injection: makes matching provider calls fail as a real backend would. */
  injectFault(fault: MemoryFault): void {
    this.faults.push({ fault, skip: fault.skip ?? 0, left: fault.times ?? 1 });
  }

  clearFaults(): void {
    this.faults = [];
  }

  /**
   * Write-once race hook: runs just before each minute chunk is written, after its existence read,
   * so a test can plant a minute "written by another client" in between (the write is then denied,
   * as the rules would, and the provider re-reads and retries).
   */
  beforeMinuteWrite: ((streamId: string, keys: readonly string[]) => void) | undefined;

  /** Throws the injected error for `op`, if one is armed. Used by the in-memory provider. */
  checkFault(op: string): void {
    for (const entry of this.faults) {
      if (entry.fault.op !== "*" && entry.fault.op !== op) continue;
      if (entry.left <= 0) continue;
      if (entry.skip > 0) {
        entry.skip -= 1;
        continue;
      }
      entry.left -= 1;
      throw faultError(entry.fault.kind);
    }
  }

  /** Direct test hook: plants a raw (possibly invalid) Firestore-like document. */
  plantDoc(path: string, value: unknown): void {
    this.docs.set(path, structuredClone(value));
  }

  /** Direct test hook: plants a raw (possibly invalid) RTDB-like value. */
  plantRt(path: string, value: unknown): void {
    this.rtdb.set(path, structuredClone(value));
    this.notify();
  }
}

export interface MemoryProviderOptions {
  store?: MemoryStore;
  /** Clock for timestamps made by the provider (default `Date.now`). */
  now?: () => number;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function parseStored<T>(schema: { parse(v: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new DataProviderError("invalid-data", { cause: error });
  }
}

export function createMemoryProviderV2(options: MemoryProviderOptions = {}): DataProviderV2 {
  const store = options.store ?? new MemoryStore();
  const now = options.now ?? Date.now;
  const nextNonce = createNonceSource(() => 0);
  let user: AuthUser | null = null;
  const authListeners = new Set<(u: AuthUser | null) => void>();

  const setUser = (next: AuthUser | null): void => {
    user = next;
    for (const l of [...authListeners]) l(next);
  };
  const requireUid = (): string => {
    if (user === null) throw new DataProviderError("unauthenticated");
    return user.uid;
  };
  const fail = (message: string): never => {
    throw new DataProviderError("invalid-argument", { message });
  };
  const validate = <T>(schema: { parse(v: unknown): T }, value: unknown, what: string): T => {
    try {
      return schema.parse(value);
    } catch (error) {
      throw new DataProviderError("invalid-argument", {
        message: `Invalid ${what}: ${describeFailure(error)}`,
        cause: error,
      });
    }
  };

  const getDocOrNull = <T>(path: string, schema: { parse(v: unknown): T }): T | null => {
    if (!store.docs.has(path)) return null;
    return parseStored(schema, store.docs.get(path));
  };
  const createDoc = (path: string, value: unknown): void => {
    if (store.docs.has(path)) throw new DataProviderError("already-exists");
    store.docs.set(path, clone(value));
  };
  const updateDocFields = (path: string, fields: object): void => {
    const existing = store.docs.get(path);
    if (existing === undefined) throw new DataProviderError("not-found");
    store.docs.set(path, { ...(existing as object), ...clone(fields) });
  };
  /** Children of `prefix` one level deep: ids and values. */
  const children = (prefix: string): [string, unknown][] =>
    [...store.docs.entries()]
      .filter(([k]) => k.startsWith(`${prefix}/`) && !k.slice(prefix.length + 1).includes("/"))
      .map(([k, v]) => [k.slice(prefix.length + 1), v]);
  const listDocs = <T>(prefix: string, schema: { parse(v: unknown): T }): ListResult<T> =>
    parseEntries(children(prefix), (_k, v) => schema.parse(v));
  const rtOf = (prefix: string): [string, unknown][] =>
    [...store.rtdb.entries()]
      .filter(([k]) => k.startsWith(`${prefix}/`))
      .map(([k, v]): [string, unknown] => [k.slice(prefix.length + 1), v])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const watch = <T>(
    read: () => { value: T } | { invalid: string; key: string },
    handlers: SubscriptionHandlers<T>,
  ): Unsubscribe => {
    const emit = (): void => {
      const r = read();
      if ("invalid" in r) handlers.onInvalid({ key: r.key, reason: r.invalid });
      else handlers.onData(r.value);
    };
    emit();
    return store.subscribe(emit);
  };

  const statusWatcher =
    <T>(path: string, schema: { parse(v: unknown): T }) =>
    (handlers: SubscriptionHandlers<T | null>): Unsubscribe =>
      watch<T | null>(() => {
        if (!store.rtdb.has(path)) return { value: null };
        try {
          return { value: schema.parse(store.rtdb.get(path)) };
        } catch (error) {
          return { key: path, invalid: describeFailure(error) };
        }
      }, handlers);

  const countDevices = (stationId: string): { deviceCount: number; active: boolean } => {
    const devices = listDocs("devices", v2.DeviceSchema).items.filter(
      (d) => d.stationId === stationId,
    );
    return { deviceCount: devices.length, active: devices.some((d) => d.status === "active") };
  };

  const provider: DataProviderV2 = {
    currentUser: () => user,
    onAuthChange(handlers) {
      authListeners.add(handlers.onChange);
      handlers.onChange(user);
      return () => authListeners.delete(handlers.onChange);
    },
    async signInWithEmail(email, password) {
      const account = store.accounts.get(email);
      if (account === undefined || account.password !== password) {
        throw new DataProviderError("invalid-credentials");
      }
      const next = { uid: account.uid, email };
      setUser(next);
      return next;
    },
    async createAccount(email, password) {
      if (store.accounts.has(email)) throw new DataProviderError("already-exists");
      if (password.length < 6) fail("Password too short.");
      const account = { uid: store.nextUid(), email, password };
      store.accounts.set(email, account);
      const next = { uid: account.uid, email };
      setUser(next);
      return next;
    },
    async signOut() {
      setUser(null);
    },

    async createUserProfile(input) {
      const profile = validate(v2.UserSchema, input, "user profile");
      if (
        store.docs.has(`users/${profile.uid}`) ||
        store.docs.has(`usernames/${profile.username}`)
      ) {
        throw new DataProviderError("already-exists");
      }
      createDoc(`users/${profile.uid}`, profile);
      createDoc(`usernames/${profile.username}`, {
        uid: profile.uid,
        createdAt: profile.createdAt,
      });
    },
    async getUser(uid) {
      return getDocOrNull(`users/${uid}`, v2.UserSchema);
    },
    async updateDisplayName(uid, displayName) {
      validate(v2.UserSchema.shape.displayName, displayName, "display name");
      updateDocFields(`users/${uid}`, { displayName });
    },
    async findUidByUsername(username) {
      return getDocOrNull(`usernames/${username}`, v2.UsernameClaimSchema)?.uid ?? null;
    },

    async createStation(input) {
      const station = validate(v2.StationSchema, input, "station");
      if (!isOwnedStationId(station.id, station.ownerUid)) {
        fail("Station id must be <ownerUid>_<random> (use newStationId).");
      }
      createDoc(`stations/${station.id}`, station);
      if (isPublic(station)) {
        createDoc(
          `publicStations/${station.id}`,
          buildPublicStation(station, { deviceCount: 0, active: false }, station.updatedAt),
        );
      }
    },
    async getStation(id) {
      return getDocOrNull(`stations/${id}`, v2.StationSchema);
    },
    async listMyStations() {
      const uid = requireUid();
      const r = listDocs("stations", v2.StationSchema);
      return { ...r, items: r.items.filter((s) => s.ownerUid === uid) };
    },
    async listSharedWithMe() {
      const uid = requireUid();
      const items: { station: v2.Station; role: v2.MemberRole }[] = [];
      let bad = 0;
      const samples: { key: string; reason: string }[] = [];
      for (const [path, value] of store.docs) {
        const m = /^stations\/([^/]+)\/members\/([^/]+)$/.exec(path);
        if (m === null || m[2] !== uid) continue;
        const stationId = m[1] as string;
        try {
          const member = v2.StationMemberSchema.parse(value);
          const station = getDocOrNull(`stations/${stationId}`, v2.StationSchema);
          if (station === null) throw new Error("station not found");
          items.push({ station, role: member.role });
        } catch (error) {
          bad += 1;
          samples.push({ key: stationId, reason: describeFailure(error) });
        }
      }
      return { items, quarantine: { count: bad, samples } };
    },
    async updateStation(stationId, patch) {
      const current = getDocOrNull(`stations/${stationId}`, v2.StationSchema);
      if (current === null) throw new DataProviderError("not-found");
      const changed = Object.fromEntries(
        Object.entries(patch).filter(
          ([k, v]) =>
            v !== undefined && JSON.stringify(v) !== JSON.stringify(current[k as keyof v2.Station]),
        ),
      );
      if (Object.keys(changed).length === 0) return;
      const at = now();
      const next = validate(
        v2.StationSchema,
        { ...current, ...changed, updatedAt: at },
        "station update",
      );
      store.docs.set(`stations/${stationId}`, clone(next));
      if (isPublic(next)) {
        if (["name", "location", "publicPrecision", "visibility"].some((k) => k in changed)) {
          store.docs.set(
            `publicStations/${stationId}`,
            buildPublicStation(next, countDevices(stationId), at),
          );
        }
      } else store.docs.delete(`publicStations/${stationId}`);
    },
    async refreshPublicProjection(stationId) {
      const station = getDocOrNull(`stations/${stationId}`, v2.StationSchema);
      if (station === null) throw new DataProviderError("not-found");
      if (!isPublic(station)) fail("The station is not public; it has no projection.");
      store.docs.set(
        `publicStations/${stationId}`,
        buildPublicStation(station, countDevices(stationId), now()),
      );
    },
    async listPublicStations() {
      return listDocs("publicStations", v2.PublicStationSchema);
    },

    async listMembers(stationId) {
      return listDocs(`stations/${stationId}/members`, v2.StationMemberSchema);
    },
    async addMember(stationId, uid, role) {
      const member = validate(
        v2.StationMemberSchema,
        { uid, role, addedBy: requireUid(), addedAt: now() },
        "member",
      );
      createDoc(`stations/${stationId}/members/${uid}`, member);
    },
    async changeMemberRole(stationId, uid, role) {
      validate(v2.MemberRoleSchema, role, "role");
      updateDocFields(`stations/${stationId}/members/${uid}`, { role });
    },
    async removeMember(stationId, uid) {
      store.docs.delete(`stations/${stationId}/members/${uid}`);
    },
    async leaveStation(stationId) {
      store.docs.delete(`stations/${stationId}/members/${requireUid()}`);
    },
    async transferOwnership(stationId, toUid) {
      const me = requireUid();
      const station = getDocOrNull(`stations/${stationId}`, v2.StationSchema);
      if (station === null) throw new DataProviderError("not-found");
      if (station.ownerUid !== me) throw new DataProviderError("permission-denied");
      if (toUid === me) fail("The recipient already owns the station.");
      const id = newTransferId(stationId);
      const at = now();
      createDoc(`ownershipTransfers/${id}`, {
        schemaVersion: 2,
        id,
        stationId,
        from: me,
        to: toUid,
        createdAt: at,
      });
      updateDocFields(`stations/${stationId}`, { ownerUid: toUid, transferId: id, updatedAt: at });
      return id;
    },
    async claimStationMirror() {
      requireUid();
    },
    async getTransfer(id) {
      return getDocOrNull(`ownershipTransfers/${id}`, v2.OwnershipTransferSchema);
    },

    async createDevice(input) {
      const d = validate(v2.DeviceSchema, input, "device");
      createDoc(`devices/${d.id}`, d);
    },
    async getDevice(id) {
      return getDocOrNull(`devices/${id}`, v2.DeviceSchema);
    },
    async listDevices(stationId) {
      const r = listDocs("devices", v2.DeviceSchema);
      return { ...r, items: r.items.filter((d) => d.stationId === stationId) };
    },
    async updateDevice(deviceId, patch) {
      const schema = v2.DeviceSchema.pick({
        label: true,
        serial: true,
        geometry: true,
        saturation: true,
        status: true,
      }).partial();
      const valid = validate(schema, patch, "device update");
      const defined = Object.fromEntries(Object.entries(valid).filter(([, v]) => v !== undefined));
      if (Object.keys(defined).length === 0) return;
      updateDocFields(`devices/${deviceId}`, defined);
    },
    async publishDeviceType(input) {
      const t = validate(v2.DeviceTypeSchema, input, "device type");
      const current = getDocOrNull(`deviceTypes/${t.id}`, v2.DeviceTypeSchema);
      if (store.docs.has(`deviceTypes/${t.id}/versions/${t.version}`)) {
        throw new DataProviderError("already-exists");
      }
      if (current !== null && current.version > t.version) throw new DataProviderError("conflict");
      store.docs.set(`deviceTypes/${t.id}/versions/${t.version}`, clone(t));
      store.docs.set(`deviceTypes/${t.id}`, clone(t));
    },
    async getDeviceType(id, version) {
      return getDocOrNull(
        version === undefined ? `deviceTypes/${id}` : `deviceTypes/${id}/versions/${version}`,
        v2.DeviceTypeSchema,
      );
    },
    async listDeviceTypes() {
      return listDocs("deviceTypes", v2.DeviceTypeSchema);
    },
    async addCalibration(input) {
      const c = validate(v2.CalibrationSchema, input, "calibration");
      createDoc(`devices/${c.deviceId}/calibrations/${c.version}`, c);
    },
    async listCalibrations(deviceId) {
      const r = listDocs(`devices/${deviceId}/calibrations`, v2.CalibrationSchema);
      return { ...r, items: r.items.sort((a, b) => a.version - b.version) };
    },
    async getAssembly(stationId) {
      return getDocOrNull(`assemblies/${stationId}`, v2.AssemblySchema);
    },
    async putAssembly(input) {
      const a = validate(v2.AssemblySchema, input, "assembly");
      store.docs.set(`assemblies/${a.stationId}`, clone(a));
    },

    async createStream(input) {
      const s = validate(v2.StreamSchema, input, "stream");
      createDoc(`streams/${s.id}`, s);
    },
    async getStream(id) {
      return getDocOrNull(`streams/${id}`, v2.StreamSchema);
    },
    async listStreams(stationId) {
      const r = listDocs("streams", v2.StreamSchema);
      return { ...r, items: r.items.filter((s) => s.stationId === stationId) };
    },
    async setStreamStatus(streamId, status) {
      if (status !== "active" && status !== "stopped") fail("Invalid stream status.");
      updateDocFields(`streams/${streamId}`, { status });
    },
    async startSession(input) {
      const s = validate(v2.SessionSchema, input, "session");
      createDoc(`streams/${s.streamId}/sessions/${s.id}`, s);
    },
    async updateSessionCounters(streamId, sessionId, counters) {
      const path = `streams/${streamId}/sessions/${sessionId}`;
      const valid = validate(v2.SessionCountersSchema, counters, "session counters");
      const current = getDocOrNull(path, v2.SessionSchema);
      if (current === null) throw new DataProviderError("not-found");
      if (current.endedAt !== undefined) throw new DataProviderError("conflict");
      updateDocFields(path, { counters: valid });
    },
    async endSession(streamId, sessionId, end) {
      const path = `streams/${streamId}/sessions/${sessionId}`;
      const current = getDocOrNull(path, v2.SessionSchema);
      if (current === null) throw new DataProviderError("not-found");
      if (current.endedAt !== undefined) throw new DataProviderError("conflict");
      const closed = validate(v2.SessionSchema, { ...current, ...end }, "session end");
      store.docs.set(path, clone(closed));
    },
    async listSessions(streamId, opts) {
      const n = opts?.limit ?? 50;
      if (!Number.isInteger(n) || n < 1 || n > 500) fail("Invalid session limit.");
      const r = listDocs(`streams/${streamId}/sessions`, v2.SessionSchema);
      return { ...r, items: r.items.sort((a, b) => b.startedAt - a.startedAt).slice(0, n) };
    },

    async writeMinutes(streamId, records) {
      const prepared = records.map((r) => ({ ts: r.ts, ...v2.serializeMinute(r) }));
      if (new Set(prepared.map((p) => p.key)).size !== prepared.length)
        fail("Two records share the same minute.");
      if (prepared.length === 0) return { written: 0, alreadyExisted: [], existing: [] };
      const result = await writeMinutesChunked(prepared, {
        async readExisting(firstKey, lastKey) {
          const found = new Map<string, string | null>();
          for (const [k, v] of rtOf(`minutes/${streamId}`)) {
            if (k < firstKey || k > lastKey) continue;
            const s = (v as { s?: unknown } | null)?.s;
            found.set(k, typeof s === "string" ? s : null);
          }
          return found;
        },
        async writeChunk(entries) {
          store.beforeMinuteWrite?.(
            streamId,
            entries.map((e) => e.key),
          );
          store.checkFault("writeMinutes.chunk");
          // The real rules deny an overwrite; so does this.
          if (entries.some((e) => store.rtdb.has(`minutes/${streamId}/${e.key}`))) {
            throw new DataProviderError("permission-denied");
          }
          for (const e of entries) store.rtdb.set(`minutes/${streamId}/${e.key}`, clone(e.value));
        },
      });
      store.notify();
      return result;
    },
    async readMinutes(streamId, query): Promise<Page<v2.MinuteRecord>> {
      const plan = planMinuteRange(query);
      const entries = rtOf(`minutes/${streamId}`).filter(([k]) =>
        plan.startExclusive ? k > plan.startKey : k >= plan.startKey,
      );
      return buildMinutePage(
        entries.filter(([k]) => k < plan.endKey).slice(0, plan.fetchLimit),
        plan,
      );
    },

    async putDaySummary(input) {
      const s = validate(v2.DaySummarySchema, input, "day summary");
      store.docs.set(`streams/${s.streamId}/days/${s.day}`, clone(s));
    },
    async getDaySummary(streamId, day) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail("Day must be YYYY-MM-DD.");
      return getDocOrNull(`streams/${streamId}/days/${day}`, v2.DaySummarySchema);
    },
    async listDaySummaries(streamId, fromDay, toDay, opts) {
      const day = /^\d{4}-\d{2}-\d{2}$/;
      if (!day.test(fromDay) || !day.test(toDay) || toDay < fromDay) {
        fail("Day range must be YYYY-MM-DD with fromDay <= toDay.");
      }
      const n = opts?.limit ?? 400;
      if (!Number.isInteger(n) || n < 1 || n > 1000) fail("Invalid page size.");
      const cursor = opts?.cursor ?? null;
      if (cursor !== null && !day.test(cursor)) fail("Invalid pagination cursor.");
      const rows = children(`streams/${streamId}/days`)
        .filter(([id]) => id >= fromDay && id <= toDay && (cursor === null || id > cursor))
        .sort(([a], [b]) => (a < b ? -1 : 1));
      const taken = rows.slice(0, n);
      const parsed = parseEntries(taken, (key, value) => {
        const s = v2.DaySummarySchema.parse(value);
        if (s.day !== key || s.streamId !== streamId)
          throw new Error("summary does not match its path");
        return s;
      });
      const last = taken[taken.length - 1];
      return { ...parsed, nextCursor: rows.length > n && last !== undefined ? last[0] : null };
    },

    async pushLiveEvents(streamId, events) {
      const entries = events.map((e) => {
        const value = toLiveValue(validate(v2.LiveEventSchema, e, "live event"));
        return [liveKey(value.t, nextNonce()), value] as const;
      });
      for (const part of chunk(entries, LIVE_BATCH_SIZE)) {
        for (const [k, v] of part) store.rtdb.set(`live/${streamId}/events/${k}`, clone(v));
      }
      store.notify();
      return { pushed: entries.length };
    },
    async pruneLive(streamId, requestedNowMs = now()): Promise<PruneResult> {
      if (!Number.isFinite(requestedNowMs)) fail("nowMs must be a finite number.");
      const nowMs = Math.min(requestedNowMs, now() + MAX_CLOCK_SKEW_MS);
      const end = pruneEndKey(nowMs);
      const expired = rtOf(`live/${streamId}/events`).filter(([k]) => k < end);
      const { remove, skipped } = selectPrunable(expired, nowMs);
      for (const k of remove) store.rtdb.delete(`live/${streamId}/events/${k}`);
      return { removed: remove.length, skipped };
    },
    subscribeLive(streamId, handlers) {
      const seen = new Set<string>();
      const prefix = `live/${streamId}/events`;
      const startKey = windowStartKey(now());
      const deliver = (): void => {
        for (const [key, value] of rtOf(prefix)) {
          if (key < startKey || seen.has(key)) continue;
          seen.add(key);
          let event: v2.LiveEvent;
          try {
            event = fromLiveValue(value);
          } catch (error) {
            handlers.onInvalid({ key, reason: describeFailure(error) });
            continue;
          }
          handlers.onData(event);
        }
      };
      deliver();
      return store.subscribe(deliver);
    },

    async setStatus(streamId, status, opts) {
      const s = validate(v2.StreamStatusSchema, status, "status");
      store.rtdb.set(`status/${streamId}`, clone(s));
      if (opts?.publish === true) {
        store.rtdb.set(`statusPublic/${streamId}`, {
          lastSeenAt: s.lastSeenAt,
          agentOnline: s.agentOnline,
        });
      }
      store.notify();
    },
    async getStatus(streamId) {
      return store.rtdb.has(`status/${streamId}`)
        ? parseStored(v2.StreamStatusSchema, store.rtdb.get(`status/${streamId}`))
        : null;
    },
    subscribeStatus: (streamId, handlers) =>
      statusWatcher(`status/${streamId}`, v2.StreamStatusSchema)(handlers),
    async getStatusPublic(streamId) {
      return store.rtdb.has(`statusPublic/${streamId}`)
        ? parseStored(v2.StreamStatusPublicSchema, store.rtdb.get(`statusPublic/${streamId}`))
        : null;
    },
    subscribeStatusPublic: (streamId, handlers) =>
      statusWatcher(`statusPublic/${streamId}`, v2.StreamStatusPublicSchema)(handlers),

    async close() {
      authListeners.clear();
    },
  };
  // Failure injection: every async method first consults the store's armed faults.
  const passthrough = new Set(["currentUser", "onAuthChange", "close"]);
  for (const [name, fn] of Object.entries(provider)) {
    if (passthrough.has(name) || name.startsWith("subscribe")) continue;
    const original = fn as (...args: unknown[]) => Promise<unknown>;
    (provider as unknown as Record<string, unknown>)[name] = async (...args: unknown[]) => {
      store.checkFault(name);
      return original(...args);
    };
  }
  return provider;
}
