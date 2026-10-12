/**
 * Error model of the v2 data layer. Every failure surfaces as a {@link DataProviderError} with a
 * stable code; the original error is kept as `cause` and its text is never shown to users
 * (safe error messages, ADR-009).
 */

export type DataErrorCode =
  | "permission-denied"
  | "unauthenticated"
  | "invalid-credentials"
  | "not-found"
  | "already-exists"
  | "invalid-argument"
  | "invalid-data"
  | "conflict"
  | "rate-limited"
  | "unavailable"
  | "outcome-unknown"
  | "internal";

const SAFE_MESSAGES: Record<DataErrorCode, string> = {
  "permission-denied": "You do not have permission to do this.",
  unauthenticated: "You must sign in first.",
  "invalid-credentials": "The email or password is not correct.",
  "not-found": "The requested item does not exist.",
  "already-exists": "That item already exists.",
  "invalid-argument": "The request is not valid.",
  "invalid-data": "Stored data does not match the expected format.",
  conflict: "The item was changed by someone else; reload and try again.",
  "rate-limited": "Too many attempts; try again later.",
  unavailable: "The service is unreachable; check the connection and try again.",
  "outcome-unknown":
    "The service did not answer in time; the operation may or may not have been applied.",
  internal: "Unexpected error.",
};

/**
 * Progress of an operation that failed half-way (minute writes, live pruning), so callers can
 * resume instead of guessing. Timestamps are UTC ms.
 */
export interface PartialProgress {
  /** Minute timestamps known to be stored by this call. */
  writtenSoFar?: readonly number[];
  /** Minute timestamps not written (or whose outcome is unknown). */
  pending?: readonly number[];
  /** Live entries deleted before the failure. */
  removed?: number;
}

export class DataProviderError extends Error {
  readonly code: DataErrorCode;
  /** Set when a multi-step operation failed after doing part of its work. */
  readonly partial: PartialProgress | undefined;

  constructor(
    code: DataErrorCode,
    options?: { message?: string; cause?: unknown; partial?: PartialProgress },
  ) {
    super(options?.message ?? SAFE_MESSAGES[code], { cause: options?.cause });
    this.name = "DataProviderError";
    this.code = code;
    this.partial = options?.partial;
  }

  /** The same error with progress attached (the cause chain is kept). */
  withPartial(partial: PartialProgress): DataProviderError {
    return new DataProviderError(this.code, {
      message: this.message,
      cause: this.cause ?? this,
      partial,
    });
  }

  /** True when retrying the same operation later can succeed. */
  get retryable(): boolean {
    return this.code === "unavailable" || this.code === "rate-limited";
  }
}

const CODE_TABLE: Record<string, DataErrorCode> = {
  // Firestore (FirebaseError.code)
  "permission-denied": "permission-denied",
  unauthenticated: "unauthenticated",
  "not-found": "not-found",
  "already-exists": "already-exists",
  "invalid-argument": "invalid-argument",
  "failed-precondition": "conflict",
  aborted: "conflict",
  "resource-exhausted": "rate-limited",
  unavailable: "unavailable",
  "deadline-exceeded": "unavailable",
  // Auth
  "auth/invalid-credential": "invalid-credentials",
  "auth/wrong-password": "invalid-credentials",
  "auth/user-not-found": "invalid-credentials",
  "auth/invalid-email": "invalid-argument",
  "auth/weak-password": "invalid-argument",
  "auth/email-already-in-use": "already-exists",
  "auth/too-many-requests": "rate-limited",
  "auth/network-request-failed": "unavailable",
  "auth/user-disabled": "permission-denied",
  "auth/requires-recent-login": "unauthenticated",
  // Realtime Database (code or message prefix)
  PERMISSION_DENIED: "permission-denied",
  "database/permission-denied": "permission-denied",
  DISCONNECTED: "unavailable",
  NETWORK_ERROR: "unavailable",
  UNAVAILABLE: "unavailable",
};

function codeOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      // RTDB reads fail with "Client is offline." when there is no connection.
      if (/client is offline/i.test(message)) return "UNAVAILABLE";
      const prefix = /^([A-Z_]{4,})\b/.exec(message)?.[1];
      if (prefix !== undefined) return prefix;
      if (/permission[ _]denied/i.test(message)) return "PERMISSION_DENIED";
    }
  }
  return undefined;
}

/** Maps any thrown value to a {@link DataProviderError}. Never swallows: the cause is preserved. */
export function mapError(error: unknown): DataProviderError {
  if (error instanceof DataProviderError) return error;
  const code = codeOf(error);
  const mapped = code === undefined ? undefined : CODE_TABLE[code];
  return new DataProviderError(mapped ?? "internal", { cause: error });
}

/** Runs an operation and rethrows every failure as a {@link DataProviderError}. */
export async function guard<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapError(error);
  }
}

export const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Rejects with `outcome-unknown` when `promise` does not settle within `ms`. The underlying
 * operation is NOT cancelled and may still complete, which is exactly why the outcome is unknown:
 * callers must reconcile (re-read) before retrying anything that is not idempotent.
 * `ms <= 0` or `Infinity` disables the deadline.
 */
export function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (!(ms > 0) || !Number.isFinite(ms)) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new DataProviderError("outcome-unknown"));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
