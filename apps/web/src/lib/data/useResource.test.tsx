import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { v2 as dp } from "@muonhub/data-provider";
import { useResource } from "./useResource";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useResource", () => {
  it("goes from loading to ready", async () => {
    const { result } = renderHook(() => useResource("a", () => Promise.resolve(42)));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data).toBe(42);
  });

  it("maps a data-layer error to a safe message", async () => {
    const { result } = renderHook(() =>
      useResource("a", () => Promise.reject(new dp.DataProviderError("permission-denied"))),
    );
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("You do not have access to this.");
  });

  it("ignores the result of a load whose key changed", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const loads: Record<string, Promise<string>> = { a: first.promise, b: second.promise };
    const { result, rerender } = renderHook(({ k }) => useResource(k, () => loads[k]!), {
      initialProps: { k: "a" },
    });
    rerender({ k: "b" });
    await act(async () => {
      second.resolve("new");
      await second.promise;
    });
    await act(async () => {
      first.resolve("stale");
      await first.promise;
    });
    expect(result.current.data).toBe("new");
  });

  it("ignores a result that arrives after unmount", async () => {
    const late = deferred<string>();
    const { result, unmount } = renderHook(() => useResource("a", () => late.promise));
    unmount();
    await act(async () => {
      late.resolve("late");
      await late.promise;
    });
    expect(result.current.status).toBe("loading");
  });

  it("reloads on demand", async () => {
    let n = 0;
    const { result } = renderHook(() => useResource("a", () => Promise.resolve(++n)));
    await waitFor(() => expect(result.current.data).toBe(1));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe(2));
  });
});
