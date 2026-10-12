import { describe, expect, it } from "vitest";
import { DataProviderError, guard, mapError, withDeadline } from "./errors.js";

describe("mapError", () => {
  it.each([
    [{ code: "permission-denied" }, "permission-denied"],
    [{ code: "not-found" }, "not-found"],
    [{ code: "unavailable" }, "unavailable"],
    [{ code: "failed-precondition" }, "conflict"],
    [{ code: "auth/invalid-credential" }, "invalid-credentials"],
    [{ code: "auth/user-not-found" }, "invalid-credentials"],
    [{ code: "auth/email-already-in-use" }, "already-exists"],
    [{ code: "auth/too-many-requests" }, "rate-limited"],
    [{ code: "auth/network-request-failed" }, "unavailable"],
    [{ code: "PERMISSION_DENIED" }, "permission-denied"],
    [new Error("PERMISSION_DENIED: Permission denied"), "permission-denied"],
    [new Error("permission denied"), "permission-denied"],
    [new Error("boom"), "internal"],
    ["a string", "internal"],
    [null, "internal"],
  ])("maps %j to %s", (input, code) => {
    expect(mapError(input).code).toBe(code);
  });

  it("keeps the original error as cause and uses a safe message", () => {
    const original = Object.assign(new Error("secret internal detail: user@example.org"), {
      code: "permission-denied",
    });
    const mapped = mapError(original);
    expect(mapped.cause).toBe(original);
    expect(mapped.message).not.toContain("secret");
  });

  it("returns an existing DataProviderError unchanged", () => {
    const e = new DataProviderError("conflict");
    expect(mapError(e)).toBe(e);
  });

  it("flags retryable codes", () => {
    expect(new DataProviderError("unavailable").retryable).toBe(true);
    expect(new DataProviderError("permission-denied").retryable).toBe(false);
  });

  it("guard rethrows mapped errors and passes values through", async () => {
    await expect(guard(async () => 5)).resolves.toBe(5);
    await expect(
      guard(async () => {
        throw { code: "not-found" };
      }),
    ).rejects.toMatchObject({ name: "DataProviderError", code: "not-found" });
  });
});

describe("offline and deadlines", () => {
  it("maps the RTDB 'Client is offline' message to unavailable", () => {
    expect(mapError(new Error("Client is offline.")).code).toBe("unavailable");
    expect(mapError(new Error("Error: Client is offline")).retryable).toBe(true);
  });

  it("withDeadline rejects with outcome-unknown, which is not blindly retryable", async () => {
    const never = new Promise<number>(() => undefined);
    const error = await withDeadline(never, 5).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "outcome-unknown" });
    expect((error as DataProviderError).retryable).toBe(false);
  });

  it("withDeadline passes values and errors through, and 0 disables it", async () => {
    await expect(withDeadline(Promise.resolve(3), 50)).resolves.toBe(3);
    await expect(withDeadline(Promise.reject(new Error("x")), 50)).rejects.toThrow("x");
    await expect(withDeadline(new Promise((r) => setTimeout(() => r(1), 10)), 0)).resolves.toBe(1);
  });

  it("withPartial keeps the code and the cause", () => {
    const base = new DataProviderError("permission-denied");
    const e = base.withPartial({ removed: 3 });
    expect(e.code).toBe("permission-denied");
    expect(e.partial).toEqual({ removed: 3 });
    expect(e.cause).toBe(base);
  });
});
