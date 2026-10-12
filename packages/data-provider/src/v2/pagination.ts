/**
 * Cursor pagination for per-minute range reads (B-M1-15). Pure logic, shared by the Firebase and
 * in-memory providers. Cursor = the key (zero-padded ts) of the last entry of the previous page,
 * so quarantined entries never stall a scan.
 */
import { v2 } from "@muonhub/shared";
import { DataProviderError } from "./errors.js";
import { parseEntries, type Page } from "./quarantine.js";

export const DEFAULT_PAGE_SIZE = 1000;
export const MAX_PAGE_SIZE = 5000;

export interface MinuteRangeQuery {
  /** Inclusive start (UTC ms). */
  fromTs: number;
  /** Exclusive end (UTC ms). */
  toTs: number;
  limit?: number;
  cursor?: string | null;
}

export interface MinuteRangePlan {
  startKey: string;
  /** True when the first key to read comes strictly after `startKey` (a cursor was given). */
  startExclusive: boolean;
  /** Exclusive end key. */
  endKey: string;
  limit: number;
  /** One more than `limit`, so a following page is detected without a second request. */
  fetchLimit: number;
}

const KEY = /^\d{13}$/;

export function planMinuteRange(query: MinuteRangeQuery): MinuteRangePlan {
  const { fromTs, toTs } = query;
  if (!Number.isSafeInteger(fromTs) || !Number.isSafeInteger(toTs) || fromTs < 0 || toTs <= fromTs) {
    throw new DataProviderError("invalid-argument", {
      message: "Minute range needs integer fromTs >= 0 and toTs > fromTs.",
    });
  }
  const limit = query.limit ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new DataProviderError("invalid-argument", {
      message: `Page size must be an integer between 1 and ${MAX_PAGE_SIZE}.`,
    });
  }
  const fromKey = v2.minuteKey(fromTs);
  const endKey = v2.minuteKey(toTs);
  const cursor = query.cursor ?? null;
  if (cursor !== null && !KEY.test(cursor)) {
    throw new DataProviderError("invalid-argument", { message: "Invalid pagination cursor." });
  }
  const useCursor = cursor !== null && cursor >= fromKey;
  return {
    startKey: useCursor ? cursor : fromKey,
    startExclusive: useCursor,
    endKey,
    limit,
    fetchLimit: limit + 1,
  };
}

/**
 * Builds a page from entries already sorted by key and fetched with `plan.fetchLimit`.
 * Invalid records are quarantined, never dropped.
 */
export function buildMinutePage(
  entries: readonly (readonly [string, unknown])[],
  plan: Pick<MinuteRangePlan, "limit">,
): Page<v2.MinuteRecord> {
  const taken = entries.slice(0, plan.limit);
  const hasMore = entries.length > plan.limit;
  const parsed = parseEntries(taken, (key, value) =>
    v2.deserializeMinute(key, value as v2.CompactMinute),
  );
  const last = taken[taken.length - 1];
  return {
    ...parsed,
    nextCursor: hasMore && last !== undefined ? last[0] : null,
  };
}

/** Iterates a whole range page by page (exports must never stop at an arbitrary cap). */
export async function* iteratePages<T>(
  fetchPage: (cursor: string | null) => Promise<Page<T>>,
): AsyncGenerator<Page<T>, void, undefined> {
  let cursor: string | null = null;
  for (;;) {
    const page: Page<T> = await fetchPage(cursor);
    yield page;
    if (page.nextCursor === null) return;
    if (page.nextCursor === cursor) {
      throw new DataProviderError("internal", { message: "Pagination cursor did not advance." });
    }
    cursor = page.nextCursor;
  }
}
