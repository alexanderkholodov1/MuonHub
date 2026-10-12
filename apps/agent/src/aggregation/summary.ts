/**
 * Hour summaries (spec 0087 FR8), rebuilt from the minutes stored locally — never from in-memory
 * state — so a restart inside the hour cannot overwrite an entry with partial data. Hours with no
 * complete minute produce no entry (a gap is never a zero).
 */
import { v2 } from "@muonhub/shared";
import type { LocalStore, MinuteRow, SessionRow } from "../store/types.js";

export const HOUR_MS = 3_600_000;

export function hourStartOf(ts: number): number {
  return Math.floor(ts / HOUR_MS) * HOUR_MS;
}

/** `YYYY-MM-DD` (UTC) and the zero-padded hour key of an hour start. */
export function dayAndHour(hourStart: number): { day: string; hh: string } {
  const d = new Date(hourStart);
  const day = d.toISOString().slice(0, 10);
  return { day, hh: String(d.getUTCHours()).padStart(2, "0") };
}

export function buildHourEntry(
  hourStart: number,
  minutes: readonly MinuteRow[],
  histogramBins?: number,
): v2.HourEntry | null {
  if (minutes.length === 0) return null;
  let n = 0;
  let coincidences: number | undefined;
  let liveMs = 0;
  let allLive = true;
  let allCounter = true;
  let pSum = 0;
  let pMin = 0;
  let tSum = 0;
  let tMin = 0;
  let hist: number[] | null = null;
  let histOk = histogramBins !== undefined;
  let saturated = 0;
  for (const m of minutes) {
    const r = m.record;
    n += r.n;
    if (r.coincidences !== undefined) coincidences = (coincidences ?? 0) + r.coincidences;
    if (r.liveMs === undefined) allLive = false;
    else liveMs += r.liveMs;
    if (r.liveSource !== "counter") allCounter = false;
    if (m.aux.pressureCount !== undefined && m.aux.pressureSum !== undefined) {
      // Time average: the mean of the minute means (every minute spans the same 60 s).
      pSum += m.aux.pressureSum / m.aux.pressureCount;
      pMin += 1;
    }
    if (m.aux.temperatureCount !== undefined && m.aux.temperatureSum !== undefined) {
      tSum += m.aux.temperatureSum / m.aux.temperatureCount;
      tMin += 1;
    }
    if (r.n > 0) {
      if (m.aux.histogram === undefined || m.aux.histogram.length !== histogramBins) histOk = false;
      else {
        hist ??= new Array<number>(m.aux.histogram.length).fill(0);
        m.aux.histogram.forEach((c, i) => {
          hist![i] = (hist![i] ?? 0) + c;
        });
        saturated += m.aux.saturated ?? 0;
      }
    }
  }
  const entry: Record<string, unknown> = {
    hourStart,
    completeMinutes: minutes.length,
    n,
    liveSource: allLive ? (allCounter ? "counter" : "tau") : "nominal",
  };
  if (allLive) entry["liveMs"] = liveMs;
  if (coincidences !== undefined) entry["coincidences"] = coincidences;
  if (pMin > 0) {
    entry["pressureHpa"] = pSum / pMin;
    entry["pressureMinutes"] = pMin;
  }
  if (tMin > 0) {
    entry["temperatureC"] = tSum / tMin;
    entry["temperatureMinutes"] = tMin;
  }
  if (histOk && hist !== null) {
    entry["histogram"] = hist;
    entry["saturated"] = saturated;
  } else if (histOk && histogramBins !== undefined && n === 0) {
    entry["histogram"] = new Array<number>(histogramBins).fill(0);
    entry["saturated"] = 0;
  }
  return v2.HourEntrySchema.parse(entry);
}

/**
 * Rebuilds the hour entry from the minutes in the local store and enqueues it when it changed since
 * the last revision: a recomputed hour is a new revision, never a silent overwrite (spec 0087 FR8).
 * The session's counters ride along (uploaded "at each hourly summary").
 */
export function enqueueHourSummary(
  store: LocalStore,
  streamId: string,
  deviceType: v2.DeviceType,
  hourStart: number,
  session: SessionRow | null,
): void {
  const minutes = store.minutesInRange(streamId, hourStart, hourStart + HOUR_MS);
  const edges = deviceType.defaults.histogramEdges;
  const entry = buildHourEntry(
    hourStart,
    minutes,
    edges === undefined ? undefined : edges.length - 1,
  );
  if (entry === null) return;
  const previous = store.latestSummary(streamId, hourStart);
  if (previous !== null && JSON.stringify(previous.entry) === JSON.stringify(entry)) return;
  const rev = previous === null ? 0 : previous.rev + 1;
  store.transaction(() => {
    store.saveSummary(streamId, hourStart, rev, entry);
    store.enqueue({
      streamId,
      kind: "hour",
      ts: hourStart,
      rev,
      sessionId: null,
      payload: JSON.stringify(entry),
    });
    if (session !== null) {
      const c = session.counters;
      store.enqueue({
        streamId,
        kind: "session-counters",
        ts: session.startedAt,
        rev: hourStart / HOUR_MS,
        sessionId: session.id,
        payload: JSON.stringify({
          completeMinutes: c.completeMinutes,
          discardedPartialMinutes: c.discardedPartialMinutes,
          quarantinedLines: c.quarantinedLines,
          eventIdGaps: c.eventIdGaps,
        }),
      });
    }
  });
}
