/**
 * Invalid stored records are never dropped silently: readers return them as a quarantine count
 * with a few samples so callers can show or log the problem (B-M1-15).
 */
export interface QuarantineEntry {
  key: string;
  /** Human-readable reason; never contains stored values. */
  reason: string;
}

export interface Quarantine {
  count: number;
  /** At most {@link QUARANTINE_SAMPLE_LIMIT} entries. */
  samples: QuarantineEntry[];
}

export const QUARANTINE_SAMPLE_LIMIT = 20;

export interface ListResult<T> {
  items: T[];
  quarantine: Quarantine;
}

export interface Page<T> extends ListResult<T> {
  /** Pass to the next call to continue; `null` when the range is exhausted. */
  nextCursor: string | null;
}

export function emptyQuarantine(): Quarantine {
  return { count: 0, samples: [] };
}

export class QuarantineCollector {
  private count = 0;
  private readonly samples: QuarantineEntry[] = [];

  add(key: string, reason: string): void {
    this.count += 1;
    if (this.samples.length < QUARANTINE_SAMPLE_LIMIT) this.samples.push({ key, reason });
  }

  result(): Quarantine {
    return { count: this.count, samples: [...this.samples] };
  }
}

/** Describes a failure without echoing stored values. */
export function describeFailure(error: unknown): string {
  if (typeof error === "object" && error !== null && "issues" in error) {
    const issues = (error as { issues: { path: PropertyKey[]; message: string }[] }).issues;
    const first = issues[0];
    if (first !== undefined) {
      const path = first.path.map(String).join(".");
      return `${path === "" ? "(root)" : path}: ${first.message}`;
    }
  }
  return error instanceof Error ? error.name : "malformed record";
}

/** Validates each entry with `parse`; failures go to the quarantine, successes to `items`. */
export function parseEntries<T>(
  entries: Iterable<readonly [string, unknown]>,
  parse: (key: string, value: unknown) => T,
): ListResult<T> {
  const items: T[] = [];
  const quarantine = new QuarantineCollector();
  for (const [key, value] of entries) {
    try {
      items.push(parse(key, value));
    } catch (error) {
      quarantine.add(key, describeFailure(error));
    }
  }
  return { items, quarantine: quarantine.result() };
}

