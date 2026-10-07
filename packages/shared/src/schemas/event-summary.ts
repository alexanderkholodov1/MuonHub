// first-attempt contract, removed in M1 step 7.
import { z } from "zod/v3";
import { IdSchema, EpochMsSchema } from "./primitives.js";

const NonNegative = z.number().nonnegative();
const NonNegativeInteger = z.number().int().nonnegative();

export const AmplitudeHistogramSchema = z
  .object({
    binWidthMv: z.number().positive(),
    minMv: NonNegative,
    counts: z.array(NonNegativeInteger),
  })
  .strict();
export type AmplitudeHistogram = z.infer<typeof AmplitudeHistogramSchema>;

export const EventSummarySchema = z
  .object({
    detectorId: IdSchema,
    sessionId: IdSchema,
    intervalStartTs: EpochMsSchema,
    intervalEndTs: EpochMsSchema,
    signalCount: NonNegativeInteger,
    aboveThresholdCount: NonNegativeInteger,
    tailCount: NonNegativeInteger,
    coincidenceCount: NonNegativeInteger,
    noiseThresholdMv: NonNegative,
    mpvMv: NonNegative.optional(),
    histogram: AmplitudeHistogramSchema,
  })
  .strict()
  .refine((summary) => summary.intervalEndTs > summary.intervalStartTs, {
    message: "intervalEndTs must be after intervalStartTs",
    path: ["intervalEndTs"],
  });

export type EventSummary = z.infer<typeof EventSummarySchema>;
