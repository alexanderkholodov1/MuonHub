/**
 * The landing's live window on the detector that is running now at the LEOPARD lab (USFQ).
 *
 * Temporary bridge (spec 0092, draft): until the v6 agent runs at the lab and publishes its own public
 * window (ADR-005 §6, M1 steps 9–11), the landing reads the detector's public v5 profile, read-only,
 * over the Realtime Database REST API. Only two paths are read: `realtime` (the individual events of
 * the last minutes) and `sessions/<session>/minutes` (one record per minute). The profile's root is
 * never read: it carries personal fields.
 */
import { z } from "zod";

/** The public profiles of MunHub v5, the data behind munhub-lab.web.app. */
export const V5_PROFILES = "https://munhub-1-default-rtdb.firebaseio.com/profiles";

export const LIVE_SOURCE = {
  base: `${V5_PROFILES}/leopard_test`,
  station: "LEOPARD Lab — USFQ",
  place: "Quito, Ecuador",
  timeZone: "America/Guayaquil",
} as const;

/** One pulse of the detector: a charged particle crossed the scintillator. */
export interface ParticleEvent {
  /** Detection time, epoch milliseconds (also the event's key). */
  ts: number;
  /** SiPM pulse reading as v5 records it; used only for relative brightness. */
  amplitude: number;
}

/** One minute as the detector recorded it: counts are uncorrected. */
export interface MinuteRecord {
  /** Start of the minute, epoch milliseconds. */
  start: number;
  count: number;
  /** Station pressure in hPa, when recorded. */
  pressureHpa: number | null;
  /** Temperature inside the detector in °C, when recorded. */
  temperatureC: number | null;
  /** Mean SiPM pulse of the minute in mV, as v5 records it (munhub-lab's "SiPM avg"). */
  sipmMeanMv: number | null;
}

const EventSchema = z.object({ ts: z.number().int().positive(), sipm: z.number().optional() });
const MinuteSchema = z.object({
  ec: z.number().int().nonnegative(),
  pr: z.number().positive().optional(),
  tp: z.number().optional(),
  sm: z.number().optional(),
});

function entries(raw: unknown): Array<[string, unknown]> {
  return raw !== null && typeof raw === "object" ? Object.entries(raw) : [];
}

/** Valid events, oldest first; malformed entries are skipped. */
export function parseEvents(raw: unknown): ParticleEvent[] {
  const out: ParticleEvent[] = [];
  for (const [, value] of entries(raw)) {
    const parsed = EventSchema.safeParse(value);
    if (parsed.success) out.push({ ts: parsed.data.ts, amplitude: parsed.data.sipm ?? 0 });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/** Valid minutes (keys are epoch seconds), oldest first; malformed entries are skipped. */
export function parseMinutes(raw: unknown): MinuteRecord[] {
  const out: MinuteRecord[] = [];
  for (const [key, value] of entries(raw)) {
    const seconds = Number(key);
    const parsed = MinuteSchema.safeParse(value);
    if (!Number.isInteger(seconds) || seconds <= 0 || !parsed.success) continue;
    out.push({
      start: seconds * 1000,
      count: parsed.data.ec,
      pressureHpa: parsed.data.pr === undefined ? null : parsed.data.pr / 100,
      temperatureC: parsed.data.tp ?? null,
      sipmMeanMv: parsed.data.sm ?? null,
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The most recent session key of a shallow listing (`session_<epoch ms>`), or null. */
export function latestSessionKey(raw: unknown): string | null {
  const keys = entries(raw)
    .map(([key]) => key)
    .filter((key) => /^session_\d+$/.test(key))
    .sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)));
  return keys.at(-1) ?? null;
}

async function getJson(path: string, query: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(`${LIVE_SOURCE.base}/${path}.json?${query}`, { signal });
  if (!res.ok) throw new Error(`live source answered ${String(res.status)}`);
  return (await res.json()) as unknown;
}

const byKey = `orderBy=${encodeURIComponent('"$key"')}`;

/** Events newer than `afterTs` (or the latest `initial` ones when null), oldest first. */
export async function fetchEvents(
  afterTs: number | null,
  signal: AbortSignal,
  initial = 120,
): Promise<ParticleEvent[]> {
  const query =
    afterTs === null
      ? `${byKey}&limitToLast=${String(initial)}`
      : `${byKey}&startAt=${encodeURIComponent(`"${String(afterTs + 1)}"`)}&limitToFirst=1000`;
  return parseEvents(await getJson("realtime", query, signal)).filter(
    (e) => afterTs === null || e.ts > afterTs,
  );
}

/** The last `count` recorded minutes of the current session, oldest first. */
export async function fetchMinutes(count: number, signal: AbortSignal): Promise<MinuteRecord[]> {
  const session = latestSessionKey(await getJson("sessions", "shallow=true", signal));
  if (session === null) return [];
  const raw = await getJson(
    `sessions/${encodeURIComponent(session)}/minutes`,
    `${byKey}&limitToLast=${String(count)}`,
    signal,
  );
  return parseMinutes(raw);
}
