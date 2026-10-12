import { describe, expect, it } from "vitest";
import {
  LIVE_RETENTION_MS,
  PRUNE_MARGIN_MS,
  chunk,
  createNonceSource,
  fromLiveValue,
  liveKey,
  pruneBound,
  pruneEndKey,
  selectPrunable,
  toLiveValue,
  windowStartKey,
} from "./live-window.js";

const NOW = 1_800_000_000_000;

describe("live keys", () => {
  it("are unique for events in the same millisecond", () => {
    const nonce = createNonceSource(() => 0.5);
    const keys = new Set(Array.from({ length: 5000 }, () => liveKey(NOW, nonce())));
    expect(keys.size).toBe(5000);
  });

  it("sort by time", () => {
    const nonce = createNonceSource();
    expect(liveKey(NOW, nonce()) < liveKey(NOW + 1, "0000")).toBe(true);
    expect(liveKey(NOW - 1, "zzzz") < liveKey(NOW, "0000")).toBe(true);
  });
});

describe("pruning", () => {
  it("bounds expired entries by retention plus the clock-skew margin", () => {
    expect(pruneBound(NOW)).toBe(NOW - LIVE_RETENTION_MS - PRUNE_MARGIN_MS);
  });

  it("treats exactly the keys with t below the bound as expired", () => {
    const bound = pruneBound(NOW);
    const end = pruneEndKey(NOW);
    expect(liveKey(bound - 1, "zzzz") < end).toBe(true);
    expect(liveKey(bound, "0000") < end).toBe(false);
  });

  it("selects only entries whose own t is expired and counts the rest", () => {
    const bound = pruneBound(NOW);
    const { remove, skipped } = selectPrunable(
      [
        ["a", { t: bound - 5, a: 1 }],
        ["b", { t: bound, a: 1 }],
        ["c", "garbage"],
        ["d", null],
        ["e", { t: bound - 1, a: 2 }],
      ],
      NOW,
    );
    expect(remove).toEqual(["a", "e"]);
    expect(skipped).toBe(3);
  });

  it("starts a new subscriber's window one retention period back", () => {
    expect(windowStartKey(NOW)).toBe(String(NOW - LIVE_RETENTION_MS).padStart(13, "0"));
  });
});

describe("live values", () => {
  it("round-trips the compact {t, a} form", () => {
    const e = { t: NOW, amplitude: 41.5 };
    expect(toLiveValue(e)).toEqual({ t: NOW, a: 41.5 });
    expect(fromLiveValue(toLiveValue(e))).toEqual(e);
  });

  it("rejects malformed stored values", () => {
    expect(() => fromLiveValue(null)).toThrow();
    expect(() => fromLiveValue({ t: "x", a: 1 })).toThrow();
    expect(() => fromLiveValue({ t: NOW })).toThrow();
  });

  it("chunks batches", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
