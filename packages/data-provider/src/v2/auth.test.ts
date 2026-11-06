import { describe, expect, it, vi } from "vitest";
import { createMemoryProviderV2, MemoryStore } from "./memory-provider.js";

function setup() {
  const store = new MemoryStore();
  return { store, provider: createMemoryProviderV2({ store }) };
}

describe("web account auth contract (spec 0088 FR8)", () => {
  it("starts unverified and preserves verification across sign-in and session restore", async () => {
    const { store, provider } = setup();
    const user = await provider.createAccount("ana@example.org", "password123");
    expect(user.emailVerified).toBe(false);
    const account = store.accounts.get("ana@example.org")!;
    account.emailVerified = true;
    await provider.signOut();
    expect((await provider.signInWithEmail(account.email, "password123")).emailVerified).toBe(true);
    const token = provider.getRefreshToken()!;
    await provider.signOut();
    expect((await provider.signInWithRefreshToken(token)).emailVerified).toBe(true);
  });

  it("sends verification without granting verification and reload notifies subscribers", async () => {
    const { store, provider } = setup();
    await provider.createAccount("ana@example.org", "password123");
    await provider.sendEmailVerification();
    expect(store.verificationEmails).toEqual(["ana@example.org"]);
    expect(provider.currentUser()?.emailVerified).toBe(false);
    const onChange = vi.fn();
    const stop = provider.onAuthChange({ onChange, onError: vi.fn() });
    store.accounts.get("ana@example.org")!.emailVerified = true;
    const refreshed = await provider.reloadUser();
    expect(refreshed?.emailVerified).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(refreshed);
    stop();
    const calls = onChange.mock.calls.length;
    await provider.reloadUser();
    expect(onChange).toHaveBeenCalledTimes(calls);
  });

  it("requires sign-in to send verification and returns null on a signed-out reload", async () => {
    const { provider } = setup();
    await expect(provider.sendEmailVerification()).rejects.toMatchObject({
      code: "unauthenticated",
    });
    await expect(provider.reloadUser()).resolves.toBeNull();
  });

  it("resolves resets equally for known and unknown email without creating accounts or signing in", async () => {
    const { store, provider } = setup();
    await provider.createAccount("ana@example.org", "password123");
    await provider.signOut();
    await expect(provider.sendPasswordReset("ana@example.org")).resolves.toBeUndefined();
    await expect(provider.sendPasswordReset("unknown@example.org")).resolves.toBeUndefined();
    expect(store.passwordResetEmails).toEqual(["ana@example.org"]);
    expect(store.accounts.size).toBe(1);
    expect(provider.currentUser()).toBeNull();
    await expect(provider.sendPasswordReset("not-an-email")).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("models a verified Google identity, notifies subscribers and reuses the account", async () => {
    const { store, provider } = setup();
    const onChange = vi.fn();
    provider.onAuthChange({ onChange, onError: vi.fn() });
    const user = await provider.signInWithGoogle();
    expect(user).toMatchObject({ email: "google@example.test", emailVerified: true });
    expect(onChange).toHaveBeenLastCalledWith(user);
    expect(provider.getRefreshToken()).toBeTruthy();
    await provider.signOut();
    expect(await provider.signInWithGoogle()).toEqual(user);
    expect(store.accounts.size).toBe(1);
    await provider.signOut();
    await expect(provider.signInWithEmail("google@example.test", "")).rejects.toMatchObject({
      code: "invalid-credentials",
    });
  });

  it.each([
    "sendPasswordReset",
    "sendEmailVerification",
    "signInWithGoogle",
    "reloadUser",
  ] as const)("surfaces injected failures in %s", async (op) => {
    const { store, provider } = setup();
    await provider.createAccount("ana@example.org", "password123");
    store.injectFault({ op, kind: "unavailable" });
    await expect(provider[op]("ana@example.org")).rejects.toMatchObject({ code: "unavailable" });
  });

  it("rejects reload after account deletion and clears the signed-in identity", async () => {
    const { store, provider } = setup();
    await provider.createAccount("ana@example.org", "password123");
    store.accounts.delete("ana@example.org");
    await expect(provider.reloadUser()).rejects.toMatchObject({ code: "unauthenticated" });
    expect(provider.currentUser()).toBeNull();
  });
});
