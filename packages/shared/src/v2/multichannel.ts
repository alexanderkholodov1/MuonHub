/**
 * Multichannel events and sampled data (spec 0083 FR13): designed and tested now so the muograph
 * (~20 channels) and the seismic sensor (~100 samples/s) fit later; no cloud storage in M1.
 */
import { z } from "zod";
import { EpochMsSchema } from "./primitives.js";

export const ChannelEventSchema = z.strictObject({
  channel: z.number().int().nonnegative().max(1023),
  t: EpochMsSchema,
  amplitude: z.number(),
});

export const SampleBlockSchema = z.strictObject({
  channel: z.number().int().nonnegative().max(1023),
  startTs: EpochMsSchema,
  rateHz: z.number().positive().max(100_000),
  values: z.array(z.number()).min(1).max(1_000_000),
});

/** End time (exclusive) of a sample block. */
export function sampleBlockEnd(block: SampleBlock): number {
  return block.startTs + (block.values.length / block.rateHz) * 1000;
}

export type ChannelEvent = z.infer<typeof ChannelEventSchema>;
export type SampleBlock = z.infer<typeof SampleBlockSchema>;
