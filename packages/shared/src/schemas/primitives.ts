// first-attempt contract, removed in M1 step 7.
/**
 * Reusable primitive schemas (identifiers, timestamps, geographic ranges).
 * Keeping these in one place keeps every entity consistent.
 */
import { z } from "zod/v3";

/** A non-empty identifier string (Firebase key / UUID / token). */
export const IdSchema = z.string().min(1);

/** Epoch milliseconds (UTC). */
export const EpochMsSchema = z.number().int().nonnegative();

/** Latitude in decimal degrees. */
export const LatitudeSchema = z.number().min(-90).max(90);

/** Longitude in decimal degrees. */
export const LongitudeSchema = z.number().min(-180).max(180);

/** ISO-3166 alpha-2 country code (e.g. "EC"). */
export const CountryCodeSchema = z.string().length(2).toUpperCase();

/** IANA timezone string (e.g. "America/Guayaquil"). Validated as non-empty. */
export const TimezoneSchema = z.string().min(1);

/** A unique, URL-safe username. */
export const UsernameSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9_-]+$/, "username must be lowercase letters, digits, '-' or '_'");
