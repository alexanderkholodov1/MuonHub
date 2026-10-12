import { describe, expect, it } from "vitest";
import { DataProviderError, guard, mapError } from "./errors.js";

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
