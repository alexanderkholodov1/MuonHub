import type { MinuteRecord } from "@muonhub/shared";

/**
 * Canonical Firebase RTDB storage shape for minute records.
 *
 * The minute timestamp is not stored in the value: it is the zero-padded RTDB
 * node key at `minutes/{ts}`. Derived fields (`ecDt`, `ecCorr`, `flux`) and
 * legacy extras such as `ts_iso` are never persisted; consumers recompute them
 * from the canonical raw observables via `@muonhub/physics`.
 */
export const CANONICAL_SLIM_MINUTE_RECORD_FIELDS = [
  "ec",
  "cc",
  "sm",
  "sx",
  "sn",
  "tp",
  "pr",
  "dt",
] as const;

export const CANONICAL_SLIM_MINUTE_RECORD_RULES = {
  timestamp: "ts-is-the-zero-padded-rtdb-node-key",
  derivedFields: "never-stored-recomputed-on-read",
  legacyExtras: "never-stored",
} as const;

export type CanonicalSlimMinuteRecordField =
  (typeof CANONICAL_SLIM_MINUTE_RECORD_FIELDS)[number];

export type CanonicalSlimMinuteRecord = Pick<
  MinuteRecord,
  CanonicalSlimMinuteRecordField
>;

export function toCanonicalSlimMinuteRecord(
  record: MinuteRecord,
): CanonicalSlimMinuteRecord {
  return {
    ec: record.ec,
    cc: record.cc,
    sm: record.sm,
    sx: record.sx,
    sn: record.sn,
    tp: record.tp,
    pr: record.pr,
    dt: record.dt,
  };
}
