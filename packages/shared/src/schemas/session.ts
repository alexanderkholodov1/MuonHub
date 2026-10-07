// first-attempt contract, removed in M1 step 7.
/** Session — one continuous data-taking run of a detector. */
import { z } from "zod/v3";
import { IdSchema, EpochMsSchema } from "./primitives.js";
import { StorageTierConfigSchema } from "./storage.js";

export const SessionSchema = z
  .object({
    id: IdSchema,
    detectorId: IdSchema,
    startedAt: EpochMsSchema,
    /** null while the session is still recording. */
    endedAt: EpochMsSchema.nullable().default(null),
    /** Hash of the source log file, used for upload de-duplication. */
    sourceFileHash: z.string().optional(),
    /** Homogeneous retention tier active for this session. */
    storageTier: StorageTierConfigSchema.optional(),
    agentVersion: z.string().min(1).optional(),
    /** trueTime - machineTime, measured by the agent. */
    clockOffsetMs: z.number().optional(),
    calibrationRef: z.string().min(1).optional(),
  })
  .strict()
  .refine((s) => s.endedAt === null || s.endedAt >= s.startedAt, {
    message: "endedAt must be at or after startedAt",
    path: ["endedAt"],
  });

export type Session = z.infer<typeof SessionSchema>;
