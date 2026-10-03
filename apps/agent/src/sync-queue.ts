import type { MinuteRecord } from "@muonhub/shared";
import type { LocalStore } from "./local-store.js";

export interface MinuteRecordUploader {
  pushMinuteRecord(detectorId: string, record: MinuteRecord): Promise<void>;
}

export interface OfflineSyncQueueOptions {
  store: LocalStore;
  uploader: MinuteRecordUploader;
}

export interface FlushResult {
  attempted: number;
  uploaded: number;
  remaining: number;
}

export class OfflineSyncQueue {
  private readonly store: LocalStore;
  private readonly uploader: MinuteRecordUploader;
  private online = false;
  private flushing: Promise<FlushResult> | null = null;

  constructor(options: OfflineSyncQueueOptions) {
    this.store = options.store;
    this.uploader = options.uploader;
  }

  isOnline(): boolean {
    return this.online;
  }

  async setOnline(online: boolean): Promise<FlushResult | null> {
    this.online = online;
    if (!online) {
      return null;
    }

    return this.flush();
  }

  async enqueueMinuteRecord(detectorId: string, record: MinuteRecord): Promise<FlushResult | null> {
    await this.store.saveMinuteRecord(detectorId, record);
    await this.store.queueMinuteRecord(detectorId, record);

    if (!this.online) {
      return null;
    }

    return this.flush();
  }

  async flush(): Promise<FlushResult> {
    if (!this.online) {
      const pending = await this.store.listQueuedMinuteRecords();
      return { attempted: 0, uploaded: 0, remaining: pending.length };
    }

    if (this.flushing !== null) {
      return this.flushing;
    }

    this.flushing = this.flushInternal();
    try {
      return await this.flushing;
    } finally {
      this.flushing = null;
    }
  }

  private async flushInternal(): Promise<FlushResult> {
    const pending = await this.store.listQueuedMinuteRecords();
    let attempted = 0;
    let uploaded = 0;

    for (const entry of pending) {
      attempted += 1;
      try {
        await this.uploader.pushMinuteRecord(entry.detectorId, entry.record);
        await this.store.markMinuteRecordSynced(entry.detectorId, entry.record.ts);
        uploaded += 1;
      } catch {
        break;
      }
    }

    const remaining = (await this.store.listQueuedMinuteRecords()).length;
    return { attempted, uploaded, remaining };
  }
}
