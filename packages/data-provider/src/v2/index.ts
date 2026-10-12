/**
 * Data layer v2 (specs 0083 and 0084). Exported from the package as the `v2` namespace.
 */
export type {
  AuthApi,
  AuthUser,
  DataProviderV2,
  DaySummariesApi,
  DeviceMetadataPatch,
  DevicesApi,
  IdentityApi,
  LiveApi,
  MinutesApi,
  PruneResult,
  SessionEnd,
  StationMetadataPatch,
  StationOwnerPatch,
  StationsApi,
  StatusApi,
  StreamsApi,
  SubscriptionHandlers,
  Unsubscribe,
  WriteMinutesResult,
} from "./interface.js";
export { DataProviderError, mapError, guard } from "./errors.js";
export type { DataErrorCode } from "./errors.js";
export type { ListResult, Page, Quarantine, QuarantineEntry } from "./quarantine.js";
export { QUARANTINE_SAMPLE_LIMIT } from "./quarantine.js";
export {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  iteratePages,
  type MinuteRangeQuery,
} from "./pagination.js";
export { LIVE_RETENTION_MS } from "./live-window.js";
export { buildPublicStation, buildStationAccess, newStreamId } from "./public-station.js";
export { createFirebaseProviderV2 } from "./firebase-provider.js";
export type { FirebaseV2Config, HostPort } from "./firebase-provider.js";
export { createMemoryProviderV2, MemoryStore } from "./memory-provider.js";
export type { MemoryProviderOptions } from "./memory-provider.js";
