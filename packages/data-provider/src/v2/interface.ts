/**
 * DataProviderV2 — the v2 data layer contract (specs 0083 and 0084), split by responsibility.
 *
 * Rules every implementation follows:
 * - create and metadata-update are separate operations (a create never overwrites; an update never
 *   changes immutable fields);
 * - minutes are write-once; a minute that already exists is reported, never replaced;
 * - invalid stored records come back as quarantine counts, never silently dropped;
 * - every failure is a {@link DataProviderError}; nothing is swallowed;
 * - there is no Cloud Storage API (ADR-005).
 */
import type { v2 } from "@muonhub/shared";
import type { ListResult, Page } from "./quarantine.js";
import type { MinuteRangeQuery } from "./pagination.js";

export type Unsubscribe = () => void;

/** Subscription handlers: data, plus an error channel and an invalid-record channel. */
export interface SubscriptionHandlers<T> {
  onData(value: T): void;
  /** Called when the subscription fails (e.g. permission denied); it is then dead. */
  onError(error: Error): void;
  /** Called for a stored record that failed validation (quarantined, not delivered). */
  onInvalid(entry: { key: string; reason: string }): void;
}

// ── Auth and identity ──────────────────────────────────────────────────────────────────────────

export interface AuthUser {
  uid: string;
  email: string | null;
}

export interface AuthApi {
  currentUser(): AuthUser | null;
  onAuthChange(handlers: {
    onChange(user: AuthUser | null): void;
    onError(error: Error): void;
  }): Unsubscribe;
  signInWithEmail(email: string, password: string): Promise<AuthUser>;
  createAccount(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
}

export interface IdentityApi {
  /** Creates `users/{uid}` and claims `usernames/{username}` in one atomic write. */
  createUserProfile(user: v2.User): Promise<void>;
  getUser(uid: string): Promise<v2.User | null>;
  updateDisplayName(uid: string, displayName: string): Promise<void>;
  /** Resolves a username to its owner (for sharing by username). */
  findUidByUsername(username: string): Promise<string | null>;
}

// ── Stations, members, transfers ───────────────────────────────────────────────────────────────

/** Fields of a station that owners and editors may change. */
export interface StationMetadataPatch {
  name?: string;
  timezone?: string;
  institutionId?: string;
}

/** Fields only the owner may change (spec 0084 FR7, FR13). */
export interface StationOwnerPatch extends StationMetadataPatch {
  location?: v2.StationLocation;
  publicPrecision?: v2.PublicPrecision;
  visibility?: v2.Visibility;
}

export interface StationsApi {
  /**
   * Creates a station: mirror first, then station (+ projection when public). Fails with
   * `already-exists` when the id is taken.
   */
  createStation(station: v2.Station): Promise<void>;
  getStation(stationId: string): Promise<v2.Station | null>;
  /** Stations owned by the signed-in user. */
  listMyStations(): Promise<ListResult<v2.Station>>;
  /** Stations the signed-in user belongs to as editor or viewer. */
  listSharedWithMe(): Promise<ListResult<{ station: v2.Station; role: v2.MemberRole }>>;
  /**
   * Updates station fields. The projection and the access mirror are updated in the same
   * operation when the change affects them (mirror first when rights shrink).
   */
  updateStation(stationId: string, patch: StationOwnerPatch): Promise<void>;
  /** Recomputes the public projection (device count, active flag); owner only. */
  refreshPublicProjection(stationId: string): Promise<void>;
  listPublicStations(): Promise<ListResult<v2.PublicStation>>;

  listMembers(stationId: string): Promise<ListResult<v2.StationMember>>;
  addMember(stationId: string, uid: string, role: v2.MemberRole): Promise<void>;
  changeMemberRole(stationId: string, uid: string, role: v2.MemberRole): Promise<void>;
  removeMember(stationId: string, uid: string): Promise<void>;
  /**
   * The signed-in member leaves. Only Firestore can be changed by a member; the owner's next
   * membership update refreshes the mirror (documented limitation of spec 0084 FR15).
   */
  leaveStation(stationId: string): Promise<void>;

  /**
   * Transfers ownership: sets `pendingOwner` in the mirror, then writes the immutable transfer
   * record and the station update in one atomic write. Returns the transfer id. The recipient then
   * calls {@link claimStationMirror}.
   */
  transferOwnership(stationId: string, toUid: string): Promise<string>;
  /** The new owner takes over the RTDB mirror after a transfer. */
  claimStationMirror(stationId: string): Promise<void>;
  getTransfer(transferId: string): Promise<v2.OwnershipTransfer | null>;
}

// ── Devices, device types, calibrations ────────────────────────────────────────────────────────

export interface DeviceMetadataPatch {
  label?: string;
  serial?: string;
  geometry?: v2.Geometry;
  saturation?: { value: number; unit: v2.AmplitudeUnit };
  status?: v2.Device["status"];
}

export interface DevicesApi {
  createDevice(device: v2.Device): Promise<void>;
  getDevice(deviceId: string): Promise<v2.Device | null>;
  listDevices(stationId: string): Promise<ListResult<v2.Device>>;
  updateDevice(deviceId: string, patch: DeviceMetadataPatch): Promise<void>;

  /** Publishes a device type version (create-only) and moves the current pointer to it. */
  publishDeviceType(deviceType: v2.DeviceType): Promise<void>;
  getDeviceType(id: string, version?: number): Promise<v2.DeviceType | null>;
  listDeviceTypes(): Promise<ListResult<v2.DeviceType>>;

  /** Calibrations are append-only: a new version is a new document. */
  addCalibration(calibration: v2.Calibration): Promise<void>;
  listCalibrations(deviceId: string): Promise<ListResult<v2.Calibration>>;

  getAssembly(stationId: string): Promise<v2.Assembly | null>;
  putAssembly(assembly: v2.Assembly): Promise<void>;
}

// ── Streams and sessions ───────────────────────────────────────────────────────────────────────

export interface SessionEnd {
  endedAt: number;
  endReason: v2.EndReason;
  counters?: v2.SessionCounters;
}

export interface StreamsApi {
  /** Mirror (`streamStation`) first, then the stream document. */
  createStream(stream: v2.Stream): Promise<void>;
  getStream(streamId: string): Promise<v2.Stream | null>;
  listStreams(stationId: string): Promise<ListResult<v2.Stream>>;
  setStreamStatus(streamId: string, status: v2.Stream["status"]): Promise<void>;

  startSession(session: v2.Session): Promise<void>;
  /** Updates the counters of an open session; counters only grow (spec 0084 FR11). */
  updateSessionCounters(
    streamId: string,
    sessionId: string,
    counters: v2.SessionCounters,
  ): Promise<void>;
  /** Closes a session once; fails with `conflict` if it is already closed. */
  endSession(streamId: string, sessionId: string, end: SessionEnd): Promise<void>;
  /** Newest first. */
  listSessions(streamId: string, options?: { limit?: number }): Promise<ListResult<v2.Session>>;
}

// ── Minutes, day summaries ─────────────────────────────────────────────────────────────────────

export interface WriteMinutesResult {
  written: number;
  /** Timestamps that already existed; they were left untouched (write-once). */
  alreadyExisted: number[];
}

export interface MinutesApi {
  /** Write-once. Existing minutes are reported in `alreadyExisted`, never overwritten. */
  writeMinutes(streamId: string, records: readonly v2.MinuteRecord[]): Promise<WriteMinutesResult>;
  /** Cursor-paginated range read, `fromTs` inclusive and `toTs` exclusive, oldest first. */
  readMinutes(streamId: string, query: MinuteRangeQuery): Promise<Page<v2.MinuteRecord>>;
}

export interface DaySummariesApi {
  /** Replaces the summary of one stream-day (it is recomputed from minutes as they arrive). */
  putDaySummary(summary: v2.DaySummary): Promise<void>;
  /** Throws `invalid-data` if the stored document does not validate. */
  getDaySummary(streamId: string, day: string): Promise<v2.DaySummary | null>;
  /** Days `fromDay`..`toDay` inclusive (`YYYY-MM-DD`), oldest first; days with no data are absent. */
  listDaySummaries(
    streamId: string,
    fromDay: string,
    toDay: string,
    options?: { limit?: number; cursor?: string | null },
  ): Promise<Page<v2.DaySummary>>;
}

// ── Live window and status ─────────────────────────────────────────────────────────────────────

export interface PruneResult {
  removed: number;
  /** Expired-looking entries that were not ours and were left alone. */
  skipped: number;
}

export interface LiveApi {
  /** Batched push with unique, time-ordered keys. */
  pushLiveEvents(streamId: string, events: readonly v2.LiveEvent[]): Promise<{ pushed: number }>;
  /** Deletes entries older than the retention window, downloading only the expired ones. */
  pruneLive(streamId: string, nowMs?: number): Promise<PruneResult>;
  /** Delivers the current window once, then only new events. */
  subscribeLive(streamId: string, handlers: SubscriptionHandlers<v2.LiveEvent>): Unsubscribe;
}

export interface StatusApi {
  /** Writes `status/{streamId}`; with `publish: true` also `statusPublic/{streamId}` atomically. */
  setStatus(
    streamId: string,
    status: v2.StreamStatus,
    options?: { publish?: boolean },
  ): Promise<void>;
  getStatus(streamId: string): Promise<v2.StreamStatus | null>;
  subscribeStatus(
    streamId: string,
    handlers: SubscriptionHandlers<v2.StreamStatus | null>,
  ): Unsubscribe;
  getStatusPublic(streamId: string): Promise<v2.StreamStatusPublic | null>;
  subscribeStatusPublic(
    streamId: string,
    handlers: SubscriptionHandlers<v2.StreamStatusPublic | null>,
  ): Unsubscribe;
}

export interface DataProviderV2
  extends
    AuthApi,
    IdentityApi,
    StationsApi,
    DevicesApi,
    StreamsApi,
    MinutesApi,
    DaySummariesApi,
    LiveApi,
    StatusApi {
  /** Releases connections. */
  close(): Promise<void>;
}
