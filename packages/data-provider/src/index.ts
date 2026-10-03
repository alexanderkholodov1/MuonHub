/**
 * @muonhub/data-provider
 *
 * Provider-agnostic data access layer (keystone, D4). Exposes the {@link DataProvider} interface
 * and its supporting types, plus the concrete `FirebaseProvider` (Phase A over muonhub).
 * Implementations live behind this contract; nothing outside this package imports a backend SDK.
 */
export type { DataProvider } from "./provider.js";
export type {
  TimeRange,
  SignalBlobRef,
  StationFilter,
  Unsubscribe,
  RealtimeCallback,
  AuthErrorCode,
  ExportOptions,
  DataChunk,
  ImportReport,
} from "./types.js";
export { AuthProviderError } from "./types.js";

// ── Phase A: concrete FirebaseProvider over the muonhub Realtime Database ──────────────────────
export { createFirebaseProvider, REALTIME_CAP } from "./firebase-provider.js";
export type {
  FirebaseProviderConfig,
  FirebaseClientConfig,
  FirebaseAdminConfig,
} from "./firebase-provider.js";

export {
  CANONICAL_SLIM_MINUTE_RECORD_FIELDS,
  CANONICAL_SLIM_MINUTE_RECORD_RULES,
  toCanonicalSlimMinuteRecord,
} from "./slim-minute-record.js";
export type {
  CanonicalSlimMinuteRecord,
  CanonicalSlimMinuteRecordField,
} from "./slim-minute-record.js";
