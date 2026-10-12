/**
 * Sign-in and session persistence (spec 0087 FR11). The agent signs in with a MuNRa account — a
 * dedicated per-machine account the station owner adds as an editor. No service-account or admin
 * keys exist on the machine (ADR-009).
 *
 * The password is typed once in the setup wizard and discarded; only the refresh token is stored.
 * The data provider implements `RefreshTokenSupport` (export the token after sign-in, restore from
 * it, detect revocation); when a restore fails the agent keeps recording locally and shows
 * "signed out — data stored locally".
 */
import type { v2 as dp } from "@muonhub/data-provider";
import type { Reporter } from "../reporter.js";
import type { CredentialStore } from "./credentials.js";

type Provider = dp.DataProviderV2;

/** What the provider must offer to persist a session without storing the password. */
export interface RefreshTokenSupport {
  /** The current refresh token (after a successful sign-in), or null when signed out. */
  getRefreshToken(): string | null;
  /** Signs in with a stored refresh token. Rejects when it is revoked or invalid. */
  signInWithRefreshToken(token: string): Promise<dp.AuthUser>;
  /** Forces a token refresh; false when the session is no longer valid (revoked, disabled). */
  checkSession?(): Promise<boolean>;
}

export type AuthState = "signed-in" | "signed-out" | "restoring";

export class AuthManager {
  private state: AuthState = "signed-out";
  private lastError: string | null = null;
  private readonly listeners = new Set<(state: AuthState) => void>();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly provider: Provider,
    private readonly support: RefreshTokenSupport | null,
    private readonly credentials: CredentialStore,
    private readonly reporter: Reporter,
  ) {}

  get current(): AuthState {
    return this.state;
  }

  get userId(): string | null {
    return this.provider.currentUser()?.uid ?? null;
  }

  get error(): string | null {
    return this.lastError;
  }

  /** Subscribes to the provider's auth-state changes (mid-run expiry or revocation). */
  start(): void {
    if (this.unsubscribe !== null) return;
    this.unsubscribe = this.provider.onAuthChange({
      onChange: (user) => {
        if (user === null && this.state === "signed-in") {
          this.reporter.raise("signed-out", "signed out — data stored locally");
        }
        this.set(user === null ? "signed-out" : "signed-in");
        if (user !== null) this.reporter.clear("signed-out");
      },
      onError: (error) => {
        this.lastError = error.message;
        this.reporter.report("error", "auth-listener-error", "auth state listener failed", {
          error: error.message,
        });
      },
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  onChange(fn: (state: AuthState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(next: AuthState): void {
    if (this.state === next) return;
    this.state = next;
    for (const l of [...this.listeners]) l(next);
  }

  isSignedIn(): boolean {
    return this.state === "signed-in" && this.provider.currentUser() !== null;
  }

  /** Restores the session after a restart. Never throws: on failure the agent records locally. */
  async restore(): Promise<"restored" | "none" | "failed"> {
    let token: string | null;
    try {
      token = this.credentials.read();
    } catch (error) {
      this.fail(error);
      return "failed";
    }
    if (token === null) {
      this.reporter.raise("signed-out", "signed out — data stored locally");
      return "none";
    }
    if (this.support === null) {
      this.reporter.raise(
        "signed-out",
        "signed out — data stored locally (this build cannot restore a session from a refresh token)",
      );
      return "failed";
    }
    this.set("restoring");
    try {
      await this.support.signInWithRefreshToken(token);
      this.lastError = null;
      this.set("signed-in");
      this.reporter.clear("signed-out");
      return "restored";
    } catch (error) {
      this.set("signed-out");
      this.fail(error);
      return "failed";
    }
  }

  private fail(error: unknown): void {
    this.lastError = error instanceof Error ? error.message : String(error);
    this.reporter.raise("signed-out", "signed out — data stored locally", {
      reason: this.lastError,
    });
  }

  /** Setup wizard: signs in with the password (never stored) and keeps only the refresh token. */
  async signIn(email: string, password: string): Promise<dp.AuthUser> {
    const user = await this.provider.signInWithEmail(email, password);
    const token = this.support?.getRefreshToken() ?? null;
    if (token !== null) this.credentials.write(token);
    this.lastError = null;
    this.set("signed-in");
    this.reporter.clear("signed-out");
    return user;
  }

  /** Signs out and deletes the credential file. */
  async signOut(): Promise<void> {
    this.credentials.clear();
    await this.provider.signOut();
    this.set("signed-out");
  }

  /**
   * Is the session still valid? Called before a flush cycle and when a write was denied:
   * a denial with a valid session is permanent, with an invalid one it only pauses the outbox.
   */
  async validate(): Promise<boolean> {
    if (this.provider.currentUser() === null) return false;
    if (this.support?.checkSession !== undefined) {
      try {
        const ok = await this.support.checkSession();
        if (!ok) this.set("signed-out");
        return ok;
      } catch {
        // cannot tell (e.g. offline): do not pause on a guess, the write error decides
        return true;
      }
    }
    return this.state === "signed-in";
  }
}
