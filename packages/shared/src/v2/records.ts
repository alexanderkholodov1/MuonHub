/**
 * Time-series records (spec 0083 FR10–FR12).
 *
 * Established behavior kept: per-minute records exist only for COMPLETE minutes (partial first/last
 * minutes are discarded, as in v5); intensive quantities are time averages, never sums.
 * Changes labelled in the spec: dead time comes from the device's cumulative counter (increment per
 * minute), and a quantity a device does not report is ABSENT, never 0.
 *
 * Dead time / live time — one definition shared with spec 0085: with a cumulative counter,
 *   deadMs = D(last line of this minute) − D(last line of the previous minute)
 *   liveMs = 60 000 · (1 − deadMs / Δt_device)
 * where Δt_device is the device-clock span between the same two lines (liveSource "counter").
 * Without a counter: liveSource "tau" (declared τ) or "nominal" (no liveMs; uncorrected).
 */
import { z } from "zod";
import {
  AmplitudeUnitSchema,
  EpochMsSchema,
  MinuteTsSchema,
  SchemaVersionSchema,
} from "./primitives.js";

export const LiveSourceSchema = z.enum(["counter", "tau", "nominal"]);

export const AmplitudeSummarySchema = z
  .strictObject({
    mean: z.number(),
    min: z.number(),
    max: z.number(),
    unit: AmplitudeUnitSchema,
  })
  .refine((a) => a.min <= a.mean && a.mean <= a.max, { message: "min ≤ mean ≤ max" });

const count = z.number().int().nonnegative();

export const MinuteRecordSchema = z
  .strictObject({
    schemaVersion: SchemaVersionSchema,
    ts: MinuteTsSchema,
    sessionId: z.string().min(1).max(128),
    n: count,
    coincidences: count.optional(),
    amplitude: AmplitudeSummarySchema.optional(),
    liveSource: LiveSourceSchema,
    liveMs: z.number().gt(0).lte(60_000).optional(),
    deadMs: z.number().nonnegative().optional(),
    temperatureC: z.number().min(-60).max(100).optional(),
    pressureHpa: z.number().gt(0).max(1100).optional(),
    quality: z.strictObject({ eventIdGaps: count, clockAnomalies: count }),
  })
  .superRefine((r, ctx) => {
    if (r.n === 0 && r.amplitude !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["amplitude"],
        message: "amplitude is absent when n = 0",
      });
    }
    if (r.n > 0 && r.amplitude === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["amplitude"],
        message: "amplitude is required when n > 0",
      });
    }
    if (r.liveSource === "nominal" && (r.liveMs !== undefined || r.deadMs !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["liveMs"],
        message: "nominal live time carries no liveMs/deadMs",
      });
    }
    if (r.liveSource !== "nominal" && r.liveMs === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["liveMs"],
        message: "liveMs is required for counter/tau",
      });
    }
    if (r.liveSource === "counter" && r.deadMs === undefined) {
      ctx.addIssue({ code: "custom", path: ["deadMs"], message: "deadMs is required for counter" });
    }
    if (r.liveSource !== "counter" && r.deadMs !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["deadMs"],
        message: "deadMs only comes from a counter",
      });
    }
  });

/** One hour inside a day summary — present only when the hour has at least one complete minute. */
export const HourEntrySchema = z
  .strictObject({
    hourStart: EpochMsSchema.refine((v) => v % 3_600_000 === 0, { message: "start of a UTC hour" }),
    completeMinutes: z.number().int().min(1).max(60),
    n: count,
    liveSource: LiveSourceSchema,
    liveMs: z.number().gt(0).lte(3_600_000).optional(),
    coincidences: count.optional(),
    pressureHpa: z.number().gt(0).max(1100).optional(),
    pressureMinutes: z.number().int().min(1).max(60).optional(),
    temperatureC: z.number().min(-60).max(100).optional(),
    temperatureMinutes: z.number().int().min(1).max(60).optional(),
    /** Counts per fixed bin of the device type (`histogramEdges`), saturated events excluded. */
    histogram: z.array(count).max(1024).optional(),
    /** Saturated events, never also counted in the last regular bin. */
    saturated: count.optional(),
  })
  .superRefine((h, ctx) => {
    if ((h.pressureHpa === undefined) !== (h.pressureMinutes === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["pressureMinutes"],
        message: "pressure mean and its minute count go together",
      });
    }
    if ((h.temperatureC === undefined) !== (h.temperatureMinutes === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["temperatureMinutes"],
        message: "temperature mean and its minute count go together",
      });
    }
    if (h.pressureMinutes !== undefined && h.pressureMinutes > h.completeMinutes) {
      ctx.addIssue({
        code: "custom",
        path: ["pressureMinutes"],
        message: "cannot exceed completeMinutes",
      });
    }
    if (h.temperatureMinutes !== undefined && h.temperatureMinutes > h.completeMinutes) {
      ctx.addIssue({
        code: "custom",
        path: ["temperatureMinutes"],
        message: "cannot exceed completeMinutes",
      });
    }
    if (h.liveSource === "nominal" ? h.liveMs !== undefined : h.liveMs === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["liveMs"],
        message: "liveMs present exactly for counter/tau",
      });
    }
  });

/** `streams/{streamId}/days/{YYYY-MM-DD}`. Hours without complete minutes are absent (gaps). */
export const DaySummarySchema = z
  .strictObject({
    schemaVersion: SchemaVersionSchema,
    streamId: z.string().min(1).max(200),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Keyed by hour of day "00"…"23". */
    hours: z.record(z.string().regex(/^(?:[01]\d|2[0-3])$/), HourEntrySchema),
    updatedAt: EpochMsSchema,
  })
  .superRefine((d, ctx) => {
    const dayStart = Date.parse(`${d.day}T00:00:00Z`);
    if (Number.isNaN(dayStart)) {
      ctx.addIssue({ code: "custom", path: ["day"], message: "invalid calendar day" });
      return;
    }
    for (const [hh, entry] of Object.entries(d.hours)) {
      if (entry.hourStart !== dayStart + Number(hh) * 3_600_000) {
        ctx.addIssue({
          code: "custom",
          path: ["hours", hh],
          message: "hourStart does not match its key",
        });
      }
    }
  });

/** Hour entry of a day summary, or `undefined` for a gap — never a zero-count entry. */
export function hourOf(summary: DaySummary, hour: number): HourEntry | undefined {
  return summary.hours[String(hour).padStart(2, "0")];
}

export const LiveEventSchema = z.strictObject({
  t: EpochMsSchema,
  amplitude: z.number(),
});

/** `status/{streamId}` — owner/editor/members. */
export const StreamStatusSchema = z.strictObject({
  lastSeenAt: EpochMsSchema,
  agentOnline: z.boolean(),
  lastMinuteTs: MinuteTsSchema.optional(),
  /** n of the last complete minute — raw and uncorrected. */
  rawRatePerMin: count.optional(),
});

/** `statusPublic/{streamId}` — the only status fields anonymous visitors may read. */
export const StreamStatusPublicSchema = z.strictObject({
  lastSeenAt: EpochMsSchema,
  agentOnline: z.boolean(),
});

export type LiveSource = z.infer<typeof LiveSourceSchema>;
export type AmplitudeSummary = z.infer<typeof AmplitudeSummarySchema>;
export type MinuteRecord = z.infer<typeof MinuteRecordSchema>;
export type HourEntry = z.infer<typeof HourEntrySchema>;
export type DaySummary = z.infer<typeof DaySummarySchema>;
export type LiveEvent = z.infer<typeof LiveEventSchema>;
export type StreamStatus = z.infer<typeof StreamStatusSchema>;
export type StreamStatusPublic = z.infer<typeof StreamStatusPublicSchema>;
