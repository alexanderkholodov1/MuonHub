/**
 * Chunked write-once minute writer shared by the Firebase and in-memory providers.
 *
 * Minutes are split into bounded chunks (by count and by key span, so the existence read of a
 * chunk is bounded too). For each chunk: read what exists, write only the missing keys. A denied
 * chunk is re-read and retried once with only the keys still missing (another writer may have won
 * the race); if it still fails the error carries what was written and what is pending.
 */
import { mapError } from "./errors.js";
import { LIVE_BATCH_SIZE } from "./live-window.js";
import type { WriteMinutesResult } from "./interface.js";

/** Largest span of minutes (keys) one existence read covers. */
export const MAX_CHUNK_SPAN_MINUTES = 1440;

export interface PreparedMinute {
  ts: number;
  key: string;
  value: unknown;
}

export interface MinuteStoreIo {
  /** Existing entries with keys in `[firstKey, lastKey]`: key → session id (or null). */
  readExisting(firstKey: string, lastKey: string): Promise<Map<string, string | null>>;
  /** Writes the entries (all missing) in one atomic update. */
  writeChunk(entries: readonly PreparedMinute[]): Promise<void>;
}

/** Splits key-sorted minutes into chunks bounded by count and by time span. */
export function chunkMinutes(sorted: readonly PreparedMinute[]): PreparedMinute[][] {
  const chunks: PreparedMinute[][] = [];
  let current: PreparedMinute[] = [];
  for (const m of sorted) {
    const first = current[0];
    if (
      first !== undefined &&
      (current.length >= LIVE_BATCH_SIZE || m.ts - first.ts > MAX_CHUNK_SPAN_MINUTES * 60_000)
    ) {
      chunks.push(current);
      current = [];
    }
    current.push(m);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export async function writeMinutesChunked(
  prepared: readonly PreparedMinute[],
  io: MinuteStoreIo,
): Promise<WriteMinutesResult> {
  const sorted = [...prepared].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const chunks = chunkMinutes(sorted);
  const written: number[] = [];
  const existing: { ts: number; sessionId: string | null }[] = [];

  const pendingFrom = (index: number, current: readonly PreparedMinute[]): number[] => [
    ...current.map((m) => m.ts),
    ...chunks.slice(index + 1).flatMap((c) => c.map((m) => m.ts)),
  ];
  const fail = (error: unknown, index: number, current: readonly PreparedMinute[]): never => {
    throw mapError(error).withPartial({
      writtenSoFar: [...written],
      pending: pendingFrom(index, current),
    });
  };

  for (const [index, chunk] of chunks.entries()) {
    const first = chunk[0] as PreparedMinute;
    const last = chunk[chunk.length - 1] as PreparedMinute;
    let found: Map<string, string | null>;
    try {
      found = await io.readExisting(first.key, last.key);
    } catch (error) {
      return fail(error, index, chunk);
    }
    let missing = chunk.filter((m) => !found.has(m.key));
    if (missing.length > 0) {
      try {
        await io.writeChunk(missing);
      } catch (error) {
        const mapped = mapError(error);
        if (mapped.code !== "permission-denied") return fail(mapped, index, missing);
        // Denied: some keys probably appeared since the read (write-once race). Re-read this range
        // and retry once with only what is still missing; if it fails again, report honestly.
        try {
          found = await io.readExisting(first.key, last.key);
          missing = missing.filter((m) => !found.has(m.key));
          if (missing.length > 0) await io.writeChunk(missing);
        } catch (retryError) {
          return fail(retryError, index, missing);
        }
      }
    }
    for (const m of chunk) {
      if (found.has(m.key)) existing.push({ ts: m.ts, sessionId: found.get(m.key) ?? null });
    }
    // `missing` is what this call wrote for the chunk (a race-lost key is in `found`, not here).
    for (const m of missing) written.push(m.ts);
  }
  return {
    written: written.length,
    alreadyExisted: existing.map((e) => e.ts),
    existing,
  };
}
