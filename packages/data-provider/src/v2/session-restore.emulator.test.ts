/**
 * Session restore from a refresh token against the Auth emulator: sign in, export the token,
 * start a brand-new provider instance (a process restart), restore, and write with the restored
 * identity. Run via `pnpm test:emulator`; skipped otherwise.
 */
import { describe, expect, it } from "vitest";
import { createFirebaseProviderV2 } from "./firebase-provider.js";
import type { DataProviderV2 } from "./interface.js";

const authHost = process.env["FIREBASE_AUTH_EMULATOR_HOST"];
const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"];
const databaseHost = process.env["FIREBASE_DATABASE_EMULATOR_HOST"];
const emulatorOn = Boolean(authHost && firestoreHost && databaseHost);
const describeEmu = emulatorOn ? describe : describe.skip;

const PROJECT = "demo-muonhub";

function hostPort(value: string | undefined): { host: string; port: number } {
  const [host, port] = (value ?? "127.0.0.1:0").split(":");
  return { host: host ?? "127.0.0.1", port: Number(port) };
}

let seq = 0;
function connect(sessionRestore: boolean): DataProviderV2 {
  seq += 1;
  return createFirebaseProviderV2({
    apiKey: "fake-api-key",
    projectId: PROJECT,
    databaseURL: `https://${PROJECT}-default-rtdb.firebaseio.com`,
    appName: `restore-${seq}-${Date.now()}`,
    sessionRestore,
    emulators: {
      auth: `http://${authHost}`,
      firestore: hostPort(firestoreHost),
      database: hostPort(databaseHost),
    },
  });
}

async function adminAccountsApi(action: "update" | "delete", body: object): Promise<void> {
  const res = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:${action}`,
    {
      method: "POST",
      headers: { Authorization: "Bearer owner", "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`emulator ${action} failed: ${String(res.status)}`);
}

/** Creates an account with a profile, then signs out: returns what a setup wizard would keep. */
async function enrol(): Promise<{ email: string; uid: string; refreshToken: string }> {
  const first = connect(true);
  const email = `agent-${Date.now()}-${String(seq)}@example.org`;
  const user = await first.createAccount(email, "CorrectHorse123!");
  await first.createUserProfile({
    schemaVersion: 2,
    uid: user.uid,
    displayName: "Agent",
    username: `agent${Date.now().toString(36)}${String(seq)}`.slice(0, 30),
    email,
    createdAt: Date.now(),
  });
  const refreshToken = first.getRefreshToken();
  expect(refreshToken).toBeTruthy();
  await first.close();
  return { email, uid: user.uid, refreshToken: refreshToken ?? "" };
}

describeEmu("session restore from a refresh token (Auth emulator)", () => {
  it("signs in, persists the token, restores in a new provider and writes", async () => {
    const { uid, email, refreshToken } = await enrol();

    const restarted = connect(true); // a new process: no password, only the stored token
    expect(restarted.currentUser()).toBeNull();
    const user = await restarted.signInWithRefreshToken(refreshToken);
    expect(user).toEqual({ uid, email });
    expect(restarted.currentUser()?.uid).toBe(uid);
    expect(restarted.getRefreshToken()).toBeTruthy();
    expect(await restarted.checkSession()).toBe(true);

    // a write under the restored identity (users/{uid} is writable only by its owner)
    await restarted.updateDisplayName(uid, "Agent restored");
    expect((await restarted.getUser(uid))?.displayName).toBe("Agent restored");
    await restarted.close();
  });

  it("reports sign-in state changes to listeners after a restore", async () => {
    const { refreshToken } = await enrol();
    const restarted = connect(true);
    const seen: (string | null)[] = [];
    const off = restarted.onAuthChange({
      onChange: (u) => seen.push(u?.uid ?? null),
      onError: () => undefined,
    });
    const user = await restarted.signInWithRefreshToken(refreshToken);
    off();
    expect(seen.at(-1)).toBe(user.uid);
    await restarted.close();
  });

  it("rejects a garbage token as unauthenticated", async () => {
    const p = connect(true);
    await expect(p.signInWithRefreshToken("not-a-token")).rejects.toMatchObject({
      code: "unauthenticated",
    });
    expect(p.currentUser()).toBeNull();
    await p.close();
  });

  it("rejects the token once the account is disabled, and checkSession turns false", async () => {
    const { uid, refreshToken } = await enrol();
    const live = connect(true);
    await live.signInWithRefreshToken(refreshToken);
    expect(await live.checkSession()).toBe(true);

    await adminAccountsApi("update", { localId: uid, disableUser: true });

    expect(await live.checkSession()).toBe(false);
    const restarted = connect(true);
    await expect(restarted.signInWithRefreshToken(refreshToken)).rejects.toMatchObject({
      code: "unauthenticated",
    });
    await live.close();
    await restarted.close();
  });

  it("rejects the token once the account is deleted", async () => {
    const { uid, refreshToken } = await enrol();
    await adminAccountsApi("delete", { localId: uid });
    const p = connect(true);
    await expect(p.signInWithRefreshToken(refreshToken)).rejects.toMatchObject({
      code: "unauthenticated",
    });
    await p.close();
  });

  it("refuses to restore when the provider was not created with sessionRestore", async () => {
    const { refreshToken } = await enrol();
    const p = connect(false);
    await expect(p.signInWithRefreshToken(refreshToken)).rejects.toMatchObject({
      code: "invalid-argument",
    });
    await p.close();
  });
});
