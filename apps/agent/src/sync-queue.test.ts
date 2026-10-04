import type { MinuteRecord } from "@muonhub/shared";
import { describe, expect, it } from "vitest";
import { InMemoryLocalStore } from "./local-store.js";
import { OfflineSyncQueue, type MinuteRecordUploader } from "./sync-queue.js";

function record(ts: number, ec = 1): MinuteRecord {
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

class FakeUploader implements MinuteRecordUploader {
  readonly calls: Array<{ detectorId: string; record: MinuteRecord }> = [];
  failOnCall: number | null = null;

  async pushMinuteRecord(detectorId: string, minute: MinuteRecord): Promise<void> {
    const callNumber = this.calls.length + 1;
    if (this.failOnCall === callNumber) {
      this.failOnCall = null;
      throw new Error("network unavailable");
    }

    this.calls.push({ detectorId, record: minute });
  }
}

describe("OfflineSyncQueue", () => {
  it("queues records while offline and does not upload", async () => {
    const store = new InMemoryLocalStore();
    const uploader = new FakeUploader();
    const queue = new OfflineSyncQueue({ store, uploader });

    await queue.enqueueMinuteRecord("detector-a", record(60_000));

    await expect(store.listQueuedMinuteRecords()).resolves.toHaveLength(1);
    expect(uploader.calls).toEqual([]);
  });

  it("flushes queued records on reconnect in timestamp order", async () => {
    const store = new InMemoryLocalStore();
    const uploader = new FakeUploader();
    const queue = new OfflineSyncQueue({ store, uploader });

    await queue.enqueueMinuteRecord("detector-a", record(120_000));
    await queue.enqueueMinuteRecord("detector-a", record(60_000));

    await expect(queue.setOnline(true)).resolves.toEqual({
      attempted: 2,
      uploaded: 2,
      remaining: 0,
    });
    expect(uploader.calls.map((call) => call.record.ts)).toEqual([60_000, 120_000]);
    await expect(store.listQueuedMinuteRecords()).resolves.toEqual([]);
  });

  it("suppresses duplicates by detector and timestamp", async () => {
    const store = new InMemoryLocalStore();
    const uploader = new FakeUploader();
    const queue = new OfflineSyncQueue({ store, uploader });

    await queue.enqueueMinuteRecord("detector-a", record(60_000, 1));
    await queue.enqueueMinuteRecord("detector-a", record(60_000, 2));
    await queue.setOnline(true);
    await queue.enqueueMinuteRecord("detector-a", record(60_000, 3));

    expect(uploader.calls).toHaveLength(1);
    expect(uploader.calls[0]?.record.ec).toBe(2);
  });

  it("resumes after a partial flush without re-uploading synced records", async () => {
    const store = new InMemoryLocalStore();
    const uploader = new FakeUploader();
    const queue = new OfflineSyncQueue({ store, uploader });

    await queue.enqueueMinuteRecord("detector-a", record(60_000));
    await queue.enqueueMinuteRecord("detector-a", record(120_000));
    await queue.enqueueMinuteRecord("detector-a", record(180_000));
    uploader.failOnCall = 2;

    await queue.setOnline(true);
    expect(uploader.calls.map((call) => call.record.ts)).toEqual([60_000]);
    await expect(store.listQueuedMinuteRecords()).resolves.toHaveLength(2);

    await expect(queue.flush()).resolves.toEqual({ attempted: 2, uploaded: 2, remaining: 0 });
    expect(uploader.calls.map((call) => call.record.ts)).toEqual([60_000, 120_000, 180_000]);
  });

  it("persists locally before attempting upload", async () => {
    const store = new InMemoryLocalStore();
    const uploader: MinuteRecordUploader = {
      async pushMinuteRecord(detectorId, minute) {
        await expect(store.getMinuteRecord(detectorId, minute.ts)).resolves.toMatchObject({
          detectorId,
          record: minute,
        });
      },
    };
    const queue = new OfflineSyncQueue({ store, uploader });

    await queue.setOnline(true);
    await queue.enqueueMinuteRecord("detector-a", record(60_000));
  });
});
