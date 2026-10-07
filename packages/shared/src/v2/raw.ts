/**
 * Raw line — layer 0 (spec 0083 FR14). Stored only in the agent's local SQLite; never modified.
 */
import { z } from "zod";
import { EpochMsSchema, IdSchema } from "./primitives.js";

export const RawLineSchema = z.strictObject({
  deviceId: IdSchema,
  /** Host wall-clock time at reception (ms). */
  hostTs: EpochMsSchema,
  /** Host monotonic clock (ns, as a decimal string to keep full precision). */
  monotonicNs: z.string().regex(/^\d+$/),
  text: z.string().max(4096),
  byteLength: z.number().int().nonnegative(),
});

export type RawLine = z.infer<typeof RawLineSchema>;
