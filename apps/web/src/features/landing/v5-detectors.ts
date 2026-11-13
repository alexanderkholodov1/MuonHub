/**
 * The detectors that munhub-lab (MunHub v5) lists as public, read-only from the v5 Realtime Database
 * over REST: the same rule as munhub-lab (every profile not marked private). For each profile only its
 * name, visibility, latest time and session keys are read — never the profile's root, which carries
 * personal fields. Profiles listed twice under one name are merged, keeping the most recent data.
 */
import { V5_PROFILES } from "./live-feed";
import { QUIET_AFTER_MS } from "./useLiveFeed";

export interface V5Detector {
  /** Profile key in v5. */
  key: string;
  name: string;
  /** Sent data in the last few minutes. */
  live: boolean;
  /** Time of the latest recorded data (epoch ms), when any. */
  lastDataTs: number | null;
  /** Recording sessions in v5. */
  sessions: number;
  /** Time of the first recorded minute (epoch ms), when any. */
  firstDataTs: number | null;
  /** Counts of the last recorded minutes (up to an hour), oldest first, for a sparkline. */
  recentCounts: number[];
  /** The session holding the latest minutes, when any. */
  lastSession: string | null;
}

async function get(path: string, query: string, signal: AbortSignal): Promise<unknown> {
  const url = `${V5_PROFILES}${path === "" ? "" : `/${path}`}.json${query === "" ? "" : `?${query}`}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`v5 answered ${String(res.status)}`);
  return (await res.json()) as unknown;
}

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;
const asMs = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? (v < 1e11 ? v * 1000 : v) : null;
const keysOf = (v: unknown): string[] =>
  v !== null && typeof v === "object" ? Object.keys(v) : [];

/** Merges profiles shown under the same name (munhub-lab lists such duplicates twice). */
export function mergeByName(detectors: readonly V5Detector[]): V5Detector[] {
  const byName = new Map<string, V5Detector>();
  for (const d of detectors) {
    const seen = byName.get(d.name);
    if (seen === undefined) {
      byName.set(d.name, d);
      continue;
    }
    const newer = (d.lastDataTs ?? 0) > (seen.lastDataTs ?? 0) ? d : seen;
    const firsts = [d.firstDataTs, seen.firstDataTs].filter((x): x is number => x !== null);
    byName.set(d.name, {
      ...newer,
      live: d.live || seen.live,
      sessions: d.sessions + seen.sessions,
      firstDataTs: firsts.length > 0 ? Math.min(...firsts) : null,
    });
  }
  return [...byName.values()].sort(
    (a, b) => Number(b.live) - Number(a.live) || (b.lastDataTs ?? 0) - (a.lastDataTs ?? 0),
  );
}

async function readProfile(
  key: string,
  signal: AbortSignal,
  now: number,
): Promise<V5Detector | null> {
  const k = encodeURIComponent(key);
  const [visibility, name, metaName, latestTs, sessions] = await Promise.all([
    get(`${k}/visibility`, "", signal),
    get(`${k}/name`, "", signal),
    get(`${k}/meta/name`, "", signal),
    get(`${k}/latest/ts`, "", signal),
    get(`${k}/sessions`, "shallow=true", signal),
  ]);
  if (visibility === "private") return null;
  const sessionKeys = keysOf(sessions).sort();
  let lastMinute: number | null = null;
  let firstMinute: number | null = null;
  let recentCounts: number[] = [];
  const lastSession = sessionKeys.at(-1);
  const firstSession = sessionKeys[0];
  const byKey = `orderBy=${encodeURIComponent('"$key"')}`;
  if (lastSession !== undefined && firstSession !== undefined) {
    const [last, first] = await Promise.all([
      get(
        `${k}/sessions/${encodeURIComponent(lastSession)}/minutes`,
        `${byKey}&limitToLast=60`,
        signal,
      ),
      get(
        `${k}/sessions/${encodeURIComponent(firstSession)}/minutes`,
        `${byKey}&limitToFirst=1`,
        signal,
      ),
    ]);
    const lastKeys = keysOf(last).sort((a, b) => Number(a) - Number(b));
    lastMinute = asMs(Number(lastKeys.at(-1)));
    // A session key often carries its start (`session_<epoch ms>`); the first one that does is the
    // detector's first data. Otherwise, the first minute of the first session.
    const starts = sessionKeys
      .map((key) => /^session_(\d{13})$/.exec(key)?.[1])
      .filter((x): x is string => x !== undefined)
      .map(Number);
    firstMinute = starts.length > 0 ? Math.min(...starts) : asMs(Number(keysOf(first)[0]));
    const minutes = last as Record<string, unknown>;
    recentCounts = lastKeys
      .map((key) => (minutes[key] as { ec?: unknown } | null)?.ec)
      .filter((ec): ec is number => typeof ec === "number");
  }
  const latest = asMs(latestTs);
  const lastDataTs = Math.max(latest ?? 0, lastMinute ?? 0) || null;
  return {
    key,
    name: asString(name) ?? asString(metaName) ?? key,
    live: latest !== null && now - latest <= QUIET_AFTER_MS,
    lastDataTs,
    sessions: sessionKeys.length,
    firstDataTs: firstMinute,
    recentCounts,
    lastSession: recentCounts.length > 0 ? (lastSession ?? null) : null,
  };
}

/** Every public v5 detector, live ones first, then by their latest data. */
export async function fetchV5Detectors(signal: AbortSignal): Promise<V5Detector[]> {
  const keys = keysOf(await get("", "shallow=true", signal));
  const now = Date.now();
  const read = await Promise.all(keys.map((key) => readProfile(key, signal, now)));
  return mergeByName(read.filter((d): d is V5Detector => d !== null));
}
