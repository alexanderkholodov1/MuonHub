/** FR8 account email operations against a local Auth emulator; never a live project. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyActionCode, getAuth } from "firebase/auth";
import { getApp } from "firebase/app";
import { createFirebaseProviderV2 } from "./firebase-provider.js";
import type { DataProviderV2 } from "./interface.js";

const authHost = process.env["FIREBASE_AUTH_EMULATOR_HOST"];
const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"];
const describeEmulator = authHost ? describe : describe.skip;
const project = "demo-muonhub";
const providers: DataProviderV2[] = [];
let sequence = 0;

function connect() {
  const name = `web-auth-${Date.now()}-${++sequence}`;
  const provider = createFirebaseProviderV2({
    apiKey: "fake-api-key",
    projectId: project,
    databaseURL: `https://${project}-default-rtdb.firebaseio.com`,
    appName: name,
    emulators: {
      auth: `http://${authHost}`,
      ...(firestoreHost === undefined
        ? {}
        : {
            firestore: {
              host: firestoreHost.split(":")[0]!,
              port: Number(firestoreHost.split(":")[1]),
            },
          }),
    },
  });
  providers.push(provider);
  return { provider, name, email: `${name}@example.org` };
}

async function outbox(): Promise<{ email: string; requestType: string; oobCode: string }[]> {
  const response = await fetch(`http://${authHost}/emulator/v1/projects/${project}/oobCodes`);
  if (!response.ok) throw new Error(`Emulator outbox failed: ${response.status}`);
  const body = (await response.json()) as {
    oobCodes: { email: string; requestType: string; oobCode: string }[];
  };
  return body.oobCodes;
}

afterEach(async () => {
  await Promise.all(providers.splice(0).map((provider) => provider.close()));
});

describeEmulator("web accounts (Auth emulator)", () => {
  it.skipIf(!firestoreHost)(
    "rejects signed-out username lookup under the existing rules",
    async () => {
      const { provider } = connect();
      await expect(provider.findUidByUsername("available_name")).rejects.toMatchObject({
        code: "permission-denied",
      });
    },
  );

  it.skipIf(!firestoreHost)(
    "allows one concurrent username claim and returns already-exists to the loser",
    async () => {
      const first = connect();
      const second = connect();
      const actors = await Promise.all(
        [first, second].map(async ({ provider, email }) => ({
          provider,
          email,
          user: await provider.createAccount(email, "CorrectHorse123!"),
        })),
      );
      const username = `race${Date.now().toString(36)}`;
      const results = await Promise.allSettled(
        actors.map(({ provider, email, user }) =>
          provider.createUserProfile({
            schemaVersion: 2,
            uid: user.uid,
            displayName: "Concurrent signup",
            username,
            email,
            createdAt: Date.now(),
          }),
        ),
      );
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected?.status === "rejected" ? rejected.reason : null).toMatchObject({
        code: "already-exists",
      });
      const loser = actors[results.findIndex((result) => result.status === "rejected")]!;
      expect(await loser.provider.getUser(loser.user.uid)).toBeNull();
    },
  );

  it("sends verification and reloads verified state after consuming the email action", async () => {
    const { provider, name, email } = connect();
    const user = await provider.createAccount(email, "CorrectHorse123!");
    expect(user.emailVerified).toBe(false);
    await provider.sendEmailVerification();
    const message = (await outbox()).find(
      (entry) => entry.email === email && entry.requestType === "VERIFY_EMAIL",
    );
    expect(message).toBeDefined();
    expect(provider.currentUser()?.emailVerified).toBe(false);
    await applyActionCode(getAuth(getApp(name)), message!.oobCode);
    const onChange = vi.fn();
    const stop = provider.onAuthChange({ onChange, onError: vi.fn() });
    const refreshed = await provider.reloadUser();
    expect(refreshed).toEqual({ ...user, emailVerified: true });
    expect(provider.currentUser()?.emailVerified).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(refreshed);
    stop();
    await provider.signOut();
    expect((await provider.signInWithEmail(email, "CorrectHorse123!")).emailVerified).toBe(true);
  });

  it("resolves both known and unknown password resets without signing in", async () => {
    const { provider, email } = connect();
    await provider.createAccount(email, "CorrectHorse123!");
    await provider.signOut();
    await expect(provider.sendPasswordReset(email)).resolves.toBeUndefined();
    await expect(provider.sendPasswordReset(`unknown-${email}`)).resolves.toBeUndefined();
    expect(provider.currentUser()).toBeNull();
    expect(
      (await outbox()).some(
        (entry) => entry.email === email && entry.requestType === "PASSWORD_RESET",
      ),
    ).toBe(true);
    await expect(provider.sendPasswordReset("invalid")).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("requires authentication for verification and returns null for signed-out reload", async () => {
    const { provider } = connect();
    await expect(provider.sendEmailVerification()).rejects.toMatchObject({
      code: "unauthenticated",
    });
    await expect(provider.reloadUser()).resolves.toBeNull();
  });
});
