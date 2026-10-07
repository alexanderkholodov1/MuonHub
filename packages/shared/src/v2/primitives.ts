/**
 * v2 primitives shared by every contract (spec 0083).
 */
import { z } from "zod";

/** Epoch milliseconds (UTC), non-negative integer. */
export const EpochMsSchema = z.number().int().nonnegative();

/** Start of a UTC minute: epoch milliseconds that are a multiple of 60 000. */
export const MinuteTsSchema = EpochMsSchema.refine((v) => v % 60_000 === 0, {
  message: "must be the start of a UTC minute (multiple of 60 000 ms)",
});

/** Opaque identifier: URL- and path-safe (Firestore document ids, RTDB keys). */
export const IdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "only letters, digits, '_' and '-'");

/** Firebase Authentication uid. */
export const UidSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9]+$/, "Firebase uids are alphanumeric");

/** ISO 3166-1 alpha-2 country code, upper case. */
export const CountryCodeSchema = z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2, upper case");

/** Persisted documents carry their contract version. */
export const SchemaVersionSchema = z.literal(2);

/** Units an amplitude or saturation threshold can be expressed in. */
export const AmplitudeUnitSchema = z.enum(["mV", "V", "adc"]);

export type EpochMs = z.infer<typeof EpochMsSchema>;
export type MinuteTs = z.infer<typeof MinuteTsSchema>;
export type Id = z.infer<typeof IdSchema>;
export type Uid = z.infer<typeof UidSchema>;
export type AmplitudeUnit = z.infer<typeof AmplitudeUnitSchema>;
