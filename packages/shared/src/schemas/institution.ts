// first-attempt contract, removed in M1 step 7.
/** Institution — a university/organization grouping users and stations (D8). */
import { z } from "zod/v3";
import { IdSchema, CountryCodeSchema } from "./primitives.js";
import { VisibilitySchema } from "./enums.js";

export const InstitutionSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1),
    country: CountryCodeSchema,
    city: z.string().min(1),
    /** UIDs of users who administer this institution. */
    adminUids: z.array(IdSchema).default([]),
    website: z.string().url().optional(),
    logoUrl: z.string().url().optional(),
    /** Suggested (not enforced) visibility for new stations under this institution. */
    defaultStationVisibility: VisibilitySchema.optional(),
    createdAt: z.number().int().nonnegative().optional(),
  })
  .strict();

export type Institution = z.infer<typeof InstitutionSchema>;
