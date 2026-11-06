/**
 * Identity: users, usernames, institutions (spec 0083 FR1).
 * The email is private: it lives only in the owner-readable user document and never in a public
 * projection.
 */
import { z } from "zod";
import { EpochMsSchema, IdSchema, SchemaVersionSchema, UidSchema } from "./primitives.js";

/** Unique, lower-case username (3–32 characters). */
export const UsernameSchema = z
  .string()
  .regex(
    /^[a-z0-9](?:[a-z0-9._-]{1,30})[a-z0-9]$/,
    "3–32 lower-case letters, digits, '.', '_', '-'",
  );

export const UserSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  uid: UidSchema,
  displayName: z.string().min(1).max(120),
  username: UsernameSchema,
  email: z.email(),
  institutionId: IdSchema.optional(),
  createdAt: EpochMsSchema,
});

/**
 * `publicProfiles/{uid}`: what other signed-in users may read about a user — the display name and
 * the username, never the email. The rules require it to match the user's own profile.
 */
export const PublicProfileSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  uid: UidSchema,
  displayName: UserSchema.shape.displayName,
  username: UsernameSchema,
  updatedAt: EpochMsSchema,
});

/** The public projection of a user's own profile. */
export function toPublicProfile(user: User, updatedAt: number): PublicProfile {
  return {
    schemaVersion: 2,
    uid: user.uid,
    displayName: user.displayName,
    username: user.username,
    updatedAt,
  };
}

/** `usernames/{username}` → the claiming uid (one username per user). */
export const UsernameClaimSchema = z.strictObject({
  uid: UidSchema,
  createdAt: EpochMsSchema,
});

export const InstitutionSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  id: IdSchema,
  name: z.string().min(1).max(200),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  createdAt: EpochMsSchema,
});

export type User = z.infer<typeof UserSchema>;
export type UsernameClaim = z.infer<typeof UsernameClaimSchema>;
export type PublicProfile = z.infer<typeof PublicProfileSchema>;
export type Institution = z.infer<typeof InstitutionSchema>;
