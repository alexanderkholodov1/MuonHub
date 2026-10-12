/**
 * Complete-minute aggregation (spec 0087 FR7; spec 0083 FR10). Pure: no I/O, no clock.
 *
 * Rules (ADR-006):
 *  - minute boundaries are on the host UTC clock;
 *  - only COMPLETE minutes become records: the first partial minute after a session start (or after
 *    a long silence) and the last partial minute before an end are discarded and counted — their raw
 *    lines remain in layer 0;
 *  - a minute completes only when a later line proves the device was alive past its end; with no
 *    such line it is never emitted, so silence cannot look like "zero counts";
 *  - n counts parsed event lines (one per line, as in v5); amplitude is absent when n = 0;
 *  - liveMs/deadMs come from the cumulative dead-time counter between the last line of the previous
 *    minute and the last line of this one (`@muonhub/physics`); without a counter the minute is
 *    "tau" (declared τ) or "nominal" (no liveMs — never a fabricated 60 000);
 *  - temperature and pressure are means of the valid readings, absent when none was reported;
 *  - event-ID gaps are counted (missing IDs), never added to n.
 */
import { v2 } from "@muonhub/shared";
import { deadFractionFromCounter, liveMsForMinute, type CounterSample } from "@muonhub/physics";
import type { ParsedEvent } from "../parsing/parser.js";
import type { MinuteAux } from "../store/types.js";

export const MINUTE_MS = 60_000;

export type AggregatorOutput =
  | { kind: "minute"; record: v2.MinuteRecord; aux: MinuteAux }
  | { kind: "discard"; ts: number; reason: "partial" | "gap" | "end" }
  | { kind: "invalid"; ts: number; reason: string };

export interface AggregatorConfig {
  deviceType: v2.DeviceType;
  /** Saturation threshold override (device defaults otherwise). */
  saturation?: { value: number; unit: v2.AmplitudeUnit } | undefined;
}

interface Current {
  ts: number;
  partial: boolean;
  n: number;
  ampN: number;
  ampSum: number;
  ampMin: number;
  ampMax: number;
  ampUnit: v2.AmplitudeUnit | null;
  coincidences: number;
  hasCoincidenceField: boolean;
  temp: { sum: number; n: number };
  pres: { sum: number; n: number };
  hist: number[] | null;
  saturated: number;
  eventIdGaps: number;
  deadSumUs: number;
  last: CounterSample | null;
}

const floorMinute = (ms: number): number => Math.floor(ms / MINUTE_MS) * MINUTE_MS;

export class MinuteAggregator {
  private sessionId = "";
  private cur: Current | null = null;
  private prevRef: CounterSample | null = null;
  private nextPartial = true;
  private lastEventId: number | null = null;
  private gapsTotal = 0;
  private readonly edges: readonly number[] | undefined;
  private readonly saturation: { value: number; unit: v2.AmplitudeUnit } | undefined;
  private readonly hasCoincidence: boolean;

  constructor(private readonly config: AggregatorConfig) {
    this.edges = config.deviceType.defaults.histogramEdges;
    this.saturation = config.saturation ?? config.deviceType.defaults.saturation;
    this.hasCoincidence = config.deviceType.parser.fields.some(
      (f) => f.quantity === "coincidenceFlag",
    );
  }

  /** Begins a new session: nothing carries over (first minute is partial). */
  startSession(sessionId: string): void {
    this.sessionId = sessionId;
    this.gapsTotal = 0;
    this.cur = null;
    this.prevRef = null;
    this.nextPartial = true;
    this.lastEventId = null;
  }

  /** Missing event IDs seen in this session, partial minutes included. */
  get eventIdGapTotal(): number {
    return this.gapsTotal;
  }

  /** Whether a minute is in progress (used by crash recovery and status). */
  get inProgress(): boolean {
    return this.cur !== null;
  }

  /**
   * A long silence inside a session: the minute in progress cannot be proven complete, and the next
   * minute starts partial. The counter reference is dropped (it no longer borders the next minute).
   */
  gap(): AggregatorOutput[] {
    const out: AggregatorOutput[] = [];
    if (this.cur !== null) out.push({ kind: "discard", ts: this.cur.ts, reason: "gap" });
    this.cur = null;
    this.prevRef = null;
    this.nextPartial = true;
    this.lastEventId = null;
    return out;
  }

  /** Ends the session: the minute in progress is partial and discarded. */
  end(): AggregatorOutput[] {
    const out: AggregatorOutput[] = [];
    if (this.cur !== null) out.push({ kind: "discard", ts: this.cur.ts, reason: "end" });
    this.cur = null;
    this.prevRef = null;
    this.nextPartial = true;
    this.lastEventId = null;
    return out;
  }

  add(hostTs: number, event: ParsedEvent): AggregatorOutput[] {
    const out: AggregatorOutput[] = [];
    const m = floorMinute(hostTs);
    if (this.cur !== null && m > this.cur.ts) {
      out.push(...this.close(this.cur));
      const closedTs = this.cur.ts;
      this.cur = null;
      // Minutes with no line at all between two lines closer than the silence window are real
      // zero-count minutes (n = 0): the device was alive on both sides of them.
      for (let ts = closedTs + MINUTE_MS; ts < m; ts += MINUTE_MS) {
        out.push(this.finish(this.fresh(ts, false)));
      }
    }
    if (this.cur === null) {
      this.cur = this.fresh(m, this.nextPartial);
      this.nextPartial = false;
    } else if (m < this.cur.ts) {
      // The caller detects clock steps; a line older than the minute in progress is ignored here.
      out.push({ kind: "invalid", ts: m, reason: "line older than the minute in progress" });
      return out;
    }
    this.accumulate(this.cur, event);
    return out;
  }

  private fresh(ts: number, partial: boolean): Current {
    return {
      ts,
      partial,
      n: 0,
      ampN: 0,
      ampSum: 0,
      ampMin: Infinity,
      ampMax: -Infinity,
      ampUnit: null,
      coincidences: 0,
      hasCoincidenceField: this.hasCoincidence,
      temp: { sum: 0, n: 0 },
      pres: { sum: 0, n: 0 },
      hist: this.edges === undefined ? null : new Array<number>(this.edges.length - 1).fill(0),
      saturated: 0,
      eventIdGaps: 0,
      deadSumUs: 0,
      last: null,
    };
  }

  private accumulate(c: Current, e: ParsedEvent): void {
    c.n += 1;
    if (e.eventId !== undefined) {
      if (this.lastEventId !== null && e.eventId > this.lastEventId + 1) {
        c.eventIdGaps += e.eventId - this.lastEventId - 1;
        this.gapsTotal += e.eventId - this.lastEventId - 1;
      }
      this.lastEventId = e.eventId;
    }
    if (e.amplitude !== undefined && Number.isFinite(e.amplitude.value)) {
      const a = e.amplitude;
      if (c.ampUnit === null || c.ampUnit === a.unit) {
        c.ampUnit = a.unit;
        c.ampN += 1;
        c.ampSum += a.value;
        c.ampMin = Math.min(c.ampMin, a.value);
        c.ampMax = Math.max(c.ampMax, a.value);
        this.binAmplitude(c, a.value, a.unit);
      }
    }
    if (e.coincidence === true) c.coincidences += 1;
    // Out-of-range readings (e.g. a sensor printing 0) are absent, never averaged in as values.
    if (e.temperatureC !== undefined && e.temperatureC >= -60 && e.temperatureC <= 100) {
      c.temp.sum += e.temperatureC;
      c.temp.n += 1;
    }
    if (e.pressureHpa !== undefined && e.pressureHpa > 0 && e.pressureHpa <= 1100) {
      c.pres.sum += e.pressureHpa;
      c.pres.n += 1;
    }
    if (e.deadTimeUs !== undefined) c.deadSumUs += e.deadTimeUs;
    if (e.deadTimeUs !== undefined && e.deviceTimeMs !== undefined) {
      c.last = { deadTimeUs: e.deadTimeUs, deviceTimeMs: e.deviceTimeMs };
    }
  }

  private binAmplitude(c: Current, value: number, unit: v2.AmplitudeUnit): void {
    const edges = this.edges;
    if (c.hist === null || edges === undefined) return;
    if (
      this.saturation !== undefined &&
      this.saturation.unit === unit &&
      value >= this.saturation.value
    ) {
      c.saturated += 1;
      return;
    }
    const last = edges.length - 1;
    let lo = 0;
    let hi = last - 1;
    // Values below the first edge go to the first bin, at or above the last edge to the last bin.
    if (value >= (edges[last] ?? Infinity)) {
      c.hist[last - 1] = (c.hist[last - 1] ?? 0) + 1;
      return;
    }
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (value >= (edges[mid] ?? Infinity)) lo = mid;
      else hi = mid - 1;
    }
    c.hist[lo] = (c.hist[lo] ?? 0) + 1;
  }

  private close(c: Current): AggregatorOutput[] {
    const out: AggregatorOutput[] = [];
    if (c.partial) {
      out.push({ kind: "discard", ts: c.ts, reason: "partial" });
    } else {
      out.push(this.finish(c));
    }
    // The last line of this minute is the counter reference of the next one, partial or not.
    if (c.last !== null) this.prevRef = c.last;
    return out;
  }

  private finish(c: Current): AggregatorOutput {
    const dt = this.config.deviceType.deadTimeSemantics;
    let liveSource: v2.LiveSource = "nominal";
    let liveMs: number | undefined;
    let deadMs: number | undefined;
    if (dt.kind === "cumulative" && c.last !== null && this.prevRef !== null) {
      const r = deadFractionFromCounter(this.prevRef, c.last);
      if (
        r.status === "ok" &&
        r.deadFraction !== undefined &&
        r.deadMs !== undefined &&
        r.deadFraction < 1
      ) {
        liveSource = "counter";
        liveMs = liveMsForMinute(r.deadFraction);
        deadMs = r.deadMs;
      }
    } else if (dt.kind !== "cumulative" && this.config.deviceType.defaults.tauUs !== undefined) {
      const live = MINUTE_MS - (c.n * this.config.deviceType.defaults.tauUs) / 1000;
      if (live > 0) {
        liveSource = "tau";
        liveMs = live;
      }
    }
    const aux: MinuteAux = {};
    if (c.hist !== null && c.ampN > 0) {
      aux.histogram = c.hist;
      aux.saturated = c.saturated;
    }
    if (c.pres.n > 0) {
      aux.pressureSum = c.pres.sum;
      aux.pressureCount = c.pres.n;
    }
    if (c.temp.n > 0) {
      aux.temperatureSum = c.temp.sum;
      aux.temperatureCount = c.temp.n;
    }
    const candidate = {
      schemaVersion: 2,
      ts: c.ts,
      sessionId: this.sessionId,
      n: c.n,
      ...(c.hasCoincidenceField ? { coincidences: c.coincidences } : {}),
      ...(c.ampN > 0 && c.ampUnit !== null
        ? { amplitude: { mean: c.ampSum / c.ampN, min: c.ampMin, max: c.ampMax, unit: c.ampUnit } }
        : {}),
      liveSource,
      ...(liveMs === undefined ? {} : { liveMs }),
      ...(deadMs === undefined ? {} : { deadMs }),
      ...(c.temp.n > 0 ? { temperatureC: c.temp.sum / c.temp.n } : {}),
      ...(c.pres.n > 0 ? { pressureHpa: c.pres.sum / c.pres.n } : {}),
      quality: { eventIdGaps: c.eventIdGaps, clockAnomalies: 0 },
    };
    const parsed = v2.MinuteRecordSchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        kind: "invalid",
        ts: c.ts,
        reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      };
    }
    return { kind: "minute", record: parsed.data, aux };
  }
}
