import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRestorablePersistence,
  exchangeRefreshToken,
  idTokenClaims,
} from "./session-restore.js";

function reply(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("exchangeRefreshToken", () => {
  it("returns the refreshed identity", async () => {
    reply(200, { id_token: "i", refresh_token: "r2", user_id: "u1", expires_in: "3600" });
    expect(await exchangeRefreshToken("key", "r1")).toEqual({
      idToken: "i",
      refreshToken: "r2",
      uid: "u1",
      expiresInSec: 3600,
    });
  });

  it.each(["TOKEN_EXPIRED", "USER_DISABLED", "USER_NOT_FOUND", "INVALID_REFRESH_TOKEN"])(
    "maps %s to unauthenticated",
    async (code) => {
      reply(400, { error: { message: `${code} : detail` } });
      await expect(exchangeRefreshToken("key", "r1")).rejects.toMatchObject({
        code: "unauthenticated",
      });
    },
  );

  it("maps a network failure to unavailable (the token may still be good)", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));
    await expect(exchangeRefreshToken("key", "r1")).rejects.toMatchObject({ code: "unavailable" });
  });

  it("maps server errors to unavailable and an invalid key to internal", async () => {
    reply(503, { error: { message: "BACKEND_ERROR" } });
    await expect(exchangeRefreshToken("key", "r1")).rejects.toMatchObject({ code: "unavailable" });
    reply(400, { error: { message: "API key not valid" } });
    await expect(exchangeRefreshToken("key", "r1")).rejects.toMatchObject({ code: "internal" });
  });

  it("targets the emulator when given its URL", async () => {
    reply(200, { id_token: "i", refresh_token: "r", user_id: "u", expires_in: "1" });
    await exchangeRefreshToken("k", "r", "http://127.0.0.1:9099/");
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(url).toBe("http://127.0.0.1:9099/securetoken.googleapis.com/v1/token?key=k");
  });
});

describe("idTokenClaims", () => {
  it("reads email claims and tolerates garbage", () => {
    const payload = Buffer.from(JSON.stringify({ email: "a@b.c", email_verified: true })).toString(
      "base64url",
    );
    expect(idTokenClaims(`h.${payload}.s`)).toEqual({ email: "a@b.c", emailVerified: true });
    expect(idTokenClaims("garbage")).toEqual({ emailVerified: false });
  });
});

describe("createRestorablePersistence", () => {
  it("notifies the SDK listener and serves the seeded user", async () => {
    const r = createRestorablePersistence();
    const p = new r.persistence() as unknown as {
      _addListener(k: string, l: () => void): void;
      _get(k: string): Promise<unknown>;
    };
    const key = "firebase:authUser:key:app";
    const listener = vi.fn();
    p._addListener(key, listener);
    const blob = {
      uid: "u",
      emailVerified: false,
      isAnonymous: false,
      providerData: [],
      stsTokenManager: { refreshToken: "r", accessToken: "a", expirationTime: 1 },
      apiKey: "key",
      appName: "app",
    };
    await r.seed(blob);
    expect(listener).toHaveBeenCalledOnce();
    expect(await p._get(key)).toBe(blob);
  });

  it("refuses to seed before the SDK has registered", async () => {
    await expect(createRestorablePersistence().seed({} as never)).rejects.toMatchObject({
      code: "internal",
    });
  });
});
