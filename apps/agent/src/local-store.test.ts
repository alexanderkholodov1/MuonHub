import { describe, expect, it } from "vitest";
import { InMemoryLocalStore } from "./local-store.js";
import type { MinuteRecord } from "@muonhub/shared";

function record(ts: number, ec: number): MinuteRecord {
  return {
    ts,
    ec,
    cc: 0,
    sm: 10,
    sx: 10,
    sn: 10,
    tp: 20,
    pr: 1_010,
    dt: 1,
  };
}

describe("InMemoryLocalStore", () => {
  it("persists records by detector and timestamp", async () => {
    const store = new InMemoryLocalStore();
    const minute = record(60_000, 2);

    await store.saveMinuteRecord("detector-a", minute);

    await expect(store.getMinuteRecord("detector-a", 60_000)).resolves.toEqual({
      detectorId: "detector-a",
      record: minute,
      synced: false,
    });
  });

  it("deduplicates queued records by detector and timestamp", async () => {
    const store = new InMemoryLocalStore();

    await store.queueMinuteRecord("detector-a", record(60_000, 2));
    await store.queueMinuteRecord("detector-a", record(60_000, 3));

    await expect(store.listQueuedMinuteRecords()).resolves.toEqual([
      { detectorId: "detector-a", record: record(60_000, 3) },
    ]);
  });

  it("lists queued records ordered by timestamp", async () => {
    const store = new InMemoryLocalStore();

    await store.queueMinuteRecord("detector-a", record(120_000, 2));
    await store.queueMinuteRecord("detector-a", record(60_000, 1));

    await expect(store.listQueuedMinuteRecords()).resolves.toEqual([
      { detectorId: "detector-a", record: record(60_000, 1) },
      { detectorId: "detector-a", record: record(120_000, 2) },
    ]);
  });

  it("removes records from the queue after marking them synced", async () => {
    const store = new InMemoryLocalStore();

    await store.queueMinuteRecord("detector-a", record(60_000, 2));
    await store.markMinuteRecordSynced("detector-a", 60_000);

    await expect(store.listQueuedMinuteRecords()).resolves.toEqual([]);
    await expect(store.getMinuteRecord("detector-a", 60_000)).resolves.toMatchObject({
      synced: true,
    });
  });
});
