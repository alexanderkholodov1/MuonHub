/**
 * Compact Realtime Database form of a minute record (spec 0083 FR17).
 *
 * Path: `minutes/{streamId}/{key}` where key = ts zero-padded to 13 digits (lexicographic order =
 * time order). Absent fields are omitted, never written as 0.
 *
 * | key | field                    | key | field                  |
 * |-----|--------------------------|-----|------------------------|
 * | v   | schemaVersion (2)        | lm  | liveMs                 |
 * | s   | sessionId                | dm  | deadMs                 |
 * | n   | n                        | t   | temperatureC           |
 * | c   | coincidences             | p   | pressureHpa            |
 * | am  | amplitude.mean           | qg  | quality.eventIdGaps    |
 * | an  | amplitude.min            | qc  | quality.clockAnomalies |
 * | ax  | amplitude.max            | l   | liveSource (c/t/n)     |
 * | au  | amplitude.unit           |     |                        |
 */
import { MinuteRecordSchema, type LiveSource, type MinuteRecord } from "./records.js";

export interface CompactMinute {
  v: 2;
  s: string;
  n: number;
  c?: number;
  am?: number;
  an?: number;
  ax?: number;
  au?: "mV" | "V" | "adc";
  l: "c" | "t" | "n";
  lm?: number;
  dm?: number;
  t?: number;
  p?: number;
  qg: number;
  qc: number;
}

const LIVE_TO: Record<LiveSource, CompactMinute["l"]> = { counter: "c", tau: "t", nominal: "n" };
const LIVE_FROM: Record<CompactMinute["l"], LiveSource> = { c: "counter", t: "tau", n: "nominal" };

export function minuteKey(ts: number): string {
  return String(ts).padStart(13, "0");
}

export function serializeMinute(record: MinuteRecord): { key: string; value: CompactMinute } {
  const r = MinuteRecordSchema.parse(record);
  const value: CompactMinute = {
    v: 2,
    s: r.sessionId,
    n: r.n,
    l: LIVE_TO[r.liveSource],
    qg: r.quality.eventIdGaps,
    qc: r.quality.clockAnomalies,
  };
  if (r.coincidences !== undefined) value.c = r.coincidences;
  if (r.amplitude !== undefined) {
    value.am = r.amplitude.mean;
    value.an = r.amplitude.min;
    value.ax = r.amplitude.max;
    value.au = r.amplitude.unit;
  }
  if (r.liveMs !== undefined) value.lm = r.liveMs;
  if (r.deadMs !== undefined) value.dm = r.deadMs;
  if (r.temperatureC !== undefined) value.t = r.temperatureC;
  if (r.pressureHpa !== undefined) value.p = r.pressureHpa;
  return { key: minuteKey(r.ts), value };
}

export function deserializeMinute(key: string, value: CompactMinute): MinuteRecord {
  if (!/^\d{13}$/.test(key)) throw new Error(`invalid minute key: ${key}`);
  const record: Record<string, unknown> = {
    schemaVersion: value.v,
    ts: Number(key),
    sessionId: value.s,
    n: value.n,
    liveSource: LIVE_FROM[value.l],
    quality: { eventIdGaps: value.qg, clockAnomalies: value.qc },
  };
  if (value.c !== undefined) record.coincidences = value.c;
  if (
    value.am !== undefined ||
    value.an !== undefined ||
    value.ax !== undefined ||
    value.au !== undefined
  ) {
    record.amplitude = { mean: value.am, min: value.an, max: value.ax, unit: value.au };
  }
  if (value.lm !== undefined) record.liveMs = value.lm;
  if (value.dm !== undefined) record.deadMs = value.dm;
  if (value.t !== undefined) record.temperatureC = value.t;
  if (value.p !== undefined) record.pressureHpa = value.p;
  return MinuteRecordSchema.parse(record);
}
