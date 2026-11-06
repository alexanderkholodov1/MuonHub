/**
 * Safe, translated messages for data-layer failures (spec 0088 FR4, ADR-009). Raw backend text is
 * never shown; unknown errors become a generic message and are logged for developers.
 */
import { v2 as dp } from "@muonhub/data-provider";
import { t, type MessageKey } from "@/i18n/t";

const BY_CODE: Record<dp.DataErrorCode, MessageKey> = {
  "permission-denied": "error.permissionDenied",
  unauthenticated: "error.unauthenticated",
  "invalid-credentials": "error.invalidCredentials",
  "not-found": "error.notFound",
  "already-exists": "error.alreadyExists",
  "invalid-argument": "error.invalidArgument",
  "invalid-data": "error.generic",
  conflict: "error.conflict",
  "rate-limited": "error.rateLimited",
  unavailable: "error.unavailable",
  "outcome-unknown": "error.outcomeUnknown",
  internal: "error.generic",
};

export function errorMessage(error: unknown): string {
  if (error instanceof dp.DataProviderError) return t(BY_CODE[error.code]);
  console.error("Unexpected error", error);
  return t("error.generic");
}
