/**
 * Supporting types for the {@link DataProvider} interface.
 * Entity types come from `@muonhub/shared`; these are the query/streaming shapes around them.
 */
import type {
  Station,
  Detector,
  Institution,
  Session,
  MinuteRecord,
  RealtimeRecord,
  Visibility,
} from "@muonhub/shared";

/** Inclusive time window in epoch milliseconds (UTC). */
export interface TimeRange {
  fromTs: number;
  toTs: number;
}

/** Deterministic object-storage pointer for one compressed signal interval. */
export interface SignalBlobRef {
  detectorId: string;
  sessionId: string;
  intervalStartTs: number;
}

/** Optional filter for listing stations (e.g. the public map, an institution view). */
export interface StationFilter {
  visibility?: Visibility;
  institutionId?: string | null;
  ownerUid?: string;
  country?: string;
  /** Geographic bounding box: [west, south, east, north] in decimal degrees. */
  bbox?: [number, number, number, number];
}

/** Cancels a realtime subscription. Idempotent. */
export type Unsubscribe = () => void;

/** Invoked for each realtime event as it arrives. */
export type RealtimeCallback = (record: RealtimeRecord) => void;

/** Stable auth error codes exposed by DataProvider implementations. */
export type AuthErrorCode =
  | "auth/email-already-in-use"
  | "auth/invalid-credential"
  | "auth/invalid-email"
  | "auth/network-request-failed"
  | "auth/operation-not-allowed"
  | "auth/persistence-unavailable"
  | "auth/requires-recent-login"
  | "auth/too-many-requests"
  | "auth/unsupported"
  | "auth/user-disabled"
  | "auth/user-record-not-found"
  | "auth/weak-password"
  | "auth/internal";

/**
 * Error type for authentication failures crossing the DataProvider boundary.
 * Backend-specific error objects never leave their provider package.
 */
export class AuthProviderError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthProviderError";
    this.code = code;
  }
}

/** Options controlling a streaming export (used by the admin migration tool, S07). */
export interface ExportOptions {
  /** Limit to specific detectors; omit for everything visible to the caller. */
  detectorIds?: string[];
  /** Include the short-lived realtime window (usually false for migrations). */
  includeRealtime?: boolean;
  /** Only export minute records at or after this epoch-ms timestamp. */
  sinceTs?: number;
}

/**
 * A single unit of a streaming export/import. A tagged union so a provider can emit (and another
 * can ingest) an arbitrarily large dataset without holding it all in memory.
 */
export type DataChunk =
  | { kind: "institution"; data: Institution }
  | { kind: "station"; data: Station }
  | { kind: "detector"; data: Detector }
  | { kind: "session"; detectorId: string; data: Session }
  | { kind: "minute"; detectorId: string; data: MinuteRecord }
  | { kind: "realtime"; detectorId: string; data: RealtimeRecord };

/** Outcome of an import run (idempotent, resumable by natural key). */
export interface ImportReport {
  imported: number;
  /** Records rejected by schema validation and set aside for inspection. */
  quarantined: number;
  /** Stations imported without full v6 metadata (flagged for the user to complete). */
  stationsWithoutMetadata: number;
  errors: string[];
}
