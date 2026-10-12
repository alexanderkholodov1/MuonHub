/**
 * Restoring a Firebase Auth session from a refresh token in Node.js (spec 0087 FR11).
 *
 * The modular `firebase/auth` API has no "sign in with refresh token" call, and the public
 * `Persistence` type is opaque (https://firebase.google.com/docs/reference/js/auth.persistence).
 * What the SDK does document is:
 *  - `initializeAuth(app, { persistence })` — the SDK saves the signed-in user to the persistence
 *    it is given and reloads it on start (https://firebase.google.com/docs/reference/js/auth.md#initializeauth_fa0bf4a),
 *    with a custom implementation being exactly how React Native supplies AsyncStorage
 *    (`getReactNativePersistence`); and
 *  - `User.refreshToken` (https://firebase.google.com/docs/reference/js/auth.user), the public
 *    way to read the token after sign-in.
 *  - The Secure Token REST endpoint that exchanges a refresh token for an ID token, with its error
 *    codes TOKEN_EXPIRED / USER_DISABLED / USER_NOT_FOUND / INVALID_REFRESH_TOKEN:
 *    https://docs.cloud.google.com/identity-platform/docs/use-rest-api (section "Exchange a
 *    refresh token for an ID token") and https://firebase.google.com/docs/reference/rest/auth.
 *
 * So: the agent exports `currentUser.refreshToken`; to restore, the token is first exchanged at
 * the documented REST endpoint (validating it, learning the uid, mapping revocation to
 * `unauthenticated`), then handed to the SDK through a custom in-memory `Persistence` — the same
 * mechanism the SDK uses when it reloads a persisted user — so Firestore and Realtime Database
 * keep using the SDK's own token management. The persisted user's shape and the `_`-prefixed
 * persistence methods are SDK internals (as for React Native), so the Firebase version is pinned
 * and the emulator test exercises the whole path.
 */
import { DataProviderError } from "./errors.js";

type Listener = () => void | Promise<void>;

/** What the SDK stores for the signed-in user (only the fields it needs to rebuild the user). */
export interface PersistedUserBlob {
  uid: string;
  email?: string;
  emailVerified: boolean;
  isAnonymous: boolean;
  providerData: unknown[];
  stsTokenManager: { refreshToken: string; accessToken: string; expirationTime: number };
  apiKey: string;
  appName: string;
}

export interface RestorablePersistence {
  /** Pass to `initializeAuth(app, { persistence })`. */
  readonly persistence: new () => object;
  /** Puts a user in the store and tells the SDK, which then signs that user in. */
  seed(blob: PersistedUserBlob): Promise<void>;
}

/** An in-memory `Persistence` whose stored user can be replaced from outside. */
export function createRestorablePersistence(): RestorablePersistence {
  const storage = new Map<string, unknown>();
  const listeners = new Map<string, Set<Listener>>();
  let userKey: string | null = null;

  class RestorableMemoryPersistence {
    static readonly type = "NONE";
    readonly type = "NONE";
    _isAvailable(): Promise<boolean> {
      return Promise.resolve(true);
    }
    _set(key: string, value: unknown): Promise<void> {
      storage.set(key, value);
      return Promise.resolve();
    }
    _get(key: string): Promise<unknown> {
      return Promise.resolve(storage.get(key) ?? null);
    }
    _remove(key: string): Promise<void> {
      storage.delete(key);
      return Promise.resolve();
    }
    _addListener(key: string, listener: Listener): void {
      if (key.startsWith("firebase:authUser:")) userKey = key;
      const set = listeners.get(key) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(key, set);
    }
    _removeListener(key: string, listener: Listener): void {
      listeners.get(key)?.delete(listener);
    }
  }

  return {
    persistence: RestorableMemoryPersistence,
    async seed(blob) {
      if (userKey === null) {
        throw new DataProviderError("internal", {
          message: "The authentication SDK has not finished starting.",
        });
      }
      storage.set(userKey, blob);
      for (const l of [...(listeners.get(userKey) ?? [])]) await l();
    },
  };
}

export interface RefreshedToken {
  idToken: string;
  refreshToken: string;
  uid: string;
  expiresInSec: number;
}

const REVOKED = new Set([
  "TOKEN_EXPIRED",
  "USER_DISABLED",
  "USER_NOT_FOUND",
  "INVALID_REFRESH_TOKEN",
  "MISSING_REFRESH_TOKEN",
  "INVALID_GRANT_TYPE",
  "PROJECT_NUMBER_MISMATCH",
]);

/**
 * Exchanges a refresh token at the Secure Token endpoint. `authEmulatorUrl` (e.g.
 * `http://127.0.0.1:9099`) targets the Auth emulator. Revoked, expired, disabled or deleted
 * accounts fail with `unauthenticated`; an unreachable service with `unavailable`.
 */
export async function exchangeRefreshToken(
  apiKey: string,
  refreshToken: string,
  authEmulatorUrl?: string,
): Promise<RefreshedToken> {
  const base =
    authEmulatorUrl === undefined
      ? "https://securetoken.googleapis.com"
      : `${authEmulatorUrl.replace(/\/+$/, "")}/securetoken.googleapis.com`;
  let response: Response;
  try {
    response = await fetch(`${base}/v1/token?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    });
  } catch (cause) {
    throw new DataProviderError("unavailable", { cause });
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new DataProviderError(response.status >= 500 ? "unavailable" : "internal", { cause });
  }
  if (!response.ok) {
    const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
    const code = typeof message === "string" ? (/^[A-Z_]+/.exec(message)?.[0] ?? "") : "";
    if (REVOKED.has(code)) throw new DataProviderError("unauthenticated", { cause: message });
    if (response.status === 429) throw new DataProviderError("rate-limited", { cause: message });
    throw new DataProviderError(response.status >= 500 ? "unavailable" : "internal", {
      cause: message,
    });
  }
  const b = body as Record<string, unknown>;
  const idToken = b["id_token"];
  const newRefresh = b["refresh_token"];
  const uid = b["user_id"];
  const expires = Number(b["expires_in"]);
  if (
    typeof idToken !== "string" ||
    typeof newRefresh !== "string" ||
    typeof uid !== "string" ||
    !Number.isFinite(expires)
  ) {
    throw new DataProviderError("internal", { message: "Unexpected token response." });
  }
  return { idToken, refreshToken: newRefresh, uid, expiresInSec: expires };
}

/** The unverified claims of an ID token (only to read the email; the server validates the token). */
export function idTokenClaims(idToken: string): { email?: string; emailVerified: boolean } {
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString(),
    ) as {
      email?: unknown;
      email_verified?: unknown;
    };
    return {
      ...(typeof payload.email === "string" ? { email: payload.email } : {}),
      emailVerified: payload.email_verified === true,
    };
  } catch {
    return { emailVerified: false };
  }
}
