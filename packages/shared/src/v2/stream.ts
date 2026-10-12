/**
 * Streams and sessions (spec 0083 FR7, FR8).
 */
import { z } from "zod";
import {
  EpochMsSchema,
  IdSchema,
  RandomIdSchema,
  SchemaVersionSchema,
  StationIdSchema,
  UidSchema,
} from "./primitives.js";

/**
 * Stream id: a random id with no uid, because stream ids appear in anonymously readable paths
 * (`statusPublic`, day summaries). Ownership comes from the station (`streamStation` mirror).
 */
export const StreamIdSchema = RandomIdSchema;

export const StreamSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  id: StreamIdSchema,
  ownerUid: UidSchema,
  stationId: StationIdSchema,
  deviceId: IdSchema,
  status: z.enum(["active", "stopped"]),
  createdAt: EpochMsSchema,
});

export const EndReasonSchema = z.enum([
  "stop",
  "reset",
  "usbLoss",
  "powerLoss",
  "configChange",
  "storageError",
  "clockStep",
  "unknown",
]);

export const TimeProvenanceSchema = z.strictObject({
  source: z.enum(["ntp", "rtc", "gps", "none"]),
  offsetMs: z.number(),
  driftPpm: z.number().optional(),
  measuredAt: EpochMsSchema,
});

export const SessionCountersSchema = z.strictObject({
  completeMinutes: z.number().int().nonnegative(),
  /** Partial first/last minutes and minutes invalidated by a counter reset (discarded, as in v5). */
  discardedPartialMinutes: z.number().int().nonnegative(),
  quarantinedLines: z.number().int().nonnegative(),
  eventIdGaps: z.number().int().nonnegative(),
});

export const SessionSchema = z
  .strictObject({
    schemaVersion: SchemaVersionSchema,
    id: IdSchema,
    streamId: StreamIdSchema,
    startedAt: EpochMsSchema,
    endedAt: EpochMsSchema.optional(),
    endReason: EndReasonSchema.optional(),
    agentVersion: z.string().min(1).max(64),
    deviceTypeVersion: z.number().int().positive(),
    calibrationVersion: z.number().int().positive().optional(),
    timeProvenance: TimeProvenanceSchema,
    counters: SessionCountersSchema,
  })
  .refine((s) => (s.endedAt === undefined) === (s.endReason === undefined), {
    message: "endedAt and endReason are set together",
    path: ["endReason"],
  })
  .refine((s) => s.endedAt === undefined || s.endedAt >= s.startedAt, {
    message: "endedAt must not precede startedAt",
    path: ["endedAt"],
  });

export type Stream = z.infer<typeof StreamSchema>;
export type EndReason = z.infer<typeof EndReasonSchema>;
export type TimeProvenance = z.infer<typeof TimeProvenanceSchema>;
export type SessionCounters = z.infer<typeof SessionCountersSchema>;
export type Session = z.infer<typeof SessionSchema>;
