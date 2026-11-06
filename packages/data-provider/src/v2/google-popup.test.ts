import type * as FirebaseAuth from "firebase/auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFirebaseProviderV2 } from "./firebase-provider.js";
import type { DataProviderV2 } from "./interface.js";

const { popup } = vi.hoisted(() => ({ popup: vi.fn() }));
vi.mock("firebase/auth", async (original) => ({
  ...(await original<typeof FirebaseAuth>()),
  signInWithPopup: popup,
}));

let provider: DataProviderV2 | undefined;
afterEach(async () => {
  await provider?.close();
  popup.mockReset();
});

function connect() {
  provider = createFirebaseProviderV2({
    apiKey: "test-key",
    authDomain: "demo-muonhub.firebaseapp.com",
    projectId: "demo-muonhub",
    databaseURL: "https://demo-muonhub-default-rtdb.firebaseio.com",
    appName: "popup-contract",
    timeoutMs: 5,
  });
  return provider;
}

describe("interactive Google popup", () => {
  it("allows account selection to outlast the provider I/O deadline", async () => {
    const user = { uid: "google-user", email: "google@example.org", emailVerified: true };
    popup.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ user }), 25)),
    );
    await expect(connect().signInWithGoogle()).resolves.toEqual(user);
  });

  it("maps popup errors into the provider error model", async () => {
    popup.mockRejectedValue({ code: "auth/popup-closed-by-user", message: "SDK detail" });
    await expect(connect().signInWithGoogle()).rejects.toMatchObject({
      name: "DataProviderError",
      code: "internal",
      message: "Unexpected error.",
    });
  });
});
