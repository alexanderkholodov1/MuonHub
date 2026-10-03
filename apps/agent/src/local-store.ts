import type { MinuteRecord } from "@muonhub/shared";

export interface StoredMinuteRecord {
  detectorId: string;
  record: MinuteRecord;
  synced: boolean;
}

export interface QueuedMinuteRecord {
  detectorId: string;
  record: MinuteRecord;
}

export interface LocalStore {
  saveMinuteRecord(detectorId: string, record: MinuteRecord): Promise<void>;
  getMinuteRecord(detectorId: string, ts: number): Promise<StoredMinuteRecord | null>;
  listMinuteRecords(detectorId?: string): Promise<StoredMinuteRecord[]>;
  queueMinuteRecord(detectorId: string, record: MinuteRecord): Promise<void>;
  listQueuedMinuteRecords(): Promise<QueuedMinuteRecord[]>;
  markMinuteRecordSynced(detectorId: string, ts: number): Promise<void>;
}

function minuteKey(detectorId: string, ts: number): string {
  return `${detectorId}:${ts}`;
}

function sortByDetectorAndTimestamp(
  left: StoredMinuteRecord | QueuedMinuteRecord,
  right: StoredMinuteRecord | QueuedMinuteRecord,
): number {
  if (left.record.ts !== right.record.ts) {
    return left.record.ts - right.record.ts;
  }

  return left.detectorId.localeCompare(right.detectorId);
}

export class InMemoryLocalStore implements LocalStore {
  private readonly records = new Map<string, StoredMinuteRecord>();
  private readonly queuedKeys = new Set<string>();

  async saveMinuteRecord(detectorId: string, record: MinuteRecord): Promise<void> {
    const key = minuteKey(detectorId, record.ts);
    const existing = this.records.get(key);
    this.records.set(key, {
      detectorId,
      record,
      synced: existing?.synced ?? false,
    });
  }

  async getMinuteRecord(detectorId: string, ts: number): Promise<StoredMinuteRecord | null> {
    return this.records.get(minuteKey(detectorId, ts)) ?? null;
  }

  async listMinuteRecords(detectorId?: string): Promise<StoredMinuteRecord[]> {
    return [...this.records.values()]
      .filter((entry) => detectorId === undefined || entry.detectorId === detectorId)
      .sort(sortByDetectorAndTimestamp);
  }

  async queueMinuteRecord(detectorId: string, record: MinuteRecord): Promise<void> {
    const key = minuteKey(detectorId, record.ts);
    await this.saveMinuteRecord(detectorId, record);

    const stored = this.records.get(key);
    if (stored?.synced === true) {
      return;
    }

    this.queuedKeys.add(key);
  }

  async listQueuedMinuteRecords(): Promise<QueuedMinuteRecord[]> {
    return [...this.queuedKeys]
      .map((key) => this.records.get(key))
      .filter((entry): entry is StoredMinuteRecord => entry !== undefined && !entry.synced)
      .map((entry) => ({ detectorId: entry.detectorId, record: entry.record }))
      .sort(sortByDetectorAndTimestamp);
  }

  async markMinuteRecordSynced(detectorId: string, ts: number): Promise<void> {
    const key = minuteKey(detectorId, ts);
    const existing = this.records.get(key);
    if (existing !== undefined) {
      this.records.set(key, { ...existing, synced: true });
    }

    this.queuedKeys.delete(key);
  }
}
