/**
 * Stations, sharing, ownership transfers, and the public projection (spec 0083 FR2, FR3, FR15).
 */
import { z } from "zod";
import {
  CountryCodeSchema,
  EpochMsSchema,
  IdSchema,
  SchemaVersionSchema,
  UidSchema,
} from "./primitives.js";

export const VisibilitySchema = z.enum(["public", "institution", "private"]);
export const PublicPrecisionSchema = z.enum(["exact", "approximate", "city", "country", "hidden"]);
export type PublicPrecision = z.infer<typeof PublicPrecisionSchema>;

/** Exact location: private (owner and members only). */
export const StationLocationSchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  altitudeM: z.number().min(-500).max(9000),
  city: z.string().min(1).max(120),
  countryCode: CountryCodeSchema,
});

export const StationSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  id: IdSchema,
  ownerUid: UidSchema,
  name: z.string().min(1).max(120),
  location: StationLocationSchema,
  publicPrecision: PublicPrecisionSchema,
  /** Required, no default (D22). */
  visibility: VisibilitySchema,
  institutionId: IdSchema.optional(),
  /** IANA time zone, e.g. "America/Guayaquil". */
  timezone: z.string().min(1).max(64),
  /** Id of the last ownership transfer, when the station has changed owner. */
  transferId: IdSchema.optional(),
  createdAt: EpochMsSchema,
  updatedAt: EpochMsSchema,
});

export const MemberRoleSchema = z.enum(["editor", "viewer"]);

/** `stations/{stationId}/members/{uid}`. */
export const StationMemberSchema = z.strictObject({
  uid: UidSchema,
  role: MemberRoleSchema,
  addedBy: UidSchema,
  addedAt: EpochMsSchema,
});

/** Transfer id `{stationId}_{nonce}`. */
export const TransferIdSchema = z.string().regex(/^[A-Za-z0-9-]+_[A-Za-z0-9]{6,64}$/);

/** `ownershipTransfers/{id}` — immutable audit record of a transfer (ADR-009 rule 3). */
export const OwnershipTransferSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  id: TransferIdSchema,
  stationId: IdSchema,
  from: UidSchema,
  to: UidSchema,
  createdAt: EpochMsSchema,
});

/**
 * `publicStations/{stationId}` — what anonymous visitors may read. Location is already rounded to
 * the owner's precision; no email, uid list, or exact coordinates.
 */
export const PublicStationSchema = z
  .strictObject({
    schemaVersion: SchemaVersionSchema,
    id: IdSchema,
    name: z.string().min(1).max(120),
    precision: PublicPrecisionSchema,
    /** Only for `exact` and `approximate` (rounded for `approximate`). */
    point: z
      .strictObject({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) })
      .optional(),
    city: z.string().min(1).max(120).optional(),
    countryCode: CountryCodeSchema.optional(),
    deviceCount: z.number().int().nonnegative(),
    active: z.boolean(),
    updatedAt: EpochMsSchema,
  })
  .superRefine((p, ctx) => {
    const has = {
      point: p.point !== undefined,
      city: p.city !== undefined,
      country: p.countryCode !== undefined,
    };
    const expected: Record<PublicPrecision, typeof has> = {
      exact: { point: true, city: true, country: true },
      approximate: { point: true, city: true, country: true },
      city: { point: false, city: true, country: true },
      country: { point: false, city: false, country: true },
      hidden: { point: false, city: false, country: false },
    };
    const want = expected[p.precision];
    for (const key of ["point", "city", "country"] as const) {
      if (has[key] !== want[key]) {
        ctx.addIssue({
          code: "custom",
          message: `precision "${p.precision}" ${want[key] ? "requires" : "forbids"} ${key}`,
          path: [key === "country" ? "countryCode" : key],
        });
      }
    }
  });

export type Visibility = z.infer<typeof VisibilitySchema>;
export type StationLocation = z.infer<typeof StationLocationSchema>;
export type Station = z.infer<typeof StationSchema>;
export type MemberRole = z.infer<typeof MemberRoleSchema>;
export type StationMember = z.infer<typeof StationMemberSchema>;
export type OwnershipTransfer = z.infer<typeof OwnershipTransferSchema>;
export type PublicStation = z.infer<typeof PublicStationSchema>;
