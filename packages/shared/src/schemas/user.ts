// first-attempt contract, removed in M1 step 7.
/** User — a person's account (D25: unique email + username + display name). */
import { z } from "zod/v3";
import { IdSchema, UsernameSchema, CountryCodeSchema } from "./primitives.js";
import { RoleSchema, LanguageSchema } from "./enums.js";

export const UserSchema = z
  .object({
    uid: IdSchema,
    email: z.string().email(),
    username: UsernameSchema,
    displayName: z.string().min(1),
    role: RoleSchema,
    /** null = independent user (no institution). */
    institutionId: IdSchema.nullable().default(null),
    country: CountryCodeSchema.optional(),
    language: LanguageSchema.default("en"),
    emailVerified: z.boolean().default(false),
    /** Exclude this user's stations from ML training by default (D-governance). */
    mlTrainingOptOut: z.boolean().default(false),
    /** Discoverable by username in the directory. */
    directoryOptIn: z.boolean().default(false),
    createdAt: z.number().int().nonnegative().optional(),
  })
  .strict();

export type User = z.infer<typeof UserSchema>;
