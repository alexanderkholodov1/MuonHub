/**
 * Live-window helpers (B-M1-16). Keys are `<ts zero-padded to 13 digits><nonce>`, so they are
 * unique (same-millisecond events never overwrite each other) and sort by time: pruning is a key
 * range query that downloads only the expired entries, and a subscriber downloads the window once
 * and then only new children.
 */
import { v2 } from "@muonhub/shared";

export const LIVE_RETENTION_MS = 600_000;
/** Pruning stays this far behind the retention bound so client/server clock skew cannot trip the rule. */
export const PRUNE_MARGIN_MS = 30_000;
export const LIVE_BATCH_SIZE = 500;

const NONCE_LENGTH = 4;
const NONCE_SPACE = 36 ** NONCE_LENGTH;

/** Produces nonces that are unique within this process and random across processes. */
export function createNonceSource(random: () => number = Math.random): () => string {
  let counter = Math.floor(random() * NONCE_SPACE);
  return () => {
    counter = (counter + 1) % NONCE_SPACE;
    return counter.toString(36).padStart(NONCE_LENGTH, "0");
  };
}

export function liveKey(t: number, nonce: string): string {
  return v2.minuteKey(t) + nonce;
}

/** Compact stored form `{t, a}` (spec 0084 FR17). */
export interface LiveValue {
  t: number;
  a: number;
}

export function toLiveValue(event: v2.LiveEvent): LiveValue {
  const parsed = v2.LiveEventSchema.parse(event);
  return { t: parsed.t, a: parsed.amplitude };
}

export function fromLiveValue(value: unknown): v2.LiveEvent {
  const raw = value as { t?: unknown; a?: unknown } | null;
  return v2.LiveEventSchema.parse({ t: raw?.t, amplitude: raw?.a });
}

/** Entries with `t` strictly below this bound are expired and may be deleted. */
export function pruneBound(nowMs: number): number {
  return nowMs - LIVE_RETENTION_MS - PRUNE_MARGIN_MS;
}

/** Exclusive end key of the expired range (`t < bound` <=> `key < endKey`). */
export function pruneEndKey(nowMs: number): string {
  return v2.minuteKey(Math.max(0, pruneBound(nowMs)));
}

/** First key of the window a new subscriber needs. */
export function windowStartKey(nowMs: number): string {
  return v2.minuteKey(Math.max(0, nowMs - LIVE_RETENTION_MS));
}

/**
 * Chooses which fetched entries to delete: only those whose own `t` is expired. Entries that do
 * not look like ours are left alone and counted, so one stray key cannot make the whole batch fail.
 */
export function selectPrunable(
  entries: Iterable<readonly [string, unknown]>,
  nowMs: number,
): { remove: string[]; skipped: number } {
  const bound = pruneBound(nowMs);
  const remove: string[] = [];
  let skipped = 0;
  for (const [key, value] of entries) {
    const t = (value as { t?: unknown } | null)?.t;
    if (typeof t === "number" && Number.isFinite(t) && t < bound) remove.push(key);
    else skipped += 1;
  }
  return { remove, skipped };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
